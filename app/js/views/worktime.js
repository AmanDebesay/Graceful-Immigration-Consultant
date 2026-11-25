// Work Time: active time in the dashboard, sign-ins, and what was done, per person and period.
// Everyone sees and downloads their own; people who manage staff can pick anyone or download the whole team.
import { db, state, can, esc, icon, fmtDate, avatarHtml, fail, rpc } from '../core.js';
import { A, ENTITY, human } from './audit.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxP = null;
const loadXlsx = () => (xlsxP = xlsxP || new Promise((res, rej) => {
  if (window.XLSX) return res(window.XLSX);
  const s = document.createElement('script'); s.src = XLSX_URL;
  s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error('The Excel maker did not load.')));
  s.onerror = () => { xlsxP = null; rej(new Error('Could not load the Excel maker. Check your connection and try again.')); };
  document.head.appendChild(s);
}));

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${pad(m)} min` : `${m} min`; };
const hours = (s) => Math.round((s || 0) / 36) / 100;
const dayOf = (t) => iso(new Date(t));
const clock = (t) => t ? new Date(t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '';
const actLabel = (a) => (A[a.action] || [human(a.action)])[0];
const recLabel = (a) => (ENTITY[a.entity] || [human(a.entity)])[0];

function periods() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  return {
    today: ['Today', t, t], week: ['This week', mon, t], lastweek: ['Last week', add(mon, -7), add(mon, -1)],
    month: ['This month', new Date(t.getFullYear(), t.getMonth(), 1), t],
    lastmonth: ['Last month', new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)],
  };
}

// Turns one person's raw report into the numbers the page and the Excel file show.
function summarize(rep) {
  const sessions = rep.sessions || [], actions = rep.actions || [], tasks = rep.tasks_done || [];
  const days = {}, pages = {}, signins = {};
  for (const s of sessions) {
    const d = dayOf(s.started_at);
    const x = days[d] = days[d] || { active: 0, first: s.started_at, last: s.last_seen_at, visits: 0, actions: 0 };
    x.active += s.active_seconds; x.visits += 1;
    if (s.started_at < x.first) x.first = s.started_at;
    if (s.last_seen_at > x.last) x.last = s.last_seen_at;
    for (const [p, n] of Object.entries(s.pages || {})) pages[p] = (pages[p] || 0) + n;
    const key = s.auth_session || s.id;
    if (!signins[key]) signins[key] = { at: s.signed_in_at || s.started_at, device: s.device, active: 0, visits: 0, last: s.last_seen_at };
    signins[key].active += s.active_seconds; signins[key].visits += 1;
    if (s.last_seen_at > signins[key].last) signins[key].last = s.last_seen_at;
  }
  for (const a of actions) { const d = dayOf(a.created_at); (days[d] = days[d] || { active: 0, first: a.created_at, last: a.created_at, visits: 0, actions: 0 }).actions += 1; }
  const total = sessions.reduce((n, s) => n + s.active_seconds, 0);
  return { sessions, actions, tasks, total, days: Object.entries(days).sort(), pages: Object.entries(pages).sort((a, b) => b[1] - a[1]),
    signins: Object.values(signins).sort((a, b) => (a.at < b.at ? -1 : 1)) };
}

export async function render(el) {
  const me = state.profile, boss = can('staff.manage');
  const team = boss ? state.staff.filter((s) => s.active && /@gracefulimmigration\.ca$/i.test(s.email || '')) : [me];
  const P = periods();
  let who = me.id, per = sessionStorage.getItem('gi_wt_per') || 'week', from = iso(P[per]?.[1] || P.week[1]), to = iso(P[per]?.[2] || P.week[2]);

  el.innerHTML = `<div class="toolbar">
      ${boss ? `<select class="input" id="who" style="max-width:260px">${team.map((s) => `<option value="${s.id}" ${s.id === me.id ? 'selected' : ''}>${esc(s.full_name || s.email)}${s.id === me.id ? ' (me)' : ''}</option>`).join('')}</select>` : ''}
      <div class="seg" id="per">${Object.entries(P).map(([k, [l]]) => `<button data-k="${k}">${l}</button>`).join('')}<button data-k="custom">Custom</button></div>
      <span id="range" style="display:flex;gap:6px;align-items:center"><input class="input" type="date" id="from" style="max-width:160px"> to <input class="input" type="date" id="to" style="max-width:160px"></span>
      <div class="grow"></div>
      <button class="btn btn-gold" id="xl">${icon('file')} Download Excel</button>
      ${boss ? `<button class="btn" id="xlAll">${icon('users')} Whole team (Excel)</button>` : ''}</div>
    <div class="alert info">Only <b>active</b> time is counted: the dashboard is on screen and in front, and you moved, clicked, scrolled or typed in the last 5 minutes. Minimized, another tab or app, or away from the keyboard is not counted. ${boss ? 'You can see everyone; each staff member sees only their own.' : 'You see only your own record. The owner can also see it.'}</div>
    <div id="body"><div class="loading" style="min-height:160px"><div class="spin"></div></div></div>`;

  const $ = (s) => el.querySelector(s);
  const syncInputs = () => {
    el.querySelectorAll('#per button').forEach((b) => b.classList.toggle('on', b.dataset.k === per));
    $('#from').value = from; $('#to').value = to;
  };
  $('#per').onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    per = b.dataset.k; sessionStorage.setItem('gi_wt_per', per);
    if (P[per]) { from = iso(P[per][1]); to = iso(P[per][2]); }
    syncInputs(); load();
  };
  $('#from').onchange = $('#to').onchange = () => { per = 'custom'; from = $('#from').value || from; to = $('#to').value || to; if (from > to) [from, to] = [to, from]; syncInputs(); load(); };
  if (boss) $('#who').onchange = (e) => { who = e.target.value; load(); };

  let cur = null, seq = 0;
  async function load() {
    const my = ++seq;
    $('#body').innerHTML = '<div class="loading" style="min-height:160px"><div class="spin"></div></div>';
    try {
      const rep = await rpc('work_report', { p_user: who, p_from: from, p_to: to });
      if (my !== seq) return;
      cur = summarize(rep); draw();
    } catch (err) { $('#body').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
  }
  function draw() {
    const s = cur, person = team.find((x) => x.id === who) || me;
    const maxPage = s.pages[0]?.[1] || 1;
    $('#body').innerHTML = `
      <div class="card" style="margin-bottom:16px"><div class="card-b"><div class="cell-name">${avatarHtml(person, 'avatar')}<div><b>${esc(person.full_name || person.email)}</b><small style="display:block;color:#667085">${fmtDate(from)} – ${fmtDate(to)}</small></div></div></div></div>
      <div class="au-tiles">
        <div class="au-tile">${icon('clock')}<div><small>Active time</small><b>${dur(s.total)}</b></div></div>
        <div class="au-tile">${icon('calendar')}<div><small>Days worked</small><b>${s.days.filter(([, d]) => d.active > 0).length}</b></div></div>
        <div class="au-tile">${icon('shield')}<div><small>Sign-ins</small><b>${s.signins.length}</b></div></div>
        <div class="au-tile">${icon('checksq')}<div><small>Actions recorded</small><b>${s.actions.length}</b></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${icon('calendar')} Day by day</h3></div><div class="table-wrap">
        ${s.days.length ? `<table class="t"><thead><tr><th>Day</th><th>First seen</th><th>Last seen</th><th>Active time</th><th>Visits</th><th>Actions</th></tr></thead><tbody>
          ${s.days.map(([d, x]) => `<tr><td><b>${fmtDate(d + 'T12:00:00', { weekday: 'short', month: 'short', day: 'numeric' })}</b></td><td>${clock(x.first)}</td><td>${clock(x.last)}</td><td><b>${dur(x.active)}</b></td><td>${x.visits}</td><td>${x.actions}</td></tr>`).join('')}
          <tr><td><b>Total</b></td><td></td><td></td><td><b>${dur(s.total)}</b></td><td>${s.sessions.length}</td><td>${s.actions.length}</td></tr></tbody></table>`
          : `<div class="empty">${icon('clock')}<div>No dashboard time in this period.</div></div>`}</div></div>
      <div class="bf-grid">
        <div class="card"><div class="card-h"><h3>${icon('shield')} Sign-ins</h3></div><div class="table-wrap">
          ${s.signins.length ? `<table class="t"><thead><tr><th>Signed in</th><th>Device</th><th>Last seen</th><th>Active</th></tr></thead><tbody>
            ${s.signins.slice().reverse().map((x) => `<tr><td><b>${fmtDate(x.at)}</b> <small>${clock(x.at)}</small></td><td>${esc(x.device || '')}</td><td>${fmtDate(x.last)} <small>${clock(x.last)}</small></td><td>${dur(x.active)}</td></tr>`).join('')}</tbody></table>`
            : `<div class="empty">${icon('shield')}<div>No sign-ins in this period.</div></div>`}</div></div>
        <div class="card"><div class="card-h"><h3>${icon('layers')} Where the time went</h3></div><div class="card-b">
          ${s.pages.length ? s.pages.slice(0, 12).map(([p, n]) => `<div style="margin:0 0 10px"><div style="display:flex;justify-content:space-between;font-size:13.5px"><b>${esc(p)}</b><span>${dur(n)}</span></div>
            <div style="height:8px;border-radius:99px;background:#F1E8D2;overflow:hidden"><div style="height:100%;width:${Math.max(3, Math.round((n / maxPage) * 100))}%;background:linear-gradient(90deg,#1F56AE,#0B2A5C)"></div></div></div>`).join('')
            : `<div class="empty">${icon('layers')}<div>Nothing yet.</div></div>`}</div></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>${icon('checksq')} What was done</h3></div><div class="table-wrap">
        ${s.actions.length || s.tasks.length ? `<table class="t"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Client</th></tr></thead><tbody>
          ${[...s.actions.map((a) => [a.created_at, actLabel(a), recLabel(a), a.contact || '']), ...s.tasks.map((t) => [t.done_at, 'Task completed', t.title, ''])]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 300)
            .map(([t, l, r, c]) => `<tr><td style="white-space:nowrap">${fmtDate(t)} <small>${clock(t)}</small></td><td><span class="ap ap-blue">${esc(l)}</span></td><td>${esc(r)}</td><td>${esc(c)}</td></tr>`).join('')}</tbody></table>`
          : `<div class="empty">${icon('checksq')}<div>No recorded actions in this period.</div></div>`}</div></div>`;
  }

  // ── Excel ──
  async function workbook(people) {
    const X = await loadXlsx();
    const reps = [];
    for (const p of people) reps.push([p, p.id === who && cur ? cur : summarize(await rpc('work_report', { p_user: p.id, p_from: from, p_to: to }))]);
    const many = people.length > 1, name = (p) => p.full_name || p.email;
    const wb = X.utils.book_new();
    const sheet = (title, rows, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map((w) => ({ wch: w })); X.utils.book_append_sheet(wb, ws, title); };
    sheet('Summary', [
      ['Graceful Immigration Consultant Inc. — Work Time report'], [`Period: ${from} to ${to}`], [`Downloaded ${new Date().toLocaleString('en-CA')} by ${name(me)}`],
      ['Active time = dashboard on screen and in front, with mouse or keyboard use in the last 5 minutes.'], [],
      ['Person', 'Role', 'Active hours', 'Active time', 'Days worked', 'Sign-ins', 'Visits', 'Actions recorded', 'Tasks completed'],
      ...reps.map(([p, s]) => [name(p), p.job_title || p.role, hours(s.total), dur(s.total), s.days.filter(([, d]) => d.active > 0).length, s.signins.length, s.sessions.length, s.actions.length, s.tasks.length]),
    ], [28, 18, 13, 15, 12, 10, 9, 16, 15]);
    const pre = (p) => (many ? [name(p)] : []), preH = many ? ['Person'] : [];
    sheet('Daily', [[...preH, 'Date', 'First seen', 'Last seen', 'Active hours', 'Active time', 'Visits', 'Actions'],
      ...reps.flatMap(([p, s]) => s.days.map(([d, x]) => [...pre(p), d, clock(x.first), clock(x.last), hours(x.active), dur(x.active), x.visits, x.actions]))], [...(many ? [24] : []), 12, 11, 11, 12, 14, 8, 9]);
    sheet('Sign-ins', [[...preH, 'Signed in (date)', 'Time', 'Device', 'Last seen', 'Active hours', 'Active time'],
      ...reps.flatMap(([p, s]) => s.signins.map((x) => [...pre(p), dayOf(x.at), clock(x.at), x.device || '', `${dayOf(x.last)} ${clock(x.last)}`, hours(x.active), dur(x.active)]))], [...(many ? [24] : []), 15, 10, 18, 20, 12, 14]);
    sheet('Pages', [[...preH, 'Page', 'Active hours', 'Active time'],
      ...reps.flatMap(([p, s]) => s.pages.map(([pg, n]) => [...pre(p), pg, hours(n), dur(n)]))], [...(many ? [24] : []), 30, 12, 14]);
    sheet('What was done', [[...preH, 'Date', 'Time', 'Action', 'Record', 'Client'],
      ...reps.flatMap(([p, s]) => [...s.actions.map((a) => [a.created_at, actLabel(a), recLabel(a), a.contact || '']), ...s.tasks.map((t) => [t.done_at, 'Task completed', t.title, ''])]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([t, l, r, c]) => [...pre(p), dayOf(t), clock(t), l, r, c]))], [...(many ? [24] : []), 12, 10, 30, 30, 26]);
    return [X, wb];
  }
  const download = async (btn, people, file) => {
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Preparing…';
    try { const [X, wb] = await workbook(people); X.writeFile(wb, file); } catch (err) { fail(err); }
    btn.disabled = false; btn.innerHTML = old;
  };
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  $('#xl').onclick = (e) => { const p = team.find((x) => x.id === who) || me; download(e.currentTarget, [p], `work-time-${slug(p.full_name || 'me')}-${from}-to-${to}.xlsx`); };
  if (boss) $('#xlAll').onclick = (e) => download(e.currentTarget, team, `work-time-team-${from}-to-${to}.xlsx`);

  syncInputs(); load();
}
