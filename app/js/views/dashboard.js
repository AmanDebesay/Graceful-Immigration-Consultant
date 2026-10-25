import { db, state, can, esc, icon, fmtDate, initials, today } from '../core.js';
import { CASE_LABEL, APPT_LABEL, editAppointment, editKeyDate } from '../crm.js';

const ACTIVE = ['open', 'in_progress', 'submitted', 'decision_pending'];
const PENDING = ['submitted', 'decision_pending'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PALETTE = ['#2F6FDE', '#7E57C2', '#E07B39', '#E6B04A', '#3FA34D', '#B8861F', '#0B2A5C', '#8A94A6'];
// Case application types grouped the way the practice reports on them.
const CATEGORY = {
  'Express Entry PR': 'Permanent Residence', 'Provincial Nominee (AAIP)': 'Permanent Residence', 'PR Card Renewal': 'Permanent Residence',
  'Spousal Sponsorship': 'Family Sponsorship', 'Parent/Grandparent Sponsorship': 'Family Sponsorship',
  'Work Permit': 'Work Permit', 'Work Permit Extension': 'Work Permit', 'LMIA (Employer)': 'Work Permit',
  'Study Permit': 'Study Permit', 'Study Permit Extension': 'Study Permit',
  'Visitor Visa (TRV)': 'Visitor & Super Visa', 'Super Visa': 'Visitor & Super Visa', 'Visitor Record': 'Visitor & Super Visa',
  'Refugee Claim': 'Refugee & Protection', 'PRRA / H&C': 'Refugee & Protection', Citizenship: 'Citizenship',
};
const STATUS_PILL = { open: 'p-blue', in_progress: 'p-gold', submitted: 'p-navy', decision_pending: 'p-amber', approved: 'p-green', refused: 'p-red', withdrawn: 'p-grey', closed: 'p-grey' };
const STAGE_LABEL = { new: 'New lead', contacted: 'Contacted', consultation_booked: 'Consultation booked', assessed: 'Assessed', retained: 'Retained', closed_lost: 'Closed' };
const monthKey = (d) => String(d).slice(0, 7);
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

export async function render(el, _params, ctx) {
  const p = state.profile;
  const first = (p.full_name || '').split(' ')[0] || 'there';
  ctx?.setTitle?.(`<span class="wb">Welcome back, <em>${esc(first)}!</em></span><small>Here's an overview of your immigration practice.</small>`, true);

  const crm = can('crm.view');
  const nowIso = new Date().toISOString();
  const in120 = new Date(Date.now() + 120 * 86400000).toLocaleDateString('en-CA');
  const ago30 = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA');
  const none = { data: [] };
  const [contacts, cases, appts, tasks, docs] = await Promise.all([
    crm ? db.from('contacts').select('id, full_name, citizenship, stage, services, created_at').order('created_at', { ascending: false }).limit(5000) : none,
    crm ? db.from('cases').select('id, contact_id, title, application_type, status, opened_on, decision_on, created_at, contacts(full_name)').order('created_at', { ascending: false }).limit(5000) : none,
    crm ? db.from('appointments').select('id, contact_id, title, kind, starts_at, ends_at, location, meeting_link, notes, contacts(full_name)').gte('ends_at', nowIso).order('starts_at').limit(4) : none,
    db.from('tasks').select('id, title, due_date, done, contacts(full_name)').eq('done', false).eq('assigned_to', p.id).order('due_date', { ascending: true, nullsFirst: false }).limit(5),
    crm ? db.from('key_dates').select('id, contact_id, doc_type, expires_on, notes, contacts(full_name)').gte('expires_on', ago30).lte('expires_on', in120).order('expires_on').limit(4) : none,
  ]);
  const C = contacts.data || [], K = cases.data || [];

  // ── KPIs ──
  const thisM = monthKey(today()), lastD = new Date(); lastD.setDate(1); lastD.setMonth(lastD.getMonth() - 1);
  const lastM = lastD.toLocaleDateString('en-CA').slice(0, 7), year = today().slice(0, 4);
  const clients = C.filter((c) => c.stage !== 'closed_lost');
  const newThis = C.filter((c) => monthKey(new Date(c.created_at).toLocaleDateString('en-CA')) === thisM).length;
  const newLast = C.filter((c) => monthKey(new Date(c.created_at).toLocaleDateString('en-CA')) === lastM).length;
  const openedThis = K.filter((k) => monthKey(k.opened_on) === thisM).length, openedLast = K.filter((k) => monthKey(k.opened_on) === lastM).length;
  const approvedYear = K.filter((k) => k.status === 'approved' && String(k.decision_on || '').startsWith(year)).length;
  const approvedPrev = K.filter((k) => k.status === 'approved' && String(k.decision_on || '').startsWith(String(year - 1))).length;
  const pending = K.filter((k) => PENDING.includes(k.status)).length;
  const trend = (d, label, fallback) => d === null ? `<span class="kpi-sub">${fallback}</span>`
    : `<span class="kpi-delta ${d < 0 ? 'neg' : ''}">${icon(d < 0 ? 'down' : 'up')}${Math.abs(d)}%</span><span class="kpi-sub">${label}</span>`;
  const kpi = (label, value, ico, tone, sub, href) => `<a class="dk-kpi" href="${href}"><span class="dk-kpi-ico ${tone}">${icon(ico)}</span>
    <span class="dk-kpi-body"><small>${label}</small><b>${value}</b><span class="dk-kpi-foot">${sub}</span></span></a>`;

  // ── Case types (donut) ──
  const typeCount = {};
  for (const k of K) { const cat = CATEGORY[k.application_type] || 'Other'; typeCount[cat] = (typeCount[cat] || 0) + 1; }
  const types = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
  let acc = 0;
  const stops = types.map(([, n], i) => { const a = (acc / K.length) * 360; acc += n; return `${PALETTE[i % PALETTE.length]} ${a}deg ${(acc / K.length) * 360}deg`; }).join(',');

  // ── Monthly trends (this year) ──
  const opened = MONTHS.map((_, i) => K.filter((k) => monthKey(k.opened_on) === `${year}-${String(i + 1).padStart(2, '0')}`).length);
  const approved = MONTHS.map((_, i) => K.filter((k) => k.status === 'approved' && monthKey(k.decision_on || '') === `${year}-${String(i + 1).padStart(2, '0')}`).length);
  const top = Math.max(4, ...opened, ...approved), step = Math.ceil(top / 4), axis = step * 4;

  // ── Clients by country ──
  const byCountry = {};
  for (const c of clients) { const k = (c.citizenship || '').trim() || 'Not recorded'; byCountry[k] = (byCountry[k] || 0) + 1; }
  const countries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const shown = countries.slice(0, 6), others = countries.slice(6).reduce((s, [, n]) => s + n, 0);
  if (others) shown.push(['Others', others]);

  // ── Recent clients with their latest case ──
  const latestCase = {};
  for (const k of K) if (!latestCase[k.contact_id]) latestCase[k.contact_id] = k;
  const recent = C.slice(0, 5);
  const approvals = K.filter((k) => k.status === 'approved').sort((a, b) => String(b.decision_on || '').localeCompare(String(a.decision_on || ''))).slice(0, 4);
  const daysTo = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  const time = (d) => new Date(d).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).toUpperCase();

  el.innerHTML = `
    ${!p.avatar_url ? `<div class="dk-nudge">${icon('camera')}<span><b>Add your photo.</b> It appears on your profile in the top right and helps your team and clients recognise you.</span><a class="btn btn-sm btn-gold" href="#/account">Add photo</a></div>` : ''}
    <div class="dk-kpis">
      ${crm ? kpi('Total clients', clients.length, 'users', 'navy', trend(pct(newThis, newLast), 'from last month', `${newThis} new this month`), '#/contacts') : ''}
      ${crm ? kpi('Active cases', K.filter((k) => ACTIVE.includes(k.status)).length, 'folder', 'navy', trend(pct(openedThis, openedLast), 'from last month', `${openedThis} opened this month`), '#/cases') : ''}
      ${crm ? kpi('Cases approved', approvedYear, 'checksq', 'gold', trend(pct(approvedYear, approvedPrev), 'vs last year', 'this year'), '#/cases') : ''}
      ${crm ? kpi('Pending cases', pending, 'clock', 'gold', '<span class="kpi-sub">awaiting IRCC decision</span>', '#/cases') : ''}
      <div class="dk-actions">
        ${can('crm.edit') ? `<a class="dk-act gold" href="#/contacts?new=1">${icon('plus')}<span>Add new client</span>${icon('arrowr')}</a>` : ''}
        ${crm ? `<button class="dk-act" id="bookC">${icon('calendar')}<span>Book consultation</span>${icon('arrowr')}</button>` : ''}
      </div>
    </div>

    ${crm ? `<div class="dk-row r3">
      <div class="dk-card"><div class="dk-h"><h3>Case Types</h3><small>All cases</small></div>
        ${K.length ? `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"><div><b>${K.length}</b><span>Total cases</span></div></div>
          <ul class="legend">${types.map(([t, n], i) => `<li><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${esc(t)}</span><b>${Math.round((n / K.length) * 100)}%</b></li>`).join('')}</ul></div>`
          : `<div class="dk-empty">${icon('folder')}<p>No cases yet. Open a case from a client's page to see the mix of case types here.</p></div>`}
      </div>
      <div class="dk-card"><div class="dk-h"><h3>Monthly Case Trends</h3><div class="dk-legend"><span><i class="navy"></i>New cases</span><span><i class="gold"></i>Approvals</span></div></div>
        <div class="bars"><div class="bars-y">${[4, 3, 2, 1, 0].map((n) => `<span>${n * step}</span>`).join('')}</div>
          <div class="bars-plot">${MONTHS.map((m, i) => `<div class="bars-m" title="${m}: ${opened[i]} new, ${approved[i]} approved"><div class="bars-pair"><i class="navy" style="height:${(opened[i] / axis) * 100}%"></i><i class="gold" style="height:${(approved[i] / axis) * 100}%"></i></div><small>${m}</small></div>`).join('')}</div></div>
      </div>
      <div class="dk-card"><div class="dk-h"><h3>Clients by Country</h3><small>Citizenship</small></div>
        ${shown.length ? `<ul class="countries">${shown.map(([n, v], i) => `<li><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${esc(n)}</span><div class="cbar"><em style="width:${(v / clients.length) * 100}%;background:${PALETTE[i % PALETTE.length]}"></em></div><b>${Math.round((v / clients.length) * 100)}%</b></li>`).join('')}</ul>`
          : `<div class="dk-empty">${icon('globe')}<p>Add citizenship on client profiles to see where your clients come from.</p></div>`}
      </div>
    </div>

    <div class="dk-row r3">
      <div class="dk-card"><div class="dk-h"><h3>Recent Clients</h3><a href="#/contacts">View all ${icon('arrowr')}</a></div>
        ${recent.length ? `<div class="dk-list">${recent.map((c) => { const k = latestCase[c.id]; return `<a class="rc" href="#/contacts/${c.id}">
          <span class="rc-av">${esc(initials(c.full_name))}</span><b>${esc(c.full_name)}</b>
          <span class="rc-type">${esc(k?.application_type || (c.services || [])[0] || '—')}</span><span class="rc-date">${fmtDate(c.created_at)}</span>
          <span class="pill ${k ? STATUS_PILL[k.status] : 'p-grey'}">${esc(k ? CASE_LABEL[k.status] : STAGE_LABEL[c.stage] || c.stage)}</span></a>`; }).join('')}</div>`
          : `<div class="dk-empty">${icon('users')}<p>No clients yet.</p>${can('crm.edit') ? `<a class="btn btn-gold btn-sm" href="#/contacts?new=1">${icon('plus')} Add your first client</a>` : ''}</div>`}
      </div>
      <div class="dk-card"><div class="dk-h"><h3>Upcoming Appointments</h3>${can('crm.edit') ? `<button class="dk-link" id="addAppt">${icon('plus')} Add</button>` : ''}</div>
        ${(appts.data || []).length ? `<div class="dk-list">${appts.data.map((a) => { const d = new Date(a.starts_at); return `<button class="ap" data-ap="${a.id}">
          <span class="ap-date"><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()].toUpperCase()}</small></span>
          <span class="ap-body"><b>${esc(APPT_LABEL[a.kind] || 'Appointment')}</b><span>${esc(a.title)}${a.contacts ? ' · ' + esc(a.contacts.full_name) : ''}</span><small>${time(a.starts_at)}${a.ends_at ? ' – ' + time(a.ends_at) : ''} · ${esc(a.location)}</small></span>
          ${a.meeting_link ? `<a class="ap-ico on" href="${esc(a.meeting_link)}" target="_blank" rel="noopener" title="Join meeting">${icon('video')}</a>` : `<span class="ap-ico">${icon(a.location === 'Phone' ? 'phone' : 'video')}</span>`}</button>`; }).join('')}</div>`
          : `<div class="dk-empty">${icon('calendar')}<p>No upcoming appointments.</p></div>`}
      </div>
      <div class="dk-card"><div class="dk-h"><h3>Tasks &amp; Reminders</h3><a href="#/tasks">View all ${icon('arrowr')}</a></div>
        ${(tasks.data || []).length ? `<div class="dk-list">${tasks.data.map((t) => `<label class="tk"><input type="checkbox" data-task="${t.id}"><span>${esc(t.title)}${t.contacts ? `<small>${esc(t.contacts.full_name)}</small>` : ''}</span>
          <em class="${t.due_date && t.due_date <= today() ? 'due' : ''}">${t.due_date ? (t.due_date === today() ? 'Today' : t.due_date < today() ? 'Overdue' : fmtDate(t.due_date, { month: 'short', day: 'numeric' })) : ''}</em></label>`).join('')}</div>`
          : `<div class="dk-empty">${icon('checksq')}<p>You're all caught up.</p></div>`}
      </div>
    </div>

    <div class="dk-row r3b">
      <div class="dk-card dk-approvals"><div class="dk-h"><h3><span class="ok-dot">${icon('check')}</span>Recent Approvals</h3><a href="#/cases">View all ${icon('arrowr')}</a></div>
        <div class="appr-wrap"><div class="dk-list">${approvals.length ? approvals.map((k) => `<a class="appr" href="#/cases/${k.id}">${icon('file')}<span>${esc(k.application_type || k.title)}<small>${esc(k.contacts?.full_name || '')}</small></span><em>${k.decision_on ? fmtDate(k.decision_on) : ''}</em></a>`).join('')
          : '<p class="dk-muted">Approved cases will be celebrated here.</p>'}</div>
          <div class="congrats">${icon('maple')}<span>Congratulations<br>to our clients!</span></div></div>
      </div>
      <div class="dk-card"><div class="dk-h"><h3><span class="warn-dot">!</span>Documents Expiring Soon</h3>${can('crm.edit') ? `<button class="dk-link" id="addDoc">${icon('plus')} Add</button>` : ''}</div>
        ${(docs.data || []).length ? `<div class="dk-list">${docs.data.map((d) => { const n = daysTo(d.expires_on); return `<button class="dx" data-doc="${d.id}">${icon('file')}<span>${esc(d.doc_type)} – ${esc(d.contacts?.full_name || '')}</span>
          <em>${fmtDate(d.expires_on)}</em><span class="pill ${n < 0 ? 'p-red' : n <= 14 ? 'p-red' : n <= 45 ? 'p-amber' : 'p-gold'}">${n < 0 ? `Expired ${-n}d ago` : n === 0 ? 'Today' : `${n} days`}</span></button>`; }).join('')}</div>`
          : `<div class="dk-empty">${icon('file')}<p>Track passports, permits and medicals so nothing expires unnoticed.</p></div>`}
      </div>
      <a class="dk-banner" href="../public/index.html" target="_blank" rel="noopener"><div><h3>Guiding<br>Brighter Futures</h3><p>Immigration solutions for individuals, families and businesses.</p></div><span>${icon('arrowr')}</span></a>
    </div>` : ''}`;

  el.querySelector('#bookC')?.addEventListener('click', () => editAppointment({ kind: 'consultation', title: 'Initial consultation' }));
  el.querySelector('#addAppt')?.addEventListener('click', () => editAppointment());
  el.querySelector('#addDoc')?.addEventListener('click', () => editKeyDate());
  el.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = (e) => { if (e.target.closest('a')) return; editAppointment(appts.data.find((a) => a.id === b.dataset.ap)); }));
  el.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => editKeyDate(docs.data.find((d) => d.id === b.dataset.doc))));
  el.querySelectorAll('[data-task]').forEach((cb) => (cb.onchange = async () => {
    const row = cb.closest('.tk'); row.classList.add('done');
    await db.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', cb.dataset.task);
    window.dispatchEvent(new Event('refresh-counts'));
  }));
  const reload = () => { if (el.isConnected) render(el, _params, ctx); };
  window.addEventListener('crm-changed', reload, { once: true });
  window.dispatchEvent(new Event('refresh-counts'));
}
