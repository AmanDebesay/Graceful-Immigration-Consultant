// Public booking on the website, backed by Microsoft Bookings: the website shows open times and books them;
// Bookings adds the meeting to the Outlook calendar, creates the Teams link and emails the client.
// Actions: services | slots { serviceId, from, days } | promo { serviceId, code, inCanada } -> price check
//          | book { serviceId, start, name, email, phone, notes, tz, consent, inCanada, promo } -> the time is held and
//            the client is emailed a Stripe pay link; unpaid after 2 hours = cancelled automatically (history kept)
//          | held { token } / reschedule { token, serviceId, start, tz } / cancelhold { token } - the client changes or
//            cancels an unpaid booking from the private link in their email (the payment deadline does not move)
//          | confirm { session } - after payment: records the paid invoice (only once)
//          | expire - run every 5 minutes: reminders, and releases unpaid holds past their deadline.
import { adminClient, corsHeaders, escapeHtml, json, rateLimit, sendEmail, sha256 } from "../_shared/common.ts";
import { bookings, graph, graphDeleteEvent, HUB, notifyTeams } from "../_shared/m365.ts";

const TZ = "America/Edmonton";
const DAY = 864e5;
// Safety net: never offer times outside 7 am – 9 pm Alberta time, whatever Bookings reports.
const EARLIEST_HOUR = 7, LATEST_END_HOUR = 21;
const albertaHour = (t: number) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t)).split(":"); return +p[0] + +p[1] / 60; };
const PROBE_HASH = "33d070785135b5738288d744102834b148d6e3a1dea92993f0d65330bffa05a0";

/** ISO 8601 duration (PT30M, PT1H30M, P1D) in milliseconds. */
function ms(iso?: string | null): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(iso ?? "");
  if (!m) return 0;
  return ((+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 60000 + +(m[4] ?? 0) * 1000;
}

/** Wall-clock time in a time zone -> UTC epoch ms. */
function zoned(date: string, time: string, tz = TZ): number {
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  const first = guess - off(guess);
  return guess - off(first);
}
const localDate = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const addDays = (date: string, n: number) => new Date(Date.parse(date + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** Graph dateTimeTimeZone -> epoch ms. */
function dt(x: { dateTime: string; timeZone?: string }): number {
  const tz = x.timeZone ?? "UTC", s = x.dateTime.replace(/\.\d+$/, "");
  if (/^(utc|gmt)$|\(UTC\)|Coordinated Universal/i.test(tz) || /[zZ]|[+-]\d\d:\d\d$/.test(s)) return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z");
  try { return zoned(s.slice(0, 10), s.slice(11, 16), tz); } catch { return Date.parse(s + "Z"); }
}

// ── Outlook calendar booking: used when Microsoft Bookings refuses access. Open times are working hours in the
// RCIC's Outlook calendar, minus anything marked busy; a booking is a Teams meeting in that calendar with the client invited.
const CAL_USER = Deno.env.get("BOOKING_CALENDAR") ?? "aman.debesay@gracefulimmigration.ca";
const HOURS: Record<number, [number, number]> = { 1: [9, 17], 2: [9, 17], 3: [9, 17], 4: [9, 17], 5: [9, 17] }; // Mon–Fri, Alberta time
const LEAD = 12 * 36e5, AHEAD = 60 * DAY, STEP = 30, AFTER = 15 * 60000;
const CAL_SERVICES = [30, 60].map((m) => ({ id: `cal-${m}`, name: m === 30 ? "30-Minute Consultation" : "1-Hour Consultation", minutes: m, price: m === 30 ? 75 : 150, description: "",
  staff: [], pre: 0, post: AFTER, policy: null }));
function statHolidays(y: number) {
  const nthMon = (m: number, n: number) => { const d = new Date(Date.UTC(y, m, 1)); return 1 + (8 - d.getUTCDay()) % 7 + (n - 1) * 7; };
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const gf = new Date(Date.UTC(y, Math.floor((h + l - 7 * mm + 114) / 31) - 1, ((h + l - 7 * mm + 114) % 31) + 1) - 2 * DAY);
  let vic = 24; while (new Date(Date.UTC(y, 4, vic)).getUTCDay() !== 1) vic--;
  const p = (m: number, dd: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return new Set([p(0, 1), p(1, nthMon(1, 3)), gf.toISOString().slice(0, 10), p(4, vic), p(6, 1), p(7, nthMon(7, 1)), p(8, nthMon(8, 1)), p(8, 30), p(9, nthMon(9, 2)), p(10, 11), p(11, 25), p(11, 26)]);
}
async function calSlots(minutes: number, from: string, to: string, ignoreEvent?: string | null) {
  const now = Date.now(), startT = Math.max(zoned(from, "00:00"), now), endT = zoned(addDays(to, 1), "00:00");
  if (endT <= startT) return [];
  // Times are exchanged with Outlook in UTC only, so a time-zone name can never be read with different rules
  // (Alberta now stays on UTC-6 all year; older systems still assume a November change).
  const d = await graph(`/users/${encodeURIComponent(CAL_USER)}/calendarView?startDateTime=${encodeURIComponent(new Date(startT - DAY).toISOString())}&endDateTime=${encodeURIComponent(new Date(endT + DAY).toISOString())}&$top=500&$select=id,start,end,showAs,isCancelled,isAllDay`,
    { headers: { Prefer: 'outlook.timezone="UTC"' } });
  const utc = (x: any) => Date.parse(String(x.dateTime).replace(/\.\d+$/, "") + "Z");
  // A client moving their own booking: their current meeting does not block the new time.
  const busy = ((d?.value ?? []) as any[]).filter((e) => !e.isCancelled && e.showAs !== "free" && !(ignoreEvent && e.id === ignoreEvent))
    .map((e) => e.isAllDay ? { s: zoned(String(e.start.dateTime).slice(0, 10), "00:00"), e: zoned(String(e.end.dateTime).slice(0, 10), "00:00") } : { s: utc(e.start), e: utc(e.end) });
  const out: { t: number; staff: string }[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const hours = HOURS[new Date(day + "T12:00:00Z").getUTCDay()];
    if (!hours || statHolidays(+day.slice(0, 4)).has(day)) continue;
    for (let m = hours[0] * 60; m + minutes <= hours[1] * 60; m += STEP) {
      const t = zoned(day, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      if (t < now + LEAD || t > now + AHEAD || t < startT) continue;
      const end = t + minutes * 60000;
      if (!busy.some((x) => x.s < end + AFTER && t - AFTER < x.e)) out.push({ t, staff: CAL_USER });
    }
  }
  return out;
}
// Bookings is tried first; if Microsoft refuses access, use the Outlook calendar for the next 10 minutes before trying again.
let calendarUntil = 0;
async function catalog(): Promise<{ list: Svc[]; cal: boolean }> {
  if (Date.now() < calendarUntil) return { list: CAL_SERVICES, cal: true };
  try { return { list: await publicServices(), cal: false }; }
  catch (e) {
    if (!/permission|Unauthorized|Forbidden|denied|: (401|403)$/i.test(String(e))) throw e;
    console.warn("booking: Bookings refused access, using the Outlook calendar", String(e));
    calendarUntil = Date.now() + 10 * 60000;
    return { list: CAL_SERVICES, cal: true };
  }
}

type Svc = { id: string; name: string; minutes: number; price: number | null; description: string; staff: string[]; pre: number; post: number; policy: any; itemId?: string | null };
const svc = (s: any): Svc => ({
  id: s.id, name: s.displayName, minutes: Math.round(ms(s.defaultDuration) / 60000), price: s.defaultPrice ?? null,
  description: s.description ?? "", staff: s.staffMemberIds ?? [], pre: ms(s.preBuffer), post: ms(s.postBuffer), policy: s.schedulingPolicy,
});

async function publicServices(): Promise<Svc[]> {
  const data = await bookings("/services");
  return ((data?.value ?? []) as any[]).filter((s) => !s.isHiddenFromCustomers).map(svc);
}

/** Open start times for a service between two local dates (inclusive), as UTC epoch ms with the staff member who is free.
    Follows Bookings exactly: its staff availability already applies business/staff hours (in the Bookings time zone)
    and Outlook busy times; existing appointments are subtracted again as a safety net. */
async function openSlots(service: Svc, from: string, to: string) {
  const business = await bookings("");
  const policy = ms(service.policy?.timeSlotInterval) ? service.policy : (business.schedulingPolicy ?? {});
  const interval = ms(policy.timeSlotInterval) || 30 * 60000;
  const now = Date.now();
  const earliest = now + ms(policy.minimumLeadTime);
  const latest = now + (ms(policy.maximumAdvance) || 365 * DAY);
  const dur = service.minutes * 60000;

  let staffIds = service.staff;
  if (!staffIds.length) staffIds = (((await bookings("/staffMembers"))?.value ?? []) as any[]).map((s) => s.id);
  if (!staffIds.length) return [];

  const startT = Math.max(zoned(from, "00:00"), now), endT = zoned(addDays(to, 1), "00:00");
  if (endT <= startT) return [];
  const iso = (t: number) => new Date(t).toISOString().slice(0, 19);
  const avail = await bookings("/getStaffAvailability", { method: "POST", body: JSON.stringify({
    staffIds, startDateTime: { dateTime: iso(startT), timeZone: "UTC" }, endDateTime: { dateTime: iso(endT), timeZone: "UTC" } }) });
  const appts = ((await bookings(`/calendarView?start=${encodeURIComponent(new Date(startT - DAY).toISOString())}&end=${encodeURIComponent(new Date(endT + DAY).toISOString())}`))?.value ?? []) as any[];
  const busy = appts.map((a) => ({ s: dt(a.startDateTime) - ms(a.preBuffer), e: dt(a.endDateTime) + ms(a.postBuffer), staff: (a.staffMemberIds ?? []) as string[] }));

  const found = new Map<number, string>();
  const order = new Map(staffIds.map((id, i) => [id, i]));
  for (const st of ((avail?.value ?? []) as any[]).sort((x, y) => (order.get(x.staffId) ?? 99) - (order.get(y.staffId) ?? 99))) {
    for (const i of (st.availabilityItems ?? []) as any[]) {
      if (i.status !== "available") continue;
      const ws = dt(i.startDateTime), we = dt(i.endDateTime);
      for (let t = Math.ceil((ws + service.pre) / interval) * interval; t + dur + service.post <= we; t += interval) {
        if (t < earliest || t > latest || t < startT || found.has(t)) continue;
        const h0 = albertaHour(t), h1 = h0 + service.minutes / 60;
        if (h0 < EARLIEST_HOUR || h1 > LATEST_END_HOUR) continue;
        const a = t - service.pre, b = t + dur + service.post;
        if (!busy.some((x) => (!x.staff.length || x.staff.includes(st.staffId)) && x.s < b && a < x.e)) found.set(t, st.staffId);
      }
    }
  }
  return [...found].sort((x, y) => x[0] - y[0]).map(([t, staff]) => ({ t, staff }));
}

const friendly = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  return /Unauthorized|Forbidden|Access is denied|: (401|403|500)$/i.test(m)
    ? "Online booking on this calendar is opening shortly."
    : "Booking is not available right now. Please try again shortly.";
};

// ── Card payment at booking (Stripe Checkout) ──
const SITE = "https://gracefulimmigration.ca";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
async function stripe(path: string, params?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method: params ? "POST" : "GET",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Stripe error");
  return data;
}
type Booking = { serviceId: string; start: number; name: string; email: string; phone: string; notes: string; tz: string; inCanada?: boolean; net?: number; gst?: number;
  price?: number; discount?: number; promo?: string | null; percent?: number; promoLabel?: string };

const HOLD_MS = 2 * 36e5;                                   // time to pay after booking
const REFUND_POLICY = "Cancel at least 3 hours before your appointment for a full refund. Cancellations less than 3 hours before, and missed appointments, are not refunded.";
const fmtAB = (t: number, o: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) =>
  new Date(t).toLocaleString("en-CA", { timeZone: TZ, ...o });
const cad = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/** A valid promo code for this consultation today, or null. Codes are the ones in the dashboard (promo_codes):
    % or $ off, for the services ticked on the code (none ticked = every professional service). */
type Promo = { code: string; kind: "percent" | "fixed"; value: number; percent: number; label: string };
async function findPromo(admin: any, code: unknown, itemId?: string | null): Promise<Promo | null> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(c)) return null;
  const { data: p } = await admin.from("promo_codes").select("code, kind, value, item_ids, starts_on, ends_on, use_limit, uses, active").eq("code", c).maybeSingle();
  const today = localDate(Date.now());
  if (!p || !p.active || (p.starts_on && p.starts_on > today) || (p.ends_on && p.ends_on < today) || (p.use_limit && p.uses >= p.use_limit)) return null;
  const items = (p.item_ids ?? []) as string[];
  if (items.length && !(itemId && items.includes(itemId))) return null;
  const value = Number(p.value), kind = p.kind === "fixed" ? "fixed" : "percent";
  return { code: p.code, kind, value, percent: kind === "percent" ? value : 0, label: kind === "fixed" ? `${cad(value)} off` : `${value}% off` };
}

/** Price in cents: fee, promo discount, then GST on the discounted fee (only for clients living in Canada). */
async function pricing(admin: any, price: number, inCanada: boolean, promo: Promo | null) {
  const { data: org } = await admin.from("org_settings").select("gst_number, gst_rate").eq("id", 1).single();
  const full = Math.round(price * 100);
  const off = !promo ? 0 : promo.kind === "fixed" ? Math.min(full, Math.round(promo.value * 100)) : Math.round(full * promo.percent / 100);
  const net = full - off, rate = Number(org?.gst_rate ?? 5);
  const gst = inCanada && org?.gst_number ? Math.round(net * rate / 100) : 0;
  return { full, off, net, gst, total: net + gst, rate, gstNo: org?.gst_number as string | undefined };
}

// ── Branded emails (table layout so they look right in Outlook, Gmail and on phones) ──
const LOGO = `${SITE}/public/img/logo-emblem.png`;
const NAVY = "#0B2A5C", GOLD = "#C9962B", MUTED = "#667085", LINE = "#E7E9F0";
const mailShell = (inner: string, o: { title?: string; sub?: string; pre?: string } = {}) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F4F8">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(o.pre ?? "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F4F8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;font-family:Arial,Helvetica,sans-serif;color:#1C2333">
  <tr><td style="padding:22px 30px 18px;border-bottom:3px solid ${GOLD}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;padding-right:14px"><a href="${SITE}"><img src="${LOGO}" width="76" alt="Graceful Immigration Consultant Inc." style="display:block;border:0;width:76px;height:auto"></a></td>
      <td style="vertical-align:middle"><div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:bold;color:${NAVY};line-height:1">Graceful</div>
        <div style="font-size:11.5px;letter-spacing:1.5px;color:${NAVY};text-transform:uppercase;margin-top:5px">Immigration Consultant Inc.</div></td>
    </tr></table></td></tr>
  ${o.title ? `<tr><td style="background:${NAVY};padding:20px 30px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#ffffff;line-height:1.3">${o.title}</div>
    ${o.sub ? `<div style="font-size:14px;color:#D6DEEC;margin-top:4px">${o.sub}</div>` : ""}</td></tr>` : ""}
  <tr><td style="padding:26px 30px 10px;font-size:15px;line-height:1.6">${inner}</td></tr>
  <tr><td style="padding:18px 30px 24px;border-top:1px solid ${LINE};font-size:12.5px;line-height:1.7;color:${MUTED}">
    <b style="color:${NAVY}">Graceful Immigration Consultant Inc.</b><br>
    Aman Debesay, Regulated Canadian Immigration Consultant (RCIC-IRB) · CICC licence R1056136<br>
    2318 23rd St N #3, Lethbridge, AB T1H 4R7<br>
    <a href="tel:+14039154230" style="color:${NAVY};text-decoration:none">(403) 915-4230</a> &nbsp;·&nbsp; <a href="mailto:info@gracefulimmigration.ca" style="color:${NAVY};text-decoration:none">info@gracefulimmigration.ca</a> &nbsp;·&nbsp; <a href="${SITE}" style="color:${NAVY};text-decoration:none">gracefulimmigration.ca</a>
  </td></tr>
</table></td></tr></table></body></html>`;
const btn = (url: string, label: string, primary = true) => `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 26px;border-radius:10px;font-weight:bold;font-size:15px;text-decoration:none;${primary
  ? `background:${GOLD};color:#1B1405;border:1px solid ${GOLD}` : `background:#ffffff;color:${NAVY};border:1px solid #C4CCDA`}">${label}</a>`;
const payButton = (url: string, label: string) => `<p style="margin:22px 0">${btn(url, label)}</p>`;
/** The appointment in a light box: what, when, where. */
const apptCard = (service: string, start: number, tz?: string) => {
  const local = tz && tz !== TZ ? new Date(start).toLocaleString("en-CA", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const row = (k: string, v: string) => `<tr><td style="padding:5px 14px 5px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:5px 0;font-size:15px">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F7FB;border-left:4px solid ${NAVY};border-radius:8px;margin:16px 0"><tr><td style="padding:14px 18px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    ${row("Consultation", `<b>${escapeHtml(service)}</b> with Aman Debesay, RCIC-IRB`)}
    ${row("Date &amp; time", `<b>${escapeHtml(fmtAB(start))}</b> (Alberta time)${local && local !== fmtAB(start, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) ? `<br><span style="color:${MUTED};font-size:13px">${escapeHtml(local)} your time</span>` : ""}`)}
    ${row("Where", "Online by Microsoft Teams (the meeting invitation is in a separate email)")}
    </table></td></tr></table>`;
};
/** Price breakdown table. Amounts in cents. */
const amountTable = (service: string, p: { full: number; off: number; gst: number; total: number; rate: number }, promoLabel?: string, promoCode?: string) => {
  const r = (k: string, v: string, b = false) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px${b ? ";font-weight:bold;color:" + NAVY : ""}">${k}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px${b ? ";font-weight:bold;color:" + NAVY : ""}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px">
    ${r(escapeHtml(service), cad(p.full / 100))}${p.off ? r(`Promo ${escapeHtml(promoCode ?? "")} (${escapeHtml(promoLabel ?? "")})`, "−" + cad(p.off / 100)) : ""}${p.gst ? r(`GST ${p.rate}%`, cad(p.gst / 100)) : ""}${r("Total (CAD)", cad(p.total / 100), true)}</table>`;
};
const manageLinks = (url: string) => `<p style="margin:4px 0 20px">${btn(url, "Change date or time", false)}&nbsp; ${btn(url + "&cancel=1", "Cancel booking", false)}</p>
  <p style="font-size:13px;color:${MUTED};margin-top:-8px">You can change or cancel online until the payment deadline. The deadline stays the same if you change the time.</p>`;
const policyNote = `<p style="font-size:13px;color:${MUTED};background:#FBF6EA;border-radius:8px;padding:12px 14px"><b style="color:#1C2333">Cancellation and refunds:</b> ${REFUND_POLICY} To cancel after paying, reply to this email or call (403) 915-4230.<br>The payment page is Stripe's; we never see or store your card number.</p>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const admin = adminClient();

  try {
    if (body.action === "probe_cancel" && await sha256(String(body.token ?? "")) === PROBE_HASH) {
      const day = new Date().toISOString();
      const list = ((await bookings(`/calendarView?start=${encodeURIComponent(day)}&end=${encodeURIComponent(new Date(Date.now() + 14 * DAY).toISOString())}`))?.value ?? []) as any[];
      const hits = list.filter((a) => (a.customers ?? []).some((c: any) => c.name === "QA Test - please ignore"));
      for (const a of hits) await bookings(`/appointments/${a.id}/cancel`, { method: "POST", body: JSON.stringify({ cancellationMessage: "Test booking cancelled." }) });
      return json(req, { cancelled: hits.length });
    }
    if (body.action === "probe" && await sha256(String(body.token ?? "")) === PROBE_HASH) {
      const out: Record<string, unknown> = {};
      for (const [k, p] of [["business", ""], ["services", "/services"], ["staff", "/staffMembers"]] as const) {
        try { out[k] = await bookings(p); } catch (e) { out[k] = String(e); }
      }
      try {
        const staffIds = (((out.staff as any)?.value ?? []) as any[]).map((x) => x.id);
        const t0 = new Date(), t1 = new Date(Date.now() + 2 * DAY);
        out.avail = await bookings("/getStaffAvailability", { method: "POST", body: JSON.stringify({ staffIds,
          startDateTime: { dateTime: t0.toISOString().slice(0, 19), timeZone: "UTC" }, endDateTime: { dateTime: t1.toISOString().slice(0, 19), timeZone: "UTC" } }) });
      } catch (e) { out.avail = String(e); }
      return json(req, out);
    }

    const cat = await catalog();
    // Consultation prices come from Products & Services in the dashboard (the two consultation items linked in
    // Business Settings; the Business Settings fees are kept equal to them by the database).
    {
      const { data: org } = await admin.from("org_settings").select("consult_fee_30, consult_fee_60, consult_item_30, consult_item_60").eq("id", 1).single();
      const itemOf = (m: number) => (m === 30 ? org?.consult_item_30 : m === 60 ? org?.consult_item_60 : null) ?? null;
      const ids = [org?.consult_item_30, org?.consult_item_60].filter(Boolean);
      const { data: its } = ids.length ? await admin.from("items").select("id, unit_price").in("id", ids) : { data: [] as any[] };
      cat.list = cat.list.map((s) => {
        const it = (its ?? []).find((i: any) => i.id === itemOf(s.minutes));
        const fee = s.minutes === 30 ? org?.consult_fee_30 : s.minutes === 60 ? org?.consult_fee_60 : null;
        return { ...s, itemId: itemOf(s.minutes), price: cat.cal || it ? Number(it?.unit_price ?? fee ?? s.price) : s.price };
      });
    }
    const when = (t: number) => ({ dateTime: new Date(t).toISOString().slice(0, 19), timeZone: "UTC" });
    const eventText = (d: Booking, payBy?: number) => `Booked on the website.\nClient: ${d.name}\nEmail: ${d.email}${d.phone ? `\nPhone: ${d.phone}` : ""}\nTime zone: ${d.tz}${d.notes ? `\n\nWhat they need help with:\n${d.notes}` : ""}` +
      (payBy ? `\n\nPayment: please pay by ${fmtAB(payBy, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (Alberta time) using the secure link we emailed you, or this time will be released.\n${REFUND_POLICY}` : "");
    const manageUrl = (token: string) => `${SITE}/public/book.html?change=${token}`;
    const makeBooking = async (service: Svc, d: Booking, staffId?: string, payBy?: number) => {
      const { start, name, email, phone, notes, tz } = d;
      const slot = { staff: staffId ?? service.staff[0] };
      const end = start + service.minutes * 60000;
      const appt = cat.cal ? await graph(`/users/${encodeURIComponent(CAL_USER)}/events`, { method: "POST", body: JSON.stringify({
        subject: `${service.name}: ${name}`, start: when(start), end: when(end), showAs: "busy", isReminderOn: true, reminderMinutesBeforeStart: 15,
        isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", attendees: [{ emailAddress: { address: email, name }, type: "required" }],
        body: { contentType: "Text", content: eventText(d, payBy) },
      }) }).then((ev: any) => ({ id: ev?.id, joinUrl: ev?.onlineMeeting?.joinUrl ?? null })) : await bookings("/appointments", { method: "POST", body: JSON.stringify({
        "@odata.type": "#microsoft.graph.bookingAppointment",
        serviceId: service.id, serviceName: service.name, staffMemberIds: [slot.staff],
        startDateTime: when(start), endDateTime: when(end), isLocationOnline: true, optOutOfCustomerEmail: false,
        customerTimeZone: tz, serviceNotes: notes ? `Client note: ${notes}` : "",
        customers: [{ "@odata.type": "#microsoft.graph.bookingCustomerInformation", name, emailAddress: email, phone, notes, timeZone: tz }],
      }) });
      const joinUrl = appt?.joinUrl ?? appt?.joinWebUrl ?? appt?.anonymousJoinWebUrl ?? null;

      const label = new Date(start).toLocaleString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      const { data: row } = await admin.from("appointments").insert({
        title: `${service.name}: ${name}`, kind: "consultation", starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
        location: "Microsoft Teams", meeting_link: joinUrl,
        notes: `Booked on the website.${payBy ? " Payment: awaiting card payment (due " + fmtAB(payBy, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ")." : ""}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}${notes ? `\n\n${notes}` : ""}`, created_by: null,
      }).select("id").single();
      await notifyTeams(admin, `📅 New website booking: ${service.name}${payBy ? " (awaiting payment)" : ""}`, `${name} · ${email}${phone ? " · " + phone : ""}\n\n${label} (Alberta time)${payBy ? "\nTo be paid within 2 hours, or it is cancelled automatically." : ""}`, HUB);
      return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), service: service.name, joinUrl, eventId: (appt?.id ?? null) as string | null, appointmentId: (row?.id ?? null) as string | null };
    };
    // Releases a hold: cancels the meeting (the client gets Outlook's cancellation), removes it from the dashboard calendar, keeps the record.
    const releaseHold = async (p: any, reason: string, mail: "timeout" | "client" | null) => {
      const { data: claim } = await admin.from("pending_bookings").update({ status: "cancelled_unpaid", cancelled_at: new Date().toISOString(), cancel_reason: reason })
        .eq("id", p.id).eq("status", "awaiting_payment").select("id");
      if (!claim?.length) return false;
      const d = p.details as Booking;
      if (p.session_id) await stripe(`checkout/sessions/${p.session_id}/expire`, {}).catch(() => null);
      try {
        const why = mail === "client" ? "The client cancelled this booking before paying." : "This booking was released because the payment was not received in time.";
        if (p.event_id && p.cal_mode !== false) await graphDeleteEvent(CAL_USER, p.event_id, why);
        else if (p.event_id) await bookings(`/appointments/${p.event_id}/cancel`, { method: "POST", body: JSON.stringify({ cancellationMessage: why }) });
      } catch (e) { console.error("release event", String(e)); }
      if (p.appointment_id) await admin.from("appointments").delete().eq("id", p.appointment_id);
      const whenTxt = fmtAB(d.start);
      const svcName = (cat.list.find((x) => x.id === d.serviceId) ?? cat.list.find((x) => `cal-${x.minutes}` === d.serviceId))?.name ?? "Consultation";
      if (mail === "timeout") await sendEmail(d.email, "Your consultation time was released", mailShell(
        `<p>Hello ${escapeHtml(d.name)},</p><p>We did not receive the payment for your consultation within the 2-hour payment window, so this time has been released. <b>You have not been charged.</b></p>
        ${apptCard(svcName, d.start, d.tz)}<p>You are welcome to book again at any time:</p>${payButton(`${SITE}/public/book.html`, "Book a new time")}<p>Questions? Reply to this email or call (403) 915-4230.</p>`,
        { title: "Your consultation time was released", sub: "The payment was not received in time", pre: "You have not been charged. You can book a new time at any time." }));
      if (mail === "client") await sendEmail(d.email, "Your consultation booking is cancelled", mailShell(
        `<p>Hello ${escapeHtml(d.name)},</p><p>As you asked, we have cancelled this booking. <b>You have not been charged.</b></p>
        ${apptCard(svcName, d.start, d.tz)}<p>Whenever you are ready, you can choose a new time:</p>${payButton(`${SITE}/public/book.html`, "Book a new time")}<p>Questions? Reply to this email or call (403) 915-4230.</p>`,
        { title: "Your booking is cancelled", sub: "You have not been charged", pre: "Your consultation booking is cancelled. You have not been charged." }));
      await notifyTeams(admin, mail === "client" ? "❌ Client cancelled an unpaid booking" : "⌛ Unpaid booking released", `${d.name} · ${d.email}\n${whenTxt} (Alberta time)\n${reason}`, HUB);
      return true;
    };
    const confirmPaid = async (sid: string): Promise<Record<string, unknown>> => {
      const sess = await stripe(`checkout/sessions/${sid}`);
      if (sess.metadata?.kind !== "booking" || !sess.metadata?.pending_id) throw new Error("Payment not found.");
      if (sess.payment_status !== "paid") return { paid: false };
      const { data: pend } = await admin.from("pending_bookings").select("*").eq("id", sess.metadata.pending_id).single();
      if (!pend) throw new Error("Booking not found.");
      const d = pend.details as Booking;
      const service = cat.list.find((x) => x.id === d.serviceId) ?? cat.list.find((x) => `cal-${x.minutes}` === d.serviceId) ?? cat.list[0];
      const { data: appt } = pend.appointment_id ? await admin.from("appointments").select("meeting_link").eq("id", pend.appointment_id).maybeSingle() : { data: null };
      const r = { start: new Date(d.start).toISOString(), end: new Date(d.start + service.minutes * 60000).toISOString(), service: service.name, joinUrl: appt?.meeting_link ?? null };
      // Claim the payment so a second confirm (page reload, sync) never records it twice.
      const late = pend.status === "cancelled_unpaid";
      const { data: claim } = await admin.from("pending_bookings").update({ paid_at: new Date().toISOString(), session_id: sid, status: late ? "paid_after_cancel" : "paid" })
        .eq("id", pend.id).is("paid_at", null).in("status", ["awaiting_payment", "cancelled_unpaid"]).select("id");
      if (claim?.length) {
        let fee = 0;
        try { const pi = await stripe(`payment_intents/${sess.payment_intent}?expand[]=latest_charge.balance_transaction`); fee = (pi.latest_charge?.balance_transaction?.fee ?? 0) / 100; } catch { /* fee unknown */ }
        const promoNote = d.promo ? ` — promo ${d.promo} (${d.promoLabel ?? `${d.percent}% off`} ${cad(Number(d.price ?? 0))})` : "";
        const { error } = await admin.rpc("stripe_record_booking", { p_session: sid, p_name: d.name, p_email: d.email, p_phone: d.phone || "", p_item: service.name,
          p_desc: `${service.name}, ${fmtAB(d.start, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} (Alberta time)${promoNote}`,
          p_net: Number(d.net ?? service.price ?? 0), p_gst: Number(d.gst ?? 0), p_fee: fee, p_date: localDate(sess.created * 1000), p_reference: `Stripe ${sess.payment_intent}` });
        if (error) console.error("stripe_record_booking", error.message);
        if (d.promo) await admin.rpc("promo_redeem", { p_code: d.promo });
        if (pend.appointment_id) {
          const { data: a } = await admin.from("appointments").select("notes").eq("id", pend.appointment_id).maybeSingle();
          if (a) await admin.from("appointments").update({ notes: String(a.notes ?? "").replace(/ Payment: awaiting card payment \(due [^)]*\)\./, " Paid by card (Stripe).") }).eq("id", pend.appointment_id);
        }
        await notifyTeams(admin, late ? "⚠️ Paid after the booking was released" : `💳 Booking paid: ${service.name}`,
          `${d.name} · ${d.email}\n${fmtAB(d.start)} (Alberta time)\n${cad((Number(d.net ?? 0) + Number(d.gst ?? 0)))} paid by card${late ? "\nThe time was already released. Please rebook the client or refund them in Stripe." : ""}`, HUB, late);
      }
      return { ok: true, paid: true, late, ...r };
    };
    if (body.action === "services") return json(req, { services: cat.list.map(({ id, name, minutes, price, description }) => ({ id, name, minutes, price, description })) });

    const service = cat.list.find((s) => s.id === String(body.serviceId ?? ""));
    const open = (from: string, to: string, ignoreEvent?: string | null) => cat.cal ? calSlots(service!.minutes, from, to, ignoreEvent) : openSlots(service!, from, to);
    // The client's private change link (only for bookings still waiting for payment).
    const byToken = async (t: unknown) => {
      const s = String(t ?? "");
      if (!/^[a-f0-9]{48,64}$/.test(s)) return null;
      const { data } = await admin.from("pending_bookings").select("*").eq("manage_token", s).maybeSingle();
      return data;
    };
    const changeable = (p: any) => p && p.status === "awaiting_payment" && Date.parse(p.pay_deadline) > Date.now();
    const notChangeable = (p: any) => !p ? "This booking link is not valid. Please check the link in your email, or call (403) 915-4230."
      : p.status === "paid" || p.status === "free" ? "This booking is already paid, so it can no longer be changed online. To change it, reply to your confirmation email or call (403) 915-4230."
      : "This booking is no longer held (it was cancelled or the payment time ran out). You can choose a new time below.";
    const serviceOf = (d: Booking) => cat.list.find((x) => x.id === d.serviceId) ?? cat.list.find((x) => `cal-${x.minutes}` === d.serviceId) ?? cat.list[0];

    /** Stripe Checkout page for a held booking. Amounts in cents. */
    const checkout = async (svc: Svc, d: Booking, p: Awaited<ReturnType<typeof pricing>>, promo: Promo | null, deadline: number, pendingId: string) => {
      const label = fmtAB(d.start, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      const back = `${SITE}/public/book.html`;
      const params: Record<string, string> = {
        mode: "payment", customer_email: d.email, "allowed_payment_method_types[0]": "card",
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "cad",
        "line_items[0][price_data][unit_amount]": String(p.net),
        "line_items[0][price_data][product_data][name]": svc.name + (promo ? ` (promo ${promo.code}: ${promo.label})` : ""),
        "line_items[0][price_data][product_data][description]": `${label} (Alberta time), online by Microsoft Teams`,
        "metadata[kind]": "booking", "metadata[pending_id]": pendingId,
        "payment_intent_data[metadata][kind]": "booking", "payment_intent_data[description]": `${svc.name}, ${label}`,
        success_url: `${back}?paid={CHECKOUT_SESSION_ID}`, cancel_url: `${back}?held=1`,
        // Stripe needs at least 30 minutes; the hold itself is released by the 5-minute job at the deadline.
        expires_at: String(Math.floor(Math.max(deadline, Date.now() + 31 * 60000) / 1000)),
      };
      if (p.gst) Object.assign(params, { "line_items[1][quantity]": "1", "line_items[1][price_data][currency]": "cad", "line_items[1][price_data][unit_amount]": String(p.gst),
        "line_items[1][price_data][product_data][name]": `GST ${p.rate}% (GST No. ${p.gstNo})` });
      return await stripe("checkout/sessions", params);
    };
    /** "Please pay" email (new booking or changed booking). */
    const payEmail = (svc: Svc, d: Booking, p: Awaited<ReturnType<typeof pricing>>, payUrl: string, deadline: number, token: string, changed = false) => {
      const due = fmtAB(deadline, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      return sendEmail(d.email, changed ? `Your consultation was moved to ${fmtAB(d.start, { month: "short", day: "numeric" })}: please pay to keep it` : `Please pay to keep your consultation on ${fmtAB(d.start, { month: "short", day: "numeric" })}`, mailShell(
        `<p>Hello ${escapeHtml(d.name)},</p><p>${changed ? "Your booking has been changed. Here is your new time:" : "Thank you for booking with Graceful Immigration. Your time is held for you:"}</p>
        ${apptCard(svc.name, d.start, d.tz)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8E8;border:1px solid #F1DDAE;border-radius:8px;margin:4px 0 6px"><tr><td style="padding:12px 16px;font-size:14.5px">
          <b>Please pay by ${escapeHtml(due)} (Alberta time)</b> to keep this time. If it is not paid by then, the booking is cancelled automatically and you are not charged.</td></tr></table>
        ${payButton(payUrl, `Pay ${cad(p.total / 100)} securely by card`)}
        ${amountTable(svc.name, p, d.promoLabel, d.promo ?? undefined)}
        <p style="font-weight:bold;color:${NAVY};margin:22px 0 8px">Need a different time?</p>${manageLinks(manageUrl(token))}
        ${policyNote}`,
        { title: changed ? "Your booking was changed" : "Your consultation time is held", sub: `Please pay by ${escapeHtml(due)} (Alberta time) to keep it`,
          pre: `Pay ${cad(p.total / 100)} by ${due} to keep your consultation. You can also change or cancel it.` }));
    };

    if (body.action === "slots") {
      if (!service) return json(req, { error: "Unknown service" }, 400);
      if (!(await rateLimit(req, admin, "booking-slots", 120, 10)).allowed) return json(req, { error: "Too many requests. Please wait a moment." }, 429);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(body.from)) ? String(body.from) : localDate(Date.now());
      const days = Math.min(Math.max(Number(body.days) || 31, 1), 42);
      const mine = body.change ? await byToken(body.change) : null;
      const slots = await open(from, addDays(from, days - 1), changeable(mine) ? mine.event_id : null);
      return json(req, { tz: TZ, minutes: service.minutes, slots: slots.map((s) => new Date(s.t).toISOString()) });
    }

    if (body.action === "book") {
      if (typeof body.website === "string" && body.website) return json(req, { ok: true });
      if (!service) return json(req, { error: "Please choose a consultation." }, 400);
      const name = String(body.name ?? "").trim().slice(0, 120), email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
      const phone = String(body.phone ?? "").trim().slice(0, 40), notes = String(body.notes ?? "").trim().slice(0, 1500);
      const tz = String(body.tz ?? TZ).slice(0, 64);
      if (name.length < 2) return json(req, { error: "Please enter your full name." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(req, { error: "Please enter a valid email address." }, 400);
      if (body.consent !== true) return json(req, { error: "Please tick the box to confirm." }, 400);
      const start = Date.parse(String(body.start ?? ""));
      if (!start) return json(req, { error: "Please choose a time." }, 400);
      const rl = await rateLimit(req, admin, "booking", 6, 60);
      if (!rl.allowed) return json(req, { error: "Too many booking attempts. Please call (403) 915-4230." }, 429);

      const day = localDate(start);
      const slot = (await open(addDays(day, -1), addDays(day, 1))).find((s) => s.t === start);
      if (!slot) return json(req, { error: "Sorry, that time was just taken. Please choose another time.", taken: true }, 409);
      const d: Booking = { serviceId: service.id, start, name, email, phone, notes, tz, inCanada: body.inCanada !== false };

      // Book first, pay within 2 hours: the time is put in the calendar now and the client is emailed a Stripe pay link.
      if (STRIPE_KEY && Number(service.price) > 0) {
        const promo = body.promo ? await findPromo(admin, body.promo, service.itemId) : null;
        if (body.promo && !promo) return json(req, { error: "That promo code is not valid or has expired.", badPromo: true }, 400);
        const p = await pricing(admin, Number(service.price), d.inCanada !== false, promo);
        Object.assign(d, { price: p.full / 100, discount: p.off / 100, net: p.net / 100, gst: p.gst / 100, promo: promo?.code ?? null, percent: promo?.percent ?? 0, promoLabel: promo?.label });

        // 100% promo: nothing to pay, book it straight away.
        if (p.total < 50) {
          const r = await makeBooking(service, d, slot.staff);
          await admin.from("pending_bookings").insert({ details: d, status: "free", booked_at: new Date().toISOString(), paid_at: new Date().toISOString(),
            event_id: r.eventId, cal_mode: cat.cal, appointment_id: r.appointmentId, promo_code: d.promo, discount: d.discount });
          if (promo) await admin.rpc("promo_redeem", { p_code: promo.code });
          return json(req, { ok: true, free: true, start: r.start, end: r.end, service: r.service, joinUrl: r.joinUrl });
        }

        const deadline = Math.min(Date.now() + HOLD_MS, start - 30 * 60000);
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
        const { data: pend, error: pe } = await admin.from("pending_bookings").insert({ details: d, pay_deadline: new Date(deadline).toISOString(),
          cal_mode: cat.cal, promo_code: d.promo, discount: d.discount, manage_token: token }).select("id").single();
        if (pe) throw new Error(pe.message);
        let sess: any;
        try { sess = await checkout(service, d, p, promo, deadline, pend.id); } catch (e) {
          console.error("stripe checkout", (e as Error).message);
          await admin.from("pending_bookings").delete().eq("id", pend.id);
          return json(req, { error: `Card payment could not start: ${(e as Error).message}` }, 502);
        }
        let r: Awaited<ReturnType<typeof makeBooking>>;
        try { r = await makeBooking(service, d, slot.staff, deadline); }
        catch (e) { await stripe(`checkout/sessions/${sess.id}/expire`, {}).catch(() => null); await admin.from("pending_bookings").delete().eq("id", pend.id); throw e; }
        await admin.from("pending_bookings").update({ session_id: sess.id, pay_url: sess.url, booked_at: new Date().toISOString(), event_id: r.eventId, appointment_id: r.appointmentId }).eq("id", pend.id);

        await payEmail(service, d, p, sess.url, deadline, token);
        return json(req, { ok: true, held: true, pay: sess.url, manage: manageUrl(token), deadline: new Date(deadline).toISOString(), total: p.total / 100, start: r.start, end: r.end, service: r.service, joinUrl: r.joinUrl });
      }
      const r = await makeBooking(service, d, slot.staff);
      return json(req, { ok: true, start: r.start, end: r.end, service: r.service, joinUrl: r.joinUrl });
    }

    // Promo code check while booking: shows the client the discounted price before they book.
    if (body.action === "promo") {
      if (!service) return json(req, { error: "Please choose a consultation." }, 400);
      if (!(await rateLimit(req, admin, "booking-promo", 20, 10)).allowed) return json(req, { error: "Too many tries. Please wait a few minutes." }, 429);
      const promo = await findPromo(admin, body.code, service.itemId);
      if (!promo) return json(req, { error: "That promo code is not valid for this consultation, or has expired." }, 400);
      const p = await pricing(admin, Number(service.price), body.inCanada !== false, promo);
      return json(req, { code: promo.code, label: promo.label, percent: promo.percent, price: p.full / 100, discount: p.off / 100, net: p.net / 100, gst: p.gst / 100, total: p.total / 100 });
    }

    // ── The client's private link: see, change or cancel an unpaid booking ──
    if (body.action === "held") {
      if (!(await rateLimit(req, admin, "booking-held", 30, 10)).allowed) return json(req, { error: "Too many requests. Please wait a moment." }, 429);
      const p = await byToken(body.token);
      if (!p) return json(req, { error: notChangeable(null) }, 404);
      const d = p.details as Booking, svc = serviceOf(d);
      return json(req, { status: changeable(p) ? "held" : p.status, message: changeable(p) ? null : notChangeable(p), service: svc.name, serviceId: svc.id, minutes: svc.minutes,
        start: new Date(d.start).toISOString(), deadline: p.pay_deadline, pay: changeable(p) ? p.pay_url : null, total: Number(d.net ?? 0) + Number(d.gst ?? 0), name: d.name });
    }

    if (body.action === "reschedule" || body.action === "cancelhold") {
      if (!(await rateLimit(req, admin, "booking-change", 10, 60)).allowed) return json(req, { error: "Too many changes. Please call (403) 915-4230." }, 429);
      const p = await byToken(body.token);
      if (!changeable(p)) return json(req, { error: notChangeable(p), status: p?.status }, 409);
      // If the client has just paid the current link, the booking is final: record the payment instead.
      if (p.session_id) {
        const cur = await stripe(`checkout/sessions/${p.session_id}`).catch(() => null);
        if (cur?.payment_status === "paid") { await confirmPaid(p.session_id); return json(req, { error: notChangeable({ status: "paid" }), status: "paid" }, 409); }
      }
      const old = p.details as Booking;

      if (body.action === "cancelhold") {
        await releaseHold(p, "Cancelled by the client before paying (from the link in their email)", "client");
        return json(req, { ok: true, cancelled: true });
      }

      if (!service) return json(req, { error: "Please choose a consultation." }, 400);
      const start = Date.parse(String(body.start ?? ""));
      if (!start) return json(req, { error: "Please choose a time." }, 400);
      if (start === old.start && service.id === old.serviceId) return json(req, { error: "That is already your booked time." }, 400);
      const day = localDate(start);
      const slot = (await open(addDays(day, -1), addDays(day, 1), p.event_id)).find((s) => s.t === start);
      if (!slot) return json(req, { error: "Sorry, that time was just taken. Please choose another time.", taken: true }, 409);

      // Same payment deadline as before (changing the time never extends it).
      const deadline = Math.min(Date.parse(p.pay_deadline), start - 30 * 60000);
      const promo = old.promo ? await findPromo(admin, old.promo, service.itemId) : null;
      const pr = await pricing(admin, Number(service.price), old.inCanada !== false, promo);
      const d: Booking = { ...old, serviceId: service.id, start, tz: String(body.tz ?? old.tz).slice(0, 64), price: pr.full / 100, discount: pr.off / 100, net: pr.net / 100, gst: pr.gst / 100,
        promo: promo?.code ?? null, percent: promo?.percent ?? 0, promoLabel: promo?.label };
      let sess: any;
      try { sess = await checkout(service, d, pr, promo, deadline, p.id); }
      catch (e) { return json(req, { error: `Card payment could not start: ${(e as Error).message}` }, 502); }

      // Move the meeting: the client receives Outlook's updated invitation and the Teams link stays the same.
      const end = start + service.minutes * 60000;
      try {
        if (p.event_id && p.cal_mode !== false) await graph(`/users/${encodeURIComponent(CAL_USER)}/events/${encodeURIComponent(p.event_id)}`, { method: "PATCH", body: JSON.stringify({
          subject: `${service.name}: ${d.name}`, start: when(start), end: when(end), body: { contentType: "Text", content: eventText(d, deadline) } }) });
        else if (p.event_id) await bookings(`/appointments/${p.event_id}`, { method: "PATCH", body: JSON.stringify({ "@odata.type": "#microsoft.graph.bookingAppointment",
          serviceId: service.id, serviceName: service.name, startDateTime: when(start), endDateTime: when(end) }) });
      } catch (e) { await stripe(`checkout/sessions/${sess.id}/expire`, {}).catch(() => null); throw e; }

      // The old pay link must not work any more.
      if (p.session_id) await stripe(`checkout/sessions/${p.session_id}/expire`, {}).catch(async () => {
        const o = await stripe(`checkout/sessions/${p.session_id}`).catch(() => null);
        if (o?.payment_status === "paid") await notifyTeams(admin, "⚠️ Paid while changing the time", `${d.name} · ${d.email}\nThey paid the earlier link while moving the booking to ${fmtAB(start)} (Alberta time). Check the amount in Stripe.`, HUB, true);
      });
      await admin.from("pending_bookings").update({ details: d, session_id: sess.id, pay_url: sess.url, pay_deadline: new Date(deadline).toISOString(),
        promo_code: d.promo, discount: d.discount }).eq("id", p.id).eq("status", "awaiting_payment");
      if (p.appointment_id) {
        const { data: a } = await admin.from("appointments").select("notes").eq("id", p.appointment_id).maybeSingle();
        await admin.from("appointments").update({ title: `${service.name}: ${d.name}`, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
          notes: `${String(a?.notes ?? "")}\nChanged by the client on the website (was ${fmtAB(old.start, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}).` }).eq("id", p.appointment_id);
      }
      await payEmail(service, d, pr, sess.url, deadline, p.manage_token, true);
      await notifyTeams(admin, `🔁 Website booking changed: ${service.name}`, `${d.name} · ${d.email}\nNow: ${fmtAB(start)} (Alberta time)\nWas: ${fmtAB(old.start)}\nStill awaiting payment.`, HUB);
      return json(req, { ok: true, held: true, pay: sess.url, manage: manageUrl(p.manage_token), deadline: new Date(deadline).toISOString(), total: pr.total / 100,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), service: service.name });
    }

    // Every 5 minutes (scheduled job): a reminder about 35 minutes before the deadline, then release unpaid holds.
    // Only holds already past their deadline are touched, so calling it early does nothing harmful.
    if (body.action === "expire") {
      if (!(await rateLimit(req, admin, "booking-expire", 30, 10)).allowed) return json(req, { error: "Too many requests" }, 429);
      const now = Date.now();
      let released = 0, paid = 0, reminded = 0;
      const { data: due } = await admin.from("pending_bookings").select("*").eq("status", "awaiting_payment").lt("pay_deadline", new Date(now).toISOString()).limit(20);
      for (const p of due ?? []) {
        try {
          if (p.session_id) {
            const s = await stripe(`checkout/sessions/${p.session_id}`).catch(() => null);
            if (s?.payment_status === "paid") { await confirmPaid(p.session_id); paid++; continue; }
          }
          if (await releaseHold(p, "Not paid within 2 hours of booking", "timeout")) released++;
        } catch (e) { console.error("expire", p.id, String(e)); }
      }
      const { data: soon } = await admin.from("pending_bookings").select("*").eq("status", "awaiting_payment").is("reminder_sent_at", null)
        .gt("pay_deadline", new Date(now).toISOString()).lt("pay_deadline", new Date(now + 40 * 60000).toISOString()).limit(20);
      for (const p of soon ?? []) {
        const { data: claim } = await admin.from("pending_bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", p.id).is("reminder_sent_at", null).select("id");
        if (!claim?.length || !p.pay_url) continue;
        const d = p.details as Booking;
        const dueT = escapeHtml(fmtAB(Date.parse(p.pay_deadline), { hour: "numeric", minute: "2-digit" }));
        await sendEmail(d.email, "Reminder: please pay to keep your consultation", mailShell(
          `<p>Hello ${escapeHtml(d.name)},</p><p>Your consultation is not paid yet. Please pay by <b>${dueT}</b> (Alberta time), or the time will be released.</p>
          ${apptCard(serviceOf(d).name, d.start, d.tz)}
          ${payButton(p.pay_url, `Pay ${cad(Number(d.net ?? 0) + Number(d.gst ?? 0))} securely by card`)}
          ${p.manage_token ? `<p style="font-weight:bold;color:${NAVY};margin:22px 0 8px">Need a different time?</p>${manageLinks(manageUrl(p.manage_token))}` : ""}${policyNote}`,
          { title: "Reminder: your payment is due soon", sub: `Please pay by ${dueT} (Alberta time) to keep your time`, pre: `Your consultation time will be released at ${fmtAB(Date.parse(p.pay_deadline), { hour: "numeric", minute: "2-digit" })} if it is not paid.` }));
        reminded++;
      }
      return json(req, { released, paid, reminded });
    }

    // After Stripe payment: check the payment with Stripe and record the money (only once).
    if (body.action === "confirm") {
      const sid = String(body.session ?? "");
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid) || !STRIPE_KEY) return json(req, { error: "Payment not found." }, 400);
      return json(req, await confirmPaid(sid));
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    console.error("booking", e);
    return json(req, { error: friendly(e), setup: /Unauthorized|Forbidden|denied|: (401|403|500)$/i.test(String(e)) }, 502);
  }
});
