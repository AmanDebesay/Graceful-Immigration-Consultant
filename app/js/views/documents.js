// All client documents in one place (stored in OneDrive). Access is set by the owner on Team & Access.
// Two views: Folders (client folder → sub-folder → files, the same layout as OneDrive) and a flat List.
import { db, esc, icon, fmtDate, fmtDateTime, staffName, modal, confirmBox, toast, fail, callFn } from '../core.js';
import { DOC_CAT, canUploadDocs, canDeleteDocs, openDoc, uploadDialog, editDoc } from '../files.js';

const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
// Sub-folder numbers as they appear in OneDrive
const FOLDER_NO = { agreements: '01', documents: '02', forms: '03', correspondence: '04', decisions: '05', representative: '06' };
const FOLDERS = Object.keys(FOLDER_NO);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export async function render(el) {
  let view = store.get('gi_docs_view') === 'list' ? 'list' : 'folders', cat = 'all', q = '', client = null, sub = null;
  el.innerHTML = `<div class="toolbar"><div class="seg" id="vw"><button data-v="folders">${icon('folder')} Folders</button><button data-v="list">List</button></div>
      <div class="search">${icon('search')}<input id="q" placeholder="Search by file, document type or client"></div>
      <div class="seg" id="dc"><button data-k="all">All</button>${FOLDERS.map((k) => `<button data-k="${k}">${DOC_CAT[k]}</button>`).join('')}</div>
      <div class="grow"></div>${canUploadDocs() ? `<button class="btn btn-gold" id="up">${icon('plus')} Upload</button>` : ''}</div>
    <p class="dk-muted" style="margin:0 0 12px;font-size:13px">${icon('folder')} Files are kept in OneDrive, one folder per client (date + client name). Every time a file is opened it is recorded in the audit log.</p>
    <div id="crumbs"></div><div id="body"><div class="card"><div class="loading">Loading…</div></div></div>`;

  const { data, error } = await db.from('client_documents').select('*, contacts(id, full_name, drive_folder_name), cases(id, case_number)').order('created_at', { ascending: false }).limit(5000);
  if (error) { el.querySelector('#body').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  let docs = data || [];

  const folderName = (c) => c?.drive_folder_name || c?.full_name || 'Client';
  const matches = (d, s) => !s || d.name.toLowerCase().includes(s) || (d.doc_type || '').toLowerCase().includes(s) || (d.contacts?.full_name || '').toLowerCase().includes(s);

  const table = (rows, withClient) => rows.length ? `<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>File</th>${withClient ? '<th>Client</th>' : ''}<th>Folder</th><th>Added</th><th></th></tr></thead><tbody>
    ${rows.map((d) => `<tr><td><a href="#" data-open="${d.id}"><b>${esc(d.name)}</b></a><br><small style="color:var(--muted)">${d.doc_type ? `${esc(d.doc_type)} · ` : ''}${size(d.size || 0)}${d.cases ? ` · <a href="#/cases/${d.cases.id}">${esc(d.cases.case_number)}</a>` : ''}</small></td>
      ${withClient ? `<td>${d.contacts ? `<a href="#/contacts/${d.contacts.id}">${esc(d.contacts.full_name)}</a>` : '—'}</td>` : ''}<td>${esc(DOC_CAT[d.category] || d.category)}</td>
      <td>${fmtDateTime(d.created_at)}${d.uploaded_by ? `<br><small style="color:var(--muted)">${esc(staffName(d.uploaded_by))}</small>` : ''}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm" data-open="${d.id}">Open</button>${canUploadDocs() ? ` <button class="btn btn-ghost btn-sm" data-edit="${d.id}" aria-label="Edit" title="Edit or replace">${icon('edit')}</button>` : ''}${canDeleteDocs() ? ` <button class="btn btn-ghost btn-sm" data-del="${d.id}" aria-label="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`
    : `<div class="card"><div class="empty">${icon('folder')}<div>${docs.length ? 'Nothing here.' : 'No documents yet. Upload here, from a client’s Documents tab, a case, or a checklist item. Signed agreements are saved automatically.'}</div></div></div>`;

  const draw = () => {
    el.querySelectorAll('#vw button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    el.querySelectorAll('#dc button').forEach((b) => b.classList.toggle('on', b.dataset.k === cat));
    el.querySelector('#dc').hidden = view !== 'list';
    const s = q.toLowerCase(), body = el.querySelector('#body'), crumbs = el.querySelector('#crumbs');
    crumbs.innerHTML = '';
    if (view === 'list') {
      body.innerHTML = table(docs.filter((d) => (cat === 'all' || d.category === cat) && matches(d, s)), true);
    } else if (!client) {
      // Client folders
      const byClient = new Map();
      for (const d of docs) { if (!d.contacts) continue; const g = byClient.get(d.contacts.id) || { c: d.contacts, n: 0, last: d.created_at, hit: false }; g.n++; g.hit ||= matches(d, s); byClient.set(d.contacts.id, g); }
      const list = [...byClient.values()].filter((g) => g.hit || folderName(g.c).toLowerCase().includes(s)).sort((a, b) => folderName(a.c).localeCompare(folderName(b.c)));
      body.innerHTML = list.length ? `<div class="fold-grid">${list.map((g) => `<button class="fold" data-client="${g.c.id}">${icon('folder')}<span><b>${esc(folderName(g.c))}</b><small>${g.n} file${g.n === 1 ? '' : 's'} · last added ${fmtDate(g.last)}</small></span></button>`).join('')}</div>`
        : table([], false);
    } else {
      const own = docs.filter((d) => d.contact_id === client.id);
      crumbs.innerHTML = `<div class="crumbs"><a href="#" data-crumb="root">All clients</a> <span>›</span> ${sub ? `<a href="#" data-crumb="client">${esc(folderName(client))}</a> <span>›</span> <b>${FOLDER_NO[sub]} ${esc(DOC_CAT[sub])}</b>` : `<b>${esc(folderName(client))}</b>`}
        <span class="grow"></span><a class="btn btn-sm" href="#/contacts/${client.id}">${icon('user')} Client page</a>${canUploadDocs() ? ` <button class="btn btn-sm btn-gold" id="upHere">${icon('plus')} Upload to this client</button>` : ''}</div>`;
      if (!sub) {
        body.innerHTML = `<div class="fold-grid">${FOLDERS.map((k) => { const n = own.filter((d) => d.category === k).length;
          return `<button class="fold ${n ? '' : 'empty-f'}" data-sub="${k}">${icon('folder')}<span><b>${FOLDER_NO[k]} ${esc(DOC_CAT[k])}</b><small>${n ? `${n} file${n === 1 ? '' : 's'}` : 'Empty'}</small></span></button>`; }).join('')}</div>`;
      } else body.innerHTML = table(own.filter((d) => d.category === sub && matches(d, s)), false);
    }
    el.querySelectorAll('[data-client]').forEach((b) => (b.onclick = () => { client = docs.find((d) => d.contact_id === b.dataset.client).contacts; sub = null; draw(); }));
    el.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { sub = b.dataset.sub; draw(); }));
    el.querySelectorAll('[data-crumb]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); if (a.dataset.crumb === 'root') client = null; sub = null; draw(); }));
    el.querySelector('#upHere')?.addEventListener('click', () => uploadDialog({ contactId: client.id, folderName: client.drive_folder_name }, reload));
    el.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
    el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { const d = docs.find((x) => x.id === b.dataset.edit);
      editDoc(d, (row) => { docs = docs.map((x) => (x.id === row.id ? { ...x, ...row } : x)); draw(); }); }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const d = docs.find((x) => x.id === b.dataset.del);
      if (!(await confirmBox('Delete document', `Move “${d.name}” to the OneDrive recycle bin and remove it from this list?`, 'Delete', true))) return;
      try { await callFn('files', { action: 'delete', id: d.id }); docs = docs.filter((x) => x.id !== d.id); toast('Document deleted'); draw(); } catch (e) { fail(e); }
    }));
  };
  // After an upload, reload the list but stay in the same folder
  async function reload() {
    const { data: fresh } = await db.from('client_documents').select('*, contacts(id, full_name, drive_folder_name), cases(id, case_number)').order('created_at', { ascending: false }).limit(5000);
    docs = fresh || docs; if (client) client = docs.find((d) => d.contact_id === client.id)?.contacts || client; draw();
  }
  el.querySelector('#vw').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { view = b.dataset.v; store.set('gi_docs_view', view); draw(); } };
  el.querySelector('#q').oninput = (e) => { q = e.target.value.trim(); draw(); };
  el.querySelector('#dc').onclick = (e) => { if (e.target.dataset.k) { cat = e.target.dataset.k; draw(); } };
  el.querySelector('#up')?.addEventListener('click', async () => {
    const { data: cs } = await db.from('contacts').select('id, full_name, drive_folder_name').order('full_name').limit(5000);
    modal({
      title: 'Upload documents',
      body: `<div class="field"><label>Client</label><input class="input" id="cq" list="cl" placeholder="Start typing the client’s name" value="${client ? esc(client.full_name) : ''}"><datalist id="cl">${(cs || []).map((c) => `<option value="${esc(c.full_name)}"></option>`).join('')}</datalist></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Next', cls: 'btn-gold', onClick: async (m) => {
        const c = (cs || []).find((x) => x.full_name === m.querySelector('#cq').value.trim());
        if (!c) throw new Error('Choose a client from the list.');
        setTimeout(() => uploadDialog({ contactId: c.id, folderName: c.drive_folder_name }, reload), 0);
      } }],
    });
  });
  draw();
}
