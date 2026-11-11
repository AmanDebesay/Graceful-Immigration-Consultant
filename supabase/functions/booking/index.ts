// Public booking on the website, backed by Microsoft Bookings: the website shows open times and books them;
// Bookings adds the meeting to the Outlook calendar, creates the Teams link and emails the client.
// Actions: services | slots { serviceId, from, days } | book { serviceId, start, name, email, phone, notes, tz, consent }.
import { adminClient, corsHeaders, json, rateLimit, sha256 } from "../_shared/common.ts";
import { bookings, graph, HUB, notifyTeams } from "../_shared/m365.ts";

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
const CAL_SERVICES = [30, 60].map((m) => ({ id: `cal-${m}`, name: m === 30 ? "30-Minute Consultation" : "1-Hour Consultation", minutes: m, price: m, description: "",
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
async function calSlots(minutes: number, from: string, to: string) {
  const now = Date.now(), startT = Math.max(zoned(from, "00:00"), now), endT = zoned(addDays(to, 1), "00:00");
  if (endT <= startT) return [];
  // Times are exchanged with Outlook in UTC only, so a time-zone name can never be read with different rules
  // (Alberta now stays on UTC-6 all year; older systems still assume a November change).
  const d = await graph(`/users/${encodeURIComponent(CAL_USER)}/calendarView?startDateTime=${encodeURIComponent(new Date(startT - DAY).toISOString())}&endDateTime=${encodeURIComponent(new Date(endT + DAY).toISOString())}&$top=500&$select=start,end,showAs,isCancelled,isAllDay`,
    { headers: { Prefer: 'outlook.timezone="UTC"' } });
  const utc = (x: any) => Date.parse(String(x.dateTime).replace(/\.\d+$/, "") + "Z");
  const busy = ((d?.value ?? []) as any[]).filter((e) => !e.isCancelled && e.showAs !== "free")
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

type Svc = { id: string; name: string; minutes: number; price: number | null; description: string; staff: string[]; pre: number; post: number; policy: any };
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
    if (body.action === "services") return json(req, { services: cat.list.map(({ id, name, minutes, price, description }) => ({ id, name, minutes, price, description })) });

    const service = cat.list.find((s) => s.id === String(body.serviceId ?? ""));
    const open = (from: string, to: string) => cat.cal ? calSlots(service!.minutes, from, to) : openSlots(service!, from, to);

    if (body.action === "slots") {
      if (!service) return json(req, { error: "Unknown service" }, 400);
      if (!(await rateLimit(req, admin, "booking-slots", 120, 10)).allowed) return json(req, { error: "Too many requests. Please wait a moment." }, 429);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(body.from)) ? String(body.from) : localDate(Date.now());
      const days = Math.min(Math.max(Number(body.days) || 31, 1), 42);
      const slots = await open(from, addDays(from, days - 1));
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

      const end = start + service.minutes * 60000;
      const when = (t: number) => ({ dateTime: new Date(t).toISOString().slice(0, 19), timeZone: "UTC" });
      const appt = cat.cal ? await graph(`/users/${encodeURIComponent(CAL_USER)}/events`, { method: "POST", body: JSON.stringify({
        subject: `${service.name}: ${name}`, start: when(start), end: when(end), showAs: "busy", isReminderOn: true, reminderMinutesBeforeStart: 15,
        isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness", attendees: [{ emailAddress: { address: email, name }, type: "required" }],
        body: { contentType: "Text", content: `Booked on the website.\nClient: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}\nTime zone: ${tz}${notes ? `\n\nWhat they need help with:\n${notes}` : ""}` },
      }) }).then((ev: any) => ({ joinUrl: ev?.onlineMeeting?.joinUrl ?? null })) }) : await bookings("/appointments", { method: "POST", body: JSON.stringify({
        "@odata.type": "#microsoft.graph.bookingAppointment",
        serviceId: service.id, serviceName: service.name, staffMemberIds: [slot.staff],
        startDateTime: when(start), endDateTime: when(end), isLocationOnline: true, optOutOfCustomerEmail: false,
        customerTimeZone: tz, serviceNotes: notes ? `Client note: ${notes}` : "",
        customers: [{ "@odata.type": "#microsoft.graph.bookingCustomerInformation", name, emailAddress: email, phone, notes, timeZone: tz }],
      }) });
      const joinUrl = appt?.joinUrl ?? appt?.joinWebUrl ?? appt?.anonymousJoinWebUrl ?? null;

      const label = new Date(start).toLocaleString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      await admin.from("appointments").insert({
        title: `${service.name}: ${name}`, kind: "consultation", starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
        location: "Microsoft Teams", meeting_link: joinUrl,
        notes: `Booked on the website.\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}${notes ? `\n\n${notes}` : ""}`, created_by: null,
      });
      await notifyTeams(admin, `📅 New website booking: ${service.name}`, `${name} · ${email}${phone ? " · " + phone : ""}\n\n${label} (Alberta time)`, HUB);
      return json(req, { ok: true, start: new Date(start).toISOString(), end: new Date(end).toISOString(), service: service.name, joinUrl });
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    console.error("booking", e);
    return json(req, { error: friendly(e), setup: /Unauthorized|Forbidden|denied|: (401|403|500)$/i.test(String(e)) }, 502);
  }
});
