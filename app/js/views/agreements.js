import { db, state, can, esc, icon, fmtDate, timeAgo, modal } from '../core.js';
import { contactsList, contactOptions, downloadCsv } from '../fin.js';
import { defaults } from '../agreement-templates.js';

export const AGR_STATUS = { draft: ['Draft', ''], sent: ['Sent', 'b-blue'], viewed: ['Viewed by client', 'b-gold'], signed: ['Signed', 'b-GREEN'], void: ['Void', ''] };
export const agrBadge = (s) => `<span class="badge ${AGR_STATUS[s]?.[1] || ''}">${AGR_STATUS[s]?.[0] || s}</span>`;
export const AGR_TYPE = { consultation: 'Initial Consultation Agreement', retainer: 'Retainer (Service) Agreement' };
export const PRO_BONO_REASON = { family: 'Family member of the RCIC', friend: 'Personal friend of the RCIC', hardship: 'Financial hardship / client needs help', community: 'Community or charitable service', other: 'Other reason' };
export const proBonoBadge = (basis) => basis === 'pro_bono' ? ' <span class="badge b-blue">Pro bono</span>' : '';

const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const pkgTotal = (p) => (p.milestones || []).reduce((s, m) => s + Number(m.fee || 0), 0);

export async function newAgreement({ contactId, caseId, type = 'retainer' } = {}) {
  const [contacts, { data: settings }, { data: pkgs }] = await Promise.all([contactsList(), db.from('org_settings').select('*').eq('id', 1).single(),
    db.from('service_packages').select('*').eq('active', true).order('category').order('sort').order('name')]);
  const groups = [...new Set((pkgs || []).map((x) => x.category || 'Other services'))];
  modal({
    title: 'Generate agreement',
    body: `<div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, contactId)}</select>
        <small style="color:var(--muted)">Not in the list? Add them first with Contacts → New client.</small></div>
      <div class="field"><label>Agreement type</label><select class="input" id="t">
        <option value="consultation" ${type === 'consultation' ? 'selected' : ''}>Initial Consultation Agreement — before paid advice (RA 4.1)</option>
        <option value="retainer" ${type === 'retainer' ? 'selected' : ''}>Retainer / Service Agreement — representation (RA 5.1)</option></select></div>
      <div class="field"><label>Fee arrangement</label><select class="input" id="fb">
        <option value="paid">Paying client — professional fees apply</option><option value="pro_bono">Pro bono — no professional fees</option></select></div>
      <div class="field" id="rw" hidden><label>Why is this pro bono?</label><select class="input" id="r">
        ${Object.entries(PRO_BONO_REASON).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <small style="color:var(--muted)">For family and friends, the agreement adds a personal-relationship disclosure the client consents to.</small></div>
      <div class="field" id="pw"><label>Service (prices from Business Settings → Fee schedule)</label><select class="input" id="p">
        ${groups.map((g) => `<optgroup label="${esc(g)}">${(pkgs || []).filter((x) => (x.category || 'Other services') === g).map((x) => `<option value="${x.id}">${esc(x.name)} — ${pkgTotal(x) ? money(pkgTotal(x)) : 'price not set'}</option>`).join('')}</optgroup>`).join('')}
        <option value="">Custom — enter the program and fees in the editor</option></select>
        <div id="pinfo" style="font-size:12.5px;margin-top:6px"></div></div>
      <div class="field" id="lw"><label>Consultation length</label><select class="input" id="l">
        <option value="30">30 minutes — ${money(settings.consult_fee_30 ?? 30)}</option><option value="60" selected>60 minutes — ${money(settings.consult_fee_60 ?? 60)}</option></select></div>
      <div class="field" id="cw"><label>Case (optional)</label><select class="input" id="k"><option value="">None</option></select></div>`,
    onOpen: (m) => {
      const load = async () => {
        const cid = m.querySelector('#c').value;
        const { data } = cid ? await db.from('cases').select('id, case_number, title').eq('contact_id', cid) : { data: [] };
        m.querySelector('#k').innerHTML = '<option value="">None</option>' + (data || []).map((x) => `<option value="${x.id}" ${x.id === caseId ? 'selected' : ''}>${esc(x.case_number)} · ${esc(x.title)}</option>`).join('');
      };
      const sync = () => {
        const retainer = m.querySelector('#t').value === 'retainer', free = m.querySelector('#fb').value === 'pro_bono';
        m.querySelector('#pw').hidden = !retainer; m.querySelector('#cw').hidden = !retainer; m.querySelector('#lw').hidden = retainer; m.querySelector('#rw').hidden = !free;
        const pk = (pkgs || []).find((x) => x.id === m.querySelector('#p').value);
        m.querySelector('#pinfo').innerHTML = free ? '<span style="color:var(--muted)">Pro bono: the service wording is used and every professional fee is $0. Government fees remain the client’s responsibility.</span>'
          : !pk ? '<span style="color:var(--muted)">You will fill in the program and milestone fees in the editor.</span>'
          : pkgTotal(pk) ? `<span style="color:var(--muted)">${pk.milestones.map((x) => `${esc(x.name)}: ${money(x.fee)}`).join(' · ')}</span>`
            : '<span style="color:#B42318">This service has no price yet. Set it in Business Settings → Fee schedule, or enter the fees in the editor.</span>';
      };
      m.querySelector('#c').onchange = load; m.querySelector('#t').onchange = sync; m.querySelector('#p').onchange = sync; m.querySelector('#fb').onchange = sync;
      load(); sync();
    },
    actions: [{ label: 'Cancel' }, { label: 'Generate agreement', cls: 'btn-gold', onClick: async (m) => {
      const t = m.querySelector('#t').value, cid = m.querySelector('#c').value, kid = t === 'retainer' ? m.querySelector('#k').value || null : null;
      if (!cid) throw new Error('Choose a client.');
      const pkg = t === 'retainer' ? (pkgs || []).find((x) => x.id === m.querySelector('#p').value) || null : null;
      const minutes = Number(m.querySelector('#l').value);
      const [{ data: contact }, { data: caseRow }] = await Promise.all([
        db.from('contacts').select('*').eq('id', cid).single(),
        kid ? db.from('cases').select('*').eq('id', kid).single() : { data: null }]);
      const free = m.querySelector('#fb').value === 'pro_bono';
      const fee = minutes === 30 ? settings.consult_fee_30 ?? 30 : settings.consult_fee_60 ?? 60;
      const data = defaults(t, { contact, settings, caseRow, pkg, consult: { minutes, fee }, proBono: free ? m.querySelector('#r').value : null });
      const title = (t === 'consultation' ? 'Initial Consultation Agreement' : `Service Agreement${pkg ? ' (' + pkg.name + ')' : ''}`) + (free ? ' — pro bono' : '');
      const { data: row, error } = await db.from('agreements').insert({ type: t, title: `${title} — ${contact.full_name}`,
        contact_id: cid, case_id: kid, data, created_by: state.profile.id }).select('id').single();
      if (error) throw error;
      location.hash = `#/agreements/${row.id}`;
    } }],
  });
}

export async function render(el) {
  let filter = 'all';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="f">${[['all', 'All'], ['draft', 'Drafts'], ['out', 'Awaiting signature'], ['signed', 'Signed'], ['void', 'Void']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
    <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>${can('agreements.manage') ? `<button class="btn btn-gold" id="new">${icon('plus')} Generate agreement</button>` : ''}</div>
    <div class="alert info">Agreements follow the CICC Retainer Agreement Regulation and the 2024 Service Agreement Guide. An Initial Consultation Agreement is required before paid advice (RA 4.1). A Retainer Agreement is required for representation and must be provided within 10 days of starting work (RA 5.1).</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;
  el.querySelector('#f').onclick = (e) => { if (e.target.dataset.k) { filter = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => newAgreement());
  let rows = [];
  async function draw() {
    el.querySelectorAll('#f button').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    let q = db.from('agreements').select('id, number, type, title, status, sent_at, viewed_at, client_signed_at, created_at, fee_basis:data->>fee_basis, contacts(full_name)').order('created_at', { ascending: false }).limit(500);
    if (filter === 'out') q = q.in('status', ['sent', 'viewed']); else if (filter !== 'all') q = q.eq('status', filter);
    rows = (await q).data || [];
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>No.</th><th>Agreement</th><th>Client</th><th>Status</th><th>Sent</th><th>Signed</th></tr></thead><tbody>
      ${rows.map((a) => `<tr class="click" data-id="${a.id}"><td><b>${esc(a.number)}</b></td><td>${esc(AGR_TYPE[a.type])}${proBonoBadge(a.fee_basis)}</td><td>${esc(a.contacts?.full_name || '')}</td>
        <td>${agrBadge(a.status)}</td><td>${a.sent_at ? timeAgo(a.sent_at) : '—'}</td><td>${a.client_signed_at ? fmtDate(a.client_signed_at) : '—'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('file')}<div>No agreements yet.</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/agreements/${tr.dataset.id}`)));
  }
  el.querySelector('#csv').onclick = () => downloadCsv('agreements.csv', [['Number', 'Type', 'Fee arrangement', 'Client', 'Status', 'Sent', 'Signed'],
    ...rows.map((a) => [a.number, AGR_TYPE[a.type], a.fee_basis === 'pro_bono' ? 'Pro bono' : 'Paid', a.contacts?.full_name, a.status, a.sent_at, a.client_signed_at])]);
  draw();
}
