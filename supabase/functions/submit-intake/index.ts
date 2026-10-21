// Receives an assessment from the public website (or from staff in the dashboard),
// triages it, files it under a CRM contact, creates a review task and notifies the office.
import { adminClient, callerProfile, corsHeaders, escapeHtml, hasPerm, json, rateLimit, sendEmail } from "../_shared/common.ts";
import { Answers, triage } from "../_shared/triage.ts";

const TEXT_KEYS = ["fullName", "email", "phone", "contactPref", "language", "languageOther", "location", "status",
  "citizenship", "firstEntryDate", "entryMethod", "cameFromUS", "claimMade", "claimDate", "bocSubmitted", "hearingDate",
  "decisionReceived", "decisionDate", "decisionFrom", "decisionDeadline", "removalOrder", "permitExpiry",
  "priorRefusals", "criminal", "misrep", "otherRep", "notes"];
const LIST_KEYS = ["services", "familyOnApp"];
const DATE_KEYS = ["firstEntryDate", "claimDate", "hearingDate", "decisionDate", "decisionDeadline", "permitExpiry"];

function clean(raw: Record<string, unknown>) {
  const a: Record<string, unknown> = {};
  for (const k of TEXT_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) a[k] = v.trim().slice(0, k === "notes" ? 600 : 200);
  }
  for (const k of LIST_KEYS) {
    const v = raw[k];
    if (Array.isArray(v)) a[k] = v.filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 40)).slice(0, 20);
    else a[k] = [];
  }
  for (const k of DATE_KEYS) if (a[k] && !/^\d{4}-\d{2}-\d{2}$/.test(a[k] as string)) delete a[k];
  return a;
}

function cleanRows(raw: unknown): [string, string][] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60)
    .filter((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && typeof r[1] === "string")
    .map((r) => [String(r[0]).slice(0, 120), String(r[1]).slice(0, 1000)] as [string, string]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const admin = adminClient();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }

  // Spam trap: pretend success
  if (typeof body.website === "string" && body.website) return json(req, { ok: true });

  const staff = await callerProfile(req, admin);
  const isStaff = !!staff && staff.role !== "client" && await hasPerm(admin, staff.role, "intake.view");
  if (!isStaff) {
    const rl = await rateLimit(req, admin, "intake", 5, 60);
    if (!rl.allowed) return json(req, { error: "Too many submissions. Please call us instead." }, 429);
  }

  const answers = clean((body.answers ?? {}) as Record<string, unknown>);
  const rows = cleanRows(body.rows);
  const fullName = answers.fullName as string | undefined;
  const email = (answers.email as string | undefined)?.toLowerCase();
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json(req, { error: "Name and a valid email are required." }, 400);
  }
  const consents = Array.isArray(body.consents) ? body.consents : [];
  if (!isStaff && !["privacy", "notClient", "secure"].every((c) => consents.includes(c))) {
    return json(req, { error: "All consent boxes must be ticked." }, 400);
  }

  // Dates are compared in the practice's local time (Lethbridge)
  const localToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  const t = triage(answers as Answers, new Date(localToday + "T00:00:00Z"));
  const services = (answers.services as string[]) ?? [];
  const language = answers.language === "other" ? (answers.languageOther as string) : (answers.language as string);

  // File under an existing contact (matched by email) or create one
  const { data: existing } = await admin.from("contacts").select("id, priority, stage").eq("email", email).maybeSingle();
  const rank = { RED: 3, AMBER: 2, GREEN: 1 } as const;
  const contactFields = {
    full_name: fullName,
    phone: (answers.phone as string) ?? null,
    citizenship: (answers.citizenship as string) ?? null,
    language: language ?? null,
    contact_pref: (answers.contactPref as string) ?? null,
    location: (answers.location as string) ?? null,
    status_in_canada: (answers.status as string) ?? null,
    services,
  };
  let contactId: string;
  if (existing) {
    const priority = !existing.priority || rank[t.level] > rank[existing.priority as keyof typeof rank] ? t.level : existing.priority;
    await admin.from("contacts").update({ ...contactFields, priority }).eq("id", existing.id);
    contactId = existing.id;
  } else {
    const { data: created, error } = await admin.from("contacts").insert({
      ...contactFields, email, priority: t.level, source: isStaff ? "staff" : "website",
      created_by: isStaff ? staff!.id : null,
    }).select("id").single();
    if (error) return json(req, { error: "Could not save your request. Please call us." }, 500);
    contactId = created.id;
  }

  const { data: submission, error: subErr } = await admin.from("intake_submissions").insert({
    contact_id: contactId,
    form_version: String(body.form_version ?? "intake-v1").slice(0, 40),
    answers, rows, triage_level: t.level, triage: { red: t.red, amber: t.amber, notes: t.notes },
    source: isStaff ? "staff" : "website",
    submitted_by: isStaff ? staff!.id : null,
  }).select("id").single();
  if (subErr) return json(req, { error: "Could not save your request. Please call us." }, 500);

  // Review task for the owner, due sooner for urgent files
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").eq("active", true).order("created_at").limit(1).maybeSingle();
  const due = new Date(Date.parse(localToday + "T00:00:00Z") + (t.level === "RED" ? 0 : t.level === "AMBER" ? 1 : 2) * 86400000).toISOString().slice(0, 10);
  await admin.from("tasks").insert({
    contact_id: contactId,
    title: `Review ${t.level} assessment — ${fullName}`,
    due_date: due,
    priority: t.level === "RED" ? "urgent" : t.level === "AMBER" ? "high" : "normal",
    assigned_to: owner?.id ?? null,
  });

  // Notify the office
  const { data: settings } = await admin.from("org_settings").select("notify_email").eq("id", 1).single();
  if (settings?.notify_email) {
    const flagList = (label: string, items: string[]) => items.length
      ? `<p><strong>${label}</strong></p><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "";
    const colors = { RED: "#A63A2B", AMBER: "#8A5A00", GREEN: "#2D6A3E" };
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
      <h2 style="margin:0 0 8px">New assessment: ${escapeHtml(fullName)}</h2>
      <p><span style="background:${colors[t.level]};color:#fff;padding:3px 12px;border-radius:12px;font-weight:bold">${t.level}</span></p>
      ${flagList("Red flags", t.red)}${flagList("Amber flags", t.amber)}${flagList("Notes", t.notes)}
      <table style="border-collapse:collapse;width:100%;margin-top:12px">${rows.map(([k, v]) =>
        `<tr><td style="padding:6px;border-bottom:1px solid #eee;color:#666;width:40%">${escapeHtml(k)}</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(v)}</td></tr>`).join("")}</table>
      <p style="margin-top:16px"><a href="https://gracefulimmigration.ca/app/#/assessments/${submission.id}">Open in dashboard</a></p></div>`;
    await sendEmail(settings.notify_email, `New assessment (${t.level}): ${fullName}`, html);
  }

  return json(req, { ok: true, urgent: t.level === "RED", id: isStaff ? submission.id : undefined });
});
