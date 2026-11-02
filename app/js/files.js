// Client documents stored in OneDrive: one folder per client ("<date> <client name>"), with sub-folders by type.
// The browser uploads straight to Microsoft through a one-time upload link; the dashboard keeps the list.
import { can, esc, icon, fmtDateTime, callFn, toast, fail, modal, confirmBox, staffName, db } from './core.js';

export const DOC_CAT = { documents: 'Client documents', agreements: 'Agreements', forms: 'Forms & submissions', correspondence: 'Correspondence', decisions: 'IRCC decisions' };
export const canUploadDocs = () => can('crm.edit') || can('checklists.work') || can('agreements.manage');
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// OneDrive takes large files in pieces (multiples of 320 KB).
async function putChunks(url, file, onProgress) {
  const CH = 320 * 1024 * 16;
  let start = 0, res;
  while (start < file.size) {
    const end = Math.min(start + CH, file.size);
    res = await fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` }, body: file.slice(start, end) });
    if (!res.ok) throw new Error(`Upload failed (${res.status}). Please try again.`);
    start = end; onProgress?.(end / file.size);
  }
  return res.json();
}

/** Uploads one file into the client's OneDrive folder and adds it to their documents. */
export async function uploadFile(file, { contactId, category = 'documents', caseId = null, checklistItemId = null, agreementId = null }, onProgress) {
  if (!file.size) throw new Error(`“${file.name}” is empty.`);
  const ctx = { contact_id: contactId, category, case_id: caseId, checklist_item_id: checklistItemId, agreement_id: agreementId };
  const { upload_url } = await callFn('files', { action: 'upload_session', ...ctx, file_name: file.name, size: file.size });
  const item = await putChunks(upload_url, file, onProgress);
  return callFn('files', { action: 'register', ...ctx, item_id: item.id });
}

export async function openDoc(id) {
  const w = window.open('about:blank', '_blank');
  try { const r = await callFn('files', { action: 'open', id }); if (w) w.location = r.url; else location.href = r.url; }
  catch (e) { w?.close(); fail(e); }
}

/** Upload dialog: several files at once, with a type (sub-folder) and progress. */
export function uploadDialog(ctx, done) {
  modal({
    title: 'Upload documents',
    body: `<p style="margin-bottom:10px;font-size:13px;color:var(--muted)">Files go to the client's OneDrive folder${ctx.folderName ? ` <b>${esc(ctx.folderName)}</b>` : ' (created automatically, named by date and client name)'}.</p>
      <div class="field"><label>Type</label><select class="input" id="cat">${Object.entries(DOC_CAT).map(([k, l]) => `<option value="${k}" ${k === (ctx.category || 'documents') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Files (up to 250 MB each)</label><input class="input" type="file" id="fs" multiple></div><div id="prog" style="font-size:13px"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Upload', cls: 'btn-gold', onClick: async (m) => {
      const files = [...m.querySelector('#fs').files];
      if (!files.length) throw new Error('Choose at least one file.');
      const prog = m.querySelector('#prog'), out = [];
      for (const [i, f] of files.entries()) {
        prog.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name}…`;
        out.push(await uploadFile(f, { ...ctx, category: m.querySelector('#cat').value }, (p) => { prog.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name} — ${Math.round(p * 100)}%`; }));
      }
      toast(files.length > 1 ? `${files.length} files uploaded` : 'File uploaded'); done?.(out);
    } }],
  });
}

/** Documents list for a client (optionally only one case), with upload, open and delete. */
export async function documentsPanel(el, { contactId, caseId = null }) {
  const [{ data: docs, error }, { data: c }] = await Promise.all([
    (caseId ? db.from('client_documents').select('*').eq('case_id', caseId) : db.from('client_documents').select('*').eq('contact_id', contactId)).order('created_at', { ascending: false }),
    db.from('contacts').select('drive_folder_name').eq('id', contactId).single()]);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  let cat = 'all';
  const draw = () => {
    const rows = (docs || []).filter((d) => cat === 'all' || d.category === cat);
    el.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px;gap:8px">
        <div class="seg" id="dc"><button data-k="all">All (${(docs || []).length})</button>${Object.entries(DOC_CAT).filter(([k]) => (docs || []).some((d) => d.category === k)).map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
        ${canUploadDocs() ? `<button class="btn btn-gold btn-sm" id="up">${icon('plus')} Upload</button>` : ''}</div>
      ${c?.drive_folder_name ? `<small class="dk-muted" style="display:block;margin-bottom:8px">${icon('folder')} OneDrive folder: <b>${esc(c.drive_folder_name)}</b></small>` : ''}
      ${rows.length ? `<table class="t"><tbody>${rows.map((d) => `<tr><td><a href="#" data-open="${d.id}"><b>${esc(d.name)}</b></a><br><small style="color:var(--muted)">${esc(DOC_CAT[d.category])} · ${size(d.size || 0)} · ${fmtDateTime(d.created_at)}${d.uploaded_by ? ' · ' + esc(staffName(d.uploaded_by)) : ''}</small></td>
          <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm" data-open="${d.id}">Open</button>${can('crm.edit') || can('cases.approve') ? ` <button class="btn btn-ghost btn-sm" data-del="${d.id}" aria-label="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty" style="padding:22px">${icon('folder')}<div>No documents yet. Uploads and signed agreements are saved in the client's OneDrive folder.</div></div>`}`;
    el.querySelectorAll('#dc button').forEach((b) => { b.classList.toggle('on', b.dataset.k === cat); b.onclick = () => { cat = b.dataset.k; draw(); }; });
    el.querySelector('#up')?.addEventListener('click', () => uploadDialog({ contactId, caseId, folderName: c?.drive_folder_name }, () => documentsPanel(el, { contactId, caseId })));
    el.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const d = docs.find((x) => x.id === b.dataset.del);
      if (!(await confirmBox('Delete document', `Move “${d.name}” to the OneDrive recycle bin and remove it from this list?`, 'Delete', true))) return;
      try { await callFn('files', { action: 'delete', id: d.id }); toast('Document deleted'); documentsPanel(el, { contactId, caseId }); } catch (e) { fail(e); }
    }));
  };
  draw();
}
