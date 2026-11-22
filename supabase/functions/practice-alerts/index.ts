// Daily practice alerts (pg_cron, 13:10 UTC ≈ 6–7 a.m. Alberta) and the Monday weekly report, by email to the RCIC.
//  • Deadlines: 14, 7 and 2 days before, and once when overdue. Federal Court / appeal deadlines are flagged at once.
//  • Document expiry (key dates): medical/biometrics 90 and 30 days, passport/ID 180 and 60, IMM 5744 30, others 60 and 14.
//  • IMM 5744 consent forms expiring in 30, 7 or 1 day(s).
//  • Monthly reconciliation reminder on the configured day until the month is signed off.
// Only callers with the shared x-alert-secret header (same secret as the IRCC news job) are accepted.
// The email goes to the firm's own mailbox; it names clients and deadlines but never sensitive file details.
import { adminClient, escapeHtml, json, sendEmail } from "../_shared/common.ts";

const TO = Deno.env.get("PRACTICE_ALERT_TO") ?? Deno.env.get("IRCC_ALERT_TO") ?? "aman.debesay@gracefulimmigration.ca";
const APP = "https://gracefulimmigration.ca/app/";
const todayAB = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
const days = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
const nice = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const KIND: Record<string, string> = { ircc_letter: "IRCC letter", medical: "Medical", biometrics: "Biometrics", passport: "Passport", imm5744: "IMM 5744", status_check: "Status check", court: "Federal Court / appeal", internal: "Internal", agreement_end: "Agreement end", other: "Other" };

function windows(docType: string): number[] {
  const t = docType.toLowerCase();
  if (/medical|biometric/.test(t)) return [90, 30];
  if (/passport|travel doc|id card|identity/.test(t)) return [180, 60];
  if (/5744/.test(t)) return [30];
  return [60, 14];
}

type Row = { when: string; client: string; contactId: string; what: string; tag: string; red: boolean };

function section(title: string, rows: Row[]) {
  if (!rows.length) return "";
  return `<tr><td style="padding:16px 0 6px;font-family:Georgia,serif;font-size:16px;color:#0B2A5C;font-weight:bold">${escapeHtml(title)}</td></tr>
    ${rows.map((r) => `<tr><td style="padding:8px 10px;border-left:4px solid ${r.red ? "#B42318" : "#C9A24A"};background:${r.red ? "#FEF3F2" : "#FFFBF2"};margin-bottom:6px">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${r.red ? "#B42318" : "#9A7420"};font-weight:bold">${escapeHtml(r.tag)} · ${escapeHtml(r.when)}</div>
      <div style="font-size:14px;margin-top:2px"><a href="${APP}#/contacts/${r.contactId}" style="color:#0B2A5C;font-weight:bold;text-decoration:none">${escapeHtml(r.client)}</a> — ${escapeHtml(r.what)}</div></td></tr>
      <tr><td style="height:6px"></td></tr>`).join("")}`;
}

function list(title: string, items: string[]) {
  if (!items.length) return "";
  return `<tr><td style="padding:14px 0 4px;font-family:Georgia,serif;font-size:15px;color:#0B2A5C;font-weight:bold">${escapeHtml(title)} (${items.length})</td></tr>
    <tr><td style="font-size:13px;color:#2A3142;line-height:1.6">${items.map((x) => `• ${x}`).join("<br>")}</td></tr>`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("IRCC_ALERT_SECRET");
  if (!secret || req.headers.get("x-alert-secret") !== secret) return json(req, { error: "Not allowed" }, 403);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const today = todayAB();
  const monday = new Date(today + "T12:00:00Z").getUTCDay() === 1;

  // ── Deadlines ──
  const { data: dls } = await admin.from("deadlines").select("id, contact_id, title, due_on, kind, owner, alerts_sent, contacts(full_name)").eq("done", false).order("due_on");
  const dueRows: Row[] = [];
  for (const d of dls ?? []) {
    const n = days(today, d.due_on), sent: number[] = d.alerts_sent ?? [];
    let level: number | null = null;
    if (d.kind === "court" && !sent.length) level = 99;
    else if (n < 0 && !sent.includes(0)) level = 0;
    else for (const l of [2, 7, 14]) if (n >= 0 && n <= l && !sent.includes(l)) { level = l; break; }
    if (level === null) continue;
    // Mark every level already passed so a late-created deadline alerts once, not three times.
    const mark = level === 99 ? [99] : level === 0 ? [0, 2, 7, 14] : [14, 7, 2].filter((l) => l >= level!);
    await admin.from("deadlines").update({ alerts_sent: [...new Set([...sent, ...mark])] }).eq("id", d.id);
    dueRows.push({ when: n < 0 ? `OVERDUE by ${-n} day${n === -1 ? "" : "s"} (${nice(d.due_on)})` : n === 0 ? `DUE TODAY` : `in ${n} day${n === 1 ? "" : "s"} · ${nice(d.due_on)}`,
      client: (d as any).contacts?.full_name ?? "Client", contactId: d.contact_id, what: `${d.title}${d.owner !== "us" ? ` (owner: ${d.owner === "ircc" ? "IRCC" : "client"})` : ""}${d.kind === "court" ? " — refer to a lawyer now" : ""}`,
      tag: KIND[d.kind] ?? "Deadline", red: n <= 2 || d.kind === "court" });
  }

  // ── Document expiry ──
  const { data: kds } = await admin.from("key_dates").select("id, contact_id, doc_type, expires_on, alerts_sent, contacts(full_name)").gte("expires_on", today).order("expires_on");
  const expRows: Row[] = [];
  for (const k of kds ?? []) {
    const n = days(today, k.expires_on), sent: number[] = k.alerts_sent ?? [];
    const w = windows(k.doc_type).find((l) => n <= l && !sent.includes(l));
    if (w === undefined) continue;
    await admin.from("key_dates").update({ alerts_sent: [...new Set([...sent, ...windows(k.doc_type).filter((l) => l >= w)])] }).eq("id", k.id);
    expRows.push({ when: `expires in ${n} day${n === 1 ? "" : "s"} · ${nice(k.expires_on)}`, client: (k as any).contacts?.full_name ?? "Client", contactId: k.contact_id,
      what: `${k.doc_type} expiring`, tag: "Document expiry", red: n <= 30 });
  }
  const { data: f5744 } = await admin.from("rep_forms").select("contact_id, expires_on, contacts(full_name)").eq("form", "IMM5744").neq("state", "withdrawn").not("expires_on", "is", null);
  for (const r of f5744 ?? []) {
    const n = days(today, r.expires_on);
    if (![30, 7, 1].includes(n)) continue;
    expRows.push({ when: `expires in ${n} day${n === 1 ? "" : "s"} · ${nice(r.expires_on)}`, client: (r as any).contacts?.full_name ?? "Client", contactId: r.contact_id,
      what: "IMM 5744 consent expires — get a new original signature before any further ATIP or status request", tag: "IMM 5744", red: n <= 7 });
  }

  // ── Monthly reconciliation ──
  const { data: s } = await admin.from("org_settings").select("rules").eq("id", 1).single();
  const recDay = Number(s?.rules?.reconciliation_day ?? 5);
  const prev = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
  const { data: closed } = await admin.from("month_closes").select("month").eq("month", prev).maybeSingle();
  const dayOfMonth = +today.slice(8, 10);
  const recon = !closed && (dayOfMonth === recDay || (dayOfMonth > recDay && monday));
  const monthName = new Date(prev + "T12:00:00Z").toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });

  // ── Weekly report (Mondays, or on request) ──
  let weekly = "";
  if (monday || body?.weekly) {
    const { data: w, error } = await admin.rpc("weekly_report_data");
    if (error) throw error;
    const money = (n: number) => Number(n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
    const link = (id: string, t: string) => `<a href="${APP}#/contacts/${id}" style="color:#0B2A5C">${escapeHtml(t)}</a>`;
    weekly = `<tr><td style="padding:22px 0 4px;border-top:3px double #C9A24A;font-family:Georgia,serif;font-size:19px;color:#0B2A5C;font-weight:bold">Weekly report</td></tr>`
      + list("Deadlines in the next 14 days", (w.deadlines ?? []).map((x: any) => `${link(x.contact_id, x.client)} — ${escapeHtml(x.title)} · <b>${escapeHtml(x.due_on)}</b>`))
      + list("Unsigned agreements", (w.unsigned_agreements ?? []).map((x: any) => `${link(x.contact_id, x.client)} — ${escapeHtml(x.number)} (${escapeHtml(x.status)})`))
      + list("IMM 5476 / 5744 outstanding", (w.rep_forms ?? []).map((x: any) => `${link(x.contact_id, x.client)} — ${escapeHtml(x.form)} ${escapeHtml(x.state)}${x.expires_on ? ` · expires ${escapeHtml(x.expires_on)}` : ""}`))
      + list("Unpaid invoices", (w.unpaid_invoices ?? []).map((x: any) => `${link(x.contact_id, x.client)} — ${escapeHtml(x.number)} · ${money(x.balance)} due ${escapeHtml(x.due_date)}`))
      + list("Client account balances", (w.trust_balances ?? []).map((x: any) => `${link(x.contact_id, x.client)} — ${money(x.balance)} (last activity ${escapeHtml(x.last)})`))
      + list("Out-of-scope IRCC letters awaiting an addendum decision", (w.out_of_scope ?? []).map((x: any) => `${link(x.contact_id, x.client)} — ${escapeHtml(x.subject)} (${escapeHtml(x.occurred_on)})${x.client_informed ? "" : " · <b style='color:#B42318'>client not yet informed</b>"}`))
      + list("Retained files with no activity for 30 days", (w.inactive ?? []).map((x: any) => link(x.contact_id, x.client)));
  }

  if (!dueRows.length && !expRows.length && !recon && !weekly) return json(req, { ok: true, sent: false });
  const html = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:660px;font-family:Arial,Helvetica,sans-serif;color:#1C2333">
    <tr><td style="padding:0 0 10px;border-bottom:3px solid #C9A24A"><div style="font-family:Georgia,serif;font-size:21px;color:#0B2A5C;font-weight:bold">Practice Hub — ${escapeHtml(nice(today))}</div>
      <div style="font-size:13px;color:#6B7385">Deadlines, expiring documents and reminders for Graceful Immigration Consultant Inc.</div></td></tr>
    ${section("Deadlines", dueRows)}${section("Expiring documents", expRows)}
    ${recon ? `<tr><td style="padding:14px 10px;background:#FFFBF2;border-left:4px solid #C9A24A;font-size:14px"><b>Monthly reconciliation for ${escapeHtml(monthName)} is still open.</b> Match the bank statement, the journal and every client ledger, then sign it off in <a href="${APP}#/trust" style="color:#0B2A5C">Trust (Client Funds)</a>.</td></tr>` : ""}
    ${weekly}
    <tr><td style="padding:18px 0 0;font-size:11px;color:#8A90A0">Sent automatically by your Practice Hub. Open <a href="${APP}#/deadlines" style="color:#8A90A0">Deadlines</a> to mark items done.</td></tr></table>`;
  const subject = dueRows.some((r) => r.red) ? `⚠ Practice Hub: ${dueRows.filter((r) => r.red).length} urgent deadline(s)` : weekly ? "Practice Hub weekly report" : "Practice Hub reminders";
  const ok = await sendEmail(TO, subject, html);
  return json(req, { ok, sent: ok, deadlines: dueRows.length, expiring: expRows.length, recon, weekly: !!weekly });
});
