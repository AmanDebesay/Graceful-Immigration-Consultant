// All client documents in one place (stored in OneDrive). Access is set by the owner on Team & Access.
import { db, esc, icon, fmtDateTime, staffName, modal, confirmBox, toast, fail, callFn } from '../core.js';
import { DOC_CAT, canUploadDocs, canDeleteDocs, openDoc, uploadDialog } from '../files.js';

const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function render(el) {
  let cat = 'all', q = '';
  el.innerHTML = `<div class="toolbar"><div class="search">${icon('search')}<input id="q" placeholder="Search by file or client name"></div>
      <div class="seg" id="dc"><button data-k="all">All</button>${Object.entries(DOC_CAT).map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="grow"></div>${canUploadDocs() ? `<button class="btn btn-gold" id="up">${icon('plus')} Upload</button>` : ''}</div>
    <p class="dk-muted" style="margin:0 0 12px;font-size:13px">${icon('folder')} Files are kept in OneDrive, one folder per client (date + client name). Every time a file is opened it is recorded in the audit log.</p>
    <div class="card"><div class="table-wrap" id="list"><div class="loading">Loading…</div></div></div>`;

  const { data, error } = await db.from('client_documents').select('*, contacts(id, full_name), cases(id, case_number)').order('created_at', { ascending: false }).limit(2000);
  if (error) { el.querySelector('#list').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  let docs = data || [];

  const draw = () => {
    el.querySelectorAll('#dc button').forEach((b) => b.classList.toggle('on', b.dataset.k === cat));
    const s = q.toLowerCase();
    const rows = docs.filter((d) => (cat === 'all' || d.category === cat) && (!s || d.name.toLowerCase().includes(s) || (d.contacts?.full_name || '').toLowerCase().includes(s)));
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>File</th><th>Client</th><th>Type</th><th>Added</th><th></th></tr></thead><tbody>
      ${rows.map((d) => `<tr><td><a href="#" data-open="${d.id}"><b>${esc(d.name)}</b></a><br><small style="color:var(--muted)">${size(d.size || 0)}${d.cases ? ` · <a href="#/cases/${d.cases.id}">${esc(d.cases.case_number)}</a>` : ''}</small></td>
        <td>${d.contacts ? `<a href="#/contacts/${d.contacts.id}">${esc(d.contacts.full_name)}</a>` : '—'}</td><td>${esc(DOC_CAT[d.category] || d.category)}</td>
        <td>${fmtDateTime(d.created_at)}${d.uploaded_by ? `<br><small style="color:var(--muted)">${esc(staffName(d.uploaded_by))}</small>` : ''}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm" data-open="${d.id}">Open</button>${canDeleteDocs() ? ` <button class="btn btn-ghost btn-sm" data-del="${d.id}" aria-label="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('folder')}<div>${docs.length ? 'No documents match.' : 'No documents yet. Upload here, from a client’s Documents tab, a case, or a checklist item. Signed agreements are saved automatically.'}</div></div>`;
    el.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const d = docs.find((x) => x.id === b.dataset.del);
      if (!(await confirmBox('Delete document', `Move “${d.name}” to the OneDrive recycle bin and remove it from this list?`, 'Delete', true))) return;
      try { await callFn('files', { action: 'delete', id: d.id }); docs = docs.filter((x) => x.id !== d.id); toast('Document deleted'); draw(); } catch (e) { fail(e); }
    }));
  };
  el.querySelector('#q').oninput = (e) => { q = e.target.value.trim(); draw(); };
  el.querySelector('#dc').onclick = (e) => { if (e.target.dataset.k) { cat = e.target.dataset.k; draw(); } };
  el.querySelector('#up')?.addEventListener('click', async () => {
    const { data: cs } = await db.from('contacts').select('id, full_name, drive_folder_name').order('full_name').limit(5000);
    modal({
      title: 'Upload documents',
      body: `<div class="field"><label>Client</label><input class="input" id="cq" list="cl" placeholder="Start typing the client’s name"><datalist id="cl">${(cs || []).map((c) => `<option value="${esc(c.full_name)}"></option>`).join('')}</datalist></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Next', cls: 'btn-gold', onClick: async (m) => {
        const c = (cs || []).find((x) => x.full_name === m.querySelector('#cq').value.trim());
        if (!c) throw new Error('Choose a client from the list.');
        setTimeout(() => uploadDialog({ contactId: c.id, folderName: c.drive_folder_name }, () => render(el)), 0);
      } }],
    });
  });
  draw();
}
