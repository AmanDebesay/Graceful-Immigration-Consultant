// Pulls the Business Profile's rating, review count and latest reviews from the Google Places API (New)
// into the website's review list. Needs the GOOGLE_PLACES_API_KEY secret and the place ID in review settings.
// Google returns up to 5 recent reviews; reviews already in the list keep their show/hide choice.
import { adminClient, callerProfile, corsHeaders, hasPerm, json } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller || !(await hasPerm(admin, caller.role, "settings.manage"))) return json(req, { error: "Not allowed" }, 403);
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return json(req, { error: "Automatic sync isn't set up yet (a Google Places API key is needed). You can add reviews by hand meanwhile." }, 503);
  const { data: s } = await admin.from("review_summary").select("place_id").eq("id", 1).single();
  if (!s?.place_id) return json(req, { error: "Add your Google place ID first." }, 400);

  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(s.place_id)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
  });
  const p = await r.json();
  if (!r.ok) return json(req, { error: `Google: ${p.error?.message ?? r.status}` }, 502);

  const writeUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(s.place_id)}`;
  await admin.from("review_summary").update({ rating: p.rating ?? 5, review_count: p.userRatingCount ?? 0, reviews_url: p.googleMapsUri ?? null, write_review_url: writeUrl, synced_at: new Date().toISOString() }).eq("id", 1);
  let added = 0;
  for (const rv of p.reviews ?? []) {
    const row = {
      external_id: rv.name, author: (rv.authorAttribution?.displayName ?? "Google user").slice(0, 80), rating: rv.rating ?? 5,
      body: (rv.originalText?.text ?? rv.text?.text ?? "").slice(0, 3000), review_date: (rv.publishTime ?? "").slice(0, 10) || null,
      avatar_url: rv.authorAttribution?.photoUri?.startsWith("https://") ? rv.authorAttribution.photoUri : null, source: "google",
    };
    const { data: existing } = await admin.from("site_reviews").select("id").eq("external_id", rv.name).maybeSingle();
    if (existing) await admin.from("site_reviews").update(row).eq("id", existing.id);
    else { await admin.from("site_reviews").insert(row); added++; }
  }
  return json(req, { ok: true, rating: p.rating, count: p.userRatingCount, added });
});
