// Client files in OneDrive (Microsoft Graph, application permission Files.ReadWrite.All).
// Layout: <root>/<YYYY-MM-DD> <Client name>/<01 Agreements | 02 Client documents | 03 Forms & submissions | 04 Correspondence | 05 IRCC decisions>
// The folder date is the day the client's folder was first created; the dashboard stores the folder id, so renaming a client never splits their files.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtml } from "./common.ts";
import { graphToken } from "./m365.ts";

export const SUBFOLDER: Record<string, string> = {
  agreements: "01 Agreements", documents: "02 Client documents", forms: "03 Forms & submissions",
  correspondence: "04 Correspondence", decisions: "05 IRCC decisions", representative: "06 Representative & consent",
};
const enc = encodeURIComponent;
export const cleanName = (s: string) =>
  String(s ?? "").replace(/["*:<>?/\\|#%~&{}]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 120);

async function g(path: string, init: RequestInit & { raw?: boolean } = {}, allow404 = false) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { Authorization: `Bearer ${await graphToken()}`, ...(init.raw ? {} : { "Content-Type": "application/json" }), ...(init.headers ?? {}) },
  });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const e = await res.json(); msg = e.error?.message || msg; } catch { /* no body */ }
    if (/Access denied|accessDenied|Authorization_RequestDenied|Either scp or roles/i.test(msg)) {
      throw new Error("Microsoft 365 hasn't allowed file storage yet. An administrator needs to add the Files.ReadWrite.All permission to the Graceful Practice Hub app and grant consent.");
    }
    throw new Error(`OneDrive: ${msg}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function driveConfig(admin: SupabaseClient) {
  const { data } = await admin.from("integration_settings").select("files_drive_user, files_root").eq("id", 1).single();
  if (!data?.files_drive_user) throw new Error("OneDrive storage isn't set up yet. The owner sets it in Business Settings → Integrations.");
  return { user: String(data.files_drive_user), root: cleanName(data.files_root || "Graceful Clients") || "Graceful Clients" };
}
const base = (u: string) => `/users/${enc(u)}/drive`;

async function ensureFolder(user: string, parentId: string | null, name: string): Promise<string> {
  const at = parentId ? `${base(user)}/items/${parentId}:/${enc(name)}` : `${base(user)}/root:/${enc(name)}`;
  const found = await g(at, {}, true);
  if (found?.folder) return found.id;
  try {
    const made = await g(parentId ? `${base(user)}/items/${parentId}/children` : `${base(user)}/root/children`, {
      method: "POST", body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    return made.id;
  } catch (e) {
    const again = await g(at, {}, true);   // created at the same moment by another request
    if (again?.folder) return again.id;
    throw e;
  }
}

/** The client's folder (created the first time) and the requested sub-folder inside it. */
export async function clientFolder(admin: SupabaseClient, contactId: string, category: string) {
  const cfg = await driveConfig(admin);
  if (!SUBFOLDER[category]) throw new Error("Unknown document type.");
  const { data: c } = await admin.from("contacts").select("id, full_name, drive_folder_id").eq("id", contactId).single();
  if (!c) throw new Error("Client not found.");
  let clientId = c.drive_folder_id && (await g(`${base(cfg.user)}/items/${c.drive_folder_id}`, {}, true))?.id;
  if (!clientId) {
    const rootId = await ensureFolder(cfg.user, null, cfg.root);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
    const name = `${today} ${cleanName(c.full_name) || "Client"}`;
    clientId = await ensureFolder(cfg.user, rootId, name);
    await admin.from("contacts").update({ drive_folder_id: clientId, drive_folder_name: name }).eq("id", contactId);
  }
  return { user: cfg.user, clientId, folderId: await ensureFolder(cfg.user, clientId, SUBFOLDER[category]) };
}

export const uploadSession = (user: string, folderId: string, name: string) =>
  g(`${base(user)}/items/${folderId}:/${enc(name)}:/createUploadSession`, {
    method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
  });
// New content for an existing file: OneDrive keeps the earlier version in the file's version history.
export const replaceSession = (user: string, id: string) =>
  g(`${base(user)}/items/${enc(id)}/createUploadSession`, { method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }) });
/** Rename and/or move a file to another folder (a number is added if the name is taken). */
export const updateItem = (user: string, id: string, change: { name?: string; folderId?: string }) =>
  g(`${base(user)}/items/${enc(id)}?@microsoft.graph.conflictBehavior=rename`, {
    method: "PATCH", body: JSON.stringify({ ...(change.name ? { name: change.name } : {}), ...(change.folderId ? { parentReference: { id: change.folderId } } : {}) }),
  });
export const getItem = (user: string, id: string) => g(`${base(user)}/items/${enc(id)}`, {}, true);
export const deleteItem = (user: string, id: string) => g(`${base(user)}/items/${enc(id)}`, { method: "DELETE" }, true);
export const rootFolder = async (admin: SupabaseClient) => {
  const cfg = await driveConfig(admin);
  return getItem(cfg.user, await ensureFolder(cfg.user, null, cfg.root));
};
const putSmall = (user: string, folderId: string, name: string, body: string, type: string) =>
  g(`${base(user)}/items/${folderId}:/${enc(name)}:/content?@microsoft.graph.conflictBehavior=rename`, { method: "PUT", raw: true, headers: { "Content-Type": type }, body });

// ── Signed agreement → "01 Agreements" (a self-contained HTML copy with the signatures and signature certificate) ──
const TYPE_LABEL: Record<string, string> = {
  consultation: "Initial Consultation Agreement", retainer: "Retainer Agreement", amendment: "Amendment",
  non_engagement: "Non-Engagement Letter", termination: "Closing Letter",
};
const when = (t?: string | null) => (t ? new Date(t).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "long", timeStyle: "short" }) : "________________");
const sigHtml = (s?: string | null) => (!s ? "" : s.startsWith("data:image") ? `<img src="${s}" alt="signature">` : `<span class="typed">${escapeHtml(s)}</span>`);

function signedHtml(a: any, events: any[]) {
  const signer = (n: string) => (a.agreement_signers || []).find((x: any) => String(x.position) === n);
  const body = String(a.body_html || "")
    .replace('<div class="gi-sig" data-sig="client"></div>', `<div class="gi-sig" data-sig="client">${sigHtml(a.client_signature)}</div>`)
    .replace('<div class="gi-sig" data-sig="rcic"></div>', `<div class="gi-sig" data-sig="rcic">${sigHtml(a.rcic_signature)}</div>`)
    .replace('<span data-sig-date="client">________________</span>', `<span data-sig-date="client">${when(a.client_signed_at)}</span>`)
    .replace('<span data-sig-date="rcic">________________</span>', `<span data-sig-date="rcic">${when(a.rcic_signed_at)}</span>`)
    .replace(/<span class="gi-initials">______<\/span>/g, `<span class="gi-initials">${escapeHtml(a.client_initials || "______")}</span>`)
    .replace(/<div class="gi-sig" data-sig="client-(\d+)"><\/div>/g, (_m: string, n: string) => `<div class="gi-sig" data-sig="client-${n}">${sigHtml(signer(n)?.signature)}</div>`)
    .replace(/<span data-sig-date="client-(\d+)">________________<\/span>/g, (_m: string, n: string) => `<span data-sig-date="client-${n}">${when(signer(n)?.signed_at)}</span>`)
    .replace(/<span class="gi-initials" data-ini="(\d+)">______<\/span>/g, (_m: string, n: string) => `<span class="gi-initials" data-ini="${n}">${escapeHtml(signer(n)?.initials || "______")}</span>`);
  const rows = [
    ["Document", `${a.number} · ${a.title}`], ["Document fingerprint (SHA-256)", a.body_sha256 || "—"],
    ...(a.sign_method === "paper" ? [["Signing method", `Signed by hand on the printed copy${a.paper_signed_on ? " on " + a.paper_signed_on : ""}; the scanned copy is in this folder`]] : []),
    ["RCIC signature", `${a.rcic_name || ""} · ${when(a.rcic_signed_at)}`],
    ["Client signature", `${a.client_name || "—"} · ${when(a.client_signed_at)}${a.client_ip ? " · IP " + a.client_ip : ""}`],
    ...[...(a.agreement_signers || [])].sort((x: any, y: any) => x.position - y.position).map((x: any) => [`Client ${x.position} signature`, `${x.signed_name || x.name} · ${when(x.signed_at)}${x.ip ? " · IP " + x.ip : ""}`]),
  ];
  const cert = `<div class="gi-agr" style="margin-top:30px;border:1px solid #E3DCCD;border-radius:8px;padding:16px 18px;font-family:Arial,sans-serif;font-size:12.5px"><h2 style="margin-top:0">Signature certificate</h2>
    <table>${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td style="word-break:break-all">${escapeHtml(v)}</td></tr>`).join("")}</table>
    <table><tr><th>Event</th><th>When</th><th>IP</th></tr>${events.map((v) => `<tr><td>${escapeHtml(v.event)}</td><td>${when(v.created_at)}</td><td>${escapeHtml(v.ip || "")}</td></tr>`).join("")}</table></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(a.number)} ${escapeHtml(a.title)}</title>
    <style>body{margin:24px;background:#fff}.gi-agr .runfoot{display:none!important}</style></head><body>${body}${cert}</body></html>`;
}

/** Saves a signed agreement to the client's Agreements folder once. Returns the document row, or null when not signed. */
export async function saveAgreementToDrive(admin: SupabaseClient, agreementId: string, by: string | null = null) {
  const { data: a } = await admin.from("agreements").select("*, agreement_signers(*)").eq("id", agreementId).single();
  if (!a || a.status !== "signed" || !a.body_html) return null;
  if (a.drive_item_id) return { already: true };
  const { data: events } = await admin.from("agreement_events").select("event, ip, created_at").eq("agreement_id", agreementId).order("created_at");
  const f = await clientFolder(admin, a.contact_id, "agreements");
  const name = cleanName(`${a.number} ${TYPE_LABEL[a.type] || "Agreement"} - signed`) + ".html";
  const item = await putSmall(f.user, f.folderId, name, signedHtml(a, events || []), "text/html; charset=utf-8");
  await admin.from("agreements").update({ drive_item_id: item.id }).eq("id", agreementId);
  const { data: doc } = await admin.from("client_documents").insert({
    contact_id: a.contact_id, case_id: a.case_id, agreement_id: a.id, category: "agreements", doc_type: "Signed agreement", name: item.name,
    drive_item_id: item.id, web_url: item.webUrl, size: item.size, mime: "text/html", uploaded_by: by,
  }).select().single();
  return doc;
}
