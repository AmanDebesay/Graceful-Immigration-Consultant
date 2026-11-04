// Email (Microsoft 365) and Microsoft Teams actions for the Practice Hub. Staff only.
//   status      → is Microsoft 365 email connected, which mailboxes can I send from
//   send        → email a client from my mailbox or the shared mailbox; logged on the client file
//   inbox       → recent Outlook emails with a client (my mailbox + shared mailbox)
//   teams_test  → post a test alert to the Teams channel (settings.manage)
import { adminClient, callerProfile, corsHeaders, escapeHtml, hasPerm, json } from "../_shared/common.ts";
import { graphAttachment, graphCalendarView, graphConfigured, graphCreateEvent, graphDeleteEvent, graphFindMail, graphFolders, graphForward, graphGetMail, graphListMail,
  graphMark, graphMove, graphReply, graphSendMail, graphUpdateEvent, HUB, notifyTeams } from "../_shared/m365.ts";
import * as MX from "../_shared/mailbox.ts";

// Microsoft's "Access is denied" usually means a permission hasn't been granted to the app yet.
const friendly = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e);
  return /Access is denied|ErrorAccessDenied|Authorization_RequestDenied/i.test(m)
    ? (/mailboxSettings|messageRules|masterCategories/i.test(m)
      ? "Microsoft 365 hasn't allowed this yet. An administrator needs to add the MailboxSettings.ReadWrite permission to the Graceful Practice Hub app and grant consent."
      : "Microsoft 365 hasn't allowed this yet. An administrator needs to add the Mail.ReadWrite and Calendars.ReadWrite permissions to the Graceful Practice Hub app and grant consent.")
    : /requested user .* is invalid|MailboxNotEnabled|ResourceNotFound/i.test(m) ? "This account doesn't have a Microsoft 365 mailbox yet." : m;
};

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
    case "status": {
      const { data: me } = await admin.from("profiles").select("full_name, job_title").eq("id", caller.id).single();
      const { data: org } = await admin.from("org_settings").select("business_name, phone").eq("id", 1).single();
      // Signature lines for the Mail page's editor (the page adds the From address).
      const signature = [me?.full_name, me?.job_title, org?.business_name, org?.phone, "gracefulimmigration.ca"].filter(Boolean);
      return json(req, { email: graphConfigured(), mailboxes: [...new Set([mine, shared])], teams: !!integ?.teams_webhook_url, signature });
    }

    case "send": {
      if (!(await hasPerm(admin, caller.role, "crm.edit"))) return json(req, { error: "You don't have permission to email clients." }, 403);
      if (!graphConfigured()) return json(req, { error: "Email isn't connected to Microsoft 365 yet. Ask the owner to finish the setup in Business Settings → Integrations." }, 503);
      const from = body.from === "shared" ? shared : mine;
      const to = list(body.to), cc = list(body.cc), bcc = list(body.bcc);
      const subject = String(body.subject ?? "").trim().slice(0, 250);
      const text = String(body.body ?? "").trim().slice(0, 20000);
      if (!to.length || to.length > 10 || cc.length > 10 || bcc.length > 10 || ![...to, ...cc, ...bcc].every((a) => EMAIL.test(a))) return json(req, { error: "Check the email addresses." }, 400);
      const atts = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 10).map((a: any) => ({
        name: String(a?.name ?? "file").slice(0, 150), contentType: String(a?.contentType ?? "application/octet-stream").slice(0, 100), contentBytes: String(a?.contentBytes ?? ""),
      }));
      if (atts.reduce((n, a) => n + a.contentBytes.length, 0) > 4_000_000) return json(req, { error: "Attachments are too large (about 3 MB in total). Share bigger files another way." }, 400);
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
        await graphSendMail({ from, to, cc, bcc, subject, html, attachments: atts, importance: body.importance === "high" ? "high" : "normal" });
      } catch (e) {
        return json(req, { error: friendly(e) }, 502);
      }
      await admin.from("activities").insert({
        type: "email", direction: "outbound", subject, contact_id: contactId, author_id: caller.id,
        body: `From: ${from}\nTo: ${to.join(", ")}${cc.length ? `\nCc: ${cc.join(", ")}` : ""}${atts.length ? `\nAttachments: ${atts.map((a) => a.name).join(", ")}` : ""}\n\n${text}`,
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
        return json(req, { error: friendly(e) }, 502);
      }
    }

    // ── Outlook actions: folders, read/unread, flag, move/archive/delete, forward, attachments ──
    case "folders":
    case "mark":
    case "move":
    case "forward":
    case "attachment": {
      if (!graphConfigured()) return json(req, { error: "Email isn't connected to Microsoft 365 yet." }, 503);
      const useShared = body.mailbox === "shared";
      if (useShared && !(await hasPerm(admin, caller.role, "crm.edit"))) return json(req, { error: "You don't have access to the shared mailbox." }, 403);
      const box = useShared ? shared : mine, id = String(body.id ?? "");
      try {
        if (body.action === "folders") return json(req, { folders: await graphFolders(box) });
        if (!id) return json(req, { error: "Missing message." }, 400);
        if (body.action === "mark") { await graphMark(box, id, { isRead: body.isRead as boolean | undefined, flagged: body.flagged as boolean | undefined }); return json(req, { ok: true }); }
        if (body.action === "move") { await graphMove(box, id, String(body.destination ?? "archive")); return json(req, { ok: true }); }
        if (body.action === "attachment") return json(req, { attachment: await graphAttachment(box, id, String(body.attachmentId ?? "")) });
        const to = list(body.to);
        if (!to.length || !to.every((a) => EMAIL.test(a))) return json(req, { error: "Enter who to forward to." }, 400);
        await graphForward(box, id, to, `<p>${escapeHtml(String(body.body ?? "")).replace(/\n/g, "<br>")}</p>`);
        return json(req, { ok: true });
      } catch (e) {
        return json(req, { error: friendly(e) }, 502);
      }
    }

    // ── Mail page (Outlook features): one action with an op ──
    case "mx": {
      if (!graphConfigured()) return json(req, { error: "Email isn't connected to Microsoft 365 yet." }, 503);
      const useShared = body.mailbox === "shared";
      if (useShared && !(await hasPerm(admin, caller.role, "crm.edit"))) return json(req, { error: "You don't have access to the shared mailbox." }, 403);
      const box = useShared ? shared : mine, op = String(body.op ?? ""), s = (k: string, n = 300) => String(body[k] ?? "").trim().slice(0, n);
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(String).filter((x) => x && x !== "undefined").slice(0, 100);
      try {
        switch (op) {
          case "folders": return json(req, { folders: await MX.folderTree(box) });
          case "list": return json(req, { messages: await MX.listMail(box, s("folder", 400) || "inbox", { skip: Number(body.skip) || 0, search: s("search", 100) || undefined, filter: s("filter", 20), focus: s("focus", 10), order: s("order", 10) }) });
          case "read": return json(req, { message: await MX.readMail(box, s("id", 400)) });
          case "thread": return json(req, { messages: await MX.thread(box, s("conversationId", 400)) });
          case "patch": return json(req, { failed: await MX.patchMany(box, ids, { isRead: body.isRead as boolean | undefined, flag: body.flag as string | undefined, categories: body.categories as string[] | undefined, importance: body.importance as string | undefined }) });
          case "move": return json(req, { failed: await MX.moveMany(box, ids, s("destination", 400) || "archive") });
          case "delete": return json(req, { failed: await MX.deleteMany(box, ids) });
          case "sweep": return json(req, { moved: await MX.sweep(box, s("folder", 400) || "inbox", s("from", 200).toLowerCase()) });
          case "empty": {
            const f = s("folder", 400);
            if (!["deleteditems", "junkemail"].includes(f)) return json(req, { error: "Only Deleted Items and Junk can be emptied." }, 400);
            return json(req, { deleted: await MX.emptyFolder(box, f) });
          }
          case "folder_create": { const n = s("name", 120); if (!n) return json(req, { error: "Name the folder." }, 400); return json(req, { folder: await MX.folderCreate(box, n, s("parentId", 400) || undefined) }); }
          case "folder_rename": { const n = s("name", 120); if (!n) return json(req, { error: "Name the folder." }, 400); await MX.folderRename(box, s("id", 400), n); return json(req, { ok: true }); }
          case "folder_delete": await MX.folderDelete(box, s("id", 400)); return json(req, { ok: true });
          case "categories": return json(req, { categories: await MX.categories(box) });
          case "attachment": return json(req, { attachment: await graphAttachment(box, s("id", 400), s("attachmentId", 400)) });
          case "compose": {
            const to = list(body.to), cc = list(body.cc), bcc = list(body.bcc), mode = s("mode", 10) || "new", send = body.send === true;
            if ([...to, ...cc, ...bcc].some((a) => !EMAIL.test(a)) || to.length > 50 || cc.length > 50 || bcc.length > 50) return json(req, { error: "Check the email addresses." }, 400);
            if (send && !to.length && !cc.length && !bcc.length) return json(req, { error: "Add at least one recipient." }, 400);
            const atts = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 20).map((a: any) => ({ id: a?.id ? String(a.id) : undefined, name: String(a?.name ?? "file").slice(0, 150),
              contentType: String(a?.contentType ?? "application/octet-stream").slice(0, 100), contentBytes: a?.contentBytes ? String(a.contentBytes) : undefined }));
            if (atts.reduce((n, a) => n + (a.contentBytes?.length ?? 0), 0) > 4_000_000) return json(req, { error: "Attachments are too large (about 3 MB in total). Share bigger files with a OneDrive link." }, 400);
            const sendAt = s("sendAt", 40);
            if (sendAt && !(new Date(sendAt).getTime() > Date.now() + 60_000)) return json(req, { error: "Pick a send time in the future." }, 400);
            const html = MX.cleanHtml(body.html);
            const r = await MX.compose(box, { mode, draftId: s("draftId", 400) || undefined, refId: s("refId", 400) || undefined, to, cc, bcc, subject: s("subject", 250), html,
              importance: s("importance", 10), readReceipt: body.readReceipt === true, deliveryReceipt: body.deliveryReceipt === true, attachments: atts,
              removeAttachments: (Array.isArray(body.removeAttachments) ? body.removeAttachments : []).map(String).slice(0, 20), send, sendAt: sendAt || undefined });
            if (send && to.length + cc.length) {
              // Log on each client's file
              const { data: cs } = await admin.from("contacts").select("id, email").in("email", [...to, ...cc]);
              const text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
              for (const c of cs ?? []) await admin.from("activities").insert({ type: "email", direction: "outbound", subject: s("subject", 250) || "(no subject)", contact_id: c.id, author_id: caller.id,
                body: `From: ${box}\nTo: ${to.join(", ")}${cc.length ? `\nCc: ${cc.join(", ")}` : ""}${sendAt ? `\nScheduled for: ${sendAt}` : ""}${atts.length ? `\nAttachments: ${atts.map((a) => a.name).join(", ")}` : ""}\n\n${text}` });
            }
            return json(req, r);
          }
          case "autoreply_get": return json(req, { settings: await MX.autoReplies(box) });
          case "autoreply_set": {
            const st = s("status", 20), au = s("audience", 20);
            if (!["disabled", "alwaysEnabled", "scheduled"].includes(st) || !["none", "contactsOnly", "all"].includes(au)) return json(req, { error: "Invalid settings." }, 400);
            if (st === "scheduled" && !(s("start", 25) && s("end", 25) > s("start", 25))) return json(req, { error: "Check the start and end times." }, 400);
            await MX.setAutoReplies(box, { status: st, audience: au, internal: MX.cleanHtml(body.internal).slice(0, 8000), external: MX.cleanHtml(body.external).slice(0, 8000), start: s("start", 25), end: s("end", 25) });
            return json(req, { ok: true });
          }
          case "rules": return json(req, { rules: await MX.rules(box) });
          case "rule_save": {
            const r = (body.rule ?? {}) as Record<string, unknown>, words = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
            if (!String(r.name ?? "").trim()) return json(req, { error: "Name the rule." }, 400);
            const from = words(r.from), subject = words(r.subject), bodyW = words(r.body);
            if (!from.length && !subject.length && !bodyW.length) return json(req, { error: "Add at least one condition." }, 400);
            if (!r.moveTo && !r.markRead && !r.importance && !r.category && !r.del) return json(req, { error: "Choose what the rule should do." }, 400);
            await MX.saveRule(box, { id: r.id ? String(r.id) : undefined, name: String(r.name).trim().slice(0, 100), enabled: r.enabled !== false, from, subject, body: bodyW,
              moveTo: r.moveTo ? String(r.moveTo) : undefined, markRead: !!r.markRead, importance: ["low", "normal", "high"].includes(String(r.importance)) ? String(r.importance) : undefined,
              category: r.category ? String(r.category).slice(0, 100) : undefined, del: !!r.del, stop: !!r.stop });
            return json(req, { ok: true });
          }
          case "rule_toggle": await MX.toggleRule(box, s("id", 400), body.enabled === true); return json(req, { ok: true });
          case "rule_delete": await MX.deleteRule(box, s("id", 400)); return json(req, { ok: true });
        }
        return json(req, { error: "Unknown mail action" }, 400);
      } catch (e) {
        return json(req, { error: friendly(e) }, 502);
      }
    }

    // ── Outlook calendar: my calendar, or the shared mailbox's calendar ──
    case "cal_list":
    case "cal_save":
    case "cal_delete": {
      if (!graphConfigured()) return json(req, { error: "Microsoft 365 isn't connected yet." }, 503);
      const useShared = body.mailbox === "shared";
      if (useShared && !(await hasPerm(admin, caller.role, "crm.edit"))) return json(req, { error: "You don't have access to the shared calendar." }, 403);
      const box = useShared ? shared : mine;
      try {
        if (body.action === "cal_list") {
          const start = String(body.start ?? ""), end = String(body.end ?? "");
          if (!/^\d{4}-\d{2}-\d{2}/.test(start) || !/^\d{4}-\d{2}-\d{2}/.test(end)) return json(req, { error: "Invalid range." }, 400);
          return json(req, { mailbox: box, events: await graphCalendarView(box, start, end) });
        }
        if (body.action === "cal_delete") { await graphDeleteEvent(box, String(body.id ?? ""), String(body.comment ?? "")); return json(req, { ok: true }); }
        const e = body.event as Record<string, unknown> ?? {};
        const input = {
          subject: String(e.subject ?? "").trim().slice(0, 250), start: String(e.start ?? ""), end: String(e.end ?? ""), isAllDay: !!e.isAllDay,
          location: String(e.location ?? "").slice(0, 250), body: String(e.body ?? "").slice(0, 8000), attendees: list(e.attendees).filter((a) => EMAIL.test(a)).slice(0, 30),
          teams: !!e.teams, reminder: Number.isFinite(Number(e.reminder)) ? Number(e.reminder) : 15, showAs: ["free", "tentative", "busy", "oof", "workingElsewhere"].includes(String(e.showAs)) ? String(e.showAs) : "busy",
        };
        if (!input.subject) return json(req, { error: "Give the event a title." }, 400);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.end) || input.end <= input.start) return json(req, { error: "Check the start and end times." }, 400);
        const saved = body.id ? await graphUpdateEvent(box, String(body.id), input) : await graphCreateEvent(box, input);
        // Log on the client file when a client is invited
        if (!body.id && input.attendees.length) {
          const { data: cs } = await admin.from("contacts").select("id, email").in("email", input.attendees);
          for (const c of cs ?? []) await admin.from("activities").insert({ type: "meeting", direction: "outbound", subject: `Meeting scheduled: ${input.subject}`, contact_id: c.id, author_id: caller.id, body: `${input.start.replace("T", " ")} – ${input.end.slice(11)} (Alberta time)${input.teams ? " · Microsoft Teams" : input.location ? ` · ${input.location}` : ""}` });
        }
        return json(req, { event: saved });
      } catch (e) {
        return json(req, { error: friendly(e) }, 502);
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
