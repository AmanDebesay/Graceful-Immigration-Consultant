// Business phone line (Twilio). Every call is logged in the dashboard's Call Log automatically.
// Twilio calls this function (webhooks, form-encoded) and gets back TwiML:
//   ?op=voice     incoming call -> "may be recorded" notice, ring the forwarding number (the caller's number shows)
//   ?op=whisper / ?op=screen  the person answering hears the line name and presses 1 (screens out phone voicemail)
//   ?op=dialdone  after ringing  -> answered: done; not answered: voicemail + a text with the booking link
//   ?op=vmdone    after the voicemail
//   ?op=recording / ?op=voicemail  recording ready -> copied into our Canadian storage, then deleted at Twilio
//   ?op=status    call status changes (set on the number in Twilio) -> catches callers who hang up while ringing
// Every request is checked with Twilio's signature (TWILIO_AUTH_TOKEN). Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
import { adminClient } from "../_shared/common.ts";

const BASE = "https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/phone";
const SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const BOOK = "https://gracefulimmigration.ca/public/book.html";

const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "text/xml" } });
const x = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
const say = (t: string) => `<Say voice="Polly.Joanna" language="en-CA">${x(t)}</Say>`;

async function validSignature(req: Request, url: string, params: URLSearchParams) {
  const sig = req.headers.get("X-Twilio-Signature") ?? "";
  if (!TOKEN || !sig) return false;
  const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(TOKEN), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
const twilio = (path: string, init: RequestInit = {}) => fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}${path}`,
  { ...init, headers: { Authorization: "Basic " + btoa(`${SID}:${TOKEN}`), ...(init.headers ?? {}) } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const u = new URL(req.url), op = u.searchParams.get("op") ?? "";
  const params = new URLSearchParams(await req.text());
  if (!(await validSignature(req, BASE + u.search, params))) return new Response("Forbidden", { status: 403 });
  const p = (k: string) => params.get(k) ?? "";
  const admin = adminClient();
  const callSid = p("CallSid");

  try {
    if (op === "voice") {
      const { data: line } = await admin.from("phone_lines").select("*").eq("number", p("To")).maybeSingle();
      const from = p("From");
      const { data: contactId } = await admin.rpc("contact_by_phone", { p: from });
      const { data: contact } = contactId ? await admin.from("contacts").select("full_name").eq("id", contactId).maybeSingle() : { data: null };
      const loc = [p("FromCity"), p("FromState"), p("FromCountry")].filter(Boolean).join(", ");
      await admin.from("calls").upsert({ twilio_sid: callSid, direction: "inbound", channel: "phone", status: "ringing", from_number: from, to_number: p("To"),
        caller_name: contact?.full_name ?? (p("CallerName") || null), caller_location: loc || null, contact_id: contactId ?? null,
        line_id: line?.id ?? null, source: line?.source ?? "unknown", category: contactId ? "existing_client" : "unreviewed", created_by: null }, { onConflict: "twilio_sid" });
      if (!line?.active || !line.forward_to) {
        return xml(say("Thank you for calling Graceful Immigration. Please leave your name, phone number and how we can help after the tone.") +
          `<Record maxLength="120" playBeep="true" action="${x(BASE)}?op=vmdone" recordingStatusCallback="${x(BASE)}?op=voicemail" recordingStatusCallbackEvent="completed"/>`);
      }
      const rec = line.record ? ` record="record-from-answer-dual" recordingStatusCallback="${x(BASE)}?op=recording" recordingStatusCallbackEvent="completed"` : "";
      return xml((line.record ? say("Thank you for calling Graceful Immigration. This call may be recorded for quality and record keeping.") : "") +
        `<Dial timeout="25" answerOnBridge="true" callerId="${x(from)}" action="${x(BASE)}?op=dialdone"${rec}><Number url="${x(`${BASE}?op=whisper&l=${line.id}`)}">${x(line.forward_to)}</Number></Dial>`);
    }

    // Call screening: the person answering hears which line it is and presses 1. A phone's own voicemail can't
    // press 1, so an unanswered call is logged as missed and goes to OUR voicemail (and the caller gets the text).
    if (op === "whisper") {
      const { data: line } = await admin.from("phone_lines").select("label").eq("id", u.searchParams.get("l") ?? "").maybeSingle();
      return xml(`<Gather numDigits="1" timeout="7" action="${x(`${BASE}?op=screen&parent=${p("ParentCallSid")}`)}">${say(`Graceful Immigration call from the ${line?.label || "business"} line. Press 1 to answer.`)}</Gather><Hangup/>`);
    }
    if (op === "screen") {
      if (p("Digits") !== "1") return xml("<Hangup/>");
      await admin.from("calls").update({ status: "answered" }).eq("twilio_sid", u.searchParams.get("parent") ?? "");
      return xml("");
    }

    if (op === "dialdone") {
      // Answered only if someone pressed 1 (see "screen"); otherwise a phone's voicemail may have picked up.
      const { data: row } = await admin.from("calls").select("status").eq("twilio_sid", callSid).maybeSingle();
      const answered = p("DialCallStatus") === "completed" && row?.status === "answered";
      await admin.from("calls").update(answered ? { status: "answered", duration_sec: Number(p("DialCallDuration")) || null } : { status: "missed" }).eq("twilio_sid", callSid);
      if (answered) return xml("<Hangup/>");
      const { data: line } = await admin.from("phone_lines").select("number, text_missed").eq("number", p("To")).maybeSingle();
      // Text the caller the booking link (Canadian/US mobile numbers only).
      if (line?.text_missed && /^\+1\d{10}$/.test(p("From"))) {
        const body = new URLSearchParams({ From: line.number, To: p("From"),
          Body: `Graceful Immigration: sorry we missed your call. We will call you back as soon as possible. You can also book a consultation online: ${BOOK}` });
        await twilio("/Messages.json", { method: "POST", body }).catch((e) => console.error("sms", String(e)));
      }
      return xml(say("Sorry, we could not take your call right now. Please leave your name, phone number and how we can help after the tone, and we will call you back. You can also book online at graceful immigration dot C A.") +
        `<Record maxLength="120" playBeep="true" action="${x(BASE)}?op=vmdone" recordingStatusCallback="${x(BASE)}?op=voicemail" recordingStatusCallbackEvent="completed"/>`);
    }

    if (op === "vmdone") return xml(say("Thank you. We will call you back soon. Goodbye.") + "<Hangup/>");

    if (op === "recording" || op === "voicemail") {
      const recUrl = p("RecordingUrl"), recSid = p("RecordingSid");
      if (!recUrl || !recSid) return new Response("ok");
      const res = await twilio(`/Recordings/${recSid}.mp3`);
      if (!res.ok) throw new Error(`recording download ${res.status}`);
      const day = new Date().toISOString().slice(0, 10);
      const path = `${day.slice(0, 7)}/${callSid || recSid}-${op}.mp3`;
      const { error } = await admin.storage.from("call-recordings").upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
      if (error) throw new Error(error.message);
      await admin.from("calls").update({ recording_path: path, recording_sec: Number(p("RecordingDuration")) || null, ...(op === "voicemail" ? { status: "voicemail" } : {}) }).eq("twilio_sid", callSid);
      // Keep recordings only in our Canadian storage.
      await twilio(`/Recordings/${recSid}.json`, { method: "DELETE" }).catch(() => null);
      return new Response("ok");
    }

    if (op === "status") {
      // A caller who hung up while it was still ringing never reaches "dialdone".
      if (["completed", "no-answer", "busy", "failed", "canceled"].includes(p("CallStatus")))
        await admin.from("calls").update({ status: "missed" }).eq("twilio_sid", callSid).eq("status", "ringing");
      return new Response("ok");
    }
    return new Response("Unknown op", { status: 400 });
  } catch (e) {
    console.error("phone", op, String(e));
    // Never leave a caller in silence: if something fails, still try to ring through.
    return op === "voice" || op === "dialdone" ? xml(say("Thank you for calling Graceful Immigration. Please leave a message after the tone.") +
      `<Record maxLength="120" playBeep="true" action="${x(BASE)}?op=vmdone"/>`) : new Response("error", { status: 500 });
  }
});
