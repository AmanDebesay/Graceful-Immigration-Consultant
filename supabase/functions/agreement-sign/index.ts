// Public endpoint for clients to view and e-sign an agreement using their private link token.
import { adminClient, corsHeaders, escapeHtml, json, rateLimit, sendEmail } from "../_shared/common.ts";
import { HUB, notifyTeams } from "../_shared/m365.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }

  const token = String(body.token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json(req, { error: "This signing link is not valid." }, 400);
  const rl = await rateLimit(req, admin, "agreement", 60, 60);
  if (!rl.allowed) return json(req, { error: "Too many attempts. Please try again later." }, 429);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);

  if (body.action === "view") {
    const { data, error } = await admin.rpc("client_view_agreement", { p_token: token, p_ip: ip, p_ua: ua });
    if (error) return json(req, { error: error.message }, 400);
    return json(req, data);
  }

  if (body.action === "sign") {
    if (body.consent !== true) return json(req, { error: "Please confirm that you agree to sign electronically." }, 400);
    const { data, error } = await admin.rpc("client_sign_agreement", {
      p_token: token, p_name: String(body.name ?? "").slice(0, 120), p_signature: String(body.signature ?? ""),
      p_initials: String(body.initials ?? "").slice(0, 8), p_ip: ip, p_ua: ua,
    });
    if (error) return json(req, { error: error.message }, 400);
    const { data: s } = await admin.from("org_settings").select("notify_email").eq("id", 1).single();
    if (s?.notify_email) {
      await sendEmail(s.notify_email, `Agreement ${data.number} ${data.complete ? "signed" : "signed by one client"}`,
        `<p><b>${escapeHtml(String(body.name))}</b> signed <b>${escapeHtml(data.title)}</b> (${escapeHtml(data.number)}).${data.complete ? "" : " Other clients on this joint agreement still need to sign."}</p>
         <p><a href="https://gracefulimmigration.ca/app/#/agreements/${data.id}">Open in dashboard</a></p>`);
    }
    await notifyTeams(admin, data.complete ? "✍️ Agreement signed by client" : "✍️ Joint agreement: one client signed",
      data.complete ? `Agreement ${data.number} was signed. Next: invoice and open the case file.` : `${String(body.name)} signed agreement ${data.number}. Waiting for the other clients.`, `${HUB}#/agreements/${data.id}`);
    return json(req, { ok: true });
  }
  return json(req, { error: "Unknown action" }, 400);
});
