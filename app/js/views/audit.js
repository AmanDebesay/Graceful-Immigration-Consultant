import { db, esc, icon, fmtDateTime, staffName } from '../core.js';

const ACTION = {
  created: 'Created', deleted: 'Deleted', stage_changed: 'Stage changed', assigned: 'Assigned', submitted: 'Submitted',
  status_changed: 'Status changed', access_changed: 'Access changed', invited: 'Invited', permission_changed: 'Permission changed',
};

export async function render(el) {
  const { data, error } = await db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const link = (r) => r.entity === 'contact' ? `#/contacts/${r.entity_id}` : r.entity === 'assessment' ? `#/assessments/${r.entity_id}` : null;
  const detail = (d) => Object.entries(d || {}).map(([k, v]) => `${esc(k)}: <b>${esc(k === 'to' && v && String(v).length === 36 ? staffName(v) : v)}</b>`).join(' · ');
  el.innerHTML = `<p style="color:var(--muted);margin-bottom:14px">The last 300 changes to contacts, assessments and access. Entries cannot be edited or deleted.</p>
    <div class="card"><div class="table-wrap">${data.length ? `<table class="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
    ${data.map((r) => `<tr><td style="white-space:nowrap">${fmtDateTime(r.created_at)}</td><td>${r.actor_id ? esc(staffName(r.actor_id)) : '<span style="color:var(--muted)">Website / system</span>'}</td>
      <td>${esc(ACTION[r.action] || r.action)}</td><td>${link(r) ? `<a href="${link(r)}">${esc(r.entity)}</a>` : esc(r.entity)}</td>
      <td style="font-size:12.5px">${detail(r.details)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${icon('history')}<div>No activity yet.</div></div>`}</div></div>`;
}
