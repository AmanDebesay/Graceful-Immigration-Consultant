// Emails new IRCC news (Government of Canada news feed for Immigration, Refugees and Citizenship Canada)
// to the RCIC. Run every hour by pg_cron; only callers with the IRCC_ALERT_SECRET header are accepted.
// The first run only records what is already published (and sends one "alerts are on" email with the latest
// items), so the inbox isn't flooded with old news.
import { adminClient, escapeHtml, json, sendEmail } from "../_shared/common.ts";

const FEED = "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=50&format=atom";
const TO = Deno.env.get("IRCC_ALERT_TO") ?? "aman.debesay@gracefulimmigration.ca";

const dec = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (b: string, t: string) => dec((b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) ?? [])[1] ?? "");

type Item = { url: string; title: string; date: string; summary: string; type: string };

async function feed(): Promise<Item[]> {
  const r = await fetch(FEED, { headers: { "User-Agent": "Mozilla/5.0 (IRCC news alerts)" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`IRCC feed returned ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: tag(e, "title"), url: (e.match(/<link[^>]*href="([^"]+)"/) ?? [])[1] ?? "",
    date: (tag(e, "published") || tag(e, "updated")).slice(0, 10),
    summary: tag(e, "summary").slice(0, 400),
    type: (e.match(/<category[^>]*term="([^"]+)"/) ?? [])[1] ?? tag(e, "category"),
  })).filter((x) => x.title && /^https:\/\/www\.canada\.ca\//.test(x.url));
}

const nice = (d: string) => { const t = new Date(d + "T12:00:00Z"); return isNaN(+t) ? d : t.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }); };

function emailHtml(items: Item[], intro: string) {
  const rows = items.map((i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #EEE8DB">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9A7420;font-weight:bold">${escapeHtml(i.type || "News")} · ${escapeHtml(nice(i.date))}</div>
      <div style="font-family:Georgia,serif;font-size:17px;margin:4px 0 6px"><a href="${escapeHtml(i.url)}" style="color:#0B2A5C;text-decoration:none">${escapeHtml(i.title)}</a></div>
      ${i.summary ? `<div style="font-size:13px;color:#4A5165;line-height:1.5">${escapeHtml(i.summary)}</div>` : ""}
      <div style="margin-top:8px"><a href="${escapeHtml(i.url)}" style="font-size:13px;color:#0B2A5C;font-weight:bold">Read on canada.ca →</a></div>
    </td></tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;font-family:Arial,Helvetica,sans-serif;color:#1C2333">
    <tr><td style="padding:0 0 10px;border-bottom:3px solid #C9A24A"><div style="font-family:Georgia,serif;font-size:20px;color:#0B2A5C;font-weight:bold">IRCC news alert</div>
      <div style="font-size:13px;color:#6B7385">${escapeHtml(intro)}</div></td></tr>
    ${rows}
    <tr><td style="padding:14px 0;font-size:11px;color:#8A90A0">Source: Government of Canada news feed for Immigration, Refugees and Citizenship Canada. Sent automatically by your Practice Hub.</td></tr>
  </table>`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("IRCC_ALERT_SECRET");
  if (!secret || req.headers.get("x-alert-secret") !== secret) return json(req, { error: "Not allowed" }, 403);
  const admin = adminClient();
  const items = await feed();
  if (!items.length) return json(req, { ok: true, new: 0, note: "feed empty" });

  const { count } = await admin.from("ircc_alerts_seen").select("url", { count: "exact", head: true });
  const { data: seen } = await admin.from("ircc_alerts_seen").select("url").in("url", items.map((i) => i.url));
  const known = new Set((seen ?? []).map((s) => s.url));
  const fresh = items.filter((i) => !known.has(i.url));
  if (!fresh.length) return json(req, { ok: true, new: 0 });

  const first = !count;
  const send = first ? items.slice(0, 5) : fresh.slice(0, 20).sort((a, b) => a.date.localeCompare(b.date)).reverse();
  const subject = first ? "IRCC news alerts are on: latest updates"
    : send.length === 1 ? `IRCC: ${send[0].title}` : `IRCC: ${send.length} new updates`;
  const intro = first ? "You'll get an email like this whenever IRCC publishes news. Here are the latest items."
    : `${send.length} new item${send.length === 1 ? "" : "s"} from Immigration, Refugees and Citizenship Canada.`;
  const text = send.map((i) => `${i.title}\n${nice(i.date)}\n${i.url}`).join("\n\n");
  const ok = await sendEmail(TO, subject, emailHtml(send, intro), text);
  if (!ok) return json(req, { error: "Email could not be sent" }, 502);   // not marked seen, so the next run retries

  const { error } = await admin.from("ircc_alerts_seen").upsert(fresh.map((i) => ({ url: i.url, title: i.title, published: i.date || null })), { onConflict: "url" });
  if (error) return json(req, { error: error.message }, 500);
  return json(req, { ok: true, new: fresh.length, emailed: send.length, first });
});
