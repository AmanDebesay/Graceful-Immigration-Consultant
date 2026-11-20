// The branded email signature (same design as the Outlook signature): logo, name and credentials, title,
// business, College ID, phone, website, location, and the person's land acknowledgement.
import { escapeHtml as e } from "./common.ts";

export const SITE = "https://gracefulimmigration.ca";
export const LOGO_SIG = `${SITE}/public/img/logo-sig.png`;

type Profile = { full_name?: string | null; job_title?: string | null; phone?: string | null; email_sig?: Record<string, string> | null };
type Org = { business_name?: string | null; phone?: string | null };

export function signatureHtml(me: Profile | null, org: Org | null): string {
  const s = (me?.email_sig ?? {}) as Record<string, string>;
  const v = (x: unknown) => String(x ?? "").trim();
  const name = v(me?.full_name) + (v(s.credentials) ? `, ${v(s.credentials)}` : "");
  const title = v(s.title) || v(me?.job_title);
  const phone = v(s.phone) || v(me?.phone) || v(org?.phone);
  const row = (icon: string, html: string) => `<tr><td style="padding:1px 6px 1px 0;font-size:13px;vertical-align:top">${icon}</td><td style="padding:1px 0;font-size:13px;color:#1C2333">${html}</td></tr>`;
  const lines = [
    title && `<div style="font-size:13px;color:#1C2333">${e(title)}</div>`,
    v(org?.business_name) && `<div style="font-size:13px;color:#1C2333">${e(v(org?.business_name))}</div>`,
    v(s.college_id) && `<div style="font-size:13px;color:#1C2333">CICC College ID: ${e(v(s.college_id))}</div>`,
  ].filter(Boolean).join("");
  const contact = [
    phone && row("&#128222;", e(phone)),
    row("&#127760;", `<a href="${SITE}" style="color:#1155CC">www.gracefulimmigration.ca</a>`),
    v(s.location) && row("&#128205;", e(v(s.location))),
  ].filter(Boolean).join("");
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse">
  <tr><td style="padding:0 16px 0 0;vertical-align:middle"><img src="${LOGO_SIG}" width="120" height="120" alt="Graceful Immigration Consultant Inc." style="display:block;width:120px;height:120px;border:0"></td>
  <td style="vertical-align:middle;line-height:1.45">
    <div style="font-size:14px;font-weight:bold;color:#000">${e(name)}</div>${lines}
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:2px;border-collapse:collapse">${contact}</table></td></tr>
  <tr><td colspan="2" style="padding-top:10px"><div style="border-top:1px solid #1C2333;height:1px;line-height:1px;font-size:1px">&nbsp;</div>
    ${v(s.footer) ? `<div style="font-size:11px;color:#6B7385;line-height:1.5;padding-top:6px">${e(v(s.footer))}</div>` : ""}
    <div style="font-size:10.5px;color:#8A93A3;line-height:1.5;padding-top:6px">This email and any attachments are confidential and intended only for the addressee.</div></td></tr></table>`;
}
