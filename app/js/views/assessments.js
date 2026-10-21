import { db, can, esc, icon, fmtDateTime, timeAgo, triageBadge, SERVICE_LABEL } from '../core.js';

const STATUS = [['open', 'Open'], ['new', 'New'], ['in_review', 'In review'], ['reviewed', 'Reviewed'], ['archived', 'Archived'], ['all', 'All']];
const STATUS_BADGE = { new: 'b-blue', in_review: 'b-gold', reviewed: 'b-GREEN', archived: '' };
const STATUS_LABEL = { new: 'New', in_review: 'In review', reviewed: 'Reviewed', archived: 'Archived' };

export async function render(el) {
  let status = sessionStorage.getItem('gi_as_status') || 'open';
  let level = 'all';

  el.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="stSeg">${STATUS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="seg" id="lvSeg">${['all', 'RED', 'AMBER', 'GREEN'].map((k) => `<button data-k="${k}">${k === 'all' ? 'All levels' : k}</button>`).join('')}</div>
      <div class="grow"></div>
      <a class="btn" href="../public/assessment.html" target="_blank" rel="noopener">${icon('external')} Public form</a>
      ${can('intake.view') ? `<a class="btn btn-primary" href="#/assessments/new">${icon('plus')} New assessment</a>` : ''}
    </div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;

  const paint = (seg, val) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === val));
  const stSeg = el.querySelector('#stSeg'), lvSeg = el.querySelector('#lvSeg');
  stSeg.onclick = (e) => { if (e.target.dataset.k) { status = e.target.dataset.k; sessionStorage.setItem('gi_as_status', status); load(); } };
  lvSeg.onclick = (e) => { if (e.target.dataset.k) { level = e.target.dataset.k; load(); } };

  async function load() {
    paint(stSeg, status); paint(lvSeg, level);
    let q = db.from('intake_submissions').select('id, triage_level, status, source, created_at, answers, contacts(id, full_name, email)').order('created_at', { ascending: false }).limit(200);
    if (status === 'open') q = q.in('status', ['new', 'in_review']);
    else if (status !== 'all') q = q.eq('status', status);
    if (level !== 'all') q = q.eq('triage_level', level);
    const { data, error } = await q;
    const box = el.querySelector('#list');
    if (error) { box.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    if (!data.length) { box.innerHTML = `<div class="empty">${icon('clipboard')}<div>No assessments here.</div></div>`; return; }
    box.innerHTML = `<table class="t"><thead><tr><th>Priority</th><th>Client</th><th>Needs help with</th><th>Where</th><th>Submitted</th><th>Status</th><th>Source</th></tr></thead><tbody>
      ${data.map((s) => `<tr class="click" data-id="${s.id}">
        <td>${triageBadge(s.triage_level)}</td>
        <td><div class="cell-name"><div><b>${esc(s.contacts?.full_name || s.answers?.fullName || '—')}</b><span>${esc(s.contacts?.email || '')}</span></div></div></td>
        <td style="max-width:280px">${esc((s.answers?.services || []).map((k) => SERVICE_LABEL[k] || k).join(', ') || '—')}</td>
        <td>${s.answers?.location === 'in' ? 'In Canada' : s.answers?.location === 'out' ? 'Outside Canada' : '—'}</td>
        <td title="${fmtDateTime(s.created_at)}">${timeAgo(s.created_at)}</td>
        <td><span class="badge ${STATUS_BADGE[s.status]}">${STATUS_LABEL[s.status]}</span></td>
        <td><span class="badge plain">${s.source === 'staff' ? 'Staff' : 'Website'}</span></td></tr>`).join('')}
      </tbody></table>`;
    box.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/assessments/${tr.dataset.id}`)));
  }
  load();
}
