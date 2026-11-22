// Daily IRCC forms check (pg_cron 12:25 UTC, or "Check now" in the dashboard).
// Reads each form's official canada.ca page, records the current edition, PDF link, IRCC notice and signature
// guidance, and emails the RCIC when a new edition appears. Only callers with the shared x-alert-secret are accepted.
import { adminClient, escapeHtml, json, sendEmail } from "../_shared/common.ts";

const TO = Deno.env.get("IRCC_ALERT_TO") ?? "aman.debesay@gracefulimmigration.ca";
const BASE = "https://www.canada.ca";
const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "’").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

async function readForm(code: string, pageUrl: string) {
  const r = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (Practice Hub forms check)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { status: "broken" as const };
  const html = await r.text();
  const t = text(html);
  const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "").replace(/\s*-\s*Canada\.ca\s*$/i, "").replace(/\s*\((IMM|CIT)[^)]*\)\s*$/i, "").trim();
  const lc = code.toLowerCase();
  const pdfs = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]);
  const pdf = pdfs.find((h) => h.toLowerCase().includes(`${lc}e.pdf`) || h.toLowerCase().includes(`/${lc}/`)) ?? pdfs.find((h) => /\/kits\/forms\//i.test(h)) ?? null;
  const folder = pdf?.match(/\/(\d{2})-(\d{2})-(\d{4})\//);
  const edNotice = t.match(/new version of this form is available \((\d{2}-\d{4})\)/i)?.[1];
  // Barcoded forms are re-published monthly under a new folder, so the folder date is not the edition. Use the edition IRCC
  // announces, else the page's "Last updated" month, else the folder.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const lu = t.match(/Last updated:?\s*([A-Z][a-z]+) (\d{4})/);
  const fromUpdated = lu && MONTHS.includes(lu[1]) ? `${String(MONTHS.indexOf(lu[1]) + 1).padStart(2, '0')}-${lu[2]}` : null;
  const edition = edNotice ?? fromUpdated ?? (folder ? `${folder[2]}-${folder[3]}` : null);
  const notice = t.match(/(A new version of this form is available[^.]*\.(?:[^.]*accept[^.]*\.)?)/i)?.[1] ?? null;
  const updated = t.match(/Last updated:?\s*([A-Z][a-z]+ \d{4})/)?.[1] ?? null;
  const modified = html.match(/dateModified"?[^>]*>\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? t.match(/Date modified:?\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const es = t.match(/E-Signature\s*:?\s*([^]*?)(?:Thumbprint|Note:)/i)?.[1]?.trim();
  return { status: "ok" as const, title: title || null, pdf_url: pdf ? (pdf.startsWith("http") ? pdf : BASE + pdf) : null, edition, notice, page_updated: updated,
    page_modified: modified, esign: es ? `IRCC accepts e-signatures on this form: ${es.slice(0, 220)}` : null };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("IRCC_ALERT_SECRET");
  if (!secret || req.headers.get("x-alert-secret") !== secret) return json(req, { error: "Not allowed" }, 403);
  const admin = adminClient();
  const { data: forms } = await admin.from("ircc_forms").select("*").eq("active", true).order("sort");
  const changed: { code: string; title: string; from: string | null; to: string | null; pdf: string | null; page: string }[] = [];
  let ok = 0, broken = 0;
  for (const f of forms ?? []) {
    try {
      const r = await readForm(f.code, f.page_url);
      const now = new Date().toISOString();
      if (r.status === "broken") { broken++; await admin.from("ircc_forms").update({ status: "broken", checked_at: now }).eq("code", f.code); continue; }
      ok++;
      const isNew = f.status === "ok" && !!r.edition && !!f.edition && r.edition !== f.edition;
      if (isNew) changed.push({ code: f.code, title: r.title ?? f.title, from: f.edition, to: r.edition, pdf: r.pdf_url, page: f.page_url });
      await admin.from("ircc_forms").update({ status: "ok", checked_at: now, title: r.title ?? f.title, pdf_url: r.pdf_url ?? f.pdf_url, edition: r.edition ?? f.edition,
        notice: r.notice, page_updated: r.page_updated, page_modified: r.page_modified, esign: r.esign,
        ...(isNew ? { changed_at: now, prev_edition: f.edition } : {}) }).eq("code", f.code);
    } catch (e) { console.error(f.code, e); }
    await new Promise((res) => setTimeout(res, 400));   // be polite to canada.ca
  }
  if (changed.length) {
    const html = `<table cellpadding="0" cellspacing="0" style="max-width:640px;font-family:Arial,sans-serif;color:#1C2333">
      <tr><td style="border-bottom:3px solid #C9A24A;padding-bottom:8px"><div style="font-family:Georgia,serif;font-size:20px;color:#0B2A5C;font-weight:bold">IRCC published new form versions</div>
      <div style="font-size:13px;color:#6B7385">Use the new versions for anything not yet submitted. Check the form page for how long old versions are accepted.</div></td></tr>
      ${changed.map((c) => `<tr><td style="padding:12px 0;border-bottom:1px solid #EEE8DB"><b style="color:#0B2A5C">${escapeHtml(c.code.replace(/^(IMM|CIT)/, "$1 "))}</b> — ${escapeHtml(c.title)}<br>
        <span style="font-size:13px">Edition ${escapeHtml(c.from ?? "?")} → <b>${escapeHtml(c.to ?? "new")}</b></span><br>
        ${c.pdf ? `<a href="${escapeHtml(c.pdf)}" style="color:#0B2A5C;font-weight:bold">Download the new PDF</a> · ` : ""}<a href="${escapeHtml(c.page)}" style="color:#0B2A5C">Form page and instructions</a></td></tr>`).join("")}
      <tr><td style="padding-top:12px;font-size:11px;color:#8A90A0">Sent by your Practice Hub forms check.</td></tr></table>`;
    await sendEmail(TO, `IRCC updated ${changed.length} form${changed.length > 1 ? "s" : ""}: ${changed.map((c) => c.code).join(", ")}`, html);
  }
  return json(req, { ok: true, checked: (forms ?? []).length, readable: ok, broken, changed: changed.map((c) => c.code) });
});
