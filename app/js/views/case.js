import { db, can, canDraftAgreements, esc, icon, fmtDate, fmtDateTime, staffName, priorityBadge, today } from '../core.js';
import { money, invoiceBadge, newInvoice } from '../fin.js';
import { caseBadge, editCase, CASE_STATUS } from '../crm.js';

export async function render(el, [id], { setTitle }) {
  const { data: c, error } = await db.from('cases').select('*, contacts(id, full_name, email, phone)').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Case not found.</div>'; return; }
  setTitle(`${c.case_number} · ${c.contacts?.full_name || ''}`);
  const { clBadge, stepProgress, progressBar, startChecklist } = await import('./checklists.js');
  const [{ data: invs }, { data: tasks }, { data: log }, { data: lists }] = await Promise.all([
    can('finance.view') ? db.from('invoices').select('id, number, issue_date, total, balance, status, due_date').eq('case_id', id) : { data: [] },
    db.from('tasks').select('id, title, due_date, done').eq('contact_id', c.contact_id).eq('done', false).order('due_date'),
    can('audit.view') ? db.from('audit_log').select('*').eq('entity', 'case').eq('entity_id', id).order('created_at', { ascending: false }) : { data: [] },
    db.from('case_checklists').select('id, name, stage, assigned_to, case_checklist_items(stage, status, required)').eq('case_id', id).order('created_at'),
  ]);
  const flow = ['open', 'in_progress', 'submitted', 'decision_pending'];
  const end = ['approved', 'refused', 'withdrawn', 'closed'].includes(c.status) ? c.status : 'approved';
  const steps = [...flow, end];
  const at = steps.indexOf(c.status);
  const label = Object.fromEntries(CASE_STATUS);

  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/cases">← Cases</a><div class="grow"></div>
      ${canDraftAgreements() ? `<button class="btn" id="agr">${icon('file')} Retainer agreement</button>` : ''}
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
        <div class="card"><div class="card-h"><h3>Checklists</h3>${can('checklists.work') ? `<button class="btn btn-gold btn-sm" id="startCl">${icon('plus')} Start checklist</button>` : ''}</div>
          <div class="card-b" style="padding-top:4px;padding-bottom:4px">${(lists || []).map((l) => `<a class="check" href="#/checklists/${l.id}" style="text-decoration:none;color:inherit"><span style="flex:1"><b>${esc(l.name)}</b><br><small style="color:var(--muted)">${esc(staffName(l.assigned_to))}</small></span>
            ${l.stage === 'approved' ? '' : `<span class="row" style="gap:6px;flex-wrap:nowrap">${progressBar(stepProgress(l))}</span>`}${clBadge(l.stage)}</a>`).join('')
            || `<div class="empty" style="padding:16px">No checklist yet.${can('checklists.work') ? ' Start one to track documents, forms and the RCIC’s final approval.' : ''}</div>`}</div></div>
        <div class="card"><div class="card-h"><h3>Documents</h3><small style="color:var(--muted)">OneDrive · this case</small></div><div class="card-b" id="docs"></div></div>
        ${can('finance.view') ? `<div class="card"><div class="card-h"><h3>Billing</h3></div><div class="table-wrap">${(invs || []).length ? `<table class="t"><tbody>${invs.map((i) => `<tr class="click" onclick="location.hash='#/invoices/${i.id}'">
          <td>${esc(i.number)}<br><small style="color:var(--muted)">${fmtDate(i.issue_date)}</small></td><td>${invoiceBadge(i)}</td><td style="text-align:right">${money(i.total)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty" style="padding:18px">No invoices linked to this case.</div>'}</div></div>` : ''}
        <div class="card"><div class="card-h"><h3>Open tasks for client</h3></div><div class="card-b" style="padding-top:4px;padding-bottom:4px">${(tasks || []).map((t) => `<div class="check"><span style="flex:1">${esc(t.title)}</span><small>${fmtDate(t.due_date)}</small></div>`).join('') || '<div class="empty" style="padding:16px">No open tasks.</div>'}</div></div>
        ${(log || []).length ? `<div class="card"><div class="card-h"><h3>History</h3></div><div class="card-b" style="font-size:13px">${log.map((l) => `<div class="check"><span style="flex:1">${l.action === 'created' ? 'Case opened' : `Status: ${esc(label[l.details.from] || l.details.from)} → <b>${esc(label[l.details.to] || l.details.to)}</b>`}</span><small>${fmtDateTime(l.created_at)}</small></div>`).join('')}</div></div>` : ''}
      </div></div>`;
  el.querySelector('#ed')?.addEventListener('click', () => editCase(c));
  import('../files.js').then(({ documentsPanel }) => documentsPanel(el.querySelector('#docs'), { contactId: c.contact_id, caseId: id }));
  el.querySelector('#startCl')?.addEventListener('click', () => startChecklist({ id, case_number: c.case_number, title: c.title, application_type: c.application_type, contacts: c.contacts }));
  el.querySelector('#agr')?.addEventListener('click', async () => (await import('./agreements.js')).newAgreement({ contactId: c.contact_id, caseId: id, type: 'retainer' }));
  el.querySelector('#inv')?.addEventListener('click', async () => {
    const { data, error: e } = await db.from('invoices').insert({ contact_id: c.contact_id, case_id: id }).select('id').single();
    if (!e) location.hash = `#/invoices/${data.id}`; else newInvoice(c.contact_id);
  });
  window.addEventListener('crm-changed', () => render(el, [id], { setTitle }), { once: true });
}
