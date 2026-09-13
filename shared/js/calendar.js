/* ================================================================
   calendar.js — Full calendar with add/edit/delete, flag,
                 priority (high/medium/low), reminders, types
   ================================================================ */

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelected = null;

const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// Use DATA.events as the live source; fall back to [] if not ready
function getEvents() { return (typeof DATA !== 'undefined' && DATA.events) ? DATA.events : []; }

document.addEventListener('DOMContentLoaded', () => { renderCalendar(); });

// ── RENDER CALENDAR GRID ─────────────────────────────────────────
function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const lbl  = document.getElementById('calMonthLabel');
  if (!grid) return;
  if (lbl) lbl.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  const first    = new Date(calYear, calMonth, 1).getDay();
  const days     = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  const today    = new Date();

  let html = DAY_NAMES.map(d => `<div class="cal-header">${d}</div>`).join('');

  // Previous month filler
  for (let i = 0; i < first; i++) {
    const d = prevDays - first + i + 1;
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  // Current month days
  for (let d = 1; d <= days; d++) {
    const dateStr  = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday  = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const isSel    = calSelected === dateStr;
    const dayEvts  = getEvents().filter(e => e.date === dateStr);
    const hasFlag  = dayEvts.some(e => e.flagged);
    const hasHigh  = dayEvts.some(e => e.priority === 'high');

    const evHtml = dayEvts.slice(0, 3).map(e => {
      const cls = e.flagged ? 'flag' : (e.priority === 'high' ? 'high' : (e.priority === 'medium' ? 'medium' : (e.type === 'deadline' ? 'deadline' : e.type === 'reminder' ? 'reminder' : e.type === 'task' ? 'task' : 'appt')));
      const star = e.flagged ? '★ ' : '';
      return `<div class="cal-event ${cls}" title="${e.title}">${star}${e.title.substring(0, 16)}</div>`;
    }).join('');
    const moreHtml = dayEvts.length > 3 ? `<div style="font-size:9px;color:var(--gray-600);padding:1px 2px">+${dayEvts.length - 3} more</div>` : '';

    html += `<div class="cal-day${isToday ? ' today' : ''}${isSel ? ' selected' : ''}${hasFlag ? ' has-flag' : ''}${hasHigh ? ' has-high' : ''}"
      onclick="calSelectDay('${dateStr}')">
      <div class="cal-day-num">${d}</div>
      ${evHtml}${moreHtml}
    </div>`;
  }

  // Next month filler
  const remaining = 42 - first - days;
  for (let d = 1; d <= remaining && remaining < 7; d++) {
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  grid.innerHTML = html;
}

// ── SELECT DAY — show events with edit/delete/flag ───────────────
function calSelectDay(dateStr) {
  calSelected = dateStr;
  renderCalendar();
  const events = getEvents().filter(e => e.date === dateStr);
  const el     = document.getElementById('calSelectedDate');
  const el2    = document.getElementById('calDayEvents');
  if (el) el.textContent = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  if (!el2) return;

  if (!events.length) {
    el2.innerHTML = `<p class="text-muted" style="padding:8px 0">No events. Click <strong>+ Add Event</strong> to create one.</p>`;
    return;
  }

  const priorityColors = { high: 'badge-red', medium: 'badge-orange', low: 'badge-gray' };
  const typeColors     = { appt: 'badge-blue', task: 'badge-orange', deadline: 'badge-red', reminder: 'badge-green' };

  el2.innerHTML = events.map(ev => `
    <div class="cal-event-row">
      <div class="cal-ev-body">
        <div class="cal-ev-title">
          ${ev.flagged ? '<span class="flag-star">★</span> ' : ''}
          ${ev.title}
        </div>
        <div class="cal-ev-meta">
          <span class="badge ${typeColors[ev.type] || 'badge-gray'}">${ev.type}</span>
          ${ev.priority ? `<span class="badge ${priorityColors[ev.priority] || 'badge-gray'}" style="margin-left:4px">${ev.priority}</span>` : ''}
          ${ev.time    ? `<span style="margin-left:6px">⏰ ${ev.time}</span>` : ''}
          ${ev.fileId  ? `<span style="margin-left:6px">📁 ${ev.fileId}</span>` : ''}
          ${ev.reminder ? `<span style="margin-left:6px;color:var(--green)">🔔 Reminder set</span>` : ''}
          ${ev.notes   ? `<div style="margin-top:3px;font-size:11px;color:var(--gray-600)">${ev.notes}</div>` : ''}
        </div>
      </div>
      <div class="cal-ev-actions">
        <button class="btn btn-sm" title="Toggle flag" onclick="toggleEventFlag(${ev.id})" style="padding:4px 8px;font-size:14px;color:${ev.flagged ? 'var(--red)' : 'var(--gray-400)'}">★</button>
        <button class="btn btn-sm btn-primary" onclick="openEditEventModal(${ev.id})" style="padding:4px 10px">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEvent(${ev.id})" style="padding:4px 10px">✕</button>
      </div>
    </div>`).join('');
}

// ── TOGGLE FLAG ──────────────────────────────────────────────────
function toggleEventFlag(id) {
  const ev = getEvents().find(e => e.id === id);
  if (ev) { ev.flagged = !ev.flagged; }
  renderCalendar();
  if (calSelected) calSelectDay(calSelected);
}

// ── DELETE EVENT ─────────────────────────────────────────────────
function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  DATA.events = DATA.events.filter(e => e.id !== id);
  renderCalendar();
  if (calSelected) calSelectDay(calSelected);
}

// ── ADD EVENT MODAL ──────────────────────────────────────────────
function openEventModal(prefillDate) {
  const today = prefillDate || calSelected || new Date().toISOString().split('T')[0];
  document.getElementById('modalTitle').textContent = 'Add Calendar Event';
  document.getElementById('modalBody').innerHTML = eventFormHtml(null, today);
  document.getElementById('modalOverlay').classList.add('open');
}

// ── EDIT EVENT MODAL ─────────────────────────────────────────────
function openEditEventModal(id) {
  const ev = getEvents().find(e => e.id === id);
  if (!ev) return;
  document.getElementById('modalTitle').textContent = 'Edit Event';
  document.getElementById('modalBody').innerHTML = eventFormHtml(ev, ev.date);
  document.getElementById('modalOverlay').classList.add('open');
}

// ── SHARED FORM HTML ─────────────────────────────────────────────
function eventFormHtml(ev, date) {
  const v = ev || {};
  const caseOpts = (typeof STATE !== 'undefined' ? STATE.cases : [])
    .map(c => `<option value="${c.id}" ${v.fileId === c.id ? 'selected' : ''}>${c.id} — ${c.client}</option>`)
    .join('');

  return `
    <div class="row-2">
      <div>
        <label>Title <span style="color:var(--red)">*</span></label>
        <input type="text" id="evTitle" value="${v.title || ''}" placeholder="e.g. Client consultation">
      </div>
      <div>
        <label>Date <span style="color:var(--red)">*</span></label>
        <input type="date" id="evDate" value="${date || ''}">
      </div>
    </div>
    <div class="row-3">
      <div>
        <label>Time</label>
        <input type="text" id="evTime" value="${v.time || ''}" placeholder="e.g. 2:00 PM">
      </div>
      <div>
        <label>Type</label>
        <select id="evType">
          <option value="appt"     ${v.type === 'appt'     ? 'selected' : ''}>Appointment</option>
          <option value="task"     ${v.type === 'task'     ? 'selected' : ''}>Task</option>
          <option value="deadline" ${v.type === 'deadline' ? 'selected' : ''}>Deadline</option>
          <option value="reminder" ${v.type === 'reminder' ? 'selected' : ''}>Reminder</option>
        </select>
      </div>
      <div>
        <label>Priority</label>
        <select id="evPriority">
          <option value=""       ${!v.priority             ? 'selected' : ''}>— None —</option>
          <option value="high"   ${v.priority === 'high'   ? 'selected' : ''}>🔴 High</option>
          <option value="medium" ${v.priority === 'medium' ? 'selected' : ''}>🟠 Medium</option>
          <option value="low"    ${v.priority === 'low'    ? 'selected' : ''}>🟢 Low</option>
        </select>
      </div>
    </div>
    <div class="row-2">
      <div>
        <label>Linked case (File ID)</label>
        <select id="evFile">
          <option value="">— No case —</option>
          ${caseOpts}
        </select>
      </div>
      <div>
        <label>Assigned to</label>
        <input type="text" id="evAssignedTo" value="${v.assignedTo || ''}" placeholder="RCIC / Assistant / Client">
      </div>
    </div>
    <div>
      <label>Notes</label>
      <textarea id="evNotes" placeholder="Any notes about this event...">${v.notes || ''}</textarea>
    </div>
    <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--gray-800)">
        <input type="checkbox" id="evFlagged" ${v.flagged ? 'checked' : ''}> ★ Flag as important
      </label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--gray-800)">
        <input type="checkbox" id="evReminder" ${v.reminder ? 'checked' : ''}> 🔔 Set reminder
      </label>
    </div>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="saveEvent(${ev ? ev.id : 'null'})">${ev ? 'Save changes' : 'Add event'}</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`;
}

// ── SAVE EVENT (add or update) ───────────────────────────────────
function saveEvent(existingId) {
  const title = document.getElementById('evTitle')?.value?.trim();
  const date  = document.getElementById('evDate')?.value;
  if (!title) { alert('Please enter an event title.'); return; }
  if (!date)  { alert('Please select a date.');         return; }

  const payload = {
    title,
    date,
    time:       document.getElementById('evTime')?.value || '',
    type:       document.getElementById('evType')?.value || 'appt',
    priority:   document.getElementById('evPriority')?.value || '',
    fileId:     document.getElementById('evFile')?.value || '',
    assignedTo: document.getElementById('evAssignedTo')?.value || '',
    notes:      document.getElementById('evNotes')?.value || '',
    flagged:    document.getElementById('evFlagged')?.checked || false,
    reminder:   document.getElementById('evReminder')?.checked || false
  };

  if (existingId !== null && existingId !== undefined) {
    // Update existing
    const idx = DATA.events.findIndex(e => e.id === existingId);
    if (idx !== -1) { DATA.events[idx] = { ...DATA.events[idx], ...payload }; }
  } else {
    // New event
    DATA.events.push({ id: Date.now(), ...payload });
  }

  closeModal();
  calSelected = date;
  renderCalendar();
  calSelectDay(date);
}

// ── NAV ──────────────────────────────────────────────────────────
function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  calSelected = null;
  renderCalendar();
  document.getElementById('calDayEvents').innerHTML = '<p class="text-muted">Click a day to see events</p>';
  document.getElementById('calSelectedDate').textContent = 'Select a day';
}

function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  calSelected = null;
  renderCalendar();
  document.getElementById('calDayEvents').innerHTML = '<p class="text-muted">Click a day to see events</p>';
  document.getElementById('calSelectedDate').textContent = 'Select a day';
}

// ── EXPORT ICS ───────────────────────────────────────────────────
function exportICS() {
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Graceful Immigration Consultant//Portal//EN\n';
  getEvents().forEach(e => {
    const dt = e.date.replace(/-/g, '');
    const priority = e.priority === 'high' ? 'PRIORITY:1\n' : e.priority === 'medium' ? 'PRIORITY:5\n' : '';
    const notes = e.notes ? `\nDESCRIPTION:${e.notes.replace(/\n/g,' ')}` : '';
    const alarm = e.reminder ? `\nBEGIN:VALARM\nTRIGGER:-PT1H\nACTION:DISPLAY\nDESCRIPTION:Reminder: ${e.title}\nEND:VALARM` : '';
    ics += `BEGIN:VEVENT\nUID:${e.id}@graceful\nDTSTART;VALUE=DATE:${dt}\nSUMMARY:${e.flagged ? '★ ' : ''}${e.title}${notes}\n${priority}END:VEVENT${alarm}\n`;
  });
  ics += 'END:VCALENDAR';
  if (typeof downloadFile === 'function') {
    downloadFile('graceful-calendar.ics', ics, 'text/calendar');
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'graceful-calendar.ics';
    a.click();
  }
}
