import { db, can, esc, icon, fmtDate, fmtDateTime, staffName, priorityBadge, today } from '../core.js';
import { money, invoiceBadge, newInvoice } from '../fin.js';
import { caseBadge, editCase, CASE_STATUS } from '../crm.js';

export async function render(el, [id], { setTitle }) {
  const { data: c, error } = await db.from('cases').select('*, contacts(id, full_name, email, phone)').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Case not found.</div>'; return; }
  setTitle(`${c.case_number} · ${c.contacts?.full_name || ''}`);
  const [{ data: invs }, { data: tasks }, { data: log }] = await Promise.all([
    can('finance.view') ? db.from('invoices').select('id, number, issue_date, total, balance, status, due_date').eq('case_id', id) : { data: [] },
    db.from('tasks').select('id, title, due_date, done').eq('contact_id', c.contact_id).eq('done', false).order('due_date'),
    can('audit.view') ? db.from('audit_log').select('*').eq('entity', 'case').eq('entity_id', id).order('created_at', { ascending: false }) : { data: [] },
  ]);
  const flow = ['open', 'in_progress', 'submitted', 'decision_pending'];
  const end = ['approved', 'refused', 'withdrawn', 'closed'].includes(c.status) ? c.status : 'approved';
  const steps = [...flow, end];
  const at = steps.indexOf(c.status);
  const label = Object.fromEntries(CASE_STATUS);

  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/cases">← Cases</a><div class="grow"></div>
      ${can('finance.manage') ? `<button class="btn" id="inv">${icon('dollar')} Invoice this case</button>` : ''}
      ${can('crm.edit') ? `<button class="btn btn-primary" id="ed">Update case</button>` : ''}</div>
    <div class="card" style="margin-bottom:18px"><div class="card-b">
      <div class="row" style="justify-content:space-between;margin-bottom:16px"><div><small style="color:var(--muted)">${esc(c.case_number)} · ${esc(c.application_type || '')}</small>
        <h2 style="font-family:var(--serif);color:var(--navy);font-size:22px">${esc(c.title)}</h2>
        <a href="#/contacts/${c.contacts?.id}">${esc(c.contacts?.full_name || '')}</a></div><div class="row">${caseBadge(c.status)}${priorityBadge(c.priority)}</div></div>
      <div class="stepper">${steps.map((s, i) => `<div class="st ${i < at ? 'done' : i === at ? 'cur' : ''}"><i>${i < at ? '✓' : i + 1}</i><span>${label[s]}</span></div>`).join('')}</div>
    </div></div>
    <div class="grid g-main">
      <div class="card"><div class="card-h"><h3>Key details</h3></div><div class="card-b"><dl class="kv">
        <dt>Opened</dt><dd>${fmtDate(c.opened_on)}</dd><dt>Submitted</dt><dd>${fmtDate(c.submitted_on)}</dd>
        <dt>Deadline</dt><dd style="color:${c.deadline && c.deadline < today() ? 'var(--red)' : 'inherit'}">${fmtDate(c.deadline)}</dd><dt>Decision</dt><dd>${fmtDate(c.decision_on)}</dd>
        <dt>IRCC file no.</dt><dd>${esc(c.ircc_file_number || '—')}</dd><dt>UCI</dt><dd>${esc(c.uci || '—')}</dd><dt>Assigned to</dt><dd>${esc(staffName(c.assigned_to))}</dd></dl>
        ${c.description ? `<p style="margin-top:14px;white-space:pre-wrap">${esc(c.description)}</p>` : ''}</div></div>
      <div class="grid">
        ${can('finance.view') ? `<div class="card"><div class="card-h"><h3>Billing</h3></div><div class="table-wrap">${(invs || []).length ? `<table class="t"><tbody>${invs.map((i) => `<tr class="click" onclick="location.hash='#/invoices/${i.id}'">
          <td>${esc(i.number)}<br><small style="color:var(--muted)">${fmtDate(i.issue_date)}</small></td><td>${invoiceBadge(i)}</td><td style="text-align:right">${money(i.total)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty" style="padding:18px">No invoices linked to this case.</div>'}</div></div>` : ''}
        <div class="card"><div class="card-h"><h3>Open tasks for client</h3></div><div class="card-b" style="padding-top:4px;padding-bottom:4px">${(tasks || []).map((t) => `<div class="check"><span style="flex:1">${esc(t.title)}</span><small>${fmtDate(t.due_date)}</small></div>`).join('') || '<div class="empty" style="padding:16px">No open tasks.</div>'}</div></div>
        ${(log || []).length ? `<div class="card"><div class="card-h"><h3>History</h3></div><div class="card-b" style="font-size:13px">${log.map((l) => `<div class="check"><span style="flex:1">${l.action === 'created' ? 'Case opened' : `Status: ${esc(label[l.details.from] || l.details.from)} → <b>${esc(label[l.details.to] || l.details.to)}</b>`}</span><small>${fmtDateTime(l.created_at)}</small></div>`).join('')}</div></div>` : ''}
      </div></div>`;
  el.querySelector('#ed')?.addEventListener('click', () => editCase(c));
  el.querySelector('#inv')?.addEventListener('click', async () => {
    const { data, error: e } = await db.from('invoices').insert({ contact_id: c.contact_id, case_id: id }).select('id').single();
    if (!e) location.hash = `#/invoices/${data.id}`; else newInvoice(c.contact_id);
  });
  window.addEventListener('crm-changed', () => render(el, [id], { setTitle }), { once: true });
}
