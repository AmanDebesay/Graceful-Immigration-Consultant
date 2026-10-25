// Microsoft 365 (Graph) email and Microsoft Teams alerts.
// Graph uses an Entra app registration with application permissions Mail.Send and Mail.Read
// (secrets MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET). Only company mailboxes are ever used.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isCompanyEmail } from "./common.ts";

let cached: { token: string; exp: number } | null = null;

export const graphConfigured = () =>
  !!(Deno.env.get("MS_TENANT_ID") && Deno.env.get("MS_CLIENT_ID") && Deno.env.get("MS_CLIENT_SECRET"));

async function graphToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${Deno.env.get("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!, client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Microsoft sign-in failed: ${data.error_description?.split("\r\n")[0] ?? res.status}`);
  cached = { token: data.access_token, exp: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function graph(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const e = await res.json(); msg = e.error?.message ?? msg; } catch { /* no body */ }
    throw new Error(`Microsoft 365: ${msg}`);
  }
  return res.status === 202 || res.status === 204 ? null : res.json();
}

const addr = (list: string[]) => list.map((a) => ({ emailAddress: { address: a } }));

/** Sends an email from a company mailbox; it is saved in that mailbox's Sent Items. */
export async function graphSendMail(opts: { from: string; to: string[]; cc?: string[]; subject: string; html: string; replyTo?: string }) {
  if (!isCompanyEmail(opts.from)) throw new Error("Email can only be sent from a company mailbox.");
  await graph(`/users/${encodeURIComponent(opts.from)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: opts.subject, body: { contentType: "HTML", content: opts.html },
        toRecipients: addr(opts.to), ccRecipients: addr(opts.cc ?? []),
        ...(opts.replyTo ? { replyTo: addr([opts.replyTo]) } : {}),
      },
      saveToSentItems: true,
    }),
  });
}

/** Recent messages in a company mailbox to or from an address (newest first). */
export async function graphFindMail(mailbox: string, party: string, top = 20) {
  if (!isCompanyEmail(mailbox)) throw new Error("Only company mailboxes can be read.");
  const q = encodeURIComponent(`"participants:${party.replace(/"/g, "")}"`);
  const data = await graph(`/users/${encodeURIComponent(mailbox)}/messages?$search=${q}&$top=${top}&$select=subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,webLink,isDraft`);
  return ((data?.value ?? []) as any[]).filter((m) => !m.isDraft).map((m) => ({
    mailbox, subject: m.subject ?? "(no subject)", from: m.from?.emailAddress?.address ?? "",
    to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
    date: m.receivedDateTime ?? m.sentDateTime, preview: m.bodyPreview ?? "", webLink: m.webLink ?? "",
  }));
}

/** Posts a card to the Microsoft Teams channel configured in Integrations. Never throws. */
export async function notifyTeams(admin: SupabaseClient, title: string, text: string, link?: string, urgent = false): Promise<boolean> {
  try {
    const { data } = await admin.from("integration_settings").select("teams_webhook_url").eq("id", 1).single();
    const url = data?.teams_webhook_url;
    if (!url) return false;
    const card = {
      type: "AdaptiveCard", $schema: "http://adaptivecards.io/schemas/adaptive-card.json", version: "1.4",
      body: [
        { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true, color: urgent ? "Attention" : "Default" },
        { type: "TextBlock", text, wrap: true, spacing: "Small" },
      ],
      actions: link ? [{ type: "Action.OpenUrl", title: "Open in Practice Hub", url: link }] : [],
    };
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }),
    });
    return res.ok;
  } catch (e) {
    console.error("Teams alert failed", e);
    return false;
  }
}

export const HUB = "https://gracefulimmigration.ca/app/";
