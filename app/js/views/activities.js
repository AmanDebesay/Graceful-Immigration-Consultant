import { db, state, can, esc, icon, fmtDateTime, staffName } from '../core.js';
import { downloadCsv } from '../fin.js';
import { ACT_TYPES, ACT_LABEL, ACT_ICON, logActivity } from '../crm.js';

export async function render(el) {
  let type = 'all', who = 'all';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="ty"><button data-k="all">All</button>${ACT_TYPES.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
    <div class="seg" id="who"><button data-k="all">Everyone</button><button data-k="me">Mine</button></div><div class="grow"></div>
    <button class="btn" id="csv">${icon('file')} Export</button>${can('crm.edit') ? `<button class="btn btn-primary" id="new">${icon('plus')} Log activity</button>` : ''}</div>
    <div class="card"><div class="card-b timeline" id="list"></div></div>`;
  el.querySelector('#ty').onclick = (e) => { if (e.target.dataset.k) { type = e.target.dataset.k; draw(); } };
  el.querySelector('#who').onclick = (e) => { if (e.target.dataset.k) { who = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => logActivity());
  window.addEventListener('crm-changed', () => draw(), { once: true });
  let rows = [];
  async function draw() {
    el.querySelectorAll('#ty button').forEach((b) => b.classList.toggle('on', b.dataset.k === type));
    el.querySelectorAll('#who button').forEach((b) => b.classList.toggle('on', b.dataset.k === who));
    let q = db.from('activities').select('*, contacts(id, full_name), companies(id, name)').order('occurred_at', { ascending: false }).limit(300);
    if (type !== 'all') q = q.eq('type', type);
    if (who === 'me') q = q.eq('author_id', state.profile.id);
    rows = (await q).data || [];
    el.querySelector('#list').innerHTML = rows.map((a) => `<div class="tl"><div class="tl-dot">${icon(ACT_ICON[a.type])}</div><div class="tl-body">
      <div class="meta">${ACT_LABEL[a.type]}${a.direction ? ' · ' + a.direction : ''} · ${esc(staffName(a.author_id))} · ${fmtDateTime(a.occurred_at)}${a.duration_min ? ` · ${a.duration_min} min` : ''}${a.outcome ? ` · <b>${esc(a.outcome)}</b>` : ''}</div>
      <div>${a.contacts ? `<a href="#/contacts/${a.contacts.id}"><b>${esc(a.contacts.full_name)}</b></a>` : ''}${a.companies ? ` <a href="#/companies/${a.companies.id}">(${esc(a.companies.name)})</a>` : ''} ${esc(a.subject || '')}</div>
      ${a.body ? `<div class="text" style="margin-top:4px">${esc(a.body)}</div>` : ''}</div></div>`).join('') || `<div class="empty">${icon('phone')}<div>No activities logged yet.</div></div>`;
  }
  el.querySelector('#csv').onclick = () => downloadCsv('activities.csv', [['When', 'Type', 'Direction', 'Contact', 'Company', 'Subject', 'Details', 'Outcome', 'By'],
    ...rows.map((a) => [a.occurred_at, a.type, a.direction, a.contacts?.full_name, a.companies?.name, a.subject, a.body, a.outcome, staffName(a.author_id)])]);
  draw();
}
