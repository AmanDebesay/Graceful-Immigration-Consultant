// Calendar: the staff member's Outlook calendar (or the shared mailbox's) via Microsoft 365.
// Day / week / month views, create and edit events with Teams meetings, invite clients.
import { can, esc, icon, toast, fail, callFn, modal } from '../core.js';
import { contactsList } from '../fin.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_PX = 48;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parse = (s) => new Date(String(s).slice(0, 19));            // event times are Alberta wall-clock times
const hm = (s) => { const d = parse(s); return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }); };
const minutes = (s) => { const d = parse(s); return d.getHours() * 60 + d.getMinutes(); };

export async function render(el) {
  const status = await callFn('comms', { action: 'status' }).catch((e) => ({ error: e.message }));
  if (!status.email) {
    el.innerHTML = `<div class="dk-card"><div class="dk-empty">${icon('calendar')}<h3 style="color:var(--navy)">Calendar isn't connected yet</h3><p>Microsoft 365 needs to be connected first.</p></div></div>`;
    return;
  }
  const boxes = [['me', 'My calendar'], ...(can('crm.edit') ? [['shared', `Shared (${status.mailboxes[1]})`]] : [])];
  let view = localStorage.getItem('gi_cal_view') || 'week', box = 'me', anchor = new Date(), events = [];
  anchor.setHours(0, 0, 0, 0);

  el.innerHTML = `<div class="cal-bar">
      <button class="btn btn-sm" id="today">Today</button><button class="btn btn-sm btn-ghost" id="prev" aria-label="Previous">‹</button><button class="btn btn-sm btn-ghost" id="next" aria-label="Next">›</button>
      <h2 id="calTitle"></h2><div class="grow"></div>
      <select class="input" id="box" style="width:auto">${boxes.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <div class="seg" id="views">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<button data-v="${k}">${l}</button>`).join('')}</div>
      <button class="btn btn-gold" id="newEv">${icon('plus')} New event</button></div>
    <div class="dk-card cal-card" id="cal"></div>`;

  const range = () => {
    if (view === 'day') return [anchor, addDays(anchor, 1)];
    if (view === 'week') { const s = addDays(anchor, -anchor.getDay()); return [s, addDays(s, 7)]; }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1), s = addDays(first, -first.getDay());
    return [s, addDays(s, 42)];
  };
  async function load() {
    el.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    const [s, e] = range();
    el.querySelector('#calTitle').textContent = view === 'month' ? anchor.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
      : view === 'day' ? anchor.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : `${s.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${addDays(e, -1).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const cal = el.querySelector('#cal');
    cal.innerHTML = '<div class="loading" style="min-height:300px"><div class="spin"></div></div>';
    try {
      // Pad by a day each side; events come back in Alberta time and are placed by their wall-clock date.
      const r = await callFn('comms', { action: 'cal_list', mailbox: box, start: `${ymd(addDays(s, -1))}T00:00:00Z`, end: `${ymd(addDays(e, 1))}T00:00:00Z` });
      events = r.events.filter((x) => !x.isCancelled);
      view === 'month' ? drawMonth(s) : drawGrid(s, view === 'day' ? 1 : 7);
    } catch (err) { cal.innerHTML = `<div class="alert err" style="margin:16px">${esc(err.message)}</div>`; }
  }
  const onDay = (d) => { const k = ymd(d); return events.filter((x) => (x.isAllDay ? String(x.start).slice(0, 10) <= k && String(x.end).slice(0, 10) > k : String(x.start).slice(0, 10) === k)); };
  const chipCls = (x) => (x.isOnlineMeeting ? 'teams' : x.showAs === 'free' ? 'free' : '');

  function drawGrid(start, n) {
    const days = [...Array(n)].map((_, i) => addDays(start, i)), todayK = ymd(new Date());
    const cols = days.map((d) => {
      const timed = onDay(d).filter((x) => !x.isAllDay).sort((a, b) => minutes(a.start) - minutes(b.start));
      const lanes = []; // simple overlap layout
      timed.forEach((x) => { const s = minutes(x.start); let l = lanes.findIndex((end) => end <= s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = Math.max(minutes(x.end) || s + 30, s + 15); x._lane = l; });
      const w = 100 / Math.max(1, lanes.length);
      return `<div class="cal-col ${ymd(d) === todayK ? 'today' : ''}" data-day="${ymd(d)}">${[...Array(24)].map((_, h) => `<div class="cal-slot" data-h="${h}"></div>`).join('')}
        ${timed.map((x) => { const top = (minutes(x.start) / 60) * HOUR_PX, end = String(x.end).slice(0, 10) > ymd(d) ? 1440 : minutes(x.end);
          return `<button class="cal-ev ${chipCls(x)}" data-ev="${esc(x.id)}" style="top:${top}px;height:${Math.max(20, ((end - minutes(x.start)) / 60) * HOUR_PX - 2)}px;left:${x._lane * w}%;width:calc(${w}% - 3px)">
            <b>${esc(x.subject)}</b><small>${hm(x.start)}${x.isOnlineMeeting ? ' · Teams' : x.location ? ' · ' + esc(x.location) : ''}</small></button>`; }).join('')}</div>`;
    }).join('');
    const allDay = days.map((d) => `<div class="cal-allday">${onDay(d).filter((x) => x.isAllDay).map((x) => `<button class="cal-chip ${chipCls(x)}" data-ev="${esc(x.id)}">${esc(x.subject)}</button>`).join('')}</div>`).join('');
    el.querySelector('#cal').innerHTML = `<div class="cal-head" style="grid-template-columns:56px repeat(${n},1fr)"><div></div>${days.map((d) => `<div class="${ymd(d) === todayK ? 'today' : ''}"><small>${DAYS[d.getDay()]}</small><b>${d.getDate()}</b></div>`).join('')}</div>
      <div class="cal-head allday" style="grid-template-columns:56px repeat(${n},1fr)"><div><small>All day</small></div>${allDay}</div>
      <div class="cal-scroll" id="calScroll"><div class="cal-body" style="grid-template-columns:56px repeat(${n},1fr)">
        <div class="cal-hours">${[...Array(24)].map((_, h) => `<div>${h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString('en-CA', { hour: 'numeric' })}</div>`).join('')}</div>${cols}</div></div>`;
    el.querySelector('#calScroll').scrollTop = 7.5 * HOUR_PX;
    el.querySelectorAll('.cal-slot').forEach((s) => (s.onclick = () => { const d = s.parentElement.dataset.day, h = pad(s.dataset.h); editEvent({ start: `${d}T${h}:00`, end: `${d}T${pad(+s.dataset.h + 1 > 23 ? 23 : +s.dataset.h + 1)}:${+s.dataset.h + 1 > 23 ? '59' : '00'}` }); }));
    wireEvents();
  }

  function drawMonth(start) {
    const todayK = ymd(new Date()), m = anchor.getMonth();
    el.querySelector('#cal').innerHTML = `<div class="cal-month"><div class="cal-mhead">${DAYS.map((d) => `<div>${d}</div>`).join('')}</div><div class="cal-mgrid">
      ${[...Array(42)].map((_, i) => { const d = addDays(start, i), list = onDay(d); return `<div class="cal-mday ${d.getMonth() !== m ? 'out' : ''} ${ymd(d) === todayK ? 'today' : ''}" data-day="${ymd(d)}">
        <span class="cal-mnum">${d.getDate()}</span>${list.slice(0, 3).map((x) => `<button class="cal-chip ${chipCls(x)}" data-ev="${esc(x.id)}">${x.isAllDay ? '' : `<em>${hm(x.start)}</em> `}${esc(x.subject)}</button>`).join('')}
        ${list.length > 3 ? `<button class="cal-more" data-more="${ymd(d)}">+${list.length - 3} more</button>` : ''}</div>`; }).join('')}</div></div>`;
    el.querySelectorAll('.cal-mday').forEach((c) => (c.ondblclick = () => editEvent({ start: `${c.dataset.day}T09:00`, end: `${c.dataset.day}T10:00` })));
    el.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); anchor = new Date(b.dataset.more + 'T00:00'); view = 'day'; load(); }));
    wireEvents();
  }

  function wireEvents() {
    el.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const x = events.find((v) => v.id === b.dataset.ev); if (x) showEvent(x); }));
  }

  function showEvent(x) {
    modal({
      title: x.subject,
      body: `<div class="ev-detail"><p>${icon('clock')} <b>${x.isAllDay ? 'All day' : `${parse(x.start).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}, ${hm(x.start)} – ${hm(x.end)}`}</b> <small class="dk-muted">(Alberta time)</small></p>
        ${x.location ? `<p>${icon('globe')} ${esc(x.location)}</p>` : ''}
        ${x.joinUrl ? `<p><a class="btn btn-primary" href="${esc(x.joinUrl)}" target="_blank" rel="noopener">${icon('video')} Join Microsoft Teams meeting</a></p>` : ''}
        ${x.attendees.length ? `<p class="dk-muted" style="margin-top:8px">Attendees</p><ul class="ev-att">${x.attendees.map((a) => `<li>${esc(a.name || a.email)} <small>${esc(a.email || '')}</small> <span class="pill ${a.response === 'accepted' ? 'p-green' : a.response === 'declined' ? 'p-red' : a.response === 'tentativelyAccepted' ? 'p-amber' : 'p-grey'}">${esc({ accepted: 'Accepted', declined: 'Declined', tentativelyAccepted: 'Tentative', none: 'No response', notResponded: 'No response', organizer: 'Organizer' }[a.response] || 'Invited')}</span></li>`).join('')}</ul>` : ''}
        ${x.preview ? `<p class="ev-notes">${esc(x.preview)}</p>` : ''}
        ${x.organizer ? `<p class="dk-muted" style="font-size:12px">Organizer: ${esc(x.organizer)}</p>` : ''}</div>`,
      actions: [
        { label: x.attendees.length ? 'Cancel meeting' : 'Delete', cls: 'btn-danger', onClick: async () => {
          if (!confirm(x.attendees.length ? 'Cancel this meeting? Attendees will be notified.' : 'Delete this event?')) return false;
          await callFn('comms', { action: 'cal_delete', mailbox: box, id: x.id }); toast('Event removed'); load();
        } },
        ...(x.webLink ? [{ label: 'Open in Outlook', onClick: () => { window.open(x.webLink, '_blank', 'noopener'); } }] : []),
        { label: 'Edit', cls: 'btn-primary', onClick: () => { setTimeout(() => editEvent(x), 0); } },
      ],
    });
  }

  async function editEvent(x = {}) {
    const contacts = await contactsList();
    const d = String(x.start || `${ymd(anchor)}T09:00`), e = String(x.end || `${ymd(anchor)}T10:00`);
    const atts = (x.attendees || []).map((a) => a.email).filter(Boolean);
    modal({
      title: x.id ? 'Edit event' : 'New event', wide: true,
      body: `<div class="field"><label>Title</label><input class="input" id="t" value="${esc(x.subject || '')}" placeholder="e.g. Consultation — PR eligibility"></div>
        <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="d" value="${d.slice(0, 10)}"></div>
          <div class="row-2" style="gap:8px"><div class="field"><label>Start</label><input class="input" type="time" id="s" value="${d.slice(11, 16)}"></div><div class="field"><label>End</label><input class="input" type="time" id="e" value="${e.slice(11, 16)}"></div></div></div>
        <div class="row" style="gap:18px;margin-bottom:12px"><label class="row" style="gap:6px"><input type="checkbox" id="ad" ${x.isAllDay ? 'checked' : ''}> All day</label>
          <label class="row" style="gap:6px"><input type="checkbox" id="tm" ${x.id ? (x.isOnlineMeeting ? 'checked' : '') : 'checked'}> ${icon('video')} Microsoft Teams meeting</label></div>
        <div class="field"><label>Invite (clients or colleagues)</label><div class="row" style="gap:8px;flex-wrap:nowrap"><input class="input" id="at" value="${esc(atts.join(', '))}" placeholder="email addresses, separated by commas">
          <select class="input" id="pick" style="max-width:220px"><option value="">+ Add a client…</option>${contacts.filter((c) => c.email).map((c) => `<option value="${esc(c.email)}">${esc(c.full_name)}</option>`).join('')}</select></div>
          <small class="dk-muted">Invitees get an Outlook invitation with the Teams link. Invited clients get a note on their file.</small></div>
        <div class="row-2"><div class="field"><label>Location</label><input class="input" id="lo" value="${esc(x.location || '')}" placeholder="Leave empty for online meetings"></div>
          <div class="row-2" style="gap:8px"><div class="field"><label>Reminder</label><select class="input" id="rm">${[[0, 'At start'], [5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day']].map(([v, l]) => `<option value="${v}" ${v === (x.reminder ?? 15) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label>Show as</label><select class="input" id="sa">${[['busy', 'Busy'], ['tentative', 'Tentative'], ['free', 'Free'], ['oof', 'Out of office'], ['workingElsewhere', 'Working elsewhere']].map(([v, l]) => `<option value="${v}" ${v === (x.showAs || 'busy') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
        <div class="field"><label>Notes / agenda</label><textarea class="input" id="no" rows="4">${esc(x.id ? x.preview || '' : '')}</textarea></div>`,
      onOpen: (m) => {
        m.querySelector('#pick').onchange = (ev) => { const v = ev.target.value; if (!v) return; const i = m.querySelector('#at'); const cur = i.value.split(/[,;\s]+/).filter(Boolean); if (!cur.includes(v)) i.value = [...cur, v].join(', '); ev.target.value = ''; };
        const sync = () => { const a = m.querySelector('#ad').checked; m.querySelector('#s').disabled = a; m.querySelector('#e').disabled = a; };
        m.querySelector('#ad').onchange = sync; sync();
      },
      actions: [{ label: 'Cancel' }, { label: x.id ? 'Save changes' : 'Create event', cls: 'btn-gold', onClick: async (m) => {
        const v = (s) => m.querySelector(s).value, day = v('#d'), allDay = m.querySelector('#ad').checked;
        if (!day) throw new Error('Choose a date.');
        const start = allDay ? `${day}T00:00:00` : `${day}T${v('#s')}:00`;
        const end = allDay ? `${ymd(addDays(new Date(day + 'T00:00'), 1))}T00:00:00` : `${day}T${v('#e')}:00`;
        const r = await callFn('comms', { action: 'cal_save', mailbox: box, id: x.id || undefined, event: { subject: v('#t'), start, end, isAllDay: allDay,
          teams: m.querySelector('#tm').checked, attendees: v('#at'), location: v('#lo'), reminder: Number(v('#rm')), showAs: v('#sa'), body: v('#no') } });
        toast(x.id ? 'Event updated' : r.event?.joinUrl ? 'Event created with a Teams meeting link' : 'Event created');
        anchor = new Date(day + 'T00:00'); load();
      } }],
    });
  }

  el.querySelector('#today').onclick = () => { anchor = new Date(); anchor.setHours(0, 0, 0, 0); load(); };
  el.querySelector('#prev').onclick = () => { anchor = view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1) : addDays(anchor, view === 'week' ? -7 : -1); load(); };
  el.querySelector('#next').onclick = () => { anchor = view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) : addDays(anchor, view === 'week' ? 7 : 1); load(); };
  el.querySelectorAll('#views button').forEach((b) => (b.onclick = () => { view = b.dataset.v; try { localStorage.setItem('gi_cal_view', view); } catch { /* storage unavailable */ } load(); }));
  el.querySelector('#box').onchange = (e) => { box = e.target.value; load(); };
  el.querySelector('#newEv').onclick = () => editEvent({});
  load();
}
