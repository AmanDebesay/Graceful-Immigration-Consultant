// Client portal. Clients only ever see their own file through this function; staff manage access and messages here too.
// Client actions:  home, doc_open, agreement_open, invoice, upload_session, register, send
// Staff actions:   invite, access, share, thread, reply   (portal.manage; thread needs crm.view)
import { adminClient, callerProfile, corsHeaders, escapeHtml, hasPerm, json } from "../_shared/common.ts";
import { graphConfigured, graphSendMail, HUB, notifyTeams } from "../_shared/m365.ts";
import { cleanName, clientFolder, driveConfig, getItem, uploadSession } from "../_shared/drive.ts";

const SITE = "https://gracefulimmigration.ca";
const MAX = 50 * 1024 * 1024;
const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|js|jar|sh|dll|html?|svg)$/i;
const OPEN_STATUSES = ["open", "partial", "paid"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller) return json(req, { error: "Please sign in again." }, 401);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const s = (k: string, n = 300) => String(body[k] ?? "").trim().slice(0, n);

  try {
    if (caller.role === "client") return await clientAction();
    return await staffAction();
  } catch (e) {
    return json(req, { error: (e as Error).message }, 400);
  }

  // ── The client's own file ──
  async function clientAction() {
    const { data: c } = await admin.from("contacts").select("id, full_name, email, phone, assigned_to").eq("client_user_id", caller!.id).maybeSingle();
    if (!c) return json(req, { error: "Your portal isn't linked to a client file yet. Please contact the office." }, 403);
    const mine = async (table: string, id: string, cols = "id, contact_id") => {
      const { data } = await admin.from(table).select(cols).eq("id", id).maybeSingle();
      if (!data || (data as any).contact_id !== c!.id) throw new Error("Not found.");
      return data as any;
    };
    switch (body.action) {
      case "home": {
        const [org, cases, agrs, invs, docs, msgs] = await Promise.all([
          admin.from("org_settings").select("business_name, rcic_name, licence_number, phone, email, address").eq("id", 1).single(),
          admin.from("cases").select("id, case_number, title, application_type, status, opened_on, submitted_on, decision_on").eq("contact_id", c.id).order("created_at", { ascending: false }),
          admin.from("agreements").select("id, number, title, type, status, sent_at, client_signed_at, signing_token, token_expires_at, drive_item_id").eq("contact_id", c.id).in("status", ["sent", "viewed", "signed"]).order("created_at", { ascending: false }),
          admin.from("invoices").select("id, number, issue_date, due_date, total, balance, status").eq("contact_id", c.id).in("status", OPEN_STATUSES).order("issue_date", { ascending: false }),
          admin.from("client_documents").select("id, name, doc_type, category, size, created_at, from_client, checklist_item_id").eq("contact_id", c.id).or("shared.eq.true,from_client.eq.true").order("created_at", { ascending: false }),
          admin.from("portal_messages").select("id, from_client, body, created_at, sender_id, profiles:sender_id(full_name)").eq("contact_id", c.id).order("created_at").limit(200),
        ]);
        // Documents the office still needs (open checklist items in the documents stage)
        const caseIds = (cases.data ?? []).map((x) => x.id);
        const { data: lists } = caseIds.length ? await admin.from("case_checklists").select("id, name, case_id, case_checklist_items(id, label, section, note, status, stage, required, sort)").in("case_id", caseIds) : { data: [] };
        const sent = new Set((docs.data ?? []).filter((d) => d.from_client && d.checklist_item_id).map((d) => d.checklist_item_id));
        const needed = (lists ?? []).flatMap((l: any) => (l.case_checklist_items ?? []).filter((i: any) => i.stage === "documents" && i.status === "todo")
          .sort((a: any, b: any) => a.sort - b.sort).map((i: any) => ({ id: i.id, label: i.label, section: i.section, note: i.note, required: i.required, list: l.name, sent: sent.has(i.id) })));
        await admin.from("portal_messages").update({ read_by_client_at: new Date().toISOString() }).eq("contact_id", c.id).eq("from_client", false).is("read_by_client_at", null);
        const now = Date.now();
        return json(req, {
          me: { name: c.full_name, email: c.email }, firm: org.data,
          cases: cases.data ?? [], needed,
          agreements: (agrs.data ?? []).map((a) => ({ id: a.id, number: a.number, title: a.title, type: a.type, status: a.status, sent_at: a.sent_at, signed_at: a.client_signed_at,
            sign_url: a.status !== "signed" && a.signing_token && (!a.token_expires_at || new Date(a.token_expires_at).getTime() > now) ? `${SITE}/public/sign.html?t=${a.signing_token}` : null,
            has_copy: a.status === "signed" })),
          invoices: invs.data ?? [],
          documents: (docs.data ?? []).map(({ checklist_item_id: _, ...d }) => d),
          messages: (msgs.data ?? []).map((m: any) => ({ id: m.id, mine: m.from_client, body: m.body, at: m.created_at, who: m.from_client ? c.full_name : (m.profiles?.full_name || "Graceful Immigration") })),
        });
      }
      case "doc_open": {
        const d = await mine("client_documents", s("id", 60), "id, contact_id, drive_item_id, name, shared, from_client");
        if (!d.shared && !d.from_client) throw new Error("Not found.");
        const { user } = await driveConfig(admin);
        const item = await getItem(user, d.drive_item_id);
        if (!item) throw new Error("This file isn't available right now. Please contact the office.");
        await admin.from("audit_log").insert({ actor_id: caller!.id, action: "portal_document_opened", entity: "contact", entity_id: c.id, details: { name: d.name } });
        return json(req, { url: item["@microsoft.graph.downloadUrl"], name: item.name });
      }
      case "agreement_open": {
        const a = await mine("agreements", s("id", 60), "id, contact_id, number, status, drive_item_id, body_html, rcic_name, rcic_signature, rcic_signed_at, client_name, client_signature, client_initials, client_signed_at, agreement_signers(position, name, signed_name, signature, initials, signed_at)");
        if (a.status !== "signed") throw new Error("This agreement hasn't been signed yet.");
        if (a.drive_item_id) {
          const { user } = await driveConfig(admin).catch(() => ({ user: "" }));
          const item = user ? await getItem(user, a.drive_item_id).catch(() => null) : null;
          if (item) return json(req, { url: item["@microsoft.graph.downloadUrl"], name: item.name });
        }
        const { drive_item_id: _, contact_id: __, ...rest } = a;
        return json(req, { agreement: rest });
      }
      case "invoice": {
        const inv = await mine("invoices", s("id", 60), "id, contact_id, number, issue_date, due_date, status, subtotal, tax_total, total, amount_paid, balance, notes, terms");
        if (!OPEN_STATUSES.includes(inv.status)) throw new Error("Not found.");
        const [{ data: lines }, { data: org }] = await Promise.all([
          admin.from("invoice_lines").select("description, quantity, unit_price, amount, tax_amount, tax_rate").eq("invoice_id", inv.id).order("position"),
          admin.from("org_settings").select("business_name, rcic_name, licence_number, phone, email, address, gst_number").eq("id", 1).single()]);
        return json(req, { invoice: inv, lines: lines ?? [], firm: org, client: { name: c.full_name, email: c.email } });
      }
      case "upload_session": {
        const name = cleanName(s("file_name", 200)), size = Number(body.size ?? 0);
        if (!name || BLOCKED.test(name)) throw new Error("This type of file can't be uploaded. Please send a PDF, photo or Office document.");
        if (!(size > 0) || size > MAX) throw new Error("Files must be smaller than 50 MB.");
        if (body.checklist_item_id) await neededItem(c.id, s("checklist_item_id", 60));
        const f = await clientFolder(admin, c.id, "documents");
        const ses = await uploadSession(f.user, f.folderId, `From client - ${name}`);
        return json(req, { upload_url: ses.uploadUrl });
      }
      case "register": {
        const item_ = body.checklist_item_id ? await neededItem(c.id, s("checklist_item_id", 60)) : null;
        const f = await clientFolder(admin, c.id, "documents");
        const item = await getItem(f.user, s("item_id", 200));
        if (!item || item.parentReference?.id !== f.folderId) throw new Error("The upload didn't finish. Please try again.");
        const { error } = await admin.from("client_documents").insert({ contact_id: c.id, case_id: item_?.case_id ?? null, checklist_item_id: item_?.id ?? null, category: "documents",
          doc_type: item_?.label?.slice(0, 120) ?? (s("doc_type", 120) || null), name: item.name, drive_item_id: item.id, web_url: item.webUrl, size: item.size,
          mime: item.file?.mimeType ?? null, uploaded_by: caller!.id, from_client: true });
        if (error) throw error;
        await admin.from("activities").insert({ type: "note", direction: "inbound", subject: "Document uploaded in the client portal", contact_id: c.id, author_id: caller!.id, body: `${item.name}${item_ ? ` (for: ${item_.label})` : ""}` });
        await notifyTeams(admin, "📎 Client uploaded a document", `${c.full_name} uploaded ${item.name} in the client portal${item_ ? ` for "${item_.label}"` : ""}.`, `${HUB}#/contacts/${c.id}`);
        return json(req, { ok: true });
      }
      case "send": {
        const text = String(body.body ?? "").trim().slice(0, 5000);
        if (!text) throw new Error("Write a message first.");
        const { count } = await admin.from("portal_messages").select("id", { count: "exact", head: true }).eq("contact_id", c.id).eq("from_client", true).gte("created_at", new Date(Date.now() - 3600e3).toISOString());
        if ((count ?? 0) >= 30) throw new Error("You've sent a lot of messages in the last hour. Please wait a little, or call the office.");
        await admin.from("portal_messages").insert({ contact_id: c.id, sender_id: caller!.id, from_client: true, body: text });
        await notifyTeams(admin, "💬 New client message", `${c.full_name} sent a message in the client portal.`, `${HUB}#/contacts/${c.id}`);
        return json(req, { ok: true });
      }
    }
    return json(req, { error: "Unknown action" }, 400);
  }

  async function neededItem(contactId: string, id: string) {
    const { data } = await admin.from("case_checklist_items").select("id, label, case_checklists(case_id, cases(contact_id))").eq("id", id).maybeSingle();
    if ((data as any)?.case_checklists?.cases?.contact_id !== contactId) throw new Error("Not found.");
    return { id: data!.id, label: data!.label as string, case_id: (data as any).case_checklists.case_id as string };
  }

  // ── Staff: access, sharing and messages ──
  async function staffAction() {
    const can = (p: string) => hasPerm(admin, caller!.role, p);
    const contactId = s("contact_id", 60);
    const { data: c } = contactId ? await admin.from("contacts").select("id, full_name, email, client_user_id, portal_invited_at").eq("id", contactId).maybeSingle() : { data: null };
    if (!c && body.action !== "share") throw new Error("Client not found.");
    switch (body.action) {
      case "status": {
        if (!(await can("crm.view"))) return json(req, { error: "Not allowed" }, 403);
        if (!c!.client_user_id) return json(req, { state: c!.portal_invited_at ? "invited" : "none" });
        const { data: p } = await admin.from("profiles").select("active").eq("id", c!.client_user_id).maybeSingle();
        const { data: u } = await admin.auth.admin.getUserById(c!.client_user_id);
        return json(req, { state: !p?.active ? "off" : u?.user?.last_sign_in_at ? "active" : "invited", last_sign_in: u?.user?.last_sign_in_at ?? null, invited_at: c!.portal_invited_at, email: u?.user?.email });
      }
      case "invite": {
        if (!(await can("portal.manage"))) return json(req, { error: "You don't have permission to invite clients." }, 403);
        const email = String(c!.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Add the client's email address on their page first.");
        if (/@gracefulimmigration\.ca$/i.test(email)) throw new Error("A company email can't be used for a client portal.");
        let userId = c!.client_user_id as string | null, link: string;
        const redirectTo = HUB;
        if (!userId) {
          const { data: existing } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
          if (existing && existing.role !== "client") throw new Error("This email belongs to a staff account.");
          if (existing) {
            const { data: other } = await admin.from("contacts").select("id").eq("client_user_id", existing.id).maybeSingle();
            if (other && other.id !== c!.id) throw new Error("This email already has a portal for another client.");
            userId = existing.id;
          }
        }
        if (!userId) {
          const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { full_name: c!.full_name } } });
          if (error) throw new Error(error.message);
          userId = data.user.id; link = data.properties.action_link;
          await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "client" } });
          await admin.from("profiles").upsert({ id: userId, email, full_name: c!.full_name, role: "client", active: true });
        } else {
          // Already has an account: a fresh link to (re)set the password
          const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
          if (error) throw new Error(error.message);
          link = data.properties.action_link;
          await admin.from("profiles").update({ active: true }).eq("id", userId);
        }
        await admin.from("contacts").update({ client_user_id: userId, portal_invited_at: new Date().toISOString() }).eq("id", c!.id);
        await admin.from("audit_log").insert({ actor_id: caller!.id, action: "portal_invited", entity: "contact", entity_id: c!.id, details: { email } });
        // Try to email it from the shared mailbox; staff can always copy the link instead.
        let emailed = false, emailError = "";
        if (graphConfigured()) {
          const { data: integ } = await admin.from("integration_settings").select("shared_mailbox").eq("id", 1).single();
          const first = String(c!.full_name || "").split(" ")[0] || "there";
          try {
            await graphSendMail({ from: integ?.shared_mailbox ?? "info@gracefulimmigration.ca", to: [email], subject: "Your secure client portal - Graceful Immigration",
              html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1C2333;max-width:560px">
                <p>Hello ${escapeHtml(first)},</p><p>Graceful Immigration Consultant Inc. has opened a secure client portal for you. In the portal you can sign your agreements, see your invoices, upload the documents we ask for and message our office.</p>
                <p style="margin:22px 0"><a href="${link}" style="background:#0B2A5C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Set your password and sign in</a></p>
                <p style="color:#5B6476;font-size:13px">This link is private to you and works once. Afterwards, sign in at ${HUB} with this email address. If you didn't expect this email, you can ignore it.</p>
                <p style="color:#5B6476;font-size:13px">Graceful Immigration Consultant Inc. · (403) 915-4230 · gracefulimmigration.ca</p></div>` });
            emailed = true;
          } catch (e) { emailError = (e as Error).message; }
        }
        return json(req, { ok: true, link, emailed, email_error: emailError });
      }
      case "access": {
        if (!(await can("portal.manage"))) return json(req, { error: "Not allowed" }, 403);
        if (!c!.client_user_id) throw new Error("This client hasn't been invited yet.");
        await admin.from("profiles").update({ active: body.on === true }).eq("id", c!.client_user_id).eq("role", "client");
        await admin.from("audit_log").insert({ actor_id: caller!.id, action: body.on ? "portal_access_on" : "portal_access_off", entity: "contact", entity_id: c!.id, details: {} });
        return json(req, { ok: true });
      }
      case "share": {
        if (!(await can("portal.manage"))) return json(req, { error: "Not allowed" }, 403);
        const { data: d } = await admin.from("client_documents").select("id, contact_id, name").eq("id", s("document_id", 60)).maybeSingle();
        if (!d) throw new Error("Document not found.");
        await admin.from("client_documents").update({ shared: body.shared === true }).eq("id", d.id);
        await admin.from("audit_log").insert({ actor_id: caller!.id, action: body.shared ? "portal_document_shared" : "portal_document_unshared", entity: "contact", entity_id: d.contact_id, details: { name: d.name } });
        return json(req, { ok: true });
      }
      case "thread": {
        if (!(await can("crm.view"))) return json(req, { error: "Not allowed" }, 403);
        const { data } = await admin.from("portal_messages").select("id, from_client, body, created_at, read_by_client_at, sender_id, profiles:sender_id(full_name)").eq("contact_id", c!.id).order("created_at").limit(300);
        await admin.from("portal_messages").update({ read_by_staff_at: new Date().toISOString() }).eq("contact_id", c!.id).eq("from_client", true).is("read_by_staff_at", null);
        return json(req, { messages: (data ?? []).map((m: any) => ({ id: m.id, from_client: m.from_client, body: m.body, at: m.created_at, read: !!m.read_by_client_at, who: m.from_client ? c!.full_name : m.profiles?.full_name || "Staff" })) });
      }
      case "reply": {
        if (!(await can("portal.manage"))) return json(req, { error: "You don't have permission to message clients." }, 403);
        const text = String(body.body ?? "").trim().slice(0, 5000);
        if (!text) throw new Error("Write a message first.");
        await admin.from("portal_messages").insert({ contact_id: c!.id, sender_id: caller!.id, from_client: false, body: text });
        await admin.from("activities").insert({ type: "note", direction: "outbound", subject: "Portal message to client", contact_id: c!.id, author_id: caller!.id, body: text });
        // Let the client know without putting the message itself in an email.
        if (c!.email && c!.client_user_id && graphConfigured()) {
          const { data: integ } = await admin.from("integration_settings").select("shared_mailbox").eq("id", 1).single();
          await graphSendMail({ from: integ?.shared_mailbox ?? "info@gracefulimmigration.ca", to: [String(c!.email).toLowerCase()], subject: "You have a new message - Graceful Immigration",
            html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1C2333"><p>Hello ${escapeHtml(String(c!.full_name || "").split(" ")[0] || "there")},</p>
              <p>You have a new secure message from Graceful Immigration Consultant Inc. Please sign in to your client portal to read it:</p><p><a href="${HUB}">${HUB}</a></p>
              <p style="color:#5B6476;font-size:13px">For your privacy, messages are only shown in the portal.</p></div>` }).catch(() => {});
        }
        return json(req, { ok: true });
      }
    }
    return json(req, { error: "Unknown action" }, 400);
  }
});
