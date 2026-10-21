import { db, can, esc, icon, fmtDate, staffName, priorityBadge, today } from '../core.js';
import { downloadCsv } from '../fin.js';
import { CASE_STATUS, caseBadge, editCase } from '../crm.js';

export async function render(el) {
  let status = 'active';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="st"><button data-k="active">Active</button>${CASE_STATUS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}<button data-k="all">All</button></div>
    <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>${can('crm.edit') ? `<button class="btn btn-gold" id="new">${icon('plus')} Open case</button>` : ''}</div>
    <div id="kpis" class="grid g-4" style="margin-bottom:16px"></div><div class="card"><div class="table-wrap" id="list"></div></div>`;
  el.querySelector('#st').onclick = (e) => { if (e.target.dataset.k) { status = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => editCase());
  window.addEventListener('crm-changed', () => draw(), { once: true });
  let rows = [];
  async function draw() {
    el.querySelectorAll('#st button').forEach((b) => b.classList.toggle('on', b.dataset.k === status));
    const { data } = await db.from('cases').select('*, contacts(id, full_name)').order('created_at', { ascending: false }).limit(1000);
    const all = data || [];
    const active = (c) => !['approved', 'refused', 'withdrawn', 'closed'].includes(c.status);
    rows = all.filter((c) => status === 'all' || (status === 'active' ? active(c) : c.status === status));
    const td = today();
    el.querySelector('#kpis').innerHTML = [
      ['Active cases', all.filter(active).length, 'briefcase', ''], ['Submitted / awaiting decision', all.filter((c) => ['submitted', 'decision_pending'].includes(c.status)).length, 'clipboard', 'gold'],
      ['Deadlines in 14 days', all.filter((c) => active(c) && c.deadline && c.deadline >= td && c.deadline <= new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-CA')).length, 'alert', 'red'],
      ['Approved', all.filter((c) => c.status === 'approved').length, 'check', 'green']]
      .map(([l, v, i, c]) => `<div class="card kpi"><div class="kpi-ico ${c}">${icon(i)}</div><div><small>${l}</small><b>${v}</b></div></div>`).join('');
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Case</th><th>Client</th><th>Type</th><th>Status</th><th>Priority</th><th>Deadline</th><th>Assigned</th></tr></thead><tbody>
      ${rows.map((c) => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.case_number)}</b><br><small style="color:var(--muted)">${esc(c.title)}</small></td>
        <td>${esc(c.contacts?.full_name || '')}</td><td>${esc(c.application_type || '')}</td><td>${caseBadge(c.status)}</td><td>${priorityBadge(c.priority)}</td>
        <td style="color:${c.deadline && c.deadline < td && active(c) ? 'var(--red)' : 'inherit'}">${fmtDate(c.deadline)}</td><td>${esc(staffName(c.assigned_to))}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('briefcase')}<div>No cases here. Open a case when a client retains you for an application.</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/cases/${tr.dataset.id}`)));
  }
  el.querySelector('#csv').onclick = () => downloadCsv('cases.csv', [['Case', 'Title', 'Client', 'Type', 'Status', 'Priority', 'Opened', 'Submitted', 'Deadline', 'Decision', 'IRCC file', 'Assigned'],
    ...rows.map((c) => [c.case_number, c.title, c.contacts?.full_name, c.application_type, c.status, c.priority, c.opened_on, c.submitted_on, c.deadline, c.decision_on, c.ircc_file_number, staffName(c.assigned_to)])]);
  draw();
}
