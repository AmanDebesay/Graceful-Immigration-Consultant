// Online card payments for invoices through Stripe Checkout. The card is typed on Stripe's own page;
// card numbers never reach this site. Payments are confirmed by asking Stripe directly (no webhook secret needed).
// Public (pay link):  info {i,k} · checkout {i,k} · confirm {i,k,session} · find {number,email} -> {i,k} ("Pay an invoice" page)
// Staff (signed in):  sync — records any paid Stripe sessions from the last 7 days that were not recorded yet.
import { adminClient, callerProfile, corsHeaders, hasPerm, json, rateLimit } from "../_shared/common.ts";

const SITE = "https://gracefulimmigration.ca";
const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

async function stripe(path: string, params?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { Authorization: `Bearer ${KEY}`, ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Stripe error");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!KEY) return json(req, { error: "Online payment is not set up yet." }, 503);
  const admin = adminClient();
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }

  // Records a session Stripe says is paid. Safe to repeat: stripe_record_payment ignores sessions already recorded.
  async function record(session: any) {
    if (session.payment_status !== "paid" || !session.metadata?.invoice_id) return false;
    let fee = 0;
    try {
      const pi = await stripe(`payment_intents/${session.payment_intent}?expand[]=latest_charge.balance_transaction`);
      fee = (pi.latest_charge?.balance_transaction?.fee ?? 0) / 100;
    } catch { /* fee unknown: record the payment anyway */ }
    const { error } = await admin.rpc("stripe_record_payment", {
      p_session: session.id, p_invoice: session.metadata.invoice_id, p_amount: session.amount_total / 100, p_fee: fee,
      p_date: new Date(session.created * 1000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }),
      p_reference: `Stripe ${String(session.payment_intent || session.id)}`,
    });
    if (error) throw new Error(error.message);
    return true;
  }

  try {
    if (body.action === "sync") {
      const caller = await callerProfile(req, admin);
      if (!caller || caller.role === "client" || !(await hasPerm(admin, caller.role, "finance.view"))) return json(req, { error: "Not allowed" }, 403);
      const since = Math.floor(Date.now() / 1000) - 7 * 86400;
      const list = await stripe(`checkout/sessions?limit=100&created[gte]=${since}`);
      let n = 0;
      for (const s of list.data || []) {
        if (s.payment_status !== "paid") continue;
        // Paid consultation whose page was closed before it confirmed: let the booking function book it (it checks with Stripe and books only once).
        if (s.metadata?.kind === "booking") {
          const { data: pb } = await admin.from("pending_bookings").select("paid_at, status").eq("id", s.metadata.pending_id).maybeSingle();
          if (pb && !pb.paid_at && ["awaiting_payment", "cancelled_unpaid"].includes(pb.status)) {
            const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/booking`, { method: "POST",
              headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Origin: SITE },
              body: JSON.stringify({ action: "confirm", session: s.id }) }).then((x) => x.json()).catch(() => null);
            if (r?.paid) n++;
          }
          continue;
        }
        if (!s.metadata?.invoice_id) continue;
        const { data: done } = await admin.from("stripe_payments").select("session_id").eq("session_id", s.id).maybeSingle();
        if (!done && (await record(s))) n++;
      }
      return json(req, { recorded: n });
    }

    // Pay-link actions: the invoice id and its secret token must match.
    const rl = await rateLimit(req, admin, "pay", 40, 10);
    if (!rl.allowed) return json(req, { error: "Too many attempts. Please wait a few minutes." }, 429);

    // "Pay an invoice" on the website: invoice number + the email on file -> that invoice's pay link.
    if (body.action === "find") {
      const number = String(body.number ?? "").trim().replace(/^#/, "").slice(0, 40), email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
      const notFound = json(req, { error: "We couldn't find an unpaid invoice with that number and email. Please check both, or call (403) 915-4230." }, 404);
      if (!number || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return notFound;
      const { data: list } = await admin.from("invoices").select("id, number, status, pay_token, contacts(email)").ilike("number", number.replace(/[%_\\]/g, "")).limit(5);
      const hit = (list ?? []).find((x: any) => String(x.contacts?.email ?? "").toLowerCase() === email);
      if (!hit) return notFound;
      if (hit.status === "paid") return json(req, { error: `Invoice ${hit.number} is already paid. Thank you!` }, 400);
      if (!["open", "partial"].includes(hit.status)) return notFound;
      return json(req, { i: hit.id, k: hit.pay_token });
    }

    const i = String(body.i ?? ""), k = String(body.k ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(i) || !/^[0-9a-f]{32,80}$/i.test(k)) return json(req, { error: "This payment link is not valid." }, 404);
    const { data: inv } = await admin.from("invoices").select("id, number, status, total, balance, due_date, pay_token").eq("id", i).maybeSingle();
    if (!inv || inv.pay_token !== k) return json(req, { error: "This payment link is not valid." }, 404);
    const { data: org } = await admin.from("org_settings").select("business_name, phone, email").eq("id", 1).single();
    const balance = Math.round(Number(inv.balance) * 100);
    const info = { number: inv.number, status: inv.status, total: Number(inv.total), balance: balance / 100, due_date: inv.due_date, business: org?.business_name, phone: org?.phone };

    if (body.action === "info") return json(req, info);

    if (body.action === "confirm") {
      const sid = String(body.session ?? "");
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return json(req, info);
      const s = await stripe(`checkout/sessions/${sid}`);
      if (s.metadata?.invoice_id === inv.id) await record(s);
      const { data: now } = await admin.from("invoices").select("status, balance").eq("id", inv.id).single();
      return json(req, { ...info, status: now?.status, balance: Number(now?.balance), paid: s.payment_status === "paid" });
    }

    if (body.action === "checkout") {
      if (!["open", "partial"].includes(inv.status) || balance < 50) return json(req, { error: inv.status === "paid" ? "This invoice is already paid. Thank you!" : "This invoice can't be paid online." }, 400);
      const back = `${SITE}/public/pay.html?i=${inv.id}&k=${k}`;
      const s = await stripe("checkout/sessions", {
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "cad",
        "line_items[0][price_data][unit_amount]": String(balance),
        "line_items[0][price_data][product_data][name]": `Invoice ${inv.number}`,
        "line_items[0][price_data][product_data][description]": `${org?.business_name ?? "Graceful Immigration Consultant Inc."} — professional fees`,
        "metadata[invoice_id]": inv.id,
        "metadata[invoice_number]": inv.number,
        "payment_intent_data[metadata][invoice_id]": inv.id,
        "payment_intent_data[metadata][invoice_number]": inv.number,
        "payment_intent_data[description]": `Invoice ${inv.number}`,
        "allowed_payment_method_types[0]": "card",
        success_url: `${back}&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${back}&cancelled=1`,
        expires_at: String(Math.floor(Date.now() / 1000) + 3600),
      });
      return json(req, { url: s.url });
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    return json(req, { error: (e as Error).message }, 400);
  }
});
