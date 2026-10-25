import { db, state, can, esc, icon, STAGES, triageBadge, priorityBadge, staffName, staffOptions, fmtDate, fmtDateTime, timeAgo,
  modal, confirmBox, toast, fail, today, SERVICE_LABEL, initials, rpc } from '../core.js';
import { money, invoiceBadge, newInvoice, receivePayment, trustTxn } from '../fin.js';
import { logActivity, editDeal, editCase, dealBadge, caseBadge, ACT_LABEL, ACT_ICON } from '../crm.js';

export async function render(el, [id], { setTitle }) {
  const { data: c, error } = await db.from('contacts').select('*, companies(id, name)').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Contact not found.</div>'; return; }
  setTitle(c.full_name);
  const edit = can('crm.edit'), fin = can('finance.view');
  let tab = sessionStorage.getItem('gi_contact_tab') || 'activity';
  const [{ data: openDeals }, money360] = await Promise.all([
    db.from('deals').select('value, stage').eq('contact_id', id),
    fin ? Promise.all([db.from('invoices').select('balance, status, total').eq('contact_id', id), rpc('trust_balance', { p_contact: id }).catch(() => 0)]) : [null, null],
  ]);
  const [invs, trust] = money360 || [];
  const owing = (invs?.data || []).filter((i) => ['open', 'partial'].includes(i.status)).reduce((s, i) => s + +i.balance, 0);
  const billed = (invs?.data || []).filter((i) => i.status !== 'void' && i.status !== 'draft').reduce((s, i) => s + +i.total, 0);

  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/contacts">← Contacts</a><div class="grow"></div>
      ${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}">${icon('phone')} Call</a>` : ''}
      ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${icon('mail')} Email</a>` : ''}
      ${edit ? `<button class="btn" id="logAct">${icon('note')} Log activity</button>` : ''}
      ${can('agreements.manage') ? `<button class="btn btn-gold" id="genAgr">${icon('file')} Generate agreement</button>` : ''}
      <div style="position:relative"><button class="btn btn-primary" id="moreNew">${icon('plus')} New ▾</button></div>
      ${edit ? `<button class="btn" id="editBtn">Edit</button>` : ''}
      ${can('crm.delete') ? `<button class="btn btn-danger" id="delBtn" aria-label="Delete">${icon('trash')}</button>` : ''}
    </div>
    <div class="detail">
      <div class="grid">
        <div class="card"><div class="card-b">
          <div class="row" style="margin-bottom:14px"><span class="avatar gold" style="width:52px;height:52px;font-size:17px">${esc(initials(c.full_name))}</span>
            <div><h2 style="font-family:var(--serif);color:var(--navy);font-size:21px">${esc(c.full_name)}</h2>
            <small style="color:var(--muted)">${c.job_title ? esc(c.job_title) + (c.companies ? ' at ' : '') : ''}${c.companies ? `<a href="#/companies/${c.companies.id}">${esc(c.companies.name)}</a>` : ''}${!c.job_title && !c.companies ? 'Added ' + fmtDate(c.created_at) + ' · ' + esc(c.source) : ''}</small></div></div>
          <div class="row" style="margin-bottom:14px">${triageBadge(c.priority)}${c.last_activity_at ? `<small style="color:var(--muted)">Last contact ${timeAgo(c.last_activity_at)}</small>` : ''}</div>
          <div class="field"><label>Lifecycle stage</label><select class="input" id="stage" ${edit ? '' : 'disabled'}>
            ${STAGES.map(([k, l]) => `<option value="${k}" ${k === c.stage ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Owner</label><select class="input" id="assign" ${edit ? '' : 'disabled'}>${staffOptions(c.assigned_to)}</select></div>
          <dl class="kv" style="margin-top:6px">
            <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
            <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
            <dt>Address</dt><dd>${esc([c.address, c.city, c.province, c.postal_code, c.country].filter(Boolean).join(', ') || '—')}</dd>
            <dt>Date of birth</dt><dd>${fmtDate(c.date_of_birth)}</dd>
            <dt>Citizenship</dt><dd>${esc(c.citizenship || '—')}</dd>
            <dt>Language</dt><dd>${esc(c.language || '—')}</dd>
            <dt>Prefers</dt><dd>${esc(c.contact_pref || '—')}</dd>
            <dt>Location</dt><dd>${c.location === 'in' ? 'In Canada' : c.location === 'out' ? 'Outside Canada' : '—'}</dd>
            <dt>Status</dt><dd>${esc(c.status_in_canada || '—')}</dd>
            <dt>Services</dt><dd>${esc((c.services || []).map((k) => SERVICE_LABEL[k] || k).join(', ') || '—')}</dd>
          </dl>
        </div></div>
        <div class="card"><div class="card-b grid g-2" style="gap:12px">
          <div><small style="color:var(--muted)">Open deals</small><div style="font-weight:700;color:var(--navy);font-size:18px">${money((openDeals || []).filter((d) => !['won', 'lost'].includes(d.stage)).reduce((s, d) => s + +d.value, 0))}</div></div>
          ${fin ? `<div><small style="color:var(--muted)">Total billed</small><div style="font-weight:700;color:var(--navy);font-size:18px">${money(billed)}</div></div>
          <div><small style="color:var(--muted)">Balance owing</small><div style="font-weight:700;font-size:18px;color:${owing ? 'var(--red)' : 'var(--navy)'}">${money(owing)}</div></div>
          <div><small style="color:var(--muted)">Held in trust</small><div style="font-weight:700;color:var(--navy);font-size:18px">${money(trust)}</div></div>` : ''}
        </div></div>
      </div>
      <div class="card">
        <div class="tabs" id="tabs">${[['activity', 'Activity'], ['deals', 'Deals'], ['cases', 'Cases'], ['agreements', 'Agreements'], ...(fin ? [['billing', 'Billing']] : []), ['tasks', 'Tasks'], ['assessments', 'Assessments']]
          .map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
        <div class="card-b" id="tabBody"></div>
      </div>
    </div>`;

  // Header actions
  el.querySelector('#logAct')?.addEventListener('click', () => logActivity({ contactId: id, companyId: c.company_id }));
  el.querySelector('#genAgr')?.addEventListener('click', async () => (await import('./agreements.js')).newAgreement({ contactId: id }));
  el.querySelector('#moreNew').onclick = (e) => {
    e.stopPropagation();
    const old = document.querySelector('.dropdown'); if (old) return old.remove();
    const d = document.createElement('div'); d.className = 'dropdown'; d.style.left = '0'; d.style.right = 'auto';
    const items = [[can('crm.edit'), 'deal', 'trend', 'Deal'], [can('crm.edit'), 'case', 'briefcase', 'Case'], [can('agreements.manage'), 'agr', 'file', 'Agreement'], [can('finance.manage'), 'inv', 'file', 'Invoice'],
      [can('finance.manage'), 'pay', 'check', 'Payment received'], [can('finance.manage'), 'trust', 'lock', 'Retainer into trust'], [true, 'task', 'checksq', 'Task']].filter((x) => x[0]);
    d.innerHTML = items.map(([, k, ic, l]) => `<button data-n="${k}">${icon(ic)} ${l}</button>`).join('');
    e.currentTarget.parentElement.appendChild(d);
    d.onclick = (ev) => {
      const k = ev.target.closest('[data-n]')?.dataset.n; d.remove();
      ({ agr: async () => (await import('./agreements.js')).newAgreement({ contactId: id }), deal: () => editDeal({}, { contactId: id }), case: () => editCase({}, { contactId: id }), inv: () => newInvoice(id), pay: () => receivePayment(id),
        trust: () => trustTxn('deposit', id), task: () => addTask() })[k]?.();
    };
    setTimeout(() => document.addEventListener('click', () => d.remove(), { once: true }));
  };
  el.querySelector('#stage').onchange = (e) => update({ stage: e.target.value }, 'Stage updated');
  el.querySelector('#assign').onchange = (e) => update({ assigned_to: e.target.value || null }, 'Owner saved');
  async function update(patch, msg) {
    const { error: er } = await db.from('contacts').update(patch).eq('id', id);
    if (er) return fail(er);
    toast(msg); window.dispatchEvent(new Event('refresh-counts'));
  }
  el.querySelector('#editBtn')?.addEventListener('click', async () => {
    const { data: companies } = await db.from('companies').select('id, name').order('name');
    modal({
      title: 'Edit contact', wide: true,
      body: `<div class="row-2"><div class="field"><label>Full name</label><input class="input" id="n" value="${esc(c.full_name)}"></div>
        <div class="field"><label>Date of birth</label><input class="input" type="date" id="dob" value="${c.date_of_birth || ''}"></div></div>
        <div class="row-2"><div class="field"><label>Email</label><input class="input" id="e" value="${esc(c.email || '')}"></div>
        <div class="field"><label>Phone</label><input class="input" id="p" value="${esc(c.phone || '')}"></div></div>
        <div class="row-2"><div class="field"><label>Company</label><select class="input" id="co"><option value="">None</option>${(companies || []).map((x) => `<option value="${x.id}" ${x.id === c.company_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Job title</label><input class="input" id="jt" value="${esc(c.job_title || '')}"></div></div>
        <div class="field"><label>Street address</label><input class="input" id="ad" value="${esc(c.address || '')}"></div>
        <div class="row-2"><div class="field"><label>City</label><input class="input" id="ci2" value="${esc(c.city || '')}"></div>
        <div class="row-2" style="gap:8px"><div class="field"><label>Province</label><input class="input" id="pv" value="${esc(c.province || '')}"></div><div class="field"><label>Postal code</label><input class="input" id="pc" value="${esc(c.postal_code || '')}"></div></div></div>
        <div class="row-2"><div class="field"><label>Country</label><input class="input" id="cn" value="${esc(c.country || '')}"></div>
        <div class="field"><label>Citizenship</label><input class="input" id="ci" value="${esc(c.citizenship || '')}"></div></div>
        <div class="row-2"><div class="field"><label>Language</label><input class="input" id="la" value="${esc(c.language || '')}"></div>
        <div class="field"><label>Priority</label><select class="input" id="pr"><option value="">None</option>${['RED', 'AMBER', 'GREEN'].map((l) => `<option ${l === c.priority ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const v = (s) => m.querySelector(s).value.trim() || null;
        const { error: er } = await db.from('contacts').update({ full_name: v('#n') || c.full_name, email: v('#e')?.toLowerCase() || null, phone: v('#p'),
          company_id: v('#co'), job_title: v('#jt'), date_of_birth: v('#dob'), address: v('#ad'), city: v('#ci2'), province: v('#pv'), postal_code: v('#pc'),
          country: v('#cn'), citizenship: v('#ci'), language: v('#la'), priority: v('#pr') }).eq('id', id);
        if (er) throw new Error(er.code === '23505' ? 'Another contact already uses this email.' : er.message);
        toast('Contact saved'); render(el, [id], { setTitle });
      } }],
    });
  });
  el.querySelector('#delBtn')?.addEventListener('click', async () => {
    if (!(await confirmBox('Delete contact', `Delete ${c.full_name} and their notes, activities, deals, cases and assessments? Contacts with invoices cannot be deleted.`, 'Delete', true))) return;
    const { error: er } = await db.from('contacts').delete().eq('id', id);
    if (er) return fail(new Error(/foreign key/i.test(er.message) ? 'This contact has invoices or payments in the books and cannot be deleted.' : er.message));
    toast('Contact deleted'); location.hash = '#/contacts';
  });

  const tabs = el.querySelector('#tabs'), body = el.querySelector('#tabBody');
  if (!tabs.querySelector(`[data-k="${tab}"]`)) tab = 'activity';
  tabs.onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; sessionStorage.setItem('gi_contact_tab', tab); showTab(); } };
  const rerender = () => render(el, [id], { setTitle });
  window.addEventListener('crm-changed', rerender, { once: true });
  window.addEventListener('books-changed', rerender, { once: true });
  showTab();

  async function showTab() {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    body.innerHTML = '<div class="loading" style="min-height:120px"><div class="spin"></div></div>';
    ({ agreements: agreementsTab, activity: activityTab, deals: dealsTab, cases: casesTab, billing: billingTab, tasks: tasksTab, assessments: assessmentsTab })[tab]();
  }

  async function activityTab() {
    const [acts, notes, subs] = await Promise.all([
      db.from('activities').select('*').eq('contact_id', id).order('occurred_at', { ascending: false }).limit(200),
      db.from('notes').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
      can('intake.view') ? db.from('intake_submissions').select('id, triage_level, created_at, source').eq('contact_id', id) : { data: [] },
    ]);
    const items = [
      ...(acts.data || []).map((a) => ({ at: a.occurred_at, ico: ACT_ICON[a.type], html: `<div class="meta">${ACT_LABEL[a.type]}${a.direction ? ' · ' + a.direction : ''} · ${esc(staffName(a.author_id))} · ${fmtDateTime(a.occurred_at)}${a.outcome ? ` · <b>${esc(a.outcome)}</b>` : ''}</div>
        ${a.subject ? `<b>${esc(a.subject)}</b>` : ''}${a.body ? `<div class="text" style="margin-top:4px">${esc(a.body)}</div>` : ''}` })),
      ...(notes.data || []).map((n) => ({ at: n.created_at, ico: 'note', html: `<div class="meta">Note · ${esc(staffName(n.author_id))} · ${timeAgo(n.created_at)}</div><div class="text">${esc(n.body)}</div>` })),
      ...(subs.data || []).map((s) => ({ at: s.created_at, ico: 'clipboard', html: `<div class="meta">${timeAgo(s.created_at)}</div>Assessment submitted ${s.source === 'staff' ? 'by staff' : 'on the website'} ${triageBadge(s.triage_level)} · <a href="#/assessments/${s.id}">Open</a>` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    body.innerHTML = `${edit ? `<div style="margin-bottom:18px"><textarea class="input" id="nb" placeholder="Quick note… (call summary, advice given, next steps)"></textarea>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-sm" id="fullLog">${icon('phone')} Log call / meeting</button><button class="btn btn-primary btn-sm" id="saveNote">Save note</button></div></div>` : ''}
      <div class="timeline">${items.map((i) => `<div class="tl"><div class="tl-dot">${icon(i.ico)}</div><div class="tl-body">${i.html}</div></div>`).join('') || '<div class="empty">No activity yet.</div>'}</div>`;
    body.querySelector('#fullLog')?.addEventListener('click', () => logActivity({ contactId: id, companyId: c.company_id }));
    body.querySelector('#saveNote')?.addEventListener('click', async () => {
      const text = body.querySelector('#nb').value.trim(); if (!text) return;
      const { error: er } = await db.from('activities').insert({ type: 'note', body: text, contact_id: id, author_id: state.profile.id });
      if (er) return fail(er);
      toast('Note saved'); showTab();
    });
  }
  async function agreementsTab() {
    const { agrBadge, AGR_TYPE, newAgreement } = await import('./agreements.js');
    const { data } = await db.from('agreements').select('id, number, type, status, created_at, client_signed_at').eq('contact_id', id).order('created_at', { ascending: false });
    body.innerHTML = `${can('agreements.manage') ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn btn-primary btn-sm" id="na">${icon('plus')} Generate agreement</button></div>` : ''}
      ${(data || []).length ? `<table class="t"><tbody>${data.map((g) => `<tr class="click" onclick="location.hash='#/agreements/${g.id}'"><td><b>${esc(g.number)}</b><br><small style="color:var(--muted)">${esc(AGR_TYPE[g.type])}</small></td>
        <td>${agrBadge(g.status)}</td><td>${g.client_signed_at ? 'Signed ' + fmtDate(g.client_signed_at) : fmtDate(g.created_at)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No agreements yet. An Initial Consultation Agreement is required before paid advice, and a Retainer Agreement for representation.</div>'}`;
    body.querySelector('#na')?.addEventListener('click', () => newAgreement({ contactId: id }));
  }
  async function dealsTab() {
    const { data } = await db.from('deals').select('*, items(name)').eq('contact_id', id).order('created_at', { ascending: false });
    body.innerHTML = `${edit ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn btn-primary btn-sm" id="nd">${icon('plus')} New deal</button></div>` : ''}
      ${(data || []).length ? `<table class="t"><tbody>${data.map((d) => `<tr class="click" data-d="${d.id}"><td><b>${esc(d.title)}</b><br><small style="color:var(--muted)">${esc(d.items?.name || '')}</small></td>
        <td>${dealBadge(d.stage)}</td><td>${d.expected_close ? fmtDate(d.expected_close) : ''}</td><td style="text-align:right"><b>${money(d.value)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No deals yet.</div>'}`;
    body.querySelector('#nd')?.addEventListener('click', () => editDeal({}, { contactId: id }));
    body.querySelectorAll('[data-d]').forEach((tr) => (tr.onclick = () => editDeal(data.find((d) => d.id === tr.dataset.d))));
  }
  async function casesTab() {
    const { data } = await db.from('cases').select('*').eq('contact_id', id).order('created_at', { ascending: false });
    body.innerHTML = `${edit ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn btn-primary btn-sm" id="nc">${icon('plus')} Open case</button></div>` : ''}
      ${(data || []).length ? `<table class="t"><tbody>${data.map((k) => `<tr class="click" onclick="location.hash='#/cases/${k.id}'"><td><b>${esc(k.case_number)}</b><br><small style="color:var(--muted)">${esc(k.title)}</small></td>
        <td>${caseBadge(k.status)}</td><td>${k.deadline ? 'Deadline ' + fmtDate(k.deadline) : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No cases yet.</div>'}`;
    body.querySelector('#nc')?.addEventListener('click', () => editCase({}, { contactId: id }));
  }
  async function billingTab() {
    const [{ data: iv }, { data: tr }] = await Promise.all([
      db.from('invoices').select('*').eq('contact_id', id).order('issue_date', { ascending: false }),
      db.from('trust_transactions').select('*').eq('contact_id', id).order('txn_date', { ascending: false })]);
    const mg = can('finance.manage');
    body.innerHTML = `${mg ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-sm" id="tdep">${icon('lock')} Retainer into trust</button><button class="btn btn-sm" id="rp">${icon('check')} Receive payment</button>
        <button class="btn btn-primary btn-sm" id="ni">${icon('plus')} New invoice</button></div>` : ''}
      <h4 style="color:var(--navy);margin:4px 0 8px">Invoices</h4>
      ${(iv || []).length ? `<table class="t"><tbody>${iv.map((i) => `<tr class="click" onclick="location.hash='#/invoices/${i.id}'"><td><b>${esc(i.number)}</b><br><small style="color:var(--muted)">${fmtDate(i.issue_date)}</small></td>
        <td>${invoiceBadge(i)}</td><td style="text-align:right">${money(i.total)}</td><td style="text-align:right">${i.status === 'void' ? '' : 'Bal ' + money(i.balance)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:16px">No invoices.</div>'}
      <h4 style="color:var(--navy);margin:18px 0 8px">Trust transactions</h4>
      ${(tr || []).length ? `<table class="t"><tbody>${tr.map((t) => `<tr><td>${fmtDate(t.txn_date)}</td><td>${t.type === 'deposit' ? 'Retainer deposited' : 'Refund'}</td><td style="text-align:right">${money(t.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:16px">No trust activity. Payments from trust appear in Payments.</div>'}`;
    body.querySelector('#ni')?.addEventListener('click', () => newInvoice(id));
    body.querySelector('#rp')?.addEventListener('click', () => receivePayment(id));
    body.querySelector('#tdep')?.addEventListener('click', () => trustTxn('deposit', id));
  }
  async function tasksTab() {
    const { data } = await db.from('tasks').select('*').eq('contact_id', id).order('done').order('due_date', { nullsFirst: false });
    body.innerHTML = `<div class="row" style="justify-content:flex-end;margin-bottom:10px"><button class="btn btn-primary btn-sm" id="newTask">${icon('plus')} Add task</button></div>
      ${(data || []).map((t) => `<div class="check ${t.done ? 'done' : ''}"><input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done">
        <div style="flex:1"><div class="title" style="font-weight:600">${esc(t.title)}</div>
        <small style="color:${!t.done && t.due_date && t.due_date < today() ? 'var(--red)' : 'var(--muted)'}">${t.due_date ? 'Due ' + fmtDate(t.due_date) : 'No due date'} · ${esc(staffName(t.assigned_to))}</small></div>${priorityBadge(t.priority)}</div>`).join('')
        || '<div class="empty">No tasks for this contact.</div>'}`;
    body.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.onchange = async () => {
      const { error: er } = await db.from('tasks').update({ done: cb.checked, done_at: cb.checked ? new Date().toISOString() : null }).eq('id', cb.dataset.id);
      if (er) return fail(er);
      window.dispatchEvent(new Event('refresh-counts')); showTab();
    }));
    body.querySelector('#newTask').onclick = addTask;
  }
  function addTask() {
    modal({
      title: 'Add task',
      body: `<div class="field"><label>Task</label><input class="input" id="tt"></div>
        <div class="row-2"><div class="field"><label>Due date</label><input class="input" type="date" id="td" value="${today()}"></div>
        <div class="field"><label>Priority</label><select class="input" id="tp"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div></div>
        <div class="field"><label>Assign to</label><select class="input" id="ta">${staffOptions(state.profile.id, { blank: 'Me' })}</select></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add task', cls: 'btn-primary', onClick: async (m) => {
        const title = m.querySelector('#tt').value.trim(); if (!title) throw new Error('Enter a task name.');
        const { error: er } = await db.from('tasks').insert({ title, contact_id: id, due_date: m.querySelector('#td').value || null,
          priority: m.querySelector('#tp').value, assigned_to: m.querySelector('#ta').value || state.profile.id, created_by: state.profile.id });
        if (er) throw er; toast('Task added'); window.dispatchEvent(new Event('refresh-counts')); if (tab === 'tasks') showTab();
      } }],
    });
  }
  async function assessmentsTab() {
    if (!can('intake.view')) { body.innerHTML = '<div class="empty">You do not have access to assessments.</div>'; return; }
    const { data } = await db.from('intake_submissions').select('id, triage_level, status, created_at, source').eq('contact_id', id).order('created_at', { ascending: false });
    body.innerHTML = (data || []).length ? `<table class="t"><tbody>${data.map((s) => `<tr class="click" onclick="location.hash='#/assessments/${s.id}'">
      <td>${triageBadge(s.triage_level)}</td><td>${fmtDateTime(s.created_at)}</td><td>${esc(s.status.replace('_', ' '))}</td><td>${s.source === 'staff' ? 'Staff' : 'Website'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">No assessments yet. <a href="#/assessments/new">Start one</a></div>`;
  }
}
