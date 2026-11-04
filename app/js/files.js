// Client documents stored in OneDrive: one folder per client ("<date> <client name>"), with sub-folders by type.
// The browser uploads straight to Microsoft through a one-time upload link; the dashboard keeps the list.
import { can, esc, icon, fmtDateTime, callFn, toast, fail, modal, confirmBox, staffName, db } from './core.js';

export const DOC_CAT = { agreements: 'Agreements', representative: 'Representative & consent', documents: 'Client documents', forms: 'Forms & submissions', correspondence: 'Correspondence', decisions: 'IRCC & IRB decisions' };

// What a document is, grouped by the OneDrive sub-folder it goes in. "Other" lets the user type a name.
export const DOC_TYPES = {
  representative: ['Use of a Representative (IMM 5476)', 'Authority to Release Personal Information to a Designated Individual (IMM 5475)',
    'Withdrawal of representative / cancel authorization', 'Counsel Contact Information (IRB)', 'Client consent (privacy, AI and communication)',
    'Client identity verification record', 'ATIP consent / access to information request', 'GCMS / ATIP notes received'],
  agreements: ['Consultation agreement', 'Retainer agreement', 'Amendment to retainer', 'Non-engagement letter', 'Closing / termination letter',
    'Signed agreement', 'Signed agreement (paper scan)', 'Invoice', 'Receipt / proof of payment', 'Trust account statement'],
  documents: ['Passport (all pages)', 'National ID card', 'Birth certificate', 'Photos (IRCC specifications)', 'Current status in Canada (visa, permit, PR card)',
    'Travel history / entry and exit records', 'Name change document', 'Marriage certificate', 'Divorce certificate / decree', 'Death certificate',
    'Custody / adoption documents', 'Children’s birth certificates', 'Relationship evidence (photos, messages, joint documents)', 'Proof of cohabitation (lease, bills)',
    'Letters of support', 'Language test results (IELTS, CELPIP, TEF, TCF, PTE)', 'Educational credential assessment (ECA)', 'Diplomas and transcripts',
    'Letter of acceptance (school)', 'Provincial attestation letter (PAL / TAL)', 'Proof of tuition payment', 'Study plan / statement of purpose', 'Job offer letter',
    'LMIA / offer of employment number', 'Employment reference letters', 'Resume / CV', 'Pay stubs', 'T4 / Notice of Assessment / tax returns', 'Bank statements / proof of funds',
    'Sponsor income documents', 'Business documents', 'Property / assets documents', 'Police certificate', 'Immigration medical exam confirmation (IMM 1017)',
    'Medical / psychological report', 'Military service records', 'Evidence of risk (refugee claim)', 'Country condition documents (NDP)', 'Affidavit / statutory declaration',
    'Letter of explanation', 'Translation and translator’s affidavit'],
  forms: ['Generic Application Form (IMM 0008)', 'Schedule A – Background / Declaration (IMM 5669)', 'Additional Family Information (IMM 5406)',
    'Application to Sponsor and Undertaking (IMM 1344)', 'Sponsorship Evaluation (IMM 5481)', 'Relationship Information and Sponsorship Evaluation (IMM 5532)',
    'Statutory Declaration of Common-law Union (IMM 5409)', 'Family Information (IMM 5645)', 'Visitor visa application (IMM 5257)', 'Study permit application (IMM 1294)',
    'Work permit application (IMM 1295)', 'Extension / change of conditions in Canada (IMM 5708 / 5709 / 5710)', 'Invitation letter', 'Financial evaluation (IMM 1283)',
    'Express Entry profile / e-APR', 'Provincial nomination (PNP) documents', 'Citizenship application (CIT 0002)', 'PR card application (IMM 5444)',
    'Basis of Claim form (BOC)', 'Notice of appeal (IAD / RAD)', 'Humanitarian and compassionate (H&C) submissions', 'Pre-removal risk assessment (PRRA)',
    'Document checklist (IRCC)', 'Submission / cover letter', 'Representative submissions / legal brief', 'Government fee payment receipt', 'Completed application package (as submitted)'],
  correspondence: ['Email with the client', 'Letter to the client', 'IRCC web form / letter to IRCC', 'IRCC web form reply', 'Letter to / from the IRB',
    'Meeting or call notes', 'Letter from a third party'],
  decisions: ['Acknowledgement of receipt (AOR)', 'Biometrics instruction letter', 'Medical exam request', 'Request for additional documents', 'Procedural fairness letter',
    'Interview / hearing notice', 'Passport request', 'Approval / Confirmation of PR (COPR / eCOPR)', 'Visa / permit issued', 'Refusal letter', 'IRB decision', 'Citizenship test / oath notice'],
};
// Who can see, upload and delete is set by the owner on Team & Access (Documents permissions).
export const canViewDocs = () => can('documents.view');
export const canUploadDocs = () => can('documents.upload');
export const canDeleteDocs = () => can('documents.delete');
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// OneDrive takes large files in pieces (multiples of 320 KB).
export async function putChunks(url, file, onProgress) {
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
export async function uploadFile(file, { contactId, category = 'documents', docType = null, caseId = null, checklistItemId = null, agreementId = null }, onProgress) {
  if (!file.size) throw new Error(`“${file.name}” is empty.`);
  const ctx = { contact_id: contactId, category, case_id: caseId, checklist_item_id: checklistItemId, agreement_id: agreementId };
  const { upload_url } = await callFn('files', { action: 'upload_session', ...ctx, file_name: file.name, size: file.size });
  const item = await putChunks(upload_url, file, onProgress);
  return callFn('files', { action: 'register', ...ctx, doc_type: docType, item_id: item.id });
}

export async function openDoc(id) {
  const w = window.open('about:blank', '_blank');
  try { const r = await callFn('files', { action: 'open', id }); if (w) w.location = r.url; else location.href = r.url; }
  catch (e) { w?.close(); fail(e); }
}

// "What is it?" picker: the value is "<folder>|<listed type>"; "<folder>|" means Other, with a typed name.
function typeField(category = '', docType = '') {
  const listed = category && (DOC_TYPES[category] || []).includes(docType);
  const sel = category ? `${category}|${listed ? docType : ''}` : '';
  return `<div class="field"><label>What is it?</label><select class="input" id="dt"><option value="">Choose the document…</option>${Object.entries(DOC_TYPES).map(([k, list]) => `<optgroup label="${esc(DOC_CAT[k])}">${list.map((t) => `<option value="${k}|${esc(t)}" ${sel === `${k}|${t}` ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="${k}|" ${sel === `${k}|` ? 'selected' : ''}>Other (${esc(DOC_CAT[k].toLowerCase())})…</option></optgroup>`).join('')}</select></div>
      <div class="field" id="otw" ${sel && sel.endsWith('|') ? '' : 'hidden'}><label>Document name</label><input class="input" id="ot" maxlength="120" value="${listed ? '' : esc(docType || '')}" placeholder="e.g. Sponsor’s employment letter"></div>`;
}
const wireType = (m) => { const dt = m.querySelector('#dt'); dt.onchange = () => { m.querySelector('#otw').hidden = !(dt.value && dt.value.endsWith('|')); }; };
function readType(m) {
  const [category, listed] = m.querySelector('#dt').value.split('|');
  if (!category) throw new Error('Choose what the document is.');
  const docType = listed || m.querySelector('#ot').value.trim();
  if (!docType) throw new Error('Type the document name.');
  return { category, docType };
}

/** Edit a document: its name, what it is (moves it to the matching folder) and, optionally, a new version of the file. */
export function editDoc(d, done) {
  const ext = (/\.[A-Za-z0-9]{1,8}$/.exec(d.name) || [''])[0];
  modal({
    title: 'Edit document',
    body: `<div class="field"><label>File name</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input class="input" id="nm" maxlength="110" value="${esc(d.name.slice(0, d.name.length - ext.length))}"><span style="color:var(--muted)">${esc(ext)}</span></div></div>
      ${typeField(d.category, d.doc_type || '')}
      <div class="field"><label>Replace the file (optional)</label><input class="input" type="file" id="rf">
        <small style="color:var(--muted)">Uploads a corrected or newer copy in place of this one. OneDrive keeps the earlier copy in the file’s version history.</small></div><div id="prog" style="font-size:13px"></div>`,
    onOpen: wireType,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-gold', onClick: async (m) => {
      const { category, docType } = readType(m);
      const name = m.querySelector('#nm').value.trim();
      if (!name) throw new Error('Enter a file name.');
      const file = m.querySelector('#rf').files[0];
      if (file && !file.size) throw new Error(`“${file.name}” is empty.`);
      let row = d;
      if (name + ext !== d.name || category !== d.category || docType !== (d.doc_type || '')) row = await callFn('files', { action: 'update', id: d.id, name, category, doc_type: docType });
      if (file) {
        const prog = m.querySelector('#prog');
        const { upload_url } = await callFn('files', { action: 'replace_session', id: d.id, file_name: file.name, size: file.size });
        await putChunks(upload_url, file, (p) => { prog.textContent = `Uploading ${file.name} — ${Math.round(p * 100)}%`; });
        row = await callFn('files', { action: 'replace_done', id: d.id, file_name: file.name });
      }
      toast(file ? 'New version uploaded' : 'Document updated'); done?.(row);
    } }],
  });
}

/** Upload dialog: several files at once, with a type (sub-folder) and progress. */
export function uploadDialog(ctx, done) {
  modal({
    title: 'Upload documents',
    body: `<p style="margin-bottom:10px;font-size:13px;color:var(--muted)">Files go to the client's OneDrive folder${ctx.folderName ? ` <b>${esc(ctx.folderName)}</b>` : ' (created automatically, named by date and client name)'}.</p>
      ${typeField()}
      <div class="field"><label>Files (up to 250 MB each)</label><input class="input" type="file" id="fs" multiple></div><div id="prog" style="font-size:13px"></div>`,
    onOpen: wireType,
    actions: [{ label: 'Cancel' }, { label: 'Upload', cls: 'btn-gold', onClick: async (m) => {
      const files = [...m.querySelector('#fs').files];
      const { category, docType } = readType(m);
      if (!files.length) throw new Error('Choose at least one file.');
      const prog = m.querySelector('#prog'), out = [];
      for (const [i, f] of files.entries()) {
        prog.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name}…`;
        out.push(await uploadFile(f, { ...ctx, category, docType }, (p) => { prog.textContent = `Uploading ${i + 1} of ${files.length}: ${f.name} — ${Math.round(p * 100)}%`; }));
      }
      toast(files.length > 1 ? `${files.length} files uploaded` : 'File uploaded'); done?.(out);
    } }],
  });
}

/** Documents list for a client (optionally only one case), with upload, open and delete. */
export async function documentsPanel(el, { contactId, caseId = null }) {
  if (!canViewDocs()) { el.innerHTML = `<div class="empty" style="padding:22px">${icon('lock')}<div>You don't have access to client documents. The owner can grant it on Team &amp; Access.</div></div>`; return; }
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
      ${rows.length ? `<table class="t"><tbody>${rows.map((d) => `<tr><td><a href="#" data-open="${d.id}"><b>${esc(d.name)}</b></a><br><small style="color:var(--muted)">${esc(d.doc_type || DOC_CAT[d.category])} · ${size(d.size || 0)} · ${fmtDateTime(d.created_at)}${d.uploaded_by ? ' · ' + esc(staffName(d.uploaded_by)) : ''}</small></td>
          <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm" data-open="${d.id}">Open</button>${canUploadDocs() ? ` <button class="btn btn-ghost btn-sm" data-edit="${d.id}" aria-label="Edit" title="Edit or replace">${icon('edit')}</button>` : ''}${canDeleteDocs() ? ` <button class="btn btn-ghost btn-sm" data-del="${d.id}" aria-label="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty" style="padding:22px">${icon('folder')}<div>No documents yet. Uploads and signed agreements are saved in the client's OneDrive folder.</div></div>`}`;
    el.querySelectorAll('#dc button').forEach((b) => { b.classList.toggle('on', b.dataset.k === cat); b.onclick = () => { cat = b.dataset.k; draw(); }; });
    el.querySelector('#up')?.addEventListener('click', () => uploadDialog({ contactId, caseId, folderName: c?.drive_folder_name }, () => documentsPanel(el, { contactId, caseId })));
    el.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
    el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editDoc(docs.find((x) => x.id === b.dataset.edit), () => documentsPanel(el, { contactId, caseId }))));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const d = docs.find((x) => x.id === b.dataset.del);
      if (!(await confirmBox('Delete document', `Move “${d.name}” to the OneDrive recycle bin and remove it from this list?`, 'Delete', true))) return;
      try { await callFn('files', { action: 'delete', id: d.id }); toast('Document deleted'); documentsPanel(el, { contactId, caseId }); } catch (e) { fail(e); }
    }));
  };
  draw();
}
