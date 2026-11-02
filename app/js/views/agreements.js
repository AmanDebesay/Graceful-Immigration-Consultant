import { db, state, can, canDraftAgreements, esc, icon, fmtDate, timeAgo, modal, staffName } from '../core.js';
import { contactsList, contactOptions, downloadCsv } from '../fin.js';
import { defaults } from '../agreement-templates.js';

export const AGR_STATUS = { draft: ['Draft', ''], sent: ['Sent', 'b-blue'], viewed: ['Viewed by client', 'b-gold'], signed: ['Signed', 'b-GREEN'], void: ['Void', ''] };
export const agrBadge = (s) => `<span class="badge ${AGR_STATUS[s]?.[1] || ''}">${AGR_STATUS[s]?.[0] || s}</span>`;
export const AGR_TYPE = { consultation: 'Initial Consultation Agreement', retainer: 'Retainer (Service) Agreement', amendment: 'Amendment to Retainer Agreement',
  non_engagement: 'Non-Engagement Letter', termination: 'Closing / Termination Letter' };
export const isLetter = (t) => ['non_engagement', 'termination'].includes(t);
export const PRO_BONO_REASON = { family: 'Family member of the RCIC', friend: 'Personal friend of the RCIC', hardship: 'Financial hardship / client needs help', community: 'Community or charitable service', other: 'Other reason' };
export const reviewBadge = (a) => a.status === 'draft' && a.review_requested_at ? ' <span class="badge b-gold">Waiting for RCIC review</span>' : '';
export const proBonoBadge = (basis) => basis === 'pro_bono' ? ' <span class="badge b-blue">Pro bono</span>' : '';

const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const pkgTotal = (p) => (p.milestones || []).reduce((s, m) => s + Number(m.fee || 0), 0);

export async function newAgreement({ contactId, caseId, type = 'retainer' } = {}) {
  const [contacts, { data: settings }, { data: pkgs }] = await Promise.all([contactsList(), db.from('org_settings').select('*').eq('id', 1).single(),
    db.from('service_packages').select('*').eq('active', true).order('category').order('sort').order('name')]);
  const groups = [...new Set((pkgs || []).map((x) => x.category || 'Other services'))];
  modal({
    title: 'Generate agreement or letter',
    body: `<div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, contactId)}</select>
        <small style="color:var(--muted)">Not in the list? Add them first with Contacts → New client.</small></div>
      <div class="field"><label>Agreement type</label><select class="input" id="t">
        <option value="consultation" ${type === 'consultation' ? 'selected' : ''}>Initial Consultation Agreement — before paid advice (RA 4.1)</option>
        <option value="retainer" ${type === 'retainer' ? 'selected' : ''}>Retainer / Service Agreement — representation (RA 5.1)</option>
        <option value="amendment" ${type === 'amendment' ? 'selected' : ''}>Amendment — change the scope, fees or terms of a retainer (AM)</option>
        <option value="non_engagement" ${type === 'non_engagement' ? 'selected' : ''}>Non-engagement letter — you are declining the matter (NE)</option>
        <option value="termination" ${type === 'termination' ? 'selected' : ''}>Closing / termination letter — file completed, ended or withdrawn (TL)</option></select></div>
      <div class="field" id="paw" hidden><label>Agreement this relates to</label><select class="input" id="pa"></select><small style="color:var(--muted)" id="pahelp"></small></div>
      <div class="field" id="fbw"><label>Fee arrangement</label><select class="input" id="fb">
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
      let parents = [];
      m.getParents = () => parents;
      const load = async () => {
        const cid = m.querySelector('#c').value;
        const [{ data }, { data: ags }] = await Promise.all([cid ? db.from('cases').select('id, case_number, title').eq('contact_id', cid) : { data: [] },
          cid ? db.from('agreements').select('id, number, type, status, case_id, created_at, data').eq('contact_id', cid).in('type', ['retainer', 'consultation']).in('status', ['signed', 'sent', 'viewed']).order('created_at', { ascending: false }) : { data: [] }]);
        m.querySelector('#k').innerHTML = '<option value="">None</option>' + (data || []).map((x) => `<option value="${x.id}" ${x.id === caseId ? 'selected' : ''}>${esc(x.case_number)} · ${esc(x.title)}</option>`).join('');
        parents = ags || [];
        m.querySelector('#pa').innerHTML = parents.map((x) => `<option value="${x.id}">${esc(x.number)} · ${esc(AGR_TYPE[x.type])} · ${esc(AGR_STATUS[x.status]?.[0] || x.status)}</option>`).join('') + '<option value="">Not linked to an agreement in the dashboard</option>';
      };
      const sync = () => {
        const t = m.querySelector('#t').value, retainer = t === 'retainer', main = ['retainer', 'consultation'].includes(t), free = main && m.querySelector('#fb').value === 'pro_bono';
        m.querySelector('#pw').hidden = !retainer; m.querySelector('#cw').hidden = t === 'consultation'; m.querySelector('#lw').hidden = t !== 'consultation'; m.querySelector('#rw').hidden = !free;
        m.querySelector('#fbw').hidden = !main; m.querySelector('#paw').hidden = !['amendment', 'termination'].includes(t);
        m.querySelector('#pahelp').textContent = t === 'amendment' ? 'The amendment refers to this agreement and copies its clients. Everyone who signed it signs the amendment.'
          : 'The letter refers to this agreement. Use it when the file is completed, when the client ends the services, or when you withdraw.';
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
      const t = m.querySelector('#t').value, cid = m.querySelector('#c').value, kid = t !== 'consultation' ? m.querySelector('#k').value || null : null;
      if (!cid) throw new Error('Choose a client.');
      const pkg = t === 'retainer' ? (pkgs || []).find((x) => x.id === m.querySelector('#p').value) || null : null;
      const minutes = Number(m.querySelector('#l').value);
      const [{ data: contact }, { data: caseRow }] = await Promise.all([
        db.from('contacts').select('*').eq('id', cid).single(),
        kid ? db.from('cases').select('*').eq('id', kid).single() : { data: null }]);
      const main = ['retainer', 'consultation'].includes(t), free = main && m.querySelector('#fb').value === 'pro_bono';
      const parent = ['amendment', 'termination'].includes(t) ? m.getParents().find((x) => x.id === m.querySelector('#pa').value) || null : null;
      const fee = minutes === 30 ? settings.consult_fee_30 ?? 30 : settings.consult_fee_60 ?? 60;
      const data = defaults(t, { contact, settings, caseRow, pkg, consult: { minutes, fee }, proBono: free ? m.querySelector('#r').value : null, parent });
      const title = (t === 'consultation' ? 'Initial Consultation Agreement' : t === 'retainer' ? `Service Agreement${pkg ? ' (' + pkg.name + ')' : ''}` : AGR_TYPE[t] + (parent ? ` (${parent.number})` : '')) + (free ? ' — pro bono' : '');
      const { data: row, error } = await db.from('agreements').insert({ type: t, title: `${title} — ${contact.full_name}`,
        contact_id: cid, case_id: kid || parent?.case_id || null, parent_id: parent?.id || null, data, created_by: state.profile.id }).select('id').single();
      if (error) throw error;
      location.hash = `#/agreements/${row.id}`;
    } }],
  });
}

export async function render(el) {
  let filter = (location.hash.match(/[?&]f=(\w+)/) || [])[1] || 'all';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="f">${[['all', 'All'], ['review', 'Needs review'], ['draft', 'Drafts'], ['out', 'Awaiting signature'], ['signed', 'Signed'], ['void', 'Void']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
    <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>${canDraftAgreements() ? `<button class="btn btn-gold" id="new">${icon('plus')} ${can('agreements.manage') ? 'Generate agreement' : 'Draft an agreement'}</button>` : ''}</div>
    ${!can('agreements.manage') && can('agreements.draft') ? '<div class="alert info">You can prepare drafts. When a draft is ready, click <b>Send to RCIC for review</b> in the draft. Only the RCIC signs and sends agreements to clients.</div>' : ''}
    <div class="alert info">Agreements follow the CICC Retainer Agreement Regulation and the 2024 Service Agreement Guide. An Initial Consultation Agreement is required before paid advice (RA 4.1). A Retainer Agreement is required for representation and must be provided within 10 days of starting work (RA 5.1).</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;
  el.querySelector('#f').onclick = (e) => { if (e.target.dataset.k) { filter = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => newAgreement());
  let rows = [];
  async function draw() {
    el.querySelectorAll('#f button').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    let q = db.from('agreements').select('id, number, type, title, status, sent_at, viewed_at, client_signed_at, created_at, review_requested_at, reviewer_id, fee_basis:data->>fee_basis, contacts(full_name)').order('created_at', { ascending: false }).limit(500);
    if (filter === 'out') q = q.in('status', ['sent', 'viewed']); else if (filter === 'review') q = q.eq('status', 'draft').not('review_requested_at', 'is', null); else if (filter !== 'all') q = q.eq('status', filter);
    rows = (await q).data || [];
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>No.</th><th>Agreement</th><th>Client</th><th>Status</th><th>Sent</th><th>Signed</th></tr></thead><tbody>
      ${rows.map((a) => `<tr class="click" data-id="${a.id}"><td><b>${esc(a.number)}</b></td><td>${esc(AGR_TYPE[a.type])}${proBonoBadge(a.fee_basis)}</td><td>${esc(a.contacts?.full_name || '')}</td>
        <td>${agrBadge(a.status)}${reviewBadge(a)}${a.review_requested_at && a.status === 'draft' ? `<br><small style="color:var(--muted)">for ${esc(staffName(a.reviewer_id))}</small>` : ''}</td><td>${a.sent_at ? timeAgo(a.sent_at) : '—'}</td><td>${a.client_signed_at ? fmtDate(a.client_signed_at) : '—'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('file')}<div>No agreements yet.</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/agreements/${tr.dataset.id}`)));
  }
  el.querySelector('#csv').onclick = () => downloadCsv('agreements.csv', [['Number', 'Type', 'Fee arrangement', 'Client', 'Status', 'Sent', 'Signed'],
    ...rows.map((a) => [a.number, AGR_TYPE[a.type], a.fee_basis === 'pro_bono' ? 'Pro bono' : 'Paid', a.contacts?.full_name, a.status, a.sent_at, a.client_signed_at])]);
  draw();
}
