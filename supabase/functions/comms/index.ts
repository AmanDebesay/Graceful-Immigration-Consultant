// Email (Microsoft 365) and Microsoft Teams actions for the Practice Hub. Staff only.
//   status      → is Microsoft 365 email connected, which mailboxes can I send from
//   send        → email a client from my mailbox or the shared mailbox; logged on the client file
//   inbox       → recent Outlook emails with a client (my mailbox + shared mailbox)
//   teams_test  → post a test alert to the Teams channel (settings.manage)
import { adminClient, callerProfile, corsHeaders, escapeHtml, hasPerm, json } from "../_shared/common.ts";
import { graphConfigured, graphFindMail, graphGetMail, graphListMail, graphReply, graphSendMail, HUB, notifyTeams } from "../_shared/m365.ts";

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;\s]+/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller || caller.role === "client") return json(req, { error: "Not allowed" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const { data: integ } = await admin.from("integration_settings").select("shared_mailbox, teams_webhook_url").eq("id", 1).single();
  const shared = integ?.shared_mailbox ?? "info@gracefulimmigration.ca";
  const mine = caller.email.toLowerCase();

  switch (body.action) {
    case "status":
      return json(req, { email: graphConfigured(), mailboxes: [...new Set([mine, shared])], teams: !!integ?.teams_webhook_url });

    case "send": {
      if (!(await hasPerm(admin, caller.role, "crm.edit"))) return json(req, { error: "You don't have permission to email clients." }, 403);
      if (!graphConfigured()) return json(req, { error: "Email isn't connected to Microsoft 365 yet. Ask the owner to finish the setup in Business Settings → Integrations." }, 503);
      const from = body.from === "shared" ? shared : mine;
      const to = list(body.to), cc = list(body.cc);
      const subject = String(body.subject ?? "").trim().slice(0, 250);
      const text = String(body.body ?? "").trim().slice(0, 20000);
      if (!to.length || to.length > 10 || cc.length > 10 || ![...to, ...cc].every((a) => EMAIL.test(a))) return json(req, { error: "Check the email addresses." }, 400);
      if (!subject || !text) return json(req, { error: "Add a subject and a message." }, 400);
      const contactId = typeof body.contact_id === "string" ? body.contact_id : null;

      const { data: me } = await admin.from("profiles").select("full_name, job_title").eq("id", caller.id).single();
      const { data: org } = await admin.from("org_settings").select("business_name, phone").eq("id", 1).single();
      const sig = [me?.full_name, me?.job_title, org?.business_name, `${org?.phone ?? ""} · ${from}`, "gracefulimmigration.ca"].filter(Boolean);
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1C2333">
        ${escapeHtml(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("")}
        <p style="margin:18px 0 0;color:#5B6476;font-size:13px;border-top:1px solid #E7E2D6;padding-top:10px">${sig.map(escapeHtml).join("<br>")}</p>
        <p style="color:#8A93A3;font-size:11px;margin-top:10px">This email and any attachments are confidential and intended only for the addressee.</p></div>`;
      try {
        await graphSendMail({ from, to, cc, subject, html });
      } catch (e) {
        return json(req, { error: (e as Error).message }, 502);
      }
      await admin.from("activities").insert({
        type: "email", direction: "outbound", subject, contact_id: contactId, author_id: caller.id,
        body: `From: ${from}\nTo: ${to.join(", ")}${cc.length ? `\nCc: ${cc.join(", ")}` : ""}\n\n${text}`,
      });
      return json(req, { ok: true, from });
    }

    case "inbox": {
      if (!(await hasPerm(admin, caller.role, "crm.view"))) return json(req, { error: "Not allowed" }, 403);
      if (!graphConfigured()) return json(req, { error: "Email isn't connected to Microsoft 365 yet." }, 503);
      const { data: c } = await admin.from("contacts").select("email").eq("id", String(body.contact_id ?? "")).maybeSingle();
      if (!c?.email) return json(req, { messages: [] });
      const boxes = [...new Set([mine, shared])];
      const results = await Promise.allSettled(boxes.map((b) => graphFindMail(b, c.email, 20)));
      const messages = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
      const failed = results.map((r, i) => (r.status === "rejected" ? `${boxes[i]}: ${(r.reason as Error).message}` : "")).filter(Boolean);
      return json(req, { messages, warnings: failed });
    }

    // ── Outlook mailbox (Email tab): my own mailbox, or the shared mailbox for staff who can edit clients ──
    case "list":
    case "read":
    case "reply": {
      if (!graphConfigured()) return json(req, { error: "Email isn't connected to Microsoft 365 yet." }, 503);
      const useShared = body.mailbox === "shared";
      if (useShared && !(await hasPerm(admin, caller.role, "crm.edit"))) return json(req, { error: "You don't have access to the shared mailbox." }, 403);
      const box = useShared ? shared : mine;
      try {
        if (body.action === "list") {
          return json(req, { mailbox: box, messages: await graphListMail(box, String(body.folder ?? "inbox"), { skip: Number(body.skip) || 0, search: String(body.search ?? "").trim().slice(0, 100) || undefined }) });
        }
        const id = String(body.id ?? "");
        if (!id) return json(req, { error: "Missing message." }, 400);
        if (body.action === "read") return json(req, { mailbox: box, message: await graphGetMail(box, id) });
        // reply
        const text = String(body.body ?? "").trim().slice(0, 20000);
        if (!text) return json(req, { error: "Write a reply first." }, 400);
        const { data: me } = await admin.from("profiles").select("full_name, job_title").eq("id", caller.id).single();
        const { data: org } = await admin.from("org_settings").select("business_name, phone").eq("id", 1).single();
        const sig = [me?.full_name, me?.job_title, org?.business_name, `${org?.phone ?? ""} · ${box}`].filter(Boolean);
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">${escapeHtml(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}<p style="color:#5B6476;font-size:13px">${sig.map(escapeHtml).join("<br>")}</p></div>`;
        await graphReply(box, id, html, body.replyAll === true);
        // Log on the client's file when the other party is a client
        const orig = await graphGetMail(box, id);
        const party = [orig.from, ...orig.to].map((a) => a.toLowerCase()).find((a) => a !== box);
        if (party) {
          const { data: c } = await admin.from("contacts").select("id").eq("email", party).maybeSingle();
          if (c) await admin.from("activities").insert({ type: "email", direction: "outbound", subject: `Re: ${orig.subject}`, contact_id: c.id, author_id: caller.id, body: `From: ${box}\nTo: ${party}\n\n${text}` });
        }
        return json(req, { ok: true });
      } catch (e) {
        return json(req, { error: (e as Error).message }, 502);
      }
    }

    case "teams_test": {
      if (!(await hasPerm(admin, caller.role, "settings.manage"))) return json(req, { error: "Not allowed" }, 403);
      const ok = await notifyTeams(admin, "✅ Practice Hub is connected", `Test message sent by ${caller.full_name || caller.email}. New assessments, urgent cases and signed agreements will appear in this channel.`, HUB);
      return ok ? json(req, { ok: true }) : json(req, { error: "Teams didn't accept the message. Check the workflow link in Integrations." }, 502);
    }
  }
  return json(req, { error: "Unknown action" }, 400);
});
