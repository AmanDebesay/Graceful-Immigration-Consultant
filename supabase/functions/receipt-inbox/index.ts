// Imports receipts emailed to the receipts mailbox (e.g. receipts@gracefulimmigration.ca).
// Only emails from company addresses are accepted. Attachments (photos/PDFs) become receipts; an email
// without attachments is kept as text (e.g. Uber or Amazon email receipts). Each email is imported once.
// Returns the new receipt ids; the Receipts page then has each one read by receipt-scan.
import { decodeBase64 } from "jsr:@std/encoding/base64";
import { adminClient, callerProfile, corsHeaders, hasPerm, isCompanyEmail, json } from "../_shared/common.ts";
import { graphConfigured, graphFileAttachments, graphGetMail, graphListMail } from "../_shared/m365.ts";

const OK_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
const htmlToText = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller || !(await hasPerm(admin, caller.role, "finance.manage"))) return json(req, { error: "Not allowed" }, 403);
  if (!graphConfigured()) return json(req, { error: "Microsoft 365 isn't connected yet." }, 503);

  const { data: integ } = await admin.from("integration_settings").select("receipts_mailbox").eq("id", 1).single();
  const box = integ?.receipts_mailbox ?? "receipts@gracefulimmigration.ca";
  let messages;
  try {
    messages = await graphListMail(box, "inbox", { top: 25 });
  } catch (e) {
    const m = (e as Error).message;
    return json(req, { error: /invalid|not found|MailboxNotEnabled/i.test(m) ? `The mailbox ${box} doesn't exist yet. Create it as a shared mailbox in Microsoft 365.` : m, mailbox: box }, 502);
  }
  const ids = messages.map((m) => m.id);
  const { data: seen } = ids.length ? await admin.from("receipt_email_log").select("message_id").in("message_id", ids) : { data: [] };
  const done = new Set((seen ?? []).map((s) => s.message_id));
  const fresh = messages.filter((m) => !done.has(m.id)).reverse();   // oldest first

  const created: string[] = [], summary = { imported: 0, skipped: 0 };
  for (const m of fresh) {
    const sender = (m.from || "").toLowerCase();
    if (!isCompanyEmail(sender)) {
      await admin.from("receipt_email_log").insert({ message_id: m.id, mailbox: box, sender, subject: m.subject, status: "skipped_sender", note: "Only emails from company addresses are imported." });
      summary.skipped++; continue;
    }
    try {
      const files: { blob: Uint8Array; type: string; ext: string; name: string }[] = [];
      if (m.hasAttachments) {
        for (const a of await graphFileAttachments(box, m.id)) {
          const type = (a.contentType || "").toLowerCase().split(";")[0];
          if (!OK_TYPES[type] || a.size > 10_485_760 || !a.contentBytes) continue;
          files.push({ blob: decodeBase64(a.contentBytes), type: type === "image/jpg" ? "image/jpeg" : type, ext: OK_TYPES[type], name: a.name });
        }
      }
      if (!files.length) {
        const full = await graphGetMail(box, m.id);
        const text = (full.bodyType === "html" ? htmlToText(full.body) : full.body).slice(0, 60_000);
        if (text.length > 40) files.push({ blob: new TextEncoder().encode(`Subject: ${m.subject}\nFrom: ${m.fromName} <${m.from}>\nDate: ${m.date}\n\n${text}`), type: "text/plain", ext: "txt", name: `${m.subject || "Email receipt"}.txt` });
      }
      if (!files.length) {
        await admin.from("receipt_email_log").insert({ message_id: m.id, mailbox: box, sender, subject: m.subject, status: "no_receipt", note: "No photo, PDF or text found." });
        continue;
      }
      let n = 0;
      for (const f of files.slice(0, 10)) {
        const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${f.ext}`;
        const { error: ue } = await admin.storage.from("receipts").upload(path, f.blob, { contentType: f.type });
        if (ue) throw ue;
        const { data: r, error } = await admin.from("receipts").insert({
          file_path: path, file_name: f.name.slice(0, 120), mime_type: f.type, source: "email", email_from: sender, email_subject: (m.subject ?? "").slice(0, 200), uploaded_by: caller.id,
        }).select("id").single();
        if (error) throw error;
        created.push(r.id); n++;
      }
      await admin.from("receipt_email_log").insert({ message_id: m.id, mailbox: box, sender, subject: m.subject, status: "imported", receipt_count: n });
      summary.imported += n;
    } catch (e) {
      console.error("import failed", m.id, e);
      await admin.from("receipt_email_log").insert({ message_id: m.id, mailbox: box, sender, subject: m.subject, status: "error", note: String((e as Error).message ?? e).slice(0, 300) });
    }
  }
  return json(req, { mailbox: box, created, ...summary });
});
