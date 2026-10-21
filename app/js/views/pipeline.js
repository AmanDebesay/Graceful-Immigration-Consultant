import { db, can, esc, icon, STAGES, triageBadge, staffName, timeAgo, toast, fail } from '../core.js';

export async function render(el) {
  const { data, error } = await db.from('contacts').select('id, full_name, email, stage, priority, assigned_to, services, updated_at').order('updated_at', { ascending: false }).limit(500);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const editable = can('crm.edit');

  el.innerHTML = `<div class="toolbar"><span style="color:var(--muted)">${editable ? 'Drag a card to move it to the next stage.' : 'Read-only view.'}</span>
    <div class="grow"></div><a class="btn" href="#/contacts">${icon('users')} List view</a></div>
    <div class="board">${STAGES.map(([k, l]) => {
      const items = data.filter((c) => c.stage === k);
      return `<div class="col" data-stage="${k}"><div class="col-h">${l}<span>${items.length}</span></div>
        ${items.map((c) => `<div class="lead" draggable="${editable}" data-id="${c.id}">
          <b>${esc(c.full_name)}</b><small>${esc(c.email || '')}</small>
          <div class="row">${triageBadge(c.priority)}<small style="margin-left:auto">${c.assigned_to ? esc(staffName(c.assigned_to).split(' ')[0]) : 'Unassigned'}</small></div>
          <small style="margin-top:6px">Updated ${timeAgo(c.updated_at)}</small></div>`).join('')}</div>`;
    }).join('')}</div>`;

  el.querySelectorAll('.lead').forEach((card) => {
    card.onclick = () => (location.hash = `#/contacts/${card.dataset.id}`);
    card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
  });
  if (!editable) return;
  el.querySelectorAll('.col').forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      const card = el.querySelector(`.lead[data-id="${id}"]`);
      if (!card || card.parentElement === col) return;
      col.appendChild(card);
      const { error: er } = await db.from('contacts').update({ stage: col.dataset.stage }).eq('id', id);
      if (er) { fail(er); return render(el); }
      toast('Stage updated');
      el.querySelectorAll('.col').forEach((c) => (c.querySelector('.col-h span').textContent = c.querySelectorAll('.lead').length));
      window.dispatchEvent(new Event('refresh-counts'));
    };
  });
}
