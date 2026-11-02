import { db, state, can, esc, icon, timeAgo, staffName, rpc, modal } from '../core.js';

// Steps a case checklist moves through, and who normally does each one.
export const CL_STAGE = [
  ['documents', 'Document collection', 'Assistant collects every document from the client and ticks it off.'],
  ['forms', 'Forms preparation', 'Case manager or RCIC completes and checks the IRCC forms.'],
  ['rcic_review', 'RCIC final review', 'The RCIC checks the whole package and approves it.'],
  ['approved', 'Approved', 'Ready to submit to IRCC.'],
];
export const CL_LABEL = Object.fromEntries(CL_STAGE.map(([k, l]) => [k, l]));
export const ITEM_STAGE = { documents: 'documents', forms: 'forms', rcic_review: 'review', approved: 'review' };
export const clBadge = (s) => `<span class="badge ${{ documents: 'b-blue', forms: 'b-gold', rcic_review: 'b-navy', approved: 'b-GREEN' }[s] || ''}">${esc(CL_LABEL[s] || s)}</span>`;

// Required items finished in the checklist's current step, e.g. "7 / 12".
export function stepProgress(c) {
  const items = (c.case_checklist_items || []).filter((i) => i.required && i.stage === ITEM_STAGE[c.stage]);
  const done = items.filter((i) => i.status !== 'todo').length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 100 };
}
export const progressBar = (p) => `<div class="cl-prog" title="${p.done} of ${p.total} required items done"><i style="width:${p.pct}%"></i></div><small>${p.done} / ${p.total}</small>`;

// Start a checklist on a case. With no case given, the user picks one of the active cases.
export async function startChecklist(caseRow) {
  const [{ data: tpls }, { data: cases }] = await Promise.all([
    db.from('checklist_templates').select('id, name, application_types, items').eq('active', true).order('sort'),
    caseRow ? { data: [caseRow] } : db.from('cases').select('id, case_number, title, application_type, contacts(full_name)').not('status', 'in', '(approved,refused,withdrawn,closed)').order('created_at', { ascending: false }).limit(500)]);
  const suggest = (type) => ((tpls || []).find((t) => (t.application_types || []).includes(type)) || (tpls || []).find((t) => !(t.application_types || []).length) || (tpls || [])[0])?.id;
  modal({
    title: 'Start a checklist',
    body: `<div class="field"><label>Case</label><select class="input" id="ck">${(cases || []).map((k) => `<option value="${k.id}">${esc(k.case_number)} · ${esc(k.contacts?.full_name || '')} · ${esc(k.application_type || k.title)}</option>`).join('')}</select>
        ${(cases || []).length ? '' : '<small style="color:#B42318">No active cases. A case is opened from the client’s page (Case manager, RCIC or owner).</small>'}</div>
      <div class="field"><label>Checklist</label><select class="input" id="ct">${(tpls || []).map((t) => `<option value="${t.id}">${esc(t.name)} (${(t.items || []).length} items)</option>`).join('')}</select>
        <small style="color:var(--muted)">Suggested from the case type. The owner can edit these lists in Business Settings → Checklists.</small></div>`,
    onOpen: (m) => {
      const pick = () => { const k = (cases || []).find((x) => x.id === m.querySelector('#ck').value); const s = k && suggest(k.application_type); if (s) m.querySelector('#ct').value = s; };
      m.querySelector('#ck').onchange = pick; pick();
    },
    actions: [{ label: 'Cancel' }, { label: 'Start checklist', cls: 'btn-gold', onClick: async (m) => {
      if (!m.querySelector('#ck').value) throw new Error('Choose a case.');
      const id = await rpc('start_checklist', { p_case: m.querySelector('#ck').value, p_template: m.querySelector('#ct').value });
      window.dispatchEvent(new Event('refresh-counts'));
      location.hash = `#/checklists/${id}`;
    } }],
  });
}

export async function render(el) {
  const approver = can('cases.approve');
  let tab = (location.hash.match(/[?&]tab=(\w+)/) || [])[1] || 'mine';
  const TABS = [['mine', 'Assigned to me'], ['review', 'Waiting for RCIC review'], ['active', 'All in progress'], ['approved', 'Approved'], ['all', 'All']];
  el.innerHTML = `<div class="toolbar"><div class="seg" id="tabs">${TABS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div><div class="grow"></div>
      <a class="btn" href="#/guide">${icon('book')} How checklists work</a>
      ${can('checklists.work') ? `<button class="btn btn-gold" id="new">${icon('plus')} Start a checklist</button>` : ''}</div>
    <div class="cl-flow">${CL_STAGE.map(([k, l, help], i) => `<div class="cl-flow-s"><b>${i + 1}. ${l}</b><small>${help}</small></div>`).join(`<span class="cl-flow-a">${icon('arrowr')}</span>`)}</div>
    <div id="kpis" class="grid g-4" style="margin:16px 0"></div><div class="card"><div class="table-wrap" id="list"></div></div>`;
  el.querySelector('#tabs').onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => startChecklist());
  async function draw() {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    const { data } = await db.from('case_checklists').select('*, case_checklist_items(stage, status, required), cases(id, case_number, application_type, contacts(id, full_name))').order('updated_at', { ascending: false }).limit(1000);
    const all = data || [], me = state.profile.id;
    const rows = all.filter((c) => tab === 'all' ? true : tab === 'mine' ? c.assigned_to === me && c.stage !== 'approved' : tab === 'review' ? c.stage === 'rcic_review'
      : tab === 'approved' ? c.stage === 'approved' : c.stage !== 'approved');
    el.querySelector('#kpis').innerHTML = [['Assigned to me', all.filter((c) => c.assigned_to === me && c.stage !== 'approved').length, 'user', 'gold'],
      ['Collecting documents', all.filter((c) => c.stage === 'documents').length, 'folder', ''], ['Preparing forms', all.filter((c) => c.stage === 'forms').length, 'file', ''],
      [approver ? 'Waiting for your approval' : 'In RCIC review', all.filter((c) => c.stage === 'rcic_review' && (!approver || c.assigned_to === me)).length, 'checksq', 'red']]
      .map(([l, v, i, c]) => `<div class="card kpi"><div class="kpi-ico ${c}">${icon(i)}</div><div><small>${l}</small><b>${v}</b></div></div>`).join('');
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Client</th><th>Checklist</th><th>Step</th><th>Progress (this step)</th><th>Assigned to</th><th>Updated</th></tr></thead><tbody>
      ${rows.map((c) => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.cases?.contacts?.full_name || '')}</b><br><small style="color:var(--muted)">${esc(c.cases?.case_number || '')} · ${esc(c.cases?.application_type || '')}</small></td>
        <td>${esc(c.name)}</td><td>${clBadge(c.stage)}</td><td><div class="row" style="flex-wrap:nowrap;gap:8px">${progressBar(stepProgress(c))}</div></td>
        <td>${c.assigned_to === me ? '<b>You</b>' : esc(staffName(c.assigned_to))}</td><td>${timeAgo(c.updated_at)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('checksq')}<div>${tab === 'mine' ? 'Nothing assigned to you right now.' : 'No checklists here.'}${can('checklists.work') ? ' Start one from a case, or with <b>Start a checklist</b>.' : ''}</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/checklists/${tr.dataset.id}`)));
  }
  draw();
}
