// Public booking on the website, backed by Microsoft Bookings: the website shows open times and books them;
// Bookings adds the meeting to the Outlook calendar, creates the Teams link and emails the client.
// Actions: services | slots { serviceId, from, days } | book { serviceId, start, name, email, phone, notes, tz, consent }.
import { adminClient, corsHeaders, json, rateLimit, sha256 } from "../_shared/common.ts";
import { bookings, HUB, notifyTeams } from "../_shared/m365.ts";

const TZ = "America/Edmonton";
const DAY = 864e5;
// Safety net: never offer times outside 7 am – 9 pm Alberta time, whatever Bookings reports.
const EARLIEST_HOUR = 7, LATEST_END_HOUR = 21;
const albertaHour = (t: number) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t)).split(":"); return +p[0] + +p[1] / 60; };
const PROBE_HASH = "04ddbf5c9f6397165cd28bb526190a512983af86b8c13a3e58b780b2779bf847";

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

    if (body.action === "services") return json(req, { services: (await publicServices()).map(({ id, name, minutes, price, description }) => ({ id, name, minutes, price, description })) });

    const service = (await publicServices()).find((s) => s.id === String(body.serviceId ?? ""));

    if (body.action === "slots") {
      if (!service) return json(req, { error: "Unknown service" }, 400);
      if (!(await rateLimit(req, admin, "booking-slots", 120, 10)).allowed) return json(req, { error: "Too many requests. Please wait a moment." }, 429);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(body.from)) ? String(body.from) : localDate(Date.now());
      const days = Math.min(Math.max(Number(body.days) || 31, 1), 42);
      const slots = await openSlots(service, from, addDays(from, days - 1));
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
      const slot = (await openSlots(service, addDays(day, -1), addDays(day, 1))).find((s) => s.t === start);
      if (!slot) return json(req, { error: "Sorry, that time was just taken. Please choose another time.", taken: true }, 409);

      const end = start + service.minutes * 60000;
      const when = (t: number) => ({ dateTime: new Date(t).toISOString().slice(0, 19), timeZone: "UTC" });
      const appt = await bookings("/appointments", { method: "POST", body: JSON.stringify({
        "@odata.type": "#microsoft.graph.bookingAppointment",
        serviceId: service.id, serviceName: service.name, staffMemberIds: [slot.staff],
        startDateTime: when(start), endDateTime: when(end), isLocationOnline: true, optOutOfCustomerEmail: false,
        customerTimeZone: tz, serviceNotes: notes ? `Client note: ${notes}` : "",
        customers: [{ "@odata.type": "#microsoft.graph.bookingCustomerInformation", name, emailAddress: email, phone, notes, timeZone: tz }],
      }) });
      const joinUrl = appt?.joinWebUrl ?? appt?.anonymousJoinWebUrl ?? null;

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
