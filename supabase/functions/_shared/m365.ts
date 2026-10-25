// Microsoft 365 (Graph) email and Microsoft Teams alerts.
// Graph uses an Entra app registration with application permissions Mail.Send and Mail.Read
// (secrets MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET). Only company mailboxes are ever used.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isCompanyEmail } from "./common.ts";

let cached: { token: string; exp: number } | null = null;

export const graphConfigured = () =>
  !!(Deno.env.get("MS_TENANT_ID") && Deno.env.get("MS_CLIENT_ID") && Deno.env.get("MS_CLIENT_SECRET"));

async function graphToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${Deno.env.get("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!, client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Microsoft sign-in failed: ${data.error_description?.split("\r\n")[0] ?? res.status}`);
  cached = { token: data.access_token, exp: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function graph(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const e = await res.json(); msg = e.error?.message ?? msg; } catch { /* no body */ }
    throw new Error(`Microsoft 365: ${msg}`);
  }
  return res.status === 202 || res.status === 204 ? null : res.json();
}

const addr = (list: string[]) => list.map((a) => ({ emailAddress: { address: a } }));

/** Sends an email from a company mailbox; it is saved in that mailbox's Sent Items. */
export type Attachment = { name: string; contentType: string; contentBytes: string };
const fileAtt = (a: Attachment) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: a.contentBytes });

export async function graphSendMail(opts: { from: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; replyTo?: string; attachments?: Attachment[]; importance?: string }) {
  if (!isCompanyEmail(opts.from)) throw new Error("Email can only be sent from a company mailbox.");
  await graph(`/users/${encodeURIComponent(opts.from)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: opts.subject, body: { contentType: "HTML", content: opts.html },
        toRecipients: addr(opts.to), ccRecipients: addr(opts.cc ?? []), bccRecipients: addr(opts.bcc ?? []),
        ...(opts.replyTo ? { replyTo: addr([opts.replyTo]) } : {}),
        ...(opts.importance === "high" ? { importance: "high" } : {}),
        ...(opts.attachments?.length ? { attachments: opts.attachments.map(fileAtt) } : {}),
      },
      saveToSentItems: true,
    }),
  });
}

const mb = (m: string) => { if (!isCompanyEmail(m)) throw new Error("Only company mailboxes can be used."); return encodeURIComponent(m); };

/** Top-level mail folders with unread counts (well-known ones first). */
export async function graphFolders(mailbox: string) {
  const data = await graph(`/users/${mb(mailbox)}/mailFolders?$top=60&$select=id,displayName,unreadItemCount,totalItemCount`);
  // v1.0 has no wellKnownName property: look up the ids of the standard folders by their well-known names.
  const names = ["inbox", "sentitems", "drafts", "archive", "deleteditems", "junkemail"];
  const ids = await Promise.all(names.map((n) => graph(`/users/${mb(mailbox)}/mailFolders/${n}?$select=id`).then((f) => f?.id as string).catch(() => null)));
  const wkById = Object.fromEntries(ids.map((id, i) => [id, names[i]]).filter(([id]) => id));
  return ((data?.value ?? []) as any[]).map((f) => ({ id: f.id, name: f.displayName, unread: f.unreadItemCount, total: f.totalItemCount, wk: wkById[f.id] ?? null }));
}

/** Read/unread and follow-up flag. */
export async function graphMark(mailbox: string, id: string, patch: { isRead?: boolean; flagged?: boolean }) {
  const body: Record<string, unknown> = {};
  if (typeof patch.isRead === "boolean") body.isRead = patch.isRead;
  if (typeof patch.flagged === "boolean") body.flag = { flagStatus: patch.flagged ? "flagged" : "notFlagged" };
  await graph(`/users/${mb(mailbox)}/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

/** Moves a message to a folder (id or well-known name such as archive, deleteditems, inbox). */
export async function graphMove(mailbox: string, id: string, destination: string) {
  await graph(`/users/${mb(mailbox)}/messages/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: destination }) });
}

export async function graphForward(mailbox: string, id: string, to: string[], html: string) {
  await graph(`/users/${mb(mailbox)}/messages/${encodeURIComponent(id)}/forward`, { method: "POST", body: JSON.stringify({ comment: html, toRecipients: addr(to) }) });
}

/** One attachment's file content (base64). */
export async function graphAttachment(mailbox: string, id: string, attachmentId: string) {
  const a = await graph(`/users/${mb(mailbox)}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`);
  return { name: a.name, contentType: a.contentType, size: a.size, contentBytes: a.contentBytes as string | undefined };
}

/** File attachments (with content) of a message — used by the receipts inbox. */
export async function graphFileAttachments(mailbox: string, id: string) {
  const data = await graph(`/users/${mb(mailbox)}/messages/${encodeURIComponent(id)}/attachments`);
  return ((data?.value ?? []) as any[]).filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && !a.isInline)
    .map((a) => ({ name: a.name as string, contentType: a.contentType as string, size: a.size as number, contentBytes: a.contentBytes as string }));
}

// ── Calendar ──
const TZ = "America/Edmonton";
const ev = (e: any) => ({
  id: e.id, subject: e.subject ?? "(no title)", start: e.start?.dateTime, end: e.end?.dateTime, isAllDay: !!e.isAllDay,
  location: e.location?.displayName ?? "", organizer: e.organizer?.emailAddress?.address ?? "",
  attendees: (e.attendees ?? []).map((a: any) => ({ email: a.emailAddress?.address, name: a.emailAddress?.name, response: a.status?.response })),
  isOnlineMeeting: !!e.isOnlineMeeting, joinUrl: e.onlineMeeting?.joinUrl ?? null, preview: e.bodyPreview ?? "", showAs: e.showAs,
  categories: e.categories ?? [], webLink: e.webLink ?? "", isCancelled: !!e.isCancelled, reminder: e.reminderMinutesBeforeStart ?? null,
});

/** Events between two ISO dates, expanded for recurring series, in Alberta time. */
export async function graphCalendarView(mailbox: string, startIso: string, endIso: string) {
  const sel = "$select=id,subject,start,end,isAllDay,location,organizer,attendees,isOnlineMeeting,onlineMeeting,bodyPreview,showAs,categories,webLink,isCancelled,reminderMinutesBeforeStart";
  const data = await graph(`/users/${mb(mailbox)}/calendarView?startDateTime=${encodeURIComponent(startIso)}&endDateTime=${encodeURIComponent(endIso)}&$top=500&$orderby=start/dateTime&${sel}`,
    { headers: { Prefer: `outlook.timezone="${TZ}"` } });
  return ((data?.value ?? []) as any[]).map(ev);
}

export type EventInput = { subject: string; start: string; end: string; isAllDay?: boolean; location?: string; body?: string; attendees?: string[]; teams?: boolean; reminder?: number; showAs?: string };
const eventBody = (e: EventInput) => ({
  subject: e.subject, isAllDay: !!e.isAllDay,
  start: { dateTime: e.start, timeZone: TZ }, end: { dateTime: e.end, timeZone: TZ },
  location: { displayName: e.location ?? "" }, body: { contentType: "Text", content: e.body ?? "" },
  attendees: (e.attendees ?? []).map((a) => ({ emailAddress: { address: a }, type: "required" })),
  reminderMinutesBeforeStart: e.reminder ?? 15, isReminderOn: true, showAs: e.showAs ?? "busy",
  ...(e.teams ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
});

export async function graphCreateEvent(mailbox: string, e: EventInput) {
  return ev(await graph(`/users/${mb(mailbox)}/events`, { method: "POST", body: JSON.stringify(eventBody(e)), headers: { Prefer: `outlook.timezone="${TZ}"` } }));
}
export async function graphUpdateEvent(mailbox: string, id: string, e: EventInput) {
  const b: any = eventBody(e); if (!e.teams) { delete b.isOnlineMeeting; delete b.onlineMeetingProvider; }
  return ev(await graph(`/users/${mb(mailbox)}/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b), headers: { Prefer: `outlook.timezone="${TZ}"` } }));
}
/** Cancels a meeting (notifies attendees) when the mailbox organizes it; otherwise deletes it. */
export async function graphDeleteEvent(mailbox: string, id: string, comment = "") {
  try { await graph(`/users/${mb(mailbox)}/events/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ comment }) }); }
  catch { await graph(`/users/${mb(mailbox)}/events/${encodeURIComponent(id)}`, { method: "DELETE" }); }
}

/** Recent messages in a company mailbox to or from an address (newest first). */
export async function graphFindMail(mailbox: string, party: string, top = 20) {
  if (!isCompanyEmail(mailbox)) throw new Error("Only company mailboxes can be read.");
  const q = encodeURIComponent(`"participants:${party.replace(/"/g, "")}"`);
  const data = await graph(`/users/${encodeURIComponent(mailbox)}/messages?$search=${q}&$top=${top}&$select=subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,webLink,isDraft`);
  return ((data?.value ?? []) as any[]).filter((m) => !m.isDraft).map((m) => ({
    mailbox, subject: m.subject ?? "(no subject)", from: m.from?.emailAddress?.address ?? "",
    to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
    date: m.receivedDateTime ?? m.sentDateTime, preview: m.bodyPreview ?? "", webLink: m.webLink ?? "",
  }));
}

const FOLDERS: Record<string, string> = { inbox: "inbox", sent: "sentitems", drafts: "drafts", archive: "archive", junk: "junkemail" };
const pick = (m: any) => ({
  id: m.id, subject: m.subject ?? "(no subject)", from: m.from?.emailAddress?.address ?? "", fromName: m.from?.emailAddress?.name ?? "",
  to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
  date: m.receivedDateTime ?? m.sentDateTime, preview: m.bodyPreview ?? "", isRead: m.isRead ?? true, hasAttachments: !!m.hasAttachments, webLink: m.webLink ?? "",
  flagged: m.flag?.flagStatus === "flagged", importance: m.importance ?? "normal",
});

/** A page of messages from a company mailbox folder (newest first), optionally filtered by a search. */
export async function graphListMail(mailbox: string, folder: string, opts: { top?: number; skip?: number; search?: string } = {}) {
  if (!isCompanyEmail(mailbox)) throw new Error("Only company mailboxes can be read.");
  const f = encodeURIComponent(FOLDERS[folder] ?? (folder || "inbox")), top = Math.min(opts.top ?? 30, 50);
  const sel = "$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,hasAttachments,webLink,flag,importance";
  const q = opts.search
    ? `?$search=${encodeURIComponent(`"${opts.search.replace(/"/g, "")}"`)}&$top=${top}&${sel}`
    : `?$orderby=receivedDateTime desc&$top=${top}&$skip=${opts.skip ?? 0}&${sel}`;
  const data = await graph(`/users/${encodeURIComponent(mailbox)}/mailFolders/${f}/messages${q}`);
  return ((data?.value ?? []) as any[]).map(pick);
}

/** One message with its body (HTML) and attachment names. */
export async function graphGetMail(mailbox: string, id: string) {
  if (!isCompanyEmail(mailbox)) throw new Error("Only company mailboxes can be read.");
  const m = await graph(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,body,bodyPreview,isRead,hasAttachments,webLink,flag,importance`);
  let attachments: { id: string; name: string; size: number }[] = [];
  if (m.hasAttachments) {
    const a = await graph(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,isInline`);
    attachments = ((a?.value ?? []) as any[]).filter((x) => !x.isInline).map((x) => ({ id: x.id, name: x.name, size: x.size }));
  }
  return { ...pick(m), cc: (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean), bodyType: m.body?.contentType, body: m.body?.content ?? "", attachments };
}

/** Replies to a message from the same company mailbox (saved in Sent Items, threaded in Outlook). */
export async function graphReply(mailbox: string, id: string, html: string, replyAll = false) {
  if (!isCompanyEmail(mailbox)) throw new Error("Only company mailboxes can send.");
  await graph(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(id)}/${replyAll ? "replyAll" : "reply"}`, {
    method: "POST", body: JSON.stringify({ comment: html }),
  });
}

/** Posts a card to the Microsoft Teams channel configured in Integrations. Never throws. */
export async function notifyTeams(admin: SupabaseClient, title: string, text: string, link?: string, urgent = false): Promise<boolean> {
  try {
    const { data } = await admin.from("integration_settings").select("teams_webhook_url").eq("id", 1).single();
    const url = data?.teams_webhook_url;
    if (!url) return false;
    const card = {
      type: "AdaptiveCard", $schema: "http://adaptivecards.io/schemas/adaptive-card.json", version: "1.4",
      body: [
        { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true, color: urgent ? "Attention" : "Default" },
        { type: "TextBlock", text, wrap: true, spacing: "Small" },
      ],
      actions: link ? [{ type: "Action.OpenUrl", title: "Open in Practice Hub", url: link }] : [],
    };
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }),
    });
    return res.ok;
  } catch (e) {
    console.error("Teams alert failed", e);
    return false;
  }
}

export const HUB = "https://gracefulimmigration.ca/app/";
