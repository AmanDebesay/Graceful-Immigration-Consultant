// Invites a staff member (or client) by email and assigns their role. Caller needs the staff.manage permission.
import { adminClient, callerProfile, corsHeaders, hasPerm, json } from "../_shared/common.ts";

const ROLES = ["owner", "rcic", "case_manager", "bookkeeper", "assistant", "client"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();

  const caller = await callerProfile(req, admin);
  if (!caller || !(await hasPerm(admin, caller.role, "staff.manage"))) return json(req, { error: "Not allowed" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim().slice(0, 120);
  const jobTitle = String(body.job_title ?? "").trim().slice(0, 80) || null;
  const role = String(body.role ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(req, { error: "Enter a valid email address." }, 400);
  if (!fullName) return json(req, { error: "Enter the person's name." }, 400);
  if (!ROLES.includes(role)) return json(req, { error: "Choose a role." }, 400);
  if (role === "owner" && caller.role !== "owner") return json(req, { error: "Only an owner can invite another owner." }, 403);

  const origin = req.headers.get("origin") ?? "https://gracefulimmigration.ca";
  const redirectTo = `${origin.includes("github.io") ? origin + "/Graceful-Immigration-Consultant" : origin}/app/`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo });
  if (error) {
    const msg = /already/i.test(error.message) ? "Someone with this email already has an account." : error.message;
    return json(req, { error: msg }, 400);
  }
  const userId = data.user.id;
  await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
  await admin.from("profiles").upsert({ id: userId, email, full_name: fullName, job_title: jobTitle, role, active: true });
  await admin.from("audit_log").insert({
    actor_id: caller.id, action: "invited", entity: "profile", entity_id: userId, details: { email, role },
  });
  return json(req, { ok: true, id: userId });
});
