// Client documents in OneDrive. Staff only (company email, two-step verified).
//   status          → is storage connected
//   test            → create/find the root folder (settings.manage)
//   upload_session  → OneDrive upload URL for one file in the client's folder; the browser uploads straight to Microsoft
//   register        → after upload: check the file is in that folder, then add it to the client's documents
//   open            → short-lived download link
//   delete          → move to the OneDrive recycle bin and remove from the list
//   save_agreement  → save a signed agreement's signed copy to "01 Agreements"
import { adminClient, callerProfile, corsHeaders, hasPerm, json } from "../_shared/common.ts";
import { graphConfigured } from "../_shared/m365.ts";
import { cleanName, clientFolder, deleteItem, driveConfig, getItem, rootFolder, saveAgreementToDrive, SUBFOLDER, uploadSession } from "../_shared/drive.ts";

const MAX = 250 * 1024 * 1024;
const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|js|jar|sh|dll)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const admin = adminClient();
  const caller = await callerProfile(req, admin);
  if (!caller || caller.role === "client") return json(req, { error: "Not allowed" }, 403);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(req, { error: "Invalid request" }, 400); }
  const can = (p: string) => hasPerm(admin, caller.role, p);
  const canUpload = () => can("documents.upload");

  // The case / checklist item / agreement must belong to the same client.
  async function links(contactId: string) {
    const out: Record<string, string | null> = { case_id: null, checklist_item_id: null, agreement_id: null };
    if (body.case_id) {
      const { data } = await admin.from("cases").select("contact_id").eq("id", body.case_id).maybeSingle();
      if (data?.contact_id !== contactId) throw new Error("That case belongs to another client.");
      out.case_id = body.case_id;
    }
    if (body.checklist_item_id) {
      const { data } = await admin.from("case_checklist_items").select("id, case_checklists(case_id, cases(contact_id))").eq("id", body.checklist_item_id).maybeSingle();
      if ((data as any)?.case_checklists?.cases?.contact_id !== contactId) throw new Error("That checklist belongs to another client.");
      out.checklist_item_id = body.checklist_item_id; out.case_id = out.case_id ?? (data as any).case_checklists.case_id;
    }
    if (body.agreement_id) {
      const { data } = await admin.from("agreements").select("contact_id").eq("id", body.agreement_id).maybeSingle();
      if (data?.contact_id !== contactId) throw new Error("That agreement belongs to another client.");
      out.agreement_id = body.agreement_id;
    }
    return out;
  }

  try {
    switch (body.action) {
      case "status": {
        const { data } = await admin.from("integration_settings").select("files_drive_user, files_root").eq("id", 1).single();
        return json(req, { configured: graphConfigured() && !!data?.files_drive_user, user: data?.files_drive_user ?? null, root: data?.files_root ?? null });
      }
      case "test": {
        if (!(await can("settings.manage"))) return json(req, { error: "Not allowed" }, 403);
        const r = await rootFolder(admin);
        return json(req, { ok: true, name: r?.name, web_url: r?.webUrl });
      }
      case "upload_session": {
        if (!(await canUpload())) return json(req, { error: "You don't have permission to upload client documents." }, 403);
        const contactId = String(body.contact_id ?? ""), category = String(body.category ?? "documents");
        const name = cleanName(String(body.file_name ?? ""));
        const size = Number(body.size ?? 0);
        if (!name || BLOCKED.test(name)) return json(req, { error: "This type of file can't be uploaded." }, 400);
        if (!(size > 0) || size > MAX) return json(req, { error: "Files must be between 1 byte and 250 MB." }, 400);
        if (!SUBFOLDER[category]) return json(req, { error: "Choose a document type." }, 400);
        await links(contactId);
        const f = await clientFolder(admin, contactId, category);
        const s = await uploadSession(f.user, f.folderId, name);
        return json(req, { upload_url: s.uploadUrl });
      }
      case "register": {
        if (!(await canUpload())) return json(req, { error: "You don't have permission to upload client documents." }, 403);
        const contactId = String(body.contact_id ?? ""), category = String(body.category ?? "documents");
        const l = await links(contactId);
        const f = await clientFolder(admin, contactId, category);
        const item = await getItem(f.user, String(body.item_id ?? ""));
        if (!item || item.parentReference?.id !== f.folderId) return json(req, { error: "The uploaded file wasn't found in the client's folder." }, 400);
        const { data, error } = await admin.from("client_documents").insert({
          contact_id: contactId, ...l, category, name: item.name, drive_item_id: item.id, web_url: item.webUrl,
          size: item.size, mime: item.file?.mimeType ?? null, uploaded_by: caller.id,
        }).select().single();
        if (error) throw error;
        return json(req, data);
      }
      case "open": {
        if (!(await can("documents.view"))) return json(req, { error: "You don't have access to client documents. Ask the owner." }, 403);
        const { data: d } = await admin.from("client_documents").select("drive_item_id, name, contact_id").eq("id", body.id).maybeSingle();
        if (!d) return json(req, { error: "Document not found." }, 404);
        const { user } = await driveConfig(admin);
        const item = await getItem(user, d.drive_item_id);
        if (!item) return json(req, { error: "This file is no longer in OneDrive (it may have been moved or deleted there)." }, 404);
        await admin.from("audit_log").insert({ actor_id: caller.id, action: "document_opened", entity: "contact", entity_id: d.contact_id, details: { name: d.name } });
        return json(req, { url: item["@microsoft.graph.downloadUrl"], web_url: item.webUrl, name: item.name, mime: item.file?.mimeType });
      }
      case "delete": {
        if (!(await can("documents.delete"))) return json(req, { error: "You don't have permission to delete client documents." }, 403);
        const { data: d } = await admin.from("client_documents").select("id, drive_item_id, name, contact_id").eq("id", body.id).maybeSingle();
        if (!d) return json(req, { error: "Document not found." }, 404);
        const { user } = await driveConfig(admin);
        await deleteItem(user, d.drive_item_id);
        await admin.from("client_documents").delete().eq("id", d.id);
        await admin.from("audit_log").insert({ actor_id: caller.id, action: "document_deleted", entity: "contact", entity_id: d.contact_id, details: { name: d.name } });
        return json(req, { ok: true });
      }
      case "save_agreement": {
        if (!(await can("agreements.manage"))) return json(req, { error: "Not allowed" }, 403);
        const doc = await saveAgreementToDrive(admin, String(body.agreement_id ?? ""), caller.id);
        return json(req, doc ?? { error: "Only signed agreements are saved." }, doc ? 200 : 400);
      }
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    console.error("files", body.action, e);
    return json(req, { error: (e as Error).message }, 400);
  }
});
