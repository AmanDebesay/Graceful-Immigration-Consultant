// Business Files: the practice's own important documents (insurance, CRA, incorporation, College, bank),
// kept in a private bucket that only people who manage business settings can open. Expiry dates trigger email alerts.
import { db, esc, icon, fmtDate, toast, fail, modal, confirmBox } from '../core.js';

const BUCKET = 'business-files';
const CATS = [
  ['insurance', 'Insurance', 'shield'], ['college', 'College (CICC)', 'award'], ['corporate', 'Corporate', 'briefcase'],
  ['tax', 'Tax & CRA', 'coins'], ['banking', 'Banking', 'wallet'], ['licences', 'Licences & permits', 'idcard'],
  ['contracts', 'Contracts & leases', 'pen'], ['other', 'Other', 'folder'],
];
const CAT = Object.fromEntries(CATS.map(([k, l, i]) => [k, { l, i }]));
// What a licensed practice is expected to keep on file. A record "covers" an item when its category and title match.
const EXPECTED = [
  ['insurance', /liab|e&o|errors/i, 'Professional liability (E&O) insurance', 'Required by the College every year.'],
  ['college', /licen|good standing|membership|certificate/i, 'College licence / certificate of good standing', 'Your current CICC licence record.'],
  ['college', /client account|trust/i, 'College notified of client account', 'Proof you told the College about the trust account.'],
  ['corporate', /incorporat|articles/i, 'Certificate and articles of incorporation', 'From Alberta Corporate Registry.'],
  ['corporate', /annual return/i, 'Alberta annual return', 'Filed every year in the anniversary month.'],
  ['tax', /gst|hst|business number/i, 'GST/HST registration', 'CRA confirmation of your GST account.'],
  ['banking', /client|trust/i, 'Client (trust) account documents', 'Account opening papers from the bank.'],
  ['banking', /operating|business account/i, 'Operating account documents', 'Account opening papers from the bank.'],
  ['licences', /business licen/i, 'Municipal business licence (if required)', 'Check with the City of Lethbridge.'],
];
const days = (d) => d ? Math.round((Date.parse(d) - Date.parse(new Date().toLocaleDateString('en-CA'))) / 864e5) : null;
function expiryPill(d) {
  const n = days(d);
  if (n === null) return '<span class="ap ap-navy">' + icon('check') + ' No expiry</span>';
  if (n < 0) return `<span class="ap ap-red">${icon('alert')} Expired ${fmtDate(d)}</span>`;
  if (n <= 60) return `<span class="ap ap-gold">${icon('clock')} Expires in ${n} day${n === 1 ? '' : 's'}</span>`;
  return `<span class="ap ap-green">${icon('calendar')} Valid to ${fmtDate(d)}</span>`;
}
const kb = (n) => !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export async function render(el) {
  let cat = sessionStorage.getItem('gi_bf_cat') || 'all', q = '';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="cats"><button data-k="all">All</button>${CATS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="grow"></div><input class="input" id="q" placeholder="Search files" style="max-width:220px">
      <button class="btn btn-gold" id="add">${icon('upload')} Add business file</button></div>
    <div class="alert info">Private to the owner and anyone allowed to manage Business Settings. Clients and other staff never see these files. You get an email 60, 30 and 7 days before anything expires, and on the day it expires.</div>
    <div class="au-tiles" id="tiles"></div>
    <div class="bf-grid"><div class="card"><div class="card-h"><h3>${icon('folder')} Business files</h3></div><div class="card-b" id="list"></div></div>
      <div class="card"><div class="card-h"><h3>${icon('checksq')} What a practice should keep</h3></div><div class="card-b" id="exp"></div></div></div>`;
  el.querySelector('#cats').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { cat = b.dataset.k; sessionStorage.setItem('gi_bf_cat', cat); draw(); } };
  el.querySelector('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  el.querySelector('#add').onclick = () => editor(null, load);
  let rows = [];
  async function load() {
    const { data, error } = await db.from('business_documents').select('*').order('category').order('created_at', { ascending: false });
    if (error) { el.querySelector('#list').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    rows = data || []; draw();
  }
  function draw() {
    el.querySelectorAll('#cats button').forEach((b) => b.classList.toggle('on', b.dataset.k === cat));
    const soon = rows.filter((r) => { const n = days(r.expires_on); return n !== null && n >= 0 && n <= 60; }).length;
    const expired = rows.filter((r) => days(r.expires_on) < 0).length, noFile = rows.filter((r) => !r.file_path).length;
    const covered = EXPECTED.filter(([c, re]) => rows.some((r) => r.category === c && re.test(r.title))).length;
    el.querySelector('#tiles').innerHTML = [['folder', 'Files on record', rows.length], ['clock', 'Expiring in 60 days', soon + expired], ['upload', 'Waiting for a file', noFile], ['checksq', 'Checklist covered', `${covered} / ${EXPECTED.length}`]]
      .map(([i, l, v]) => `<div class="au-tile">${icon(i)}<div><small>${l}</small><b>${v}</b></div></div>`).join('');
    const list = rows.filter((r) => (cat === 'all' || r.category === cat) && (!q || [r.title, r.issuer, r.reference_no, r.notes, r.file_name].join(' ').toLowerCase().includes(q)));
    el.querySelector('#list').innerHTML = list.length ? `<div class="bf-list">${list.map((r) => `<div class="bf-row">
        <span class="bf-ic">${icon(CAT[r.category]?.i || 'folder')}</span>
        <div class="bf-main"><b>${esc(r.title)}</b><small>${esc(CAT[r.category]?.l || '')}${r.issuer ? ` · ${esc(r.issuer)}` : ''}${r.reference_no ? ` · ${esc(r.reference_no)}` : ''}${r.issued_on ? ` · from ${fmtDate(r.issued_on)}` : ''}</small>
          ${r.notes ? `<p>${esc(r.notes)}</p>` : ''}
          <div class="bf-tags">${expiryPill(r.expires_on)}${r.file_path ? `<span class="ap ap-blue">${icon('file')} ${esc(r.file_name || 'File')} ${kb(r.file_size)}</span>` : `<span class="ap ap-gold">${icon('upload')} No file yet</span>`}</div></div>
        <div class="bf-act">${r.file_path ? `<button class="btn btn-sm btn-primary" data-open="${r.id}">${icon('file')} Open</button>` : `<button class="btn btn-sm btn-gold" data-edit="${r.id}">${icon('upload')} Upload</button>`}
          <button class="btn btn-sm" data-edit="${r.id}">${icon('pen')} Edit</button><button class="btn btn-sm btn-ghost" data-del="${r.id}" title="Delete">${icon('trash')}</button></div></div>`).join('')}</div>`
      : `<div class="empty">${icon('folder')}<div>${rows.length ? 'Nothing matches.' : 'No business files yet.'}</div></div>`;
    el.querySelector('#exp').innerHTML = EXPECTED.map(([c, re, t, hint]) => {
      const ok = rows.some((r) => r.category === c && re.test(r.title));
      return `<div class="bs-chk ${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'alert')}<span><b style="color:inherit">${esc(t)}</b><br><small style="color:#667085">${esc(hint)}</small></span>
        ${ok ? '' : `<button class="btn btn-sm" style="margin-left:auto" data-new="${c}" data-title="${esc(t)}">${icon('plus')} Add</button>`}</div>`;
    }).join('');
  }
  el.onclick = async (e) => {
    const t = e.target.closest('[data-open],[data-edit],[data-del],[data-new]'); if (!t) return;
    const r = rows.find((x) => x.id === (t.dataset.open || t.dataset.edit || t.dataset.del));
    try {
      if (t.dataset.open) {
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(r.file_path, 600);
        if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener');
      } else if (t.dataset.edit) editor(r, load);
      else if (t.dataset.new) editor({ category: t.dataset.new, title: t.dataset.title }, load);
      else if (t.dataset.del && await confirmBox('Delete business file', `Delete "${r.title}" and its file? This cannot be undone.`, 'Delete', true)) {
        if (r.file_path) await db.storage.from(BUCKET).remove([r.file_path]);
        const { error } = await db.from('business_documents').delete().eq('id', r.id); if (error) throw error;
        toast('Deleted'); load();
      }
    } catch (err) { fail(err); }
  };
  await load();
}

function editor(r, done) {
  const v = r || {};
  const f = (k, l, type = 'text', extra = '') => `<div class="field"><label for="b_${k}">${l}</label><input class="input" id="b_${k}" type="${type}" value="${esc(v[k] ?? '')}" ${extra}></div>`;
  modal({
    title: v.id ? 'Edit business file' : 'Add business file', wide: true,
    body: `<div class="row-2"><div class="field"><label for="b_category">Category</label><select class="input" id="b_category">${CATS.map(([k, l]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${f('title', 'Title')}</div>
      <div class="row-2">${f('issuer', 'Issued by (insurer, CRA, bank, College…)')}${f('reference_no', 'Policy / reference number')}</div>
      <div class="row-2">${f('issued_on', 'Start or issue date', 'date')}${f('expires_on', 'Expiry or renewal date (leave empty if none)', 'date')}</div>
      <div class="field"><label for="b_notes">Notes</label><textarea class="input" id="b_notes" rows="3">${esc(v.notes || '')}</textarea></div>
      <div class="field"><label for="b_file">${v.file_path ? `Replace file (now: ${esc(v.file_name || '')})` : 'File (PDF, image, Word or Excel, up to 25 MB)'}</label><input class="input" id="b_file" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"></div>`,
    actions: [{ label: 'Cancel' }, { label: v.id ? 'Save' : 'Add file', cls: 'btn-primary', onClick: async (m) => {
      const g = (k) => m.querySelector('#b_' + k).value.trim();
      const row = { category: g('category'), title: g('title'), issuer: g('issuer') || null, reference_no: g('reference_no') || null,
        issued_on: g('issued_on') || null, expires_on: g('expires_on') || null, notes: g('notes') || null };
      if (!row.title) throw new Error('Give the file a title.');
      const file = m.querySelector('#b_file').files[0];
      if (file) {
        if (file.size > 25 * 1024 * 1024) throw new Error('The file is larger than 25 MB.');
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
        const path = `${row.category}/${crypto.randomUUID()}.${ext}`;
        const { error: ue } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (ue) throw ue;
        Object.assign(row, { file_path: path, file_name: file.name.slice(0, 160), file_size: file.size, mime: file.type || null });
      }
      const { error } = v.id ? await db.from('business_documents').update(row).eq('id', v.id) : await db.from('business_documents').insert(row);
      if (error) { if (row.file_path) await db.storage.from(BUCKET).remove([row.file_path]); throw error; }
      if (file && v.file_path) await db.storage.from(BUCKET).remove([v.file_path]);
      toast(v.id ? 'Saved' : 'Business file added'); done();
    } }],
  });
}
