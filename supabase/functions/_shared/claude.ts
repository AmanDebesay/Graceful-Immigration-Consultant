// Calls the Claude Messages API and streams plain text back to the browser.
// Token usage is logged to ai_usage (conversation text is never stored).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./common.ts";

export type Msg = { role: "user" | "assistant"; content: string };

/** Keeps only well-formed turns, trims them, and makes sure the conversation starts with the user. */
export function cleanMessages(raw: unknown, maxTurns: number, maxChars: number): Msg[] | null {
  if (!Array.isArray(raw)) return null;
  const msgs = raw.slice(-maxTurns)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, maxChars) })) as Msg[];
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export async function streamClaude(req: Request, admin: SupabaseClient, opts: {
  kind: "staff" | "public"; userId?: string | null; model: string; system: string; messages: Msg[]; maxTokens: number;
}): Promise<Response> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const headers = { ...corsHeaders(req), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  if (!key) return new Response("The AI assistant is not set up yet. Please try again later.", { status: 503, headers });

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: opts.model, max_tokens: opts.maxTokens, system: opts.system, messages: opts.messages, stream: true }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("Claude API error", upstream.status, detail.slice(0, 500));
    const msg = upstream.status === 429 || upstream.status === 529
      ? "The assistant is very busy right now. Please try again in a minute."
      : "Sorry, the assistant couldn't answer just now. Please try again.";
    return new Response(msg, { status: 502, headers });
  }

  let inTok = 0, outTok = 0;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const reader = upstream.body.getReader();
  const body = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            let ev: any;
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") controller.enqueue(enc.encode(ev.delta.text));
            else if (ev.type === "message_start") inTok = ev.message?.usage?.input_tokens ?? 0;
            else if (ev.type === "message_delta") outTok = ev.usage?.output_tokens ?? outTok;
            else if (ev.type === "error") controller.enqueue(enc.encode("\n\n(The answer was interrupted. Please try again.)"));
          }
        }
      } catch (e) {
        console.error("stream error", e);
        controller.enqueue(enc.encode("\n\n(The answer was interrupted. Please try again.)"));
      } finally {
        controller.close();
        await admin.from("ai_usage").insert({ kind: opts.kind, user_id: opts.userId ?? null, model: opts.model, input_tokens: inTok, output_tokens: outTok });
      }
    },
  });
  return new Response(body, { headers });
}
