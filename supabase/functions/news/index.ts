// Public news for the homepage: official IRCC news releases (Government of Canada news feed) and recent
// immigration headlines from major Canadian media (via Google News RSS, limited to trusted outlets).
// Cached for 2 hours so visitors never wait on the feeds.
import { adminClient, corsHeaders, json } from "../_shared/common.ts";

const IRCC = "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=50&format=atom";
const OUTLETS = ["cbc.ca", "ctvnews.ca", "globalnews.ca", "theglobeandmail.com", "thecanadianpress.com", "cp24.com"];
const MEDIA = "https://news.google.com/rss/search?q=" + encodeURIComponent(
  `Canada immigration (IRCC OR "permanent residents" OR refugees OR "study permit" OR "work permit" OR citizenship) when:30d (${OUTLETS.map((o) => "site:" + o).join(" OR ")})`,
) + "&hl=en-CA&gl=CA&ceid=CA:en";
const RELEVANT = /immigra|refugee|asylum|resettle|permanent resid|\bPR\b|citizenship|visa|study permit|work permit|foreign worker|international student|IRCC|express entry|newcomer|francophone|caregiver|deport|border/i;
const TTL_MS = 2 * 60 * 60 * 1000;

const dec = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, "").trim();
const tag = (block: string, t: string) => dec((block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) ?? [])[1] ?? "");

async function fetchText(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (GracefulImmigration news widget)" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

async function ircc() {
  const xml = await fetchText(IRCC);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    title: tag(e, "title"), url: (e.match(/<link href="([^"]+)"/) ?? [])[1] ?? "", date: tag(e, "updated").slice(0, 10),
    summary: tag(e, "summary").replace(/^[A-Z][a-z]+ \d{1,2}, \d{4}\s*[—-]\s*[^—]*—\s*/, "").slice(0, 220),
    type: tag(e, "category") || (e.match(/<category term="([^"]+)"/) ?? [])[1] || "",
  })).filter((x) => x.title && x.url.startsWith("https://www.canada.ca/") && !/media advisor/i.test(x.type)
    && !/to make an announcement|media advisory/i.test(x.title) && RELEVANT.test(`${x.title} ${x.summary}`)).slice(0, 10);
}

async function media() {
  const xml = await fetchText(MEDIA);
  const seen = new Set<string>();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, i]) => {
    const raw = tag(i, "title"), source = tag(i, "source");
    return { title: raw.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), ""), source, url: tag(i, "link"), date: new Date(tag(i, "pubDate")).toISOString().slice(0, 10) };
  }).filter((x) => x.title && x.url.startsWith("https://") && RELEVANT.test(x.title) && !seen.has(x.title) && seen.add(x.title)).slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const admin = adminClient();
  const { data: cached } = await admin.from("news_cache").select("payload, fetched_at").eq("key", "home").maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
    return new Response(JSON.stringify(cached.payload), { headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } });
  }
  const [a, b] = await Promise.allSettled([ircc(), media()]);
  const payload = {
    ircc: a.status === "fulfilled" ? a.value : (cached?.payload as any)?.ircc ?? [],
    media: b.status === "fulfilled" ? b.value : (cached?.payload as any)?.media ?? [],
    updated: new Date().toISOString(),
  };
  if (payload.ircc.length || payload.media.length) await admin.from("news_cache").upsert({ key: "home", payload, fetched_at: new Date().toISOString() });
  return new Response(JSON.stringify(payload), { headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } });
});
