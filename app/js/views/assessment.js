import { db, state, can, esc, icon, fmtDateTime, triageBadge, staffName, staffOptions, toast, fail, modal, today } from '../core.js';

const STATUS_OPTS = [['new', 'New'], ['in_review', 'In review'], ['reviewed', 'Reviewed'], ['archived', 'Archived']];

export async function render(el, [id], { setTitle }) {
  const { data: s, error } = await db.from('intake_submissions')
    .select('*, contacts(id, full_name, email, phone, stage, assigned_to)').eq('id', id).single();
  if (error) { el.innerHTML = `<div class="alert err">Assessment not found.</div>`; return; }
  const c = s.contacts || {};
  setTitle(`Assessment · ${c.full_name || ''}`);
  const tri = s.triage || { red: [], amber: [], notes: [] };
  const flags = [
    ...tri.red.map((x) => `<div class="flag red">${icon('alert')}<span>${esc(x)}</span></div>`),
    ...tri.amber.map((x) => `<div class="flag amber">${icon('alert')}<span>${esc(x)}</span></div>`),
    ...tri.notes.map((x) => `<div class="flag note">${icon('note')}<span>${esc(x)}</span></div>`),
  ].join('');
  const manage = can('intake.manage');

  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/assessments">← All assessments</a><div class="grow"></div>
      <a class="btn btn-gold" href="#/assistant?a=${s.id}">${icon('sparkle')} Review with AI</a>
      ${c.id ? `<a class="btn" href="#/contacts/${c.id}">${icon('user')} Open contact</a>` : ''}
      <button class="btn" id="addTask">${icon('checksq')} Add task</button>
      ${manage && s.status !== 'reviewed' ? `<button class="btn btn-primary" id="markReviewed">${icon('check')} Mark reviewed</button>` : ''}
    </div>
    <div class="detail">
      <div class="grid">
        <div class="card"><div class="card-b">
          <div class="row" style="justify-content:space-between;margin-bottom:12px">${triageBadge(s.triage_level)}<span class="badge plain">${s.source === 'staff' ? 'Entered by staff' : 'From website'}</span></div>
          <h2 style="font-family:var(--serif);color:var(--navy);font-size:22px">${esc(c.full_name || '—')}</h2>
          <p style="color:var(--muted);margin-bottom:16px">Submitted ${fmtDateTime(s.created_at)}</p>
          <dl class="kv">
            <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
            <dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
            <dt>Reviewed by</dt><dd>${s.reviewed_by ? `${esc(staffName(s.reviewed_by))}<br><small style="color:var(--muted)">${fmtDateTime(s.reviewed_at)}</small>` : '—'}</dd>
          </dl>
          ${manage ? `<div class="field" style="margin-top:16px"><label>Status</label><select class="input" id="status">
            ${STATUS_OPTS.map(([k, l]) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
          ${can('crm.edit') && c.id ? `<div class="field"><label>Assigned to</label><select class="input" id="assign">${staffOptions(c.assigned_to)}</select></div>` : ''}
        </div></div>
        <div class="card"><div class="card-h"><h3>Internal triage</h3><small style="color:var(--muted)">Never shown to the client</small></div>
          <div class="card-b flags">${flags || '<div class="flag note">No flags raised.</div>'}</div></div>
      </div>
      <div class="card"><div class="card-h"><h3>Answers</h3><button class="btn btn-sm no-print" id="print">${icon('file')} Download PDF / Print</button></div>
        <div class="card-b"><dl class="answers">${(s.rows || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') || '<div>No answers recorded.</div>'}</dl></div></div>
    </div>`;

  el.querySelector('#print').onclick = () => {
    // The page title becomes the suggested PDF file name.
    const old = document.title;
    document.title = `Assessment - ${c.full_name || 'client'} - ${s.created_at.slice(0, 10)}`;
    window.addEventListener('afterprint', () => { document.title = old; }, { once: true });
    window.print();
  };
  const status = el.querySelector('#status');
  if (status) status.onchange = () => setStatus(status.value);
  el.querySelector('#markReviewed')?.addEventListener('click', () => setStatus('reviewed'));

  async function setStatus(v) {
    const patch = { status: v };
    if (v === 'reviewed') { patch.reviewed_by = state.profile.id; patch.reviewed_at = new Date().toISOString(); }
    const { error: e } = await db.from('intake_submissions').update(patch).eq('id', id);
    if (e) return fail(e);
    if (v === 'reviewed' && c.id && c.stage === 'new') await db.from('contacts').update({ stage: 'assessed' }).eq('id', c.id);
    toast('Assessment updated');
    window.dispatchEvent(new Event('refresh-counts'));
    render(el, [id], { setTitle });
  }
  el.querySelector('#assign')?.addEventListener('change', async (e) => {
    const { error: er } = await db.from('contacts').update({ assigned_to: e.target.value || null }).eq('id', c.id);
    er ? fail(er) : toast('Assignment saved');
  });
  el.querySelector('#addTask').onclick = () => modal({
    title: 'Add task',
    body: `<div class="field"><label>Task</label><input class="input" id="tt" value="Follow up with ${esc(c.full_name || '')}"></div>
      <div class="row-2"><div class="field"><label>Due date</label><input class="input" type="date" id="td" value="${today()}"></div>
      <div class="field"><label>Priority</label><select class="input" id="tp"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div></div>
      <div class="field"><label>Assign to</label><select class="input" id="ta">${staffOptions(state.profile.id, { blank: 'Me' })}</select></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Add task', cls: 'btn-primary', onClick: async (m) => {
      const title = m.querySelector('#tt').value.trim(); if (!title) throw new Error('Enter a task name.');
      const { error: er } = await db.from('tasks').insert({ title, due_date: m.querySelector('#td').value || null, priority: m.querySelector('#tp').value,
        assigned_to: m.querySelector('#ta').value || state.profile.id, contact_id: c.id || null, created_by: state.profile.id });
      if (er) throw er; toast('Task added'); window.dispatchEvent(new Event('refresh-counts'));
    } }],
  });
}
