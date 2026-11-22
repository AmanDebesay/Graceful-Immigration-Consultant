// All deadlines across files (overdue in red at the top) and IRCC letters waiting for an addendum decision.
import { db, can, esc, icon, fmtDate, toast, fail } from '../core.js';
import { deadlineTable, wireDeadlines, deadlineModal } from './file.js';
import { daysTo } from '../practice.js';

export async function render(el) {
  let filter = sessionStorage.getItem('gi_dl_filter') || 'open';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="f">${[['open', 'Open'], ['14', 'Next 14 days'], ['overdue', 'Overdue'], ['done', 'Done']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="grow"></div>${can('crm.edit') ? `<button class="btn btn-gold" id="add">${icon('plus')} Add deadline</button>` : ''}</div>
    <div class="alert info">IRCC letters logged on a client's <b>Deadlines &amp; IRCC</b> tab create their deadline automatically. You get an email 14, 7 and 2 days before each deadline and when one is overdue.</div>
    <div id="over"></div><div class="card"><div class="card-b" id="list"></div></div>
    <div class="card" style="margin-top:16px"><div class="card-h"><h3>${icon('mail')} IRCC letters outside the scope — waiting for an addendum decision</h3></div><div class="card-b" id="oos"></div></div>`;
  el.querySelector('#f').onclick = (e) => { if (e.target.dataset.k) { filter = e.target.dataset.k; sessionStorage.setItem('gi_dl_filter', filter); draw(); } };
  el.querySelector('#add')?.addEventListener('click', () => deadlineModal({ done: draw }));
  async function draw() {
    el.querySelectorAll('#f button').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    let q = db.from('deadlines').select('*, contacts(full_name)').order('due_on').limit(500);
    const t = new Date().toLocaleDateString('en-CA'), in14 = new Date(Date.now() + 14 * 864e5).toLocaleDateString('en-CA');
    q = filter === 'done' ? q.eq('done', true).order('done_at', { ascending: false }) : q.eq('done', false);
    if (filter === '14') q = q.lte('due_on', in14); if (filter === 'overdue') q = q.lt('due_on', t);
    const [{ data, error }, { data: oos }] = await Promise.all([q, db.from('correspondence').select('id, contact_id, subject, occurred_on, client_informed, addendum_status, contacts(full_name)').in('addendum_status', ['pending', 'offered']).order('occurred_on')]);
    if (error) { el.querySelector('#list').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    const overdue = (data || []).filter((d) => !d.done && daysTo(d.due_on) < 0);
    el.querySelector('#over').innerHTML = overdue.length && filter !== 'overdue' ? `<div class="alert err"><b>${overdue.length} overdue deadline${overdue.length > 1 ? 's' : ''}:</b> ${overdue.slice(0, 5).map((d) => `${esc(d.contacts?.full_name || '')} — ${esc(d.title)} (${d.due_on})`).join(' · ')}</div>` : '';
    el.querySelector('#list').innerHTML = deadlineTable(data || [], can('crm.edit'), true);
    wireDeadlines(el.querySelector('#list'), data || [], draw);
    el.querySelector('#oos').innerHTML = (oos || []).length ? `<table class="t"><tbody>${oos.map((r) => `<tr><td><a href="#/contacts/${r.contact_id}">${esc(r.contacts?.full_name || '')}</a></td><td>${esc(r.subject)}<br><small class="dk-muted">${fmtDate(r.occurred_on)}</small></td>
      <td>${r.client_informed ? '<span class="badge b-GREEN">Client informed</span>' : '<span class="badge b-RED">Client not informed</span>'}</td><td>Addendum ${esc(r.addendum_status)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="dk-muted">None.</div>';
  }
  draw().catch(fail);
}
