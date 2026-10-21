import { db, state, can, esc, icon, STAGES, triageBadge, priorityBadge, staffName, staffOptions, fmtDate, fmtDateTime, timeAgo,
  modal, confirmBox, toast, fail, today, SERVICE_LABEL, initials } from '../core.js';

export async function render(el, [id], { setTitle }) {
  const { data: c, error } = await db.from('contacts').select('*').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Contact not found.</div>'; return; }
  setTitle(c.full_name);
  const edit = can('crm.edit');
  let tab = sessionStorage.getItem('gi_contact_tab') || 'activity';

  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/contacts">← Contacts</a><div class="grow"></div>
      ${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}">${icon('phone')} Call</a>` : ''}
      ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${icon('mail')} Email</a>` : ''}
      ${edit ? `<button class="btn" id="editBtn">Edit details</button>` : ''}
      ${can('crm.delete') ? `<button class="btn btn-danger" id="delBtn">${icon('trash')}</button>` : ''}
    </div>
    <div class="detail">
      <div class="grid">
        <div class="card"><div class="card-b">
          <div class="row" style="margin-bottom:14px"><span class="avatar gold" style="width:52px;height:52px;font-size:17px">${esc(initials(c.full_name))}</span>
            <div><h2 style="font-family:var(--serif);color:var(--navy);font-size:21px">${esc(c.full_name)}</h2>
            <small style="color:var(--muted)">Added ${fmtDate(c.created_at)} · ${esc(c.source)}</small></div></div>
          <div class="row" style="margin-bottom:14px">${triageBadge(c.priority)}</div>
          <div class="field"><label>Stage</label><select class="input" id="stage" ${edit ? '' : 'disabled'}>
            ${STAGES.map(([k, l]) => `<option value="${k}" ${k === c.stage ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Assigned to</label><select class="input" id="assign" ${edit ? '' : 'disabled'}>${staffOptions(c.assigned_to)}</select></div>
          <dl class="kv" style="margin-top:6px">
            <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
            <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
            <dt>Citizenship</dt><dd>${esc(c.citizenship || '—')}</dd>
            <dt>Language</dt><dd>${esc(c.language || '—')}</dd>
            <dt>Prefers</dt><dd>${esc(c.contact_pref || '—')}</dd>
            <dt>Location</dt><dd>${c.location === 'in' ? 'In Canada' : c.location === 'out' ? 'Outside Canada' : '—'}</dd>
            <dt>Status</dt><dd>${esc(c.status_in_canada || '—')}</dd>
            <dt>Services</dt><dd>${esc((c.services || []).map((k) => SERVICE_LABEL[k] || k).join(', ') || '—')}</dd>
          </dl>
        </div></div>
      </div>
      <div class="card">
        <div class="tabs" id="tabs">${[['activity', 'Activity'], ['notes', 'Notes'], ['tasks', 'Tasks'], ['assessments', 'Assessments']]
          .map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
        <div class="card-b" id="tabBody"></div>
      </div>
    </div>`;

  el.querySelector('#stage').onchange = (e) => update({ stage: e.target.value }, 'Stage updated');
  el.querySelector('#assign').onchange = (e) => update({ assigned_to: e.target.value || null }, 'Assignment saved');
  async function update(patch, msg) {
    const { error: er } = await db.from('contacts').update(patch).eq('id', id);
    if (er) return fail(er);
    toast(msg); window.dispatchEvent(new Event('refresh-counts'));
  }
  el.querySelector('#editBtn')?.addEventListener('click', () => modal({
    title: 'Edit contact',
    body: `<div class="field"><label>Full name</label><input class="input" id="n" value="${esc(c.full_name)}"></div>
      <div class="row-2"><div class="field"><label>Email</label><input class="input" id="e" value="${esc(c.email || '')}"></div>
      <div class="field"><label>Phone</label><input class="input" id="p" value="${esc(c.phone || '')}"></div></div>
      <div class="row-2"><div class="field"><label>Citizenship</label><input class="input" id="ci" value="${esc(c.citizenship || '')}"></div>
      <div class="field"><label>Language</label><input class="input" id="la" value="${esc(c.language || '')}"></div></div>
      <div class="field"><label>Priority</label><select class="input" id="pr"><option value="">None</option>${['RED', 'AMBER', 'GREEN'].map((l) => `<option ${l === c.priority ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
      const v = (s) => m.querySelector(s).value.trim() || null;
      const { error: er } = await db.from('contacts').update({ full_name: v('#n') || c.full_name, email: v('#e')?.toLowerCase() || null, phone: v('#p'),
        citizenship: v('#ci'), language: v('#la'), priority: v('#pr') }).eq('id', id);
      if (er) throw new Error(er.code === '23505' ? 'Another contact already uses this email.' : er.message);
      toast('Contact saved'); render(el, [id], { setTitle });
    } }],
  }));
  el.querySelector('#delBtn')?.addEventListener('click', async () => {
    if (!(await confirmBox('Delete contact', `Delete ${c.full_name} and all their notes, tasks and assessments? This cannot be undone.`, 'Delete', true))) return;
    const { error: er } = await db.from('contacts').delete().eq('id', id);
    if (er) return fail(er);
    toast('Contact deleted'); location.hash = '#/contacts';
  });

  const tabs = el.querySelector('#tabs'), body = el.querySelector('#tabBody');
  tabs.onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; sessionStorage.setItem('gi_contact_tab', tab); showTab(); } };
  showTab();

  async function showTab() {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    body.innerHTML = '<div class="loading" style="min-height:120px"><div class="spin"></div></div>';
    if (tab === 'notes' || tab === 'activity') return notesTab(tab === 'activity');
    if (tab === 'tasks') return tasksTab();
    return assessmentsTab();
  }

  async function notesTab(withActivity) {
    const [notes, subs, tasks] = await Promise.all([
      db.from('notes').select('*').eq('contact_id', id).order('created_at', { ascending: false }),
      withActivity && can('intake.view') ? db.from('intake_submissions').select('id, triage_level, created_at, source').eq('contact_id', id) : { data: [] },
      withActivity ? db.from('tasks').select('id, title, done, done_at, created_at').eq('contact_id', id) : { data: [] },
    ]);
    const items = [
      ...(notes.data || []).map((n) => ({ at: n.created_at, ico: 'note', html: `<div class="meta">${esc(staffName(n.author_id))} added a note · ${timeAgo(n.created_at)}</div><div class="text">${esc(n.body)}</div>` })),
      ...(subs.data || []).map((s) => ({ at: s.created_at, ico: 'clipboard', html: `<div class="meta">${timeAgo(s.created_at)}</div>Assessment submitted ${s.source === 'staff' ? 'by staff' : 'on the website'} ${triageBadge(s.triage_level)} · <a href="#/assessments/${s.id}">Open</a>` })),
      ...(tasks.data || []).map((t) => ({ at: t.created_at, ico: 'checksq', html: `<div class="meta">${timeAgo(t.created_at)}</div>Task created: <b>${esc(t.title)}</b>${t.done ? ' · completed' : ''}` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    body.innerHTML = `${edit ? `<div style="margin-bottom:18px"><textarea class="input" id="nb" placeholder="Write a note… (call summary, advice given, next steps)"></textarea>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" id="saveNote">Save note</button></div></div>` : ''}
      <div class="timeline">${items.map((i) => `<div class="tl"><div class="tl-dot">${icon(i.ico)}</div><div class="tl-body">${i.html}</div></div>`).join('') || '<div class="empty">Nothing here yet.</div>'}</div>`;
    body.querySelector('#saveNote')?.addEventListener('click', async () => {
      const text = body.querySelector('#nb').value.trim(); if (!text) return;
      const { error: er } = await db.from('notes').insert({ contact_id: id, author_id: state.profile.id, body: text });
      if (er) return fail(er);
      if (c.stage === 'new') { await db.from('contacts').update({ stage: 'contacted' }).eq('id', id); c.stage = 'contacted'; el.querySelector('#stage').value = 'contacted'; }
      toast('Note saved'); showTab();
    });
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
    body.querySelector('#newTask').onclick = () => modal({
      title: 'Add task',
      body: `<div class="field"><label>Task</label><input class="input" id="tt"></div>
        <div class="row-2"><div class="field"><label>Due date</label><input class="input" type="date" id="td" value="${today()}"></div>
        <div class="field"><label>Priority</label><select class="input" id="tp"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div></div>
        <div class="field"><label>Assign to</label><select class="input" id="ta">${staffOptions(state.profile.id, { blank: 'Me' })}</select></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add task', cls: 'btn-primary', onClick: async (m) => {
        const title = m.querySelector('#tt').value.trim(); if (!title) throw new Error('Enter a task name.');
        const { error: er } = await db.from('tasks').insert({ title, contact_id: id, due_date: m.querySelector('#td').value || null,
          priority: m.querySelector('#tp').value, assigned_to: m.querySelector('#ta').value || state.profile.id, created_by: state.profile.id });
        if (er) throw er; toast('Task added'); window.dispatchEvent(new Event('refresh-counts')); showTab();
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
