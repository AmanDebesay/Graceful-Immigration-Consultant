// Audit Log: every recorded change, in plain words. Entries cannot be edited or deleted.
import { db, state, esc, icon, fmtDate, staffName, avatarHtml } from '../core.js';
import { downloadCsv, downloadXlsx } from '../fin.js';

// action → [label, icon, tone, category]
export const A = {
  created: ['Created', 'plus', 'green', 'clients'], deleted: ['Deleted', 'trash', 'red', 'clients'], stage_changed: ['Stage changed', 'layers', 'blue', 'clients'],
  assigned: ['Assigned', 'user', 'blue', 'clients'], submitted: ['Assessment submitted', 'send', 'green', 'clients'], status_changed: ['Status changed', 'layers', 'blue', 'clients'],
  access_changed: ['Access changed', 'shield', 'gold', 'security'], invited: ['Staff invited', 'mail', 'gold', 'security'], permission_changed: ['Permission changed', 'shield', 'gold', 'security'],
  portal_invited: ['Invited to client portal', 'monitor', 'blue', 'clients'], portal_document_shared: ['Shared in client portal', 'monitor', 'blue', 'documents'],
  portal_document_unshared: ['Removed from client portal', 'monitor', 'gold', 'documents'], document_opened: ['Document opened', 'file', 'navy', 'documents'],
  document_deleted: ['Document deleted', 'trash', 'red', 'documents'], document_updated: ['Document renamed or moved', 'edit', 'blue', 'documents'],
  document_replaced: ['New version uploaded', 'upload', 'blue', 'documents'], ircc_form_saved: ['IRCC form saved to file', 'note', 'green', 'documents'],
  receipt_sent: ['Receipt sent', 'mail', 'green', 'money'], posted: ['Invoice posted', 'coins', 'green', 'money'], quote_invoiced: ['Quote turned into invoice', 'coins', 'green', 'money'],
  month_reconciled: ['Month reconciled', 'checksq', 'green', 'money'], pathway_finalized: ['Pathway assessment finalized', 'route', 'green', 'agreements'],
  letter_finalized: ['Submission letter finalized', 'pen', 'green', 'agreements'], letter_reopened: ['Submission letter reopened', 'pen', 'gold', 'agreements'],
  correspondence_logged: ['IRCC correspondence logged', 'mail', 'blue', 'clients'], file_closed: ['Client file closed', 'lock', 'navy', 'clients'], file_reopened: ['Client file reopened', 'lock', 'gold', 'clients'],
};
const CATS = { clients: 'Clients & cases', security: 'Staff access & security', documents: 'Documents & portal', money: 'Money', agreements: 'Agreements, letters & assessments' };
export const ENTITY = { contact: ['Client', 'user', (id) => `#/contacts/${id}`], case: ['Case', 'briefcase', (id) => `#/cases/${id}`], invoice: ['Invoice', 'file', (id) => `#/invoices/${id}`],
  payment: ['Payment', 'coins', null], profile: ['Staff account', 'shield', null], role: ['Role permissions', 'shield', null], assessment: ['Assessment', 'clipboard', (id) => `#/assessments/${id}`],
  pathway_assessment: ['Pathway assessment', 'route', (id) => `#/pathways/${id}`], agreement: ['Agreement', 'pen', (id) => `#/agreements/${id}`], quote: ['Quote', 'coins', null],
  month_close: ['Month', 'calendar', null], submission_letter: ['Submission letter', 'pen', (id) => `#/letters/${id}`] };
export const human = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = { to: 'To', from: 'From', name: 'Name', source: 'Source', email: 'Email', total: 'Total', number: 'Number', top_route: 'Recommended route', received_from: 'Received from',
  role: 'Role', active: 'Active', permission: 'Permission', granted: 'Granted', subject: 'Subject', in_scope: 'Inside scope', code: 'Form', edition: 'Edition', reason: 'Reason' };

export async function render(el) {
  el.innerHTML = '<div class="loading" style="min-height:160px"><div class="spin"></div></div>';
  const { data, error } = await db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(1500);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const rows = data || [];
  const ids = [...new Set(rows.filter((r) => r.entity === 'contact' && UUID.test(r.entity_id || '')).map((r) => r.entity_id)
    .concat(rows.map((r) => r.details?.contact_id).filter((x) => UUID.test(x || ''))))];
  const names = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data: cs } = await db.from('contacts').select('id, full_name').in('id', ids.slice(i, i + 200));
    (cs || []).forEach((c) => (names[c.id] = c.full_name));
  }
  const nameOf = (v) => names[v] || (state.staff.find((s) => s.id === v) ? staffName(v) : null);
  const meta = (r) => A[r.action] || [human(r.action), 'history', 'navy', r.entity === 'profile' || r.entity === 'role' ? 'security' : 'clients'];
  const today = new Date().toLocaleDateString('en-CA');
  const dayOf = (t) => new Date(t).toLocaleDateString('en-CA');

  el.innerHTML = `
    <div class="au-tiles">
      <div class="au-tile">${icon('history')}<div><small>Events recorded</small><b>${rows.length.toLocaleString()}</b></div></div>
      <div class="au-tile">${icon('calendar')}<div><small>Today</small><b>${rows.filter((r) => dayOf(r.created_at) === today).length}</b></div></div>
      <div class="au-tile">${icon('users')}<div><small>People who made changes</small><b>${new Set(rows.map((r) => r.actor_id).filter(Boolean)).size}</b></div></div>
      <div class="au-tile">${icon('shield')}<div><small>Access &amp; security events</small><b>${rows.filter((r) => meta(r)[3] === 'security').length}</b></div></div>
    </div>
    <div class="toolbar">
      <input class="input" id="q" placeholder="Search client, person, action or detail" style="max-width:340px">
      <select class="input" id="cat" style="max-width:250px"><option value="">All activity</option>${Object.entries(CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <select class="input" id="who" style="max-width:220px"><option value="">Everyone</option>${[...new Set(rows.map((r) => r.actor_id).filter(Boolean))].map((id) => [id, staffName(id)]).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}<option value="system">Website / system</option></select>
      <select class="input" id="per" style="max-width:180px"><option value="">Any time</option><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
      <div class="grow"></div><button class="btn btn-gold" id="xl">${icon('file')} Download Excel</button><button class="btn" id="csv">${icon('file')} CSV</button></div>
    <div class="alert info">Every change to clients, documents, money, agreements and staff access is recorded here automatically. Entries can't be edited or deleted, so this is your record for the College.</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;

  let shown = rows;
  const who = (r) => {
    if (!r.actor_id) return `<span class="td-i">${icon('globe')}Website / system</span>`;
    const p = state.staff.find((s) => s.id === r.actor_id) || { full_name: staffName(r.actor_id) };
    return `<div class="cell-name">${avatarHtml(p, 'avatar sm')}<div><b style="font-size:14px">${esc(p.full_name || '—')}</b></div></div>`;
  };
  const record = (r) => {
    const [label, ic, href] = ENTITY[r.entity] || [human(r.entity), 'file', null];
    const nm = r.entity === 'contact' ? names[r.entity_id] : r.entity === 'profile' ? (state.staff.find((s) => s.id === r.entity_id) ? staffName(r.entity_id) : null) : null;
    const inner = `<span class="au-rec">${icon(ic)}<span><b>${esc(nm || label)}</b>${nm ? `<small>${esc(label)}</small>` : ''}</span></span>`;
    return href && UUID.test(r.entity_id || '') ? `<a href="${href(r.entity_id)}" class="au-link">${inner}</a>` : inner;
  };
  const details = (d) => Object.entries(d || {}).filter(([k, v]) => v !== null && v !== '' && k !== 'contact_id' && !(typeof v === 'object'))
    .map(([k, v]) => { const val = UUID.test(String(v)) ? nameOf(v) : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v).replace(/_/g, ' '); return val ? `<span class="au-chip"><i>${esc(KEY[k] || human(k))}</i>${esc(val)}</span>` : ''; })
    .join('') || '<span style="color:#98A2B3">—</span>';
  const draw = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase(), cat = el.querySelector('#cat').value, whoF = el.querySelector('#who').value, per = Number(el.querySelector('#per').value || 0);
    const since = per ? Date.now() - per * 864e5 : 0;
    shown = rows.filter((r) => (!cat || meta(r)[3] === cat) && (!whoF || (whoF === 'system' ? !r.actor_id : r.actor_id === whoF)) && (!since || new Date(r.created_at).getTime() >= (per === 1 ? new Date(today + 'T00:00:00').getTime() : since))
      && (!q || [meta(r)[0], staffName(r.actor_id), names[r.entity_id], r.entity, JSON.stringify(r.details || {})].join(' ').toLowerCase().includes(q)));
    el.querySelector('#list').innerHTML = shown.length ? `<table class="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
      ${shown.slice(0, 500).map((r) => { const [label, ic, tone] = meta(r); return `<tr>
        <td style="white-space:nowrap"><span class="au-when">${icon('calendar')}<span><b>${fmtDate(r.created_at)}</b><small>${new Date(r.created_at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}</small></span></span></td>
        <td>${who(r)}</td><td><span class="ap ap-${tone}">${icon(ic)}${esc(label)}</span></td><td>${record(r)}</td><td><div class="au-chips">${details(r.details)}</div></td></tr>`; }).join('')}</tbody></table>
        ${shown.length > 500 ? `<div class="dk-muted" style="padding:12px 18px">Showing the latest 500 of ${shown.length}. Narrow the search or export to CSV for all.</div>` : ''}`
      : `<div class="empty">${icon('history')}<div>No activity matches.</div></div>`;
  };
  let t; el.querySelector('#q').oninput = () => { clearTimeout(t); t = setTimeout(draw, 200); };
  el.querySelector('#cat').onchange = draw; el.querySelector('#per').onchange = draw; el.querySelector('#who').onchange = draw;
  const flat = (d) => Object.entries(d || {}).filter(([k, v]) => v !== null && v !== '' && k !== 'contact_id' && typeof v !== 'object')
    .map(([k, v]) => `${KEY[k] || human(k)}: ${UUID.test(String(v)) ? nameOf(v) || v : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v).replace(/_/g, ' ')}`).join('; ');
  el.querySelector('#xl').onclick = async (e) => {
    const b = e.currentTarget, old = b.innerHTML; b.disabled = true; b.innerHTML = 'Preparing…';
    const whoF = el.querySelector('#who').value, person = whoF && whoF !== 'system' ? staffName(whoF) : whoF ? 'website' : 'everyone';
    const t = (x) => new Date(x).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
    const byPerson = {};
    shown.forEach((r) => { const k = r.actor_id ? staffName(r.actor_id) : 'Website / system'; byPerson[k] = (byPerson[k] || 0) + 1; });
    try {
      await downloadXlsx(`audit-log-${person.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today}.xlsx`, [
        ['Activity', [['Date', 'Time', 'Who', 'Action', 'Area', 'Record', 'Client / name', 'Details'],
          ...shown.map((r) => [dayOf(r.created_at), t(r.created_at), r.actor_id ? staffName(r.actor_id) : 'Website / system', meta(r)[0], CATS[meta(r)[3]] || '',
            (ENTITY[r.entity] || [human(r.entity)])[0], names[r.entity_id] || nameOf(r.details?.contact_id) || '', flat(r.details)])], [12, 10, 22, 30, 26, 20, 26, 60]],
        ['By person', [['Person', 'Actions'], ...Object.entries(byPerson).sort((a, b) => b[1] - a[1])], [28, 10]],
      ]);
    } catch (err) { (await import('../core.js')).fail(err); }
    b.disabled = false; b.innerHTML = old;
  };
  el.querySelector('#csv').onclick = () => downloadCsv(`audit-log-${today}.csv`, [['When', 'Who', 'Action', 'Record', 'Record name', 'Details'],
    ...shown.map((r) => [r.created_at, r.actor_id ? staffName(r.actor_id) : 'Website / system', meta(r)[0], (ENTITY[r.entity] || [human(r.entity)])[0], names[r.entity_id] || '', JSON.stringify(r.details || {})])]);
  draw();
}
