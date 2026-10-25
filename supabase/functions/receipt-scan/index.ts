// Reads an uploaded receipt (photo or PDF) with Claude and fills in the receipt for review:
// vendor, date, totals, GST/HST, line items, and a suggested expense category and payment account.
// Finance staff only. Nothing is posted to the books until a person approves the receipt.
import Anthropic from "npm:@anthropic-ai/sdk";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { adminClient, callerProfile, corsHeaders, hasPerm, json } from "../_shared/common.ts";

const MODEL = Deno.env.get("AI_RECEIPT_MODEL") ?? "claude-opus-5-5";

const SYSTEM = `You read receipts and invoices for a small Canadian immigration consultancy (Alberta, GST 5%, no PST) and extract bookkeeping data.
Rules:
- Read only what is printed. If a value is missing or unreadable, use null. Never guess amounts.
- "total" is the amount actually paid, including tax and tip. "tax" is GST/HST only (sum them if both appear); 0 if the receipt shows no GST/HST.
- Dates as YYYY-MM-DD. Amounts as numbers in the receipt's currency.
- Choose the expense category that best fits from the provided list, using its id. Choose the payment account from the provided list when the receipt shows how it was paid (card brand/last digits, cash, e-transfer); otherwise "none".
- In "notes", briefly flag anything a bookkeeper should check: foreign currency, partially illegible text, a personal-looking purchase, a missing GST number on a large purchase, or a document that is not a receipt.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller || !(await hasPerm(admin, caller.role, "finance.manage"))) return json(req, { error: "Not allowed" }, 403);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json(req, { error: "The AI assistant is not set up yet." }, 503);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const { data: r } = await admin.from("receipts").select("id, file_path, mime_type, status").eq("id", String(body.receipt_id ?? "")).maybeSingle();
  if (!r) return json(req, { error: "Receipt not found." }, 404);
  if (r.status === "approved") return json(req, { error: "This receipt is already in the books." }, 400);
  await admin.from("receipts").update({ status: "processing", error: null }).eq("id", r.id);

  const fail = async (msg: string, status = 502) => {
    await admin.from("receipts").update({ status: "error", error: msg }).eq("id", r.id);
    return json(req, { error: msg }, status);
  };

  const { data: file, error: dlErr } = await admin.storage.from("receipts").download(r.file_path);
  if (dlErr || !file) return fail("Could not open the uploaded file.");
  const data = encodeBase64(new Uint8Array(await file.arrayBuffer()));

  const { data: accts } = await admin.from("accounts").select("id, code, name, type, subtype").eq("active", true).order("code");
  const expenseAccts = (accts ?? []).filter((a) => a.type === "expense" || a.subtype === "fixed_asset");
  const payAccts = (accts ?? []).filter((a) => ["bank", "credit_card"].includes(a.subtype));
  if (!expenseAccts.length) return fail("No expense categories exist in the chart of accounts.", 400);

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["is_receipt", "vendor", "receipt_date", "subtotal", "tax", "total", "currency", "payment_hint", "receipt_number", "line_items", "account_id", "payment_account_id", "memo", "notes"],
    properties: {
      is_receipt: { type: "boolean" },
      vendor: { type: ["string", "null"] },
      receipt_date: { type: ["string", "null"] },
      subtotal: { type: ["number", "null"] },
      tax: { type: ["number", "null"] },
      total: { type: ["number", "null"] },
      currency: { type: ["string", "null"] },
      payment_hint: { type: ["string", "null"] },
      receipt_number: { type: ["string", "null"] },
      line_items: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["description", "amount"], properties: { description: { type: "string" }, amount: { type: ["number", "null"] } } },
      },
      account_id: { type: "string", enum: expenseAccts.map((a) => a.id) },
      payment_account_id: { type: "string", enum: [...payAccts.map((a) => a.id), "none"] },
      memo: { type: "string" },
      notes: { type: ["string", "null"] },
    },
  };

  const accountList = `Expense categories (id — code name):\n${expenseAccts.map((a) => `${a.id} — ${a.code} ${a.name}`).join("\n")}\n\nPayment accounts:\n${payAccts.map((a) => `${a.id} — ${a.code} ${a.name}`).join("\n") || "(none)"}`;
  const fileBlock = r.mime_type === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: r.mime_type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } };

  const client = new Anthropic();
  let msg;
  try {
    msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system: SYSTEM,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: `${accountList}\n\nExtract the bookkeeping data from this receipt. Write "memo" as a short description of what was bought (e.g. "Printer ink and paper").` }] }],
    } as any);
  } catch (e) {
    const status = e instanceof Anthropic.RateLimitError ? 429 : 502;
    console.error("Claude error", e);
    return fail(status === 429 ? "The AI is busy right now. Try again in a minute." : "The AI could not read this receipt. Try again or enter it manually.", status);
  }
  await admin.from("ai_usage").insert({ kind: "receipt", user_id: caller.id, model: MODEL, input_tokens: msg.usage?.input_tokens ?? 0, output_tokens: msg.usage?.output_tokens ?? 0 });

  if (msg.stop_reason === "refusal") return fail("The AI declined to read this file. Please enter it manually.");
  const text = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
  let x: any;
  try { x = JSON.parse(text); } catch { return fail("The AI's answer could not be read. Try scanning again."); }
  if (!x.is_receipt) return fail(x.notes || "This doesn't look like a receipt or invoice.", 422);

  // Match an existing vendor by name; use its default category when it has one.
  let vendorId: string | null = null, accountId = x.account_id;
  if (x.vendor) {
    const { data: v } = await admin.from("vendors").select("id, default_account_id").ilike("name", String(x.vendor).replace(/[%_]/g, "")).eq("active", true).limit(1).maybeSingle();
    if (v) { vendorId = v.id; accountId = v.default_account_id ?? accountId; }
  }
  const validDate = typeof x.receipt_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.receipt_date) ? x.receipt_date : null;
  const money = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.round(n * 100) / 100 : null);
  const patch = {
    status: "ready", error: null, vendor: x.vendor, receipt_date: validDate, subtotal: money(x.subtotal), tax: money(x.tax) ?? 0, total: money(x.total),
    currency: x.currency ? String(x.currency).toUpperCase().slice(0, 3) : "CAD", payment_hint: x.payment_hint, receipt_number: x.receipt_number,
    line_items: Array.isArray(x.line_items) ? x.line_items.slice(0, 60) : [], account_id: accountId,
    payment_account_id: x.payment_account_id && x.payment_account_id !== "none" ? x.payment_account_id : null, vendor_id: vendorId,
    memo: x.memo?.slice(0, 300) ?? null, ai_notes: x.notes,
  };
  const { data: saved, error } = await admin.from("receipts").update(patch).eq("id", r.id).select("*").single();
  if (error) return fail("Could not save the scanned details.");
  return json(req, { receipt: saved });
});
