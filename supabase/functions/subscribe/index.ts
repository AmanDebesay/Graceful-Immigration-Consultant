// Newsletter sign-up (CASL: records the exact consent wording and time) and one-click unsubscribe.
import { adminClient, corsHeaders, json, rateLimit } from "../_shared/common.ts";

const CONSENT_TEXT = "I agree to receive immigration news and updates by email from Graceful Immigration Consultant Inc. I can unsubscribe at any time.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }

  if (body.action === "unsubscribe") {
    const token = String(body.token ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json(req, { error: "Invalid link" }, 400);
    await admin.from("newsletter_subscribers").update({ unsubscribed_at: new Date().toISOString() }).eq("unsubscribe_token", token);
    return json(req, { ok: true });
  }

  if (typeof body.website === "string" && body.website) return json(req, { ok: true });
  const rl = await rateLimit(req, admin, "subscribe", 10, 60);
  if (!rl.allowed) return json(req, { error: "Too many requests. Please try again later." }, 429);

  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(req, { error: "Enter a valid email address." }, 400);
  if (body.consent !== true) return json(req, { error: "Please tick the consent box." }, 400);

  const fullName = String(body.full_name ?? "").trim().slice(0, 120) || null;
  const language = String(body.language ?? "").trim().slice(0, 40) || null;
  const { data: existing } = await admin.from("newsletter_subscribers").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await admin.from("newsletter_subscribers").update({
      unsubscribed_at: null, consent_text: CONSENT_TEXT, consent_at: new Date().toISOString(),
      full_name: fullName, language,
    }).eq("id", existing.id);
  } else {
    await admin.from("newsletter_subscribers").insert({
      email, full_name: fullName, language, consent_text: CONSENT_TEXT, source: String(body.source ?? "website").slice(0, 40),
    });
  }
  return json(req, { ok: true });
});
