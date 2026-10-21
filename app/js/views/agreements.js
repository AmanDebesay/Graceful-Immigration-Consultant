import { db, state, can, esc, icon, fmtDate, timeAgo, modal } from '../core.js';
import { contactsList, contactOptions, orgSettings, itemsList, downloadCsv } from '../fin.js';
import { defaults } from '../agreement-templates.js';

export const AGR_STATUS = { draft: ['Draft', ''], sent: ['Sent', 'b-blue'], viewed: ['Viewed by client', 'b-gold'], signed: ['Signed', 'b-GREEN'], void: ['Void', ''] };
export const agrBadge = (s) => `<span class="badge ${AGR_STATUS[s]?.[1] || ''}">${AGR_STATUS[s]?.[0] || s}</span>`;
export const AGR_TYPE = { consultation: 'Initial Consultation Agreement', retainer: 'Retainer (Service) Agreement' };

export async function newAgreement({ contactId, caseId, type = 'retainer' } = {}) {
  const contacts = await contactsList();
  modal({
    title: 'New agreement',
    body: `<div class="field"><label>Agreement type</label><select class="input" id="t">
        <option value="consultation" ${type === 'consultation' ? 'selected' : ''}>Initial Consultation Agreement (before paid advice)</option>
        <option value="retainer" ${type === 'retainer' ? 'selected' : ''}>Retainer / Service Agreement (representation)</option></select></div>
      <div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, contactId)}</select></div>
      <div class="field" id="cw"><label>Case (optional)</label><select class="input" id="k"><option value="">None</option></select></div>`,
    onOpen: (m) => {
      const load = async () => {
        const cid = m.querySelector('#c').value;
        const { data } = cid ? await db.from('cases').select('id, case_number, title').eq('contact_id', cid) : { data: [] };
        m.querySelector('#k').innerHTML = '<option value="">None</option>' + (data || []).map((x) => `<option value="${x.id}" ${x.id === caseId ? 'selected' : ''}>${esc(x.case_number)} · ${esc(x.title)}</option>`).join('');
      };
      m.querySelector('#c').onchange = load; load();
    },
    actions: [{ label: 'Cancel' }, { label: 'Create draft', cls: 'btn-primary', onClick: async (m) => {
      const t = m.querySelector('#t').value, cid = m.querySelector('#c').value, kid = m.querySelector('#k').value || null;
      if (!cid) throw new Error('Choose a client.');
      const [{ data: contact }, settings, items, { data: caseRow }] = await Promise.all([
        db.from('contacts').select('*').eq('id', cid).single(), orgSettings(), itemsList(),
        kid ? db.from('cases').select('*').eq('id', kid).single() : { data: null }]);
      const item = items.find((i) => /1-Hour/i.test(i.name));
      const data = defaults(t, { contact, settings, caseRow, item });
      const { data: row, error } = await db.from('agreements').insert({ type: t, title: `${t === 'consultation' ? 'Initial Consultation Agreement' : 'Service Agreement'} — ${contact.full_name}`,
        contact_id: cid, case_id: kid, data, created_by: state.profile.id }).select('id').single();
      if (error) throw error;
      location.hash = `#/agreements/${row.id}`;
    } }],
  });
}

export async function render(el) {
  let filter = 'all';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="f">${[['all', 'All'], ['draft', 'Drafts'], ['out', 'Awaiting signature'], ['signed', 'Signed'], ['void', 'Void']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
    <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>${can('agreements.manage') ? `<button class="btn btn-gold" id="new">${icon('plus')} New agreement</button>` : ''}</div>
    <div class="alert info">Agreements follow the CICC Retainer Agreement Regulation and the 2024 Service Agreement Guide. An Initial Consultation Agreement is required before paid advice (RA 4.1). A Retainer Agreement is required for representation and must be provided within 10 days of starting work (RA 5.1).</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;
  el.querySelector('#f').onclick = (e) => { if (e.target.dataset.k) { filter = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => newAgreement());
  let rows = [];
  async function draw() {
    el.querySelectorAll('#f button').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    let q = db.from('agreements').select('id, number, type, title, status, sent_at, viewed_at, client_signed_at, created_at, contacts(full_name)').order('created_at', { ascending: false }).limit(500);
    if (filter === 'out') q = q.in('status', ['sent', 'viewed']); else if (filter !== 'all') q = q.eq('status', filter);
    rows = (await q).data || [];
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>No.</th><th>Agreement</th><th>Client</th><th>Status</th><th>Sent</th><th>Signed</th></tr></thead><tbody>
      ${rows.map((a) => `<tr class="click" data-id="${a.id}"><td><b>${esc(a.number)}</b></td><td>${esc(AGR_TYPE[a.type])}</td><td>${esc(a.contacts?.full_name || '')}</td>
        <td>${agrBadge(a.status)}</td><td>${a.sent_at ? timeAgo(a.sent_at) : '—'}</td><td>${a.client_signed_at ? fmtDate(a.client_signed_at) : '—'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('file')}<div>No agreements yet.</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/agreements/${tr.dataset.id}`)));
  }
  el.querySelector('#csv').onclick = () => downloadCsv('agreements.csv', [['Number', 'Type', 'Client', 'Status', 'Sent', 'Signed'],
    ...rows.map((a) => [a.number, AGR_TYPE[a.type], a.contacts?.full_name, a.status, a.sent_at, a.client_signed_at])]);
  draw();
}
