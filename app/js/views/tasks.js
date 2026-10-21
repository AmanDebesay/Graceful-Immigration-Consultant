import { db, state, can, esc, icon, fmtDate, priorityBadge, staffName, staffOptions, modal, toast, fail, today } from '../core.js';

export async function render(el) {
  let scope = can('tasks.manage') ? (sessionStorage.getItem('gi_task_scope') || 'mine') : 'mine';
  let show = 'open';
  el.innerHTML = `<div class="toolbar">
      ${can('tasks.manage') ? `<div class="seg" id="scope"><button data-k="mine">My tasks</button><button data-k="all">Everyone</button></div>` : ''}
      <div class="seg" id="show"><button data-k="open">Open</button><button data-k="overdue">Overdue</button><button data-k="done">Completed</button></div>
      <div class="grow"></div><button class="btn btn-primary" id="add">${icon('plus')} New task</button></div>
    <div class="card"><div class="card-b" id="list" style="padding-top:4px;padding-bottom:4px"></div></div>`;
  const paint = (id, v) => el.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.k === v));
  el.querySelector('#scope')?.addEventListener('click', (e) => { if (e.target.dataset.k) { scope = e.target.dataset.k; sessionStorage.setItem('gi_task_scope', scope); load(); } });
  el.querySelector('#show').onclick = (e) => { if (e.target.dataset.k) { show = e.target.dataset.k; load(); } };
  el.querySelector('#add').onclick = () => openTask();

  async function load() {
    paint('scope', scope); paint('show', show);
    let q = db.from('tasks').select('*, contacts(id, full_name)').limit(300);
    if (scope === 'mine') q = q.eq('assigned_to', state.profile.id);
    if (show === 'done') q = q.eq('done', true).order('done_at', { ascending: false });
    else { q = q.eq('done', false).order('due_date', { ascending: true, nullsFirst: false }); if (show === 'overdue') q = q.lt('due_date', today()); }
    const { data, error } = await q;
    const box = el.querySelector('#list');
    if (error) { box.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    box.innerHTML = data.length ? data.map((t) => `<div class="check ${t.done ? 'done' : ''}">
        <input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Mark done">
        <div style="flex:1;min-width:0;cursor:pointer" data-open="${t.id}"><div class="title" style="font-weight:600">${esc(t.title)}</div>
          <small style="color:${!t.done && t.due_date && t.due_date < today() ? 'var(--red)' : 'var(--muted)'}">
          ${t.due_date ? 'Due ' + fmtDate(t.due_date) : 'No due date'}${scope === 'all' ? ' · ' + esc(staffName(t.assigned_to)) : ''}
          ${t.contacts ? ` · <a href="#/contacts/${t.contacts.id}">${esc(t.contacts.full_name)}</a>` : ''}</small></div>
        ${priorityBadge(t.priority)}</div>`).join('') : `<div class="empty">${icon('checksq')}<div>Nothing here.</div></div>`;
    box.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.onchange = async () => {
      const { error: er } = await db.from('tasks').update({ done: cb.checked, done_at: cb.checked ? new Date().toISOString() : null }).eq('id', cb.dataset.id);
      if (er) return fail(er);
      toast(cb.checked ? 'Task completed' : 'Task reopened'); window.dispatchEvent(new Event('refresh-counts')); load();
    }));
    box.querySelectorAll('[data-open]').forEach((d) => (d.onclick = (e) => { if (e.target.tagName !== 'A') openTask(data.find((x) => x.id === d.dataset.open)); }));
  }

  function openTask(t) {
    modal({
      title: t ? 'Edit task' : 'New task',
      body: `<div class="field"><label>Task</label><input class="input" id="tt" value="${esc(t?.title || '')}"></div>
        <div class="field"><label>Details</label><textarea class="input" id="tdesc">${esc(t?.details || '')}</textarea></div>
        <div class="row-2"><div class="field"><label>Due date</label><input class="input" type="date" id="td" value="${t?.due_date || today()}"></div>
        <div class="field"><label>Priority</label><select class="input" id="tp">${['normal', 'high', 'urgent', 'low'].map((p) => `<option value="${p}" ${p === (t?.priority || 'normal') ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></div></div>
        ${can('tasks.manage') ? `<div class="field"><label>Assign to</label><select class="input" id="ta">${staffOptions(t?.assigned_to || state.profile.id, { blank: 'Unassigned' })}</select></div>` : ''}`,
      actions: [
        ...(t && (can('tasks.manage') || t.created_by === state.profile.id) ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => {
          const { error } = await db.from('tasks').delete().eq('id', t.id); if (error) throw error; toast('Task deleted'); load(); } }] : []),
        { label: 'Cancel' },
        { label: t ? 'Save' : 'Create task', cls: 'btn-primary', onClick: async (m) => {
          const title = m.querySelector('#tt').value.trim(); if (!title) throw new Error('Enter a task name.');
          const row = { title, details: m.querySelector('#tdesc').value.trim() || null, due_date: m.querySelector('#td').value || null,
            priority: m.querySelector('#tp').value, assigned_to: m.querySelector('#ta')?.value || (t ? t.assigned_to : state.profile.id) };
          const { error } = t ? await db.from('tasks').update(row).eq('id', t.id) : await db.from('tasks').insert({ ...row, created_by: state.profile.id });
          if (error) throw error;
          toast(t ? 'Task saved' : 'Task created'); window.dispatchEvent(new Event('refresh-counts')); load();
        } },
      ],
    });
  }
  load();
}
