// Outlook mailbox features for the Mail page (Microsoft Graph, company mailboxes only):
// folder tree, filtered lists, conversations, bulk actions, categories, drafts and sending
// (new, reply, reply all, forward, scheduled), sweep, empty folder, automatic replies and inbox rules.
import { graph } from "./m365.ts";
import { isCompanyEmail } from "./common.ts";

const U = (m: string) => { if (!isCompanyEmail(m)) throw new Error("Only company mailboxes can be used."); return `/users/${encodeURIComponent(m)}`; };
const enc = encodeURIComponent;
const addr = (list: string[]) => list.map((a) => ({ emailAddress: { address: a } }));
const emails = (rs: any[] | undefined) => (rs ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean);
const people = (rs: any[] | undefined) => (rs ?? []).map((r: any) => ({ email: r.emailAddress?.address ?? "", name: r.emailAddress?.name ?? "" })).filter((p: any) => p.email);
const HTML = { Prefer: 'outlook.body-content-type="html"' };

// Staff write the HTML in the dashboard editor; strip anything active before it goes into Outlook.
export const cleanHtml = (h: unknown) => String(h ?? "").slice(0, 400_000)
  .replace(/<\s*(script|style|iframe|object|embed|form|textarea|select)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
  .replace(/<\s*\/?\s*(script|iframe|object|embed|meta|link|base|form|input|button)\b[^>]*>/gi, "")
  .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"');

const WK = ["inbox", "sentitems", "drafts", "archive", "deleteditems", "junkemail", "outbox"];
const FSEL = "$select=id,displayName,unreadItemCount,totalItemCount,childFolderCount,parentFolderId";

/** Folder tree (two levels of sub-folders) with unread counts and well-known names. */
export async function folderTree(mailbox: string) {
  const [top, ...wkIds] = await Promise.all([
    graph(`${U(mailbox)}/mailFolders?$top=100&${FSEL}`),
    ...WK.map((n) => graph(`${U(mailbox)}/mailFolders/${n}?$select=id`).then((f) => f?.id as string).catch(() => null)),
  ]);
  const wkById: Record<string, string> = Object.fromEntries(wkIds.map((id, i) => [id, WK[i]]).filter(([id]) => id));
  const out: any[] = [];
  const add = async (fs: any[], depth: number, parent: string | null) => {
    for (const f of fs) {
      out.push({ id: f.id, name: f.displayName, unread: f.unreadItemCount, total: f.totalItemCount, wk: wkById[f.id] ?? null, depth, parent });
      if (f.childFolderCount && depth < 2) {
        const kids = await graph(`${U(mailbox)}/mailFolders/${enc(f.id)}/childFolders?$top=100&${FSEL}`).catch(() => null);
        await add(kids?.value ?? [], depth + 1, f.id);
      }
    }
  };
  await add(top?.value ?? [], 0, null);
  return out;
}

export async function folderCreate(mailbox: string, name: string, parentId?: string) {
  const path = parentId ? `${U(mailbox)}/mailFolders/${enc(parentId)}/childFolders` : `${U(mailbox)}/mailFolders`;
  return await graph(path, { method: "POST", body: JSON.stringify({ displayName: name }) });
}
export const folderRename = (mailbox: string, id: string, name: string) =>
  graph(`${U(mailbox)}/mailFolders/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ displayName: name }) });
export const folderDelete = (mailbox: string, id: string) => graph(`${U(mailbox)}/mailFolders/${enc(id)}`, { method: "DELETE" });

const LSEL = "$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,isDraft,hasAttachments,webLink,flag,importance,categories,inferenceClassification,parentFolderId";
const item = (m: any) => ({
  id: m.id, conversationId: m.conversationId, subject: m.subject || "(no subject)", from: m.from?.emailAddress?.address ?? "", fromName: m.from?.emailAddress?.name ?? "",
  to: people(m.toRecipients), cc: people(m.ccRecipients), date: m.receivedDateTime ?? m.sentDateTime, preview: m.bodyPreview ?? "",
  isRead: m.isRead ?? true, isDraft: !!m.isDraft, hasAttachments: !!m.hasAttachments, webLink: m.webLink ?? "",
  flag: m.flag?.flagStatus ?? "notFlagged", importance: m.importance ?? "normal", categories: m.categories ?? [], focus: m.inferenceClassification ?? "focused", folderId: m.parentFolderId,
});

/** A page of a folder: newest (or oldest) first, with Outlook's filters and the Focused/Other split. */
export async function listMail(mailbox: string, folder: string, o: { skip?: number; search?: string; filter?: string; focus?: string; order?: string }) {
  const f = enc(folder || "inbox"), base = folder === "all" ? `${U(mailbox)}/messages` : `${U(mailbox)}/mailFolders/${f}/messages`;
  if (o.search) {
    const d = await graph(`${base}?$search=${enc(`"${o.search.replace(/"/g, "")}"`)}&$top=50&${LSEL}`);
    return ((d?.value ?? []) as any[]).map(item);
  }
  // Graph needs the sort property first in the filter when both are used.
  const conds = ["receivedDateTime ge 1900-01-01T00:00:00Z"];
  const F: Record<string, string> = { unread: "isRead eq false", flagged: "flag/flagStatus eq 'flagged'", files: "hasAttachments eq true", high: "importance eq 'high'" };
  if (o.filter && F[o.filter]) conds.push(F[o.filter]);
  if (o.focus === "focused" || o.focus === "other") conds.push(`inferenceClassification eq '${o.focus}'`);
  const dir = o.order === "oldest" ? "asc" : "desc";
  const d = await graph(`${base}?$filter=${enc(conds.join(" and "))}&$orderby=${enc("receivedDateTime " + dir)}&$top=40&$skip=${o.skip ?? 0}&${LSEL}`);
  return ((d?.value ?? []) as any[]).map(item);
}

// Inline pictures arrive as cid: links; swap them for the picture itself (up to ~3 MB per email).
async function inlineImages(mailbox: string, id: string, html: string) {
  if (!/cid:/i.test(html)) return html;
  const a = await graph(`${U(mailbox)}/messages/${enc(id)}/attachments?$select=id,isInline,contentId,contentType,size`).catch(() => null);
  let budget = 3_000_000;
  for (const x of ((a?.value ?? []) as any[]).filter((x) => x.isInline && x.contentId && /^image\//i.test(x.contentType ?? ""))) {
    if ((budget -= x.size) < 0) break;
    const full = await graph(`${U(mailbox)}/messages/${enc(id)}/attachments/${enc(x.id)}`).catch(() => null);
    if (full?.contentBytes) html = html.split(`cid:${x.contentId}`).join(`data:${x.contentType};base64,${full.contentBytes}`);
  }
  return html;
}

const RSEL = LSEL + ",bccRecipients,replyTo,body,isReadReceiptRequested";
async function full(mailbox: string, m: any) {
  let attachments: { id: string; name: string; size: number; contentType: string }[] = [];
  if (m.hasAttachments) {
    const a = await graph(`${U(mailbox)}/messages/${enc(m.id)}/attachments?$select=id,name,size,isInline,contentType`).catch(() => null);
    attachments = ((a?.value ?? []) as any[]).filter((x) => !x.isInline).map((x) => ({ id: x.id, name: x.name, size: x.size, contentType: x.contentType }));
  }
  const html = m.body?.contentType === "html" ? await inlineImages(mailbox, m.id, m.body?.content ?? "") : null;
  return { ...item(m), bcc: people(m.bccRecipients), replyTo: emails(m.replyTo), bodyType: m.body?.contentType, body: html ?? m.body?.content ?? "", attachments };
}

/** One message with its body, inline pictures and attachments. */
export async function readMail(mailbox: string, id: string) {
  return await full(mailbox, await graph(`${U(mailbox)}/messages/${enc(id)}?${RSEL}`, { headers: HTML }));
}

/** Every message in a conversation (all folders), oldest first. */
export async function thread(mailbox: string, conversationId: string) {
  const d = await graph(`${U(mailbox)}/messages?$filter=${enc(`conversationId eq '${conversationId.replace(/'/g, "''")}'`)}&$top=25&${RSEL}`, { headers: HTML });
  const list = ((d?.value ?? []) as any[]).sort((a, b) => String(a.receivedDateTime ?? a.sentDateTime).localeCompare(String(b.receivedDateTime ?? b.sentDateTime)));
  return await Promise.all(list.map((m) => full(mailbox, m)));
}

// Up to 20 requests per Graph batch; returns how many failed.
async function batch(reqs: { method: string; url: string; body?: unknown }[]) {
  let failed = 0;
  for (let i = 0; i < reqs.length; i += 20) {
    const r = await graph("/$batch", { method: "POST", body: JSON.stringify({ requests: reqs.slice(i, i + 20).map((q, j) => ({ id: String(i + j), method: q.method, url: q.url,
      ...(q.body ? { body: q.body, headers: { "Content-Type": "application/json" } } : {}) })) }) });
    failed += ((r?.responses ?? []) as any[]).filter((x) => x.status >= 400).length;
  }
  return failed;
}
const rel = (mailbox: string, rest: string) => `/users/${enc(mailbox)}${rest}`;

export type Patch = { isRead?: boolean; flag?: string; categories?: string[]; importance?: string };
export function patchMany(mailbox: string, ids: string[], p: Patch) {
  U(mailbox);
  const body: Record<string, unknown> = {};
  if (typeof p.isRead === "boolean") body.isRead = p.isRead;
  if (p.flag && ["flagged", "complete", "notFlagged"].includes(p.flag)) body.flag = { flagStatus: p.flag };
  if (Array.isArray(p.categories)) body.categories = p.categories.map(String).slice(0, 25);
  if (p.importance && ["low", "normal", "high"].includes(p.importance)) body.importance = p.importance;
  return batch(ids.map((id) => ({ method: "PATCH", url: rel(mailbox, `/messages/${enc(id)}`), body })));
}
export const moveMany = (mailbox: string, ids: string[], destination: string) =>
  (U(mailbox), batch(ids.map((id) => ({ method: "POST", url: rel(mailbox, `/messages/${enc(id)}/move`), body: { destinationId: destination } }))));
export const deleteMany = (mailbox: string, ids: string[]) =>
  (U(mailbox), batch(ids.map((id) => ({ method: "DELETE", url: rel(mailbox, `/messages/${enc(id)}`) }))));

/** Sweep: move every email from one sender in this folder to Deleted Items. */
export async function sweep(mailbox: string, folder: string, from: string) {
  const d = await graph(`${U(mailbox)}/mailFolders/${enc(folder)}/messages?$filter=${enc(`from/emailAddress/address eq '${from.replace(/'/g, "''")}'`)}&$top=200&$select=id`);
  const ids = ((d?.value ?? []) as any[]).map((m) => m.id);
  await moveMany(mailbox, ids, "deleteditems");
  return ids.length;
}

/** Empty a folder (Deleted Items or Junk): deletes up to 500 emails. */
export async function emptyFolder(mailbox: string, folder: string) {
  let n = 0;
  for (let round = 0; round < 5; round++) {
    const d = await graph(`${U(mailbox)}/mailFolders/${enc(folder)}/messages?$top=100&$select=id`);
    const ids = ((d?.value ?? []) as any[]).map((m) => m.id);
    if (!ids.length) break;
    await deleteMany(mailbox, ids); n += ids.length;
  }
  return n;
}

const PRESET: [string, string][] = [["Red category", "preset0"], ["Orange category", "preset1"], ["Yellow category", "preset3"], ["Green category", "preset4"], ["Blue category", "preset7"], ["Purple category", "preset8"]];
export async function categories(mailbox: string) {
  try {
    const d = await graph(`${U(mailbox)}/outlook/masterCategories`);
    const l = ((d?.value ?? []) as any[]).map((c) => ({ name: c.displayName, color: c.color }));
    if (l.length) return l;
  } catch { /* needs MailboxSettings.Read: fall back to Outlook's standard colours */ }
  return PRESET.map(([name, color]) => ({ name, color }));
}

export type Att = { id?: string; name: string; contentType?: string; contentBytes?: string };
export type Compose = { mode: string; draftId?: string; refId?: string; to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; importance?: string;
  readReceipt?: boolean; deliveryReceipt?: boolean; attachments?: Att[]; removeAttachments?: string[]; send?: boolean; sendAt?: string };

/** Saves a draft (new, reply, reply all, forward, or an existing draft) and optionally sends it, now or at sendAt. */
export async function compose(mailbox: string, c: Compose) {
  const base = U(mailbox);
  const fields: Record<string, unknown> = {
    toRecipients: addr(c.to), ccRecipients: addr(c.cc), bccRecipients: addr(c.bcc),
    importance: ["low", "high"].includes(c.importance ?? "") ? c.importance : "normal",
    isReadReceiptRequested: !!c.readReceipt, isDeliveryReceiptRequested: !!c.deliveryReceipt,
  };
  const respond = ["reply", "replyAll", "forward"].includes(c.mode) && c.refId;
  let id = c.draftId;
  let fresh = false;
  if (respond) {
    // A reply's draft holds the quoted conversation, so each save recreates it from what was typed.
    if (id) await graph(`${base}/messages/${enc(id)}`, { method: "DELETE" }).catch(() => null);
    const verb = c.mode === "reply" ? "createReply" : c.mode === "replyAll" ? "createReplyAll" : "createForward";
    const d = await graph(`${base}/messages/${enc(c.refId!)}/${verb}`, { method: "POST", body: JSON.stringify({ comment: c.html }) });
    id = d.id; fresh = true;
    await graph(`${base}/messages/${enc(id!)}`, { method: "PATCH", body: JSON.stringify({ ...fields, ...(c.subject ? { subject: c.subject } : {}) }) });
  } else if (id) {
    await graph(`${base}/messages/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ ...fields, subject: c.subject, body: { contentType: "HTML", content: c.html } }) });
  } else {
    const d = await graph(`${base}/messages`, { method: "POST", body: JSON.stringify({ ...fields, subject: c.subject, body: { contentType: "HTML", content: c.html } }) });
    id = d.id; fresh = true;
  }
  for (const aid of fresh ? [] : c.removeAttachments ?? []) await graph(`${base}/messages/${enc(id!)}/attachments/${enc(aid)}`, { method: "DELETE" }).catch(() => null);
  for (const a of (c.attachments ?? []).filter((a) => a.contentBytes && (fresh || !a.id))) {
    await graph(`${base}/messages/${enc(id!)}/attachments`, { method: "POST", body: JSON.stringify({
      "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType || "application/octet-stream", contentBytes: a.contentBytes }) });
  }
  if (c.send) {
    if (c.sendAt) {
      // Exchange holds the email in the Outbox until this time (PidTagDeferredSendTime).
      await graph(`${base}/messages/${enc(id!)}`, { method: "PATCH", body: JSON.stringify({ singleValueExtendedProperties: [{ id: "SystemTime 0x3FEF", value: new Date(c.sendAt).toISOString() }] }) });
    }
    await graph(`${base}/messages/${enc(id!)}/send`, { method: "POST" });
    return { sent: true, draftId: null, attachments: [] };
  }
  const a = await graph(`${base}/messages/${enc(id!)}/attachments?$select=id,name,size,isInline`);
  return { sent: false, draftId: id, attachments: ((a?.value ?? []) as any[]).filter((x) => !x.isInline).map((x) => ({ id: x.id, name: x.name, size: x.size })) };
}

// ── Automatic replies (out of office) and inbox rules: need MailboxSettings.ReadWrite ──
export async function autoReplies(mailbox: string) {
  const d = await graph(`${U(mailbox)}/mailboxSettings/automaticRepliesSetting`);
  return { status: d.status, audience: d.externalAudience, internal: d.internalReplyMessage ?? "", external: d.externalReplyMessage ?? "",
    start: d.scheduledStartDateTime?.dateTime ?? null, end: d.scheduledEndDateTime?.dateTime ?? null, tz: d.scheduledStartDateTime?.timeZone ?? "UTC" };
}
export async function setAutoReplies(mailbox: string, s: { status: string; audience: string; internal: string; external: string; start?: string; end?: string }) {
  const tz = "Mountain Standard Time"; // Alberta (Windows time-zone name; handles daylight time)
  await graph(`${U(mailbox)}/mailboxSettings`, { method: "PATCH", body: JSON.stringify({ automaticRepliesSetting: {
    status: s.status, externalAudience: s.audience, internalReplyMessage: s.internal, externalReplyMessage: s.external,
    ...(s.status === "scheduled" ? { scheduledStartDateTime: { dateTime: s.start, timeZone: tz }, scheduledEndDateTime: { dateTime: s.end, timeZone: tz } } : {}),
  } }) });
}

export async function rules(mailbox: string) {
  const d = await graph(`${U(mailbox)}/mailFolders/inbox/messageRules`);
  return ((d?.value ?? []) as any[]).sort((a, b) => a.sequence - b.sequence).map((r) => ({ id: r.id, name: r.displayName, enabled: r.isEnabled, conditions: r.conditions ?? {}, actions: r.actions ?? {} }));
}
export async function saveRule(mailbox: string, r: { id?: string; name: string; enabled: boolean; from?: string[]; subject?: string[]; body?: string[]; moveTo?: string; markRead?: boolean; importance?: string; category?: string; del?: boolean; stop?: boolean }) {
  const conditions: Record<string, unknown> = {};
  if (r.from?.length) conditions.senderContains = r.from;
  if (r.subject?.length) conditions.subjectContains = r.subject;
  if (r.body?.length) conditions.bodyContains = r.body;
  const actions: Record<string, unknown> = { stopProcessingRules: !!r.stop };
  if (r.moveTo) actions.moveToFolder = r.moveTo;
  if (r.markRead) actions.markAsRead = true;
  if (r.importance) actions.markImportance = r.importance;
  if (r.category) actions.assignCategories = [r.category];
  if (r.del) actions.delete = true;
  const body = JSON.stringify({ displayName: r.name, isEnabled: r.enabled, conditions, actions, ...(r.id ? {} : { sequence: 1 }) });
  return r.id ? await graph(`${U(mailbox)}/mailFolders/inbox/messageRules/${enc(r.id)}`, { method: "PATCH", body })
    : await graph(`${U(mailbox)}/mailFolders/inbox/messageRules`, { method: "POST", body });
}
export const toggleRule = (mailbox: string, id: string, enabled: boolean) =>
  graph(`${U(mailbox)}/mailFolders/inbox/messageRules/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ isEnabled: enabled }) });
export const deleteRule = (mailbox: string, id: string) => graph(`${U(mailbox)}/mailFolders/inbox/messageRules/${enc(id)}`, { method: "DELETE" });
