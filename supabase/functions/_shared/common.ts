import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://gracefulimmigration.ca",
  "https://www.gracefulimmigration.ca",
  "https://amandebesay.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const COMPANY_DOMAIN = "gracefulimmigration.ca";
export const isCompanyEmail = (e?: string | null) => !!e && e.toLowerCase().endsWith("@" + COMPANY_DOMAIN);

/** Returns the signed-in staff user making the request, or null. */
export async function callerProfile(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !token.includes(".")) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, email, full_name, role, active").eq("id", data.user.id).single();
  if (!profile || !profile.active) return null;
  // Staff access only for company email addresses (checked against the auth email, not the profile copy).
  if (profile.role !== "client" && !isCompanyEmail(data.user.email)) return null;
  return profile as { id: string; email: string; full_name: string; role: string; active: boolean };
}

export async function hasPerm(admin: SupabaseClient, role: string, perm: string): Promise<boolean> {
  if (role === "owner") return true;
  const { data } = await admin.from("role_permissions").select("permission").eq("role", role).eq("permission", perm).maybeSingle();
  return !!data;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Simple sliding-window limit per IP. Returns true when the request is allowed. */
export async function rateLimit(req: Request, admin: SupabaseClient, bucket: string, max: number, windowMinutes: number) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const key = await sha256(`${bucket}:${ip}:${Deno.env.get("SUPABASE_URL")}`);
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count } = await admin.from("rate_limits").select("id", { count: "exact", head: true })
    .eq("bucket", bucket).eq("key_hash", key).gte("created_at", since);
  if ((count ?? 0) >= max) return { allowed: false, key };
  await admin.from("rate_limits").insert({ bucket, key_hash: key });
  return { allowed: true, key };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Sends a system email: through Microsoft 365 when connected (from the shared mailbox), otherwise
    through Resend when RESEND_API_KEY is configured. Never throws. */
export async function sendEmail(to: string | string[], subject: string, html: string, text?: string): Promise<boolean> {
  const { graphConfigured, graphSendMail } = await import("./m365.ts");
  if (graphConfigured()) {
    try {
      const { data } = await adminClient().from("integration_settings").select("shared_mailbox").eq("id", 1).single();
      await graphSendMail({ from: data?.shared_mailbox ?? "info@gracefulimmigration.ca", to: Array.isArray(to) ? to : [to], subject, html });
      return true;
    } catch (e) {
      console.error("Microsoft 365 send failed", e);
    }
  }
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("EMAIL_FROM") ?? "Graceful Immigration <notifications@gracefulimmigration.ca>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
