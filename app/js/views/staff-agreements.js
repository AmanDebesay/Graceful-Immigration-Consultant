// Staff agreements: employment agreements for new hires, generated on the letterhead.
// The owner can change every fact (role, address, term, pay, duties, schedules) and even edit the text directly.
import { db, state, esc, icon, fmtDate, timeAgo, modal, confirmBox, toast, fail } from '../core.js';
import { render as renderDoc, staffDefaults, ROLE_PRESETS, PROVINCES, docTitle, subtitle, endDate, missing } from '../staff-agreement-template.js';

const BADGE = { draft: '<span class="badge b-gold">Draft</span>', sent: '<span class="badge b-blue">Sent</span>', signed: '<span class="badge b-GREEN">Signed</span>', void: '<span class="badge">Void</span>' };
const EMPLOYER_KEYS = ['business_name', 'business_address', 'business_phone', 'business_email', 'website', 'rcic_name', 'rcic_id', 'rcic_designation', 'supervisor_name', 'supervisor_id'];

export async function render(el, [id], ctx) {
  if (id) return editor(el, id, ctx);
  el.innerHTML = `<div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="new">${icon('plus')} New staff agreement</button></div>
    <div class="alert info">Employment agreements for new team members, on the company letterhead. Pick a role, fill in the facts, and print or save as PDF. Every word can be changed.</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;
  el.querySelector('#new').onclick = () => newAgreement().catch(fail);
  const { data, error } = await db.from('staff_agreements').select('id, number, employee_name, role_title, status, data, signed_on, updated_at').order('updated_at', { ascending: false });
  const box = el.querySelector('#list');
  if (error) { box.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  box.innerHTML = data.length ? `<table class="t"><thead><tr><th>Number</th><th>Employee</th><th>Role</th><th>Start</th><th>Status</th><th>Updated</th></tr></thead><tbody>
    ${data.map((a) => `<tr class="click" data-id="${a.id}"><td><b>${esc(a.number)}</b></td><td>${esc(a.employee_name || '—')}</td><td>${esc(a.role_title || '—')}</td>
      <td>${a.data?.start_date ? fmtDate(a.data.start_date) : '—'}</td><td>${BADGE[a.status]}${a.signed_on ? ` <small class="dk-muted">${fmtDate(a.signed_on)}</small>` : ''}</td><td>${timeAgo(a.updated_at)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${icon('file')}<div>No staff agreements yet.</div></div>`;
  box.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/staff-agreements/${tr.dataset.id}`)));
}

// New agreement: choose the role; employer details come from the last agreement (or Business Settings).
async function newAgreement(copyOf = null) {
  const [{ data: org }, { data: last }, { data: staff }] = await Promise.all([
    db.from('org_settings').select('*').eq('id', 1).single(),
    db.from('staff_agreements').select('data').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('profiles').select('id, full_name, email, job_title, role').neq('role', 'client').order('full_name')]);
  if (copyOf) return create({ ...copyOf.data, employee_name: '', employee_address: '', employee_email: '', employee_phone: '', start_date: '', end_date: '', agreement_date: new Date().toLocaleDateString('en-CA') }, null);
  modal({ title: 'New staff agreement',
    body: `<div class="field"><label>Role</label><select class="input" id="r">${Object.entries(ROLE_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')}<option value="blank">Other role (start from the case assistant text)</option></select></div>
      <div class="field"><label>Team member (optional)</label><select class="input" id="p"><option value="">Not invited yet</option>${(staff || []).map((s) => `<option value="${s.id}">${esc(s.full_name || s.email)} · ${esc(s.email)}</option>`).join('')}</select>
        <small class="dk-muted">If they already have a login, their name and email are filled in.</small></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Create', cls: 'btn-primary', onClick: async (m) => {
      const preset = m.querySelector('#r').value, prof = (staff || []).find((s) => s.id === m.querySelector('#p').value);
      const d = staffDefaults(org || {}, preset === 'blank' ? 'case_assistant' : preset);
      if (preset === 'blank') d.role_title = '';
      if (last?.data) EMPLOYER_KEYS.forEach((k) => { if (last.data[k]) d[k] = last.data[k]; });
      if (prof) { d.employee_name = prof.full_name || ''; d.employee_email = prof.email || ''; if (preset === 'blank' && prof.job_title) d.role_title = prof.job_title; }
      await create(d, prof?.id || null);
    } }] });
}
async function create(d, profile_id) {
  const { data, error } = await db.from('staff_agreements').insert({ data: d, employee_name: d.employee_name || '', employee_email: d.employee_email || null, role_title: d.role_title || '', profile_id }).select('id').single();
  if (error) throw error;
  location.hash = `#/staff-agreements/${data.id}`;
}

const F = {
  text: (k, label, d, extra = '') => `<div class="field"><label>${label}</label><input class="input" data-k="${k}" value="${esc(d[k] ?? '')}" ${extra}></div>`,
  num: (k, label, d, extra = '') => `<div class="field"><label>${label}</label><input class="input" type="number" min="0" step="any" data-k="${k}" value="${esc(d[k] ?? '')}" ${extra}></div>`,
  date: (k, label, d) => `<div class="field"><label>${label}</label><input class="input" type="date" data-k="${k}" value="${esc(d[k] || '')}"></div>`,
  sel: (k, label, d, opts) => `<div class="field"><label>${label}</label><select class="input" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(d[k]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`,
  area: (k, label, d, rows, hint = '') => `<div class="field"><label>${label}</label><textarea class="input" data-k="${k}" rows="${rows}">${esc(d[k] || '')}</textarea>${hint ? `<small class="dk-muted">${hint}</small>` : ''}</div>`,
  check: (k, label, d) => `<label class="row" style="gap:8px;margin:4px 0 8px"><input type="checkbox" data-k="${k}" ${d[k] ? 'checked' : ''}> ${label}</label>`,
};
// Form for an independent contractor outside Canada (no payroll, hours or vacation).
const contractorForm = (d) => `${group('Contractor and role', true, `${F.text('role_title', 'Role', d)}${F.text('employee_name', 'Contractor’s full legal name', d)}
    ${F.text('employee_address', 'Contractor’s address (street, city)', d)}${F.text('country', 'Country where they work', d)}
    <div class="row-2">${F.text('employee_email', 'Email', d, 'type="email"')}${F.text('employee_phone', 'Phone / WhatsApp', d)}</div>`)}
  ${group('Start and notice', true, `<div class="row-2">${F.date('agreement_date', 'Agreement date', d)}${F.date('start_date', 'Start date', d)}</div>
    <div class="row-2">${F.num('trial_months', 'Trial period (months, 0 = none)', d)}${F.num('notice_days', 'Notice to end (days)', d)}</div>`)}
  ${group('Fee', true, `<div class="row-2">${F.num('fee_amount', 'Fee amount', d)}${F.sel('fee_currency', 'Currency', d, [['USD', 'US dollars (USD)'], ['CAD', 'Canadian dollars (CAD)'], ['ETB', 'Ethiopian birr (ETB)']])}</div>
    ${F.sel('fee_period', 'Paid', d, [['month', 'Per month'], ['two_weeks', 'Every two weeks'], ['week', 'Per week'], ['project', 'Per project']])}
    ${F.text('payment_terms', 'When it is paid', d)}${F.text('payment_method', 'How it is paid', d)}`)}
  ${group('Work and minimum deliverables', true, `<div class="row-2">${F.num('videos_min', 'At least this many videos', d)}${F.sel('videos_period', 'Per', d, [['day', 'Day'], ['week', 'Week'], ['month', 'Month']])}</div>
    ${F.text('platforms', 'Platforms', d)}<div class="row-2">${F.num('reply_hours', 'Check comments/messages every (hours)', d)}${F.num('approval_hours', 'RCIC approval time (hours)', d)}</div>
    ${F.area('duties', 'Services (one per line)', d, 8)}${F.area('not_allowed', 'What the contractor must not do (one per line)', d, 7)}`)}
  ${group('Access and other terms', false, `${F.area('access', 'Schedule B: access and security (Item | Rule)', d, 7)}
    ${F.num('non_solicit_months', 'No directing clients elsewhere after leaving (months, 0 = leave out)', d)}${F.check('include_witness', 'Witness signature lines', d)}
    ${F.area('extra_terms', 'Additional terms (each line is a clause)', d, 4)}`)}`;
const group = (title, open, html) => `<details class="sa-g" ${open ? 'open' : ''}><summary>${title}</summary><div class="sa-gb">${html}</div></details>`;
const CSS = `<style>
.sa-wrap{display:grid;grid-template-columns:minmax(330px,420px) minmax(0,1fr);gap:16px;align-items:start}
.sa-form{max-height:calc(100vh - 150px);overflow:auto;padding:4px}
.sa-g{background:#FFFDF8;border:1px solid #E7DFCC;border-radius:12px;margin-bottom:10px;color:#1C2333}
.sa-g summary{cursor:pointer;padding:11px 14px;font-weight:700;color:#0B2A5C;font-family:var(--serif,Georgia);font-size:15.5px}
.sa-gb{padding:0 14px 8px}.sa-gb .field{margin-bottom:10px}.sa-gb textarea{font-size:13px;line-height:1.45}
.sa-prev{background:#fff;border-radius:12px;padding:34px 38px;box-shadow:0 10px 30px rgba(3,12,32,.25);max-height:calc(100vh - 150px);overflow:auto;color:#1C2333}
.sa-prev[contenteditable=true]{outline:3px dashed #C9A24A;outline-offset:-3px}
.sa-miss{font-size:13px}
@media (max-width:1000px){.sa-wrap{grid-template-columns:1fr}.sa-form,.sa-prev{max-height:none}.sa-prev{padding:18px}}
</style>`;

async function editor(el, id, { setTitle }) {
  const { data: a, error } = await db.from('staff_agreements').select('*').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Agreement not found.</div>'; return; }
  const d = a.data || {};
  const locked = a.status === 'signed' || a.status === 'void';
  let custom = a.body_html || '', editing = false, timer = null, saved = JSON.stringify([d, custom]);
  setTitle(`${a.number} · ${d.employee_name || 'New staff agreement'}`);

  el.innerHTML = `${CSS}<div class="toolbar"><a class="btn btn-sm" href="#/staff-agreements">← Staff agreements</a>${BADGE[a.status]}
      <span id="st" class="dk-muted" style="font-size:13px">${locked ? (a.status === 'signed' ? `Signed ${a.signed_on ? fmtDate(a.signed_on) : ''} · locked` : 'Void') : 'Saves automatically'}</span><div class="grow"></div>
      ${locked ? '' : `<button class="btn" id="edit">${icon('edit')} Edit text directly</button>`}
      <button class="btn btn-gold" id="print">${icon('file')} Print / PDF</button>
      ${a.status === 'draft' ? `<button class="btn" id="sent">Mark sent</button>` : ''}
      ${['draft', 'sent'].includes(a.status) ? `<button class="btn btn-primary" id="sign">${icon('check')} Mark signed</button>` : ''}
      <button class="btn" id="copy" title="New agreement with the same terms">Copy</button>
      ${a.status === 'sent' || a.status === 'signed' ? `<button class="btn" id="void">Void</button>` : ''}
      ${a.status === 'draft' ? `<button class="btn btn-danger" id="del" aria-label="Delete draft">${icon('trash')}</button>` : ''}</div>
    <div id="banner"></div>
    <div class="sa-wrap">
      ${locked ? '' : `<div class="sa-form" id="form">
        ${d.kind === 'contractor' ? contractorForm(d) : `${group('Employee and role', true, `${F.sel('preset', 'Role template', d, [...Object.entries(ROLE_PRESETS).filter(([, p]) => !p.kind).map(([k, p]) => [k, p.label]), ['custom', 'Custom']])}
          ${F.text('role_title', 'Job title', d)}${F.text('employee_name', 'Employee’s full legal name', d)}
          ${F.text('employee_address', 'Employee’s address (street, city, province, postal code)', d)}
          <div class="row-2">${F.text('employee_email', 'Email', d, 'type="email"')}${F.text('employee_phone', 'Phone', d)}</div>
          ${F.sel('work_province', 'Province where they work (employment standards law)', d, Object.entries(PROVINCES).map(([k, [n]]) => [k, n]))}`)}
        ${group('Term', true, `${F.sel('term_type', 'Type of employment', d, [['fixed', 'Fixed term (ends on a set date)'], ['permanent', 'Permanent (no end date)']])}
          <div class="row-2">${F.date('agreement_date', 'Agreement date', d)}${F.date('start_date', 'Start date', d)}</div>
          <div class="row-2" data-show="fixed">${F.num('term_months', 'Length (months)', d)}${F.date('end_date', 'End date (blank = worked out)', d)}</div>
          <div data-show="permanent">${F.num('probation_months', 'Probation (months, 0 = none)', d)}</div>
          ${F.num('early_notice_weeks', 'Notice to end early (weeks)', d)}`)}
        ${group('Hours and place of work', false, `${F.sel('hours_type', 'Hours', d, [['part_time', 'Part-time, as needed'], ['part_time_fixed', 'Part-time, set hours'], ['full_time', 'Full-time']])}
          <div class="row-2">${F.text('hours_expected', 'About how many hours a week', d)}${F.text('hours_max', 'Most hours a week', d)}</div>
          ${F.sel('work_place', 'Where they work', d, [['remote', 'Remote'], ['office', 'In the office'], ['hybrid', 'Hybrid']])}
          ${F.text('work_place_text', 'Location (e.g. Ontario, or the office address)', d)}`)}
        ${group('Pay and vacation', false, `<div class="row-2">${F.sel('pay_type', 'Pay', d, [['hourly', 'Hourly wage'], ['salary', 'Yearly salary']])}${F.num('wage', 'Amount ($)', d)}</div>
          <div class="row-2">${F.text('pay_frequency', 'Paid', d)}${F.num('vacation_pct', 'Vacation pay (%)', d)}</div>
          ${F.area('benefits', 'Benefits', d, 2)}`)}
        ${group('Duties and limits', false, `${F.area('duties', 'Duties (one per line)', d, 8)}${F.area('not_allowed', 'What the employee must not do (one per line)', d, 7)}${F.area('escalation', 'Schedule B: must ask the RCIC before… (one per line)', d, 6)}`)}
        ${group('Schedules and other terms', false, `${F.area('access', 'Schedule A: system access (one row per line: Item | Rule)', d, 8)}
          ${F.check('include_training', 'Include training (section and Schedule C)', d)}${F.area('training', 'Schedule C: training plan (lines starting with # are headings)', d, 10)}
          ${F.num('non_solicit_months', 'No soliciting clients after leaving (months, 0 = leave out)', d)}${F.check('include_witness', 'Witness signature lines', d)}
          ${F.area('extra_terms', 'Additional terms (each line is a clause)', d, 4)}`)}`}
        ${group('Employer and supervisor', false, `${F.text('business_name', 'Business name', d)}${F.text('business_address', 'Business address', d)}
          <div class="row-2">${F.text('business_phone', 'Phone', d)}${F.text('business_email', 'Email', d)}</div>${F.text('website', 'Website', d)}
          <div class="row-2">${F.text('rcic_name', 'Signing RCIC', d)}${F.text('rcic_id', 'CICC licence no.', d)}</div>${F.text('rcic_designation', 'Designation', d)}
          <div class="row-2">${F.text('supervisor_name', 'Supervising Consultant', d)}${F.text('supervisor_id', 'Supervisor licence no.', d)}</div>`)}
        ${group('Title', false, `${F.text('doc_title', 'Document title (blank = automatic)', d, `placeholder="${esc(docTitle(d))}"`)}${F.text('subtitle', 'Subtitle (blank = automatic)', d, `placeholder="${esc(subtitle(d))}"`)}`)}
      </div>`}
      <div class="sa-prev" id="prev"></div></div>`;
  if (locked) el.querySelector('.sa-wrap').style.gridTemplateColumns = 'minmax(0,1fr)';

  const prev = el.querySelector('#prev'), st = el.querySelector('#st'), banner = el.querySelector('#banner');
  const paint = () => {
    el.querySelectorAll('[data-show]').forEach((x) => (x.hidden = x.dataset.show !== (d.term_type || 'fixed')));
    const endInput = el.querySelector('[data-k=end_date]'); if (endInput) endInput.placeholder = endDate({ ...d, end_date: '' });
    if (!editing) prev.innerHTML = custom || renderDoc(d);
    const miss = missing(d);
    banner.innerHTML = (custom && !locked ? `<div class="alert info row" style="gap:10px;flex-wrap:wrap">You edited the text directly, so changes in the form are not shown. <button class="btn btn-sm" id="rebuild">Rebuild from the form</button> <small class="dk-muted">(your direct edits will be lost)</small></div>` : '')
      + (miss.length && !locked ? `<div class="alert err sa-miss">Still blank: ${miss.map(esc).join(', ')}. Blanks print as lines to fill in by hand.</div>` : '');
    banner.querySelector('#rebuild')?.addEventListener('click', async () => {
      if (!(await confirmBox('Rebuild from the form', 'Replace the text you edited directly with the text built from the form?', 'Rebuild'))) return;
      custom = ''; paint(); schedule();
    });
  };
  async function save() {
    clearTimeout(timer); timer = null;
    if (locked) return;
    const now = JSON.stringify([d, custom]); if (now === saved) return;
    st.textContent = 'Saving…';
    const { error: e } = await db.from('staff_agreements').update({ data: d, body_html: custom || null, employee_name: d.employee_name || '', employee_email: d.employee_email || null, role_title: d.role_title || '' }).eq('id', id);
    if (e) { st.textContent = 'Not saved'; return fail(e); }
    saved = now; st.textContent = `Saved ${new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`;
    setTitle(`${a.number} · ${d.employee_name || 'New staff agreement'}`);
  }
  const schedule = () => { st.textContent = 'Unsaved changes…'; clearTimeout(timer); timer = setTimeout(save, 900); };
  const onLeave = () => { if (timer) save(); window.removeEventListener('hashchange', onLeave); };
  window.addEventListener('hashchange', onLeave);

  el.querySelector('#form')?.addEventListener('input', (ev) => {
    const k = ev.target.dataset.k; if (!k) return;
    if (k === 'preset') return;
    d[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    if (['duties', 'access', 'training'].includes(k) && d.preset !== 'custom') { d.preset = 'custom'; el.querySelector('[data-k=preset]').value = 'custom'; }
    paint(); schedule();
  });
  el.querySelector('[data-k=preset]')?.addEventListener('change', async (ev) => {
    const p = ROLE_PRESETS[ev.target.value];
    if (!p) { d.preset = 'custom'; schedule(); return; }
    if (!(await confirmBox('Change role', `Use the ${p.label} template? The job title, duties, system access and training plan will be replaced. Everything else stays.`, 'Use template'))) { ev.target.value = d.preset || 'custom'; return; }
    const base = staffDefaults({}, ev.target.value);
    Object.assign(d, { preset: ev.target.value, role_title: p.role_title, duties: base.duties, access: base.access, training: base.training });
    ['role_title', 'duties', 'access', 'training'].forEach((k) => { el.querySelector(`[data-k=${k}]`).value = d[k]; });
    paint(); schedule();
  });

  el.querySelector('#edit')?.addEventListener('click', (ev) => {
    editing = !editing;
    if (editing) {
      if (!custom) prev.innerHTML = renderDoc(d);
      prev.contentEditable = 'true'; prev.focus();
      el.querySelector('#form').style.opacity = '.45'; el.querySelector('#form').style.pointerEvents = 'none';
      ev.currentTarget.innerHTML = `${icon('check')} Done editing`; ev.currentTarget.classList.add('btn-primary');
      toast('Click anywhere in the agreement and type. Click Done when you finish.');
    } else {
      prev.contentEditable = 'false';
      const html = prev.innerHTML; if (html !== renderDoc(d)) custom = html;
      el.querySelector('#form').style.opacity = ''; el.querySelector('#form').style.pointerEvents = '';
      ev.currentTarget.innerHTML = `${icon('edit')} Edit text directly`; ev.currentTarget.classList.remove('btn-primary');
      paint(); schedule();
    }
  });
  const html = () => (editing ? prev.innerHTML : custom || a.body_html || renderDoc(d));
  el.querySelector('#print').onclick = async () => {
    if (editing) el.querySelector('#edit').click();
    await save();
    const { printDoc } = await import('./agreement.js');
    const miss = missing(d);
    printDoc(html(), `${a.number} ${docTitle(d)} - ${d.employee_name || 'employee'}`, a.status === 'void' ? 'VOID: this agreement is no longer in effect.' : '');
    if (miss.length && a.status === 'draft') toast(`Printed with blanks: ${miss.join(', ')}`);
  };
  const setStatus = async (patch, msg) => {
    await save();
    const { error: e } = await db.from('staff_agreements').update(patch).eq('id', id);
    if (e) return fail(e);
    toast(msg); editor(el, id, { setTitle });
  };
  el.querySelector('#sent')?.addEventListener('click', () => setStatus({ status: 'sent' }, 'Marked as sent'));
  el.querySelector('#sign')?.addEventListener('click', () => modal({ title: 'Mark signed',
    body: `<p class="dk-muted" style="margin-bottom:12px">Once both of you have signed, mark it signed. The text is then locked as the record. Keep the signed copy in the employee's file.</p>
      <div class="field"><label>Date signed</label><input class="input" type="date" id="sd" value="${new Date().toLocaleDateString('en-CA')}"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Mark signed', cls: 'btn-primary', onClick: async (m) => {
      if (editing) el.querySelector('#edit').click();
      await setStatus({ status: 'signed', signed_on: m.querySelector('#sd').value || null, body_html: custom || renderDoc(d) }, 'Agreement marked signed');
    } }] }));
  el.querySelector('#void')?.addEventListener('click', async () => {
    if (!(await confirmBox('Void agreement', `Void ${a.number}? It stays in the records but is no longer in effect.`, 'Void', true))) return;
    setStatus({ status: 'void' }, 'Agreement voided');
  });
  el.querySelector('#copy').onclick = () => newAgreement({ data: d }).catch(fail);
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox('Delete draft', `Delete draft ${a.number}? This can't be undone.`, 'Delete', true))) return;
    clearTimeout(timer); timer = null;
    const { error: e } = await db.from('staff_agreements').delete().eq('id', id);
    if (e) return fail(e);
    toast('Draft deleted'); location.hash = '#/staff-agreements';
  });
  paint();
}
