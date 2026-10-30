// App bootstrap: session → profile & permissions → shell → hash router.
import { db, state, can, isStaff, esc, icon, avatarHtml, fmtDate, ROLE_LABEL, loadStaff, fail, toast } from './core.js';
import { showLogin, showSetPassword, showLinkError, showMfaChallenge } from './auth.js';
performance.setResourceTimingBufferSize?.(2000); // keep the list of loaded scripts for healStaleModules

const NAV = [
  { group: 'Overview' },
  { path: '/', label: 'Dashboard', icon: 'home', show: () => isStaff() },
  { path: '/assistant', label: 'AI Assistant', icon: 'sparkle', show: () => isStaff() },
  { path: '/email', label: 'Email', icon: 'mail', show: () => isStaff() },
  { path: '/calendar', label: 'Calendar', icon: 'calendar', show: () => isStaff() },
  { path: '/chat', label: 'Team Chat', icon: 'chat', show: () => isStaff(), count: 'chat_unread' },
  { group: 'IRCC' },
  { path: '/ircc', label: 'IRCC Portal', icon: 'globe', show: () => can('crm.view') },
  { group: 'CRM' },
  { path: '/contacts', label: 'Contacts', icon: 'users', show: () => can('crm.view') },
  { path: '/companies', label: 'Companies', icon: 'briefcase', show: () => can('crm.view') },
  { path: '/deals', label: 'Deals', icon: 'trend', show: () => can('crm.view') },
  { path: '/pipeline', label: 'Lead Pipeline', icon: 'kanban', show: () => can('crm.view') },
  { path: '/activities', label: 'Activities', icon: 'phone', show: () => can('crm.view') },
  { path: '/cases', label: 'Cases', icon: 'file', show: () => can('crm.view') },
  { path: '/assessments', label: 'Assessments', icon: 'clipboard', show: () => can('intake.view'), count: 'new_assessments' },
  { path: '/tasks', label: 'Tasks', icon: 'checksq', show: () => isStaff(), count: 'tasks_overdue', red: true },
  { path: '/crm-reports', label: 'CRM Reports', icon: 'trend', show: () => can('crm.view') },
  { group: 'Accounting' },
  { path: '/accounting', label: 'Overview', icon: 'dollar', show: () => can('finance.view') },
  { path: '/invoices', label: 'Sales & Invoices', icon: 'file', show: () => can('finance.view') },
  { path: '/expenses', label: 'Expenses & Bills', icon: 'briefcase', show: () => can('finance.view') },
  { path: '/receipts', label: 'Receipts', icon: 'camera', show: () => can('finance.view') },
  { path: '/banking', label: 'Banking', icon: 'home', show: () => can('finance.view') },
  { path: '/trust', label: 'Trust (Client Funds)', icon: 'lock', show: () => can('finance.view') },
  { path: '/reports', label: 'Reports', icon: 'trend', show: () => can('finance.view') },
  { path: '/coa', label: 'Chart of Accounts', icon: 'note', show: () => can('finance.view') },
  { path: '/journal', label: 'Journal', icon: 'history', show: () => can('finance.view') },
  { path: '/items', label: 'Products & Services', icon: 'clipboard', show: () => can('finance.view') || can('crm.edit') },
  { group: 'Business' },
  { path: '/newsletter', label: 'Newsletter', icon: 'mail', show: () => can('newsletter.view') },
  { path: '/agreements', label: 'Agreements', icon: 'file', show: () => can('agreements.manage') || can('crm.view') },
  { group: 'Resources' },
  { path: '/resources', label: 'Legal & Research', icon: 'book', show: () => isStaff() },
  { group: 'Administration' },
  { path: '/team', label: 'Team & Access', icon: 'shield', show: () => can('staff.manage') },
  { path: '/settings', label: 'Business Settings', icon: 'settings', show: () => can('settings.manage') },
  { path: '/audit', label: 'Audit Log', icon: 'history', show: () => can('audit.view') },
];

const ROUTES = [
  [/^\/$/, 'dashboard', 'Dashboard'],
  [/^\/resources$/, 'resources', 'Legal & Research Resources'],
  [/^\/assistant$/, 'assistant', 'AI Assistant'],
  [/^\/chat$/, 'chat', 'Team Chat'],
  [/^\/email$/, 'email', 'Email'],
  [/^\/calendar$/, 'calendar', 'Calendar'],
  [/^\/receipts$/, 'receipts', 'Receipts'],
  [/^\/ircc$/, 'ircc', 'IRCC Portal'],
  [/^\/assessments$/, 'assessments', 'Assessments'],
  [/^\/assessments\/new$/, 'assessment-new', 'New assessment'],
  [/^\/assessments\/([\w-]+)$/, 'assessment', 'Assessment'],
  [/^\/pipeline$/, 'pipeline', 'Lead Pipeline'],
  [/^\/contacts$/, 'contacts', 'Contacts'],
  [/^\/contacts\/([\w-]+)$/, 'contact', 'Contact'],
  [/^\/companies$/, 'companies', 'Companies'],
  [/^\/companies\/([\w-]+)$/, 'company', 'Company'],
  [/^\/deals$/, 'deals', 'Deals'],
  [/^\/activities$/, 'activities', 'Activities'],
  [/^\/cases$/, 'cases', 'Cases'],
  [/^\/cases\/([\w-]+)$/, 'case', 'Case'],
  [/^\/crm-reports$/, 'crm-reports', 'CRM Reports'],
  [/^\/tasks$/, 'tasks', 'Tasks'],
  [/^\/accounting$/, 'accounting', 'Accounting'],
  [/^\/invoices$/, 'invoices', 'Sales & Invoices'],
  [/^\/invoices\/([\w-]+)$/, 'invoice', 'Invoice'],
  [/^\/expenses$/, 'expenses', 'Expenses & Bills'],
  [/^\/banking$/, 'banking', 'Banking'],
  [/^\/trust$/, 'trust', 'Trust (Client Funds)'],
  [/^\/reports$/, 'reports', 'Reports'],
  [/^\/coa$/, 'coa', 'Chart of Accounts'],
  [/^\/journal$/, 'journal', 'Journal'],
  [/^\/items$/, 'items', 'Products & Services'],
  [/^\/newsletter$/, 'newsletter', 'Newsletter'],
  [/^\/team$/, 'team', 'Team & Access'],
  [/^\/settings$/, 'settings', 'Business Settings'],
  [/^\/audit$/, 'audit', 'Audit Log'],
  [/^\/account$/, 'account', 'My Account'],
  [/^\/agreements$/, 'agreements', 'Agreements'],
  [/^\/agreements\/([\w-]+)$/, 'agreement', 'Agreement'],
];

let shellBuilt = false;
let counts = {};

async function boot() {
  const app = document.getElementById('app');
  // Links from invite / reset emails arrive with tokens or errors in the URL fragment
  // Read the link fragment once; later re-boots (after saving a password or signing in) must not see it again
  const authHash = window.__authHash || '';
  window.__authHash = '';
  if (/error_description=/.test(authHash)) {
    const desc = decodeURIComponent((authHash.match(/error_description=([^&]+)/) || [])[1] || '').replace(/\+/g, ' ');
    history.replaceState(null, '', location.pathname);
    return showLinkError(desc);
  }
  const kindMatch = authHash.match(/type=(invite|recovery|signup|magiclink)/);
  if (kindMatch) sessionStorage.setItem('gi_auth_kind', kindMatch[1]);

  const { data: { session } } = await db.auth.getSession();
  if (!session) { shellBuilt = false; return showLogin(); }
  if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');

  const kind = sessionStorage.getItem('gi_auth_kind');
  if (kind === 'invite' || kind === 'recovery') return showSetPassword(kind);

  // Two-step verification when enrolled
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    const { data: f } = await db.auth.mfa.listFactors();
    const totp = f?.totp?.find((x) => x.status === 'verified');
    if (totp) return showMfaChallenge(totp.id);
  }

  state.user = session.user;
  const { data: profile, error } = await db.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !profile) { app.innerHTML = '<div class="loading">Your account is not set up yet. Contact the administrator.</div>'; return; }
  if (!profile.active) { await db.auth.signOut(); return showLogin('This account has been deactivated.'); }
  if (profile.role !== 'client' && !/@gracefulimmigration\.ca$/i.test(session.user.email || '')) {
    await db.auth.signOut();
    return showLogin('Staff access requires a company email address (@gracefulimmigration.ca). Ask the administrator to invite you with your company email.');
  }
  state.profile = profile;
  const { data: perms } = await db.rpc('my_permissions');
  state.perms = new Set(perms || []);
  if (isStaff()) await loadStaff();

  if (!isStaff()) {
    app.innerHTML = `<div class="auth"><div class="auth-form" style="grid-column:1/-1"><div class="auth-box" style="max-width:520px;text-align:center">
      <img src="../public/img/logo-emblem.png" alt="" style="width:90px;margin:0 auto 14px">
      <h1>Hello, ${esc(profile.full_name.split(' ')[0] || 'there')}</h1>
      <p>Your client portal is being set up. Soon you'll see your agreements, invoices and messages here.
      For anything urgent call <a href="tel:+14039154230">(403) 915-4230</a>.</p>
      <button class="btn btn-primary" id="so">Sign out</button></div></div></div>`;
    document.getElementById('so').onclick = async () => { await db.auth.signOut(); location.reload(); };
    return;
  }
  buildShell();
  route();
}

function buildShell() {
  const app = document.getElementById('app');
  const p = state.profile;
  app.innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      <a class="sb-brand" href="#/"><img src="../public/img/logo-emblem.png" alt=""><b>GRACEFUL</b><span>Immigration Consultant Inc.</span></a>
      <nav class="sb-nav" id="sbNav"></nav>
      <div class="sb-foot"><a class="sb-help" href="#/resources">${icon('book')}<span><b>Need help?</b><small>Legal &amp; research resources</small></span>${icon('arrowr')}</a>
        <a class="sb-site" href="../public/index.html" target="_blank" rel="noopener">View website ↗</a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn btn btn-ghost btn-sm" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
        <h1 id="pageTitle">Dashboard</h1>
        <div class="search">${icon('search')}<input id="gSearch" placeholder="Search clients, cases, invoices, documents…" autocomplete="off"><div class="search-results" id="gResults" hidden></div></div>
        <div style="position:relative"><button class="btn btn-gold" id="plusNew">${icon('plus')} New</button></div>
        <div style="position:relative"><button class="bell" id="bell" aria-label="Notifications">${icon('bell')}<span class="bell-n" id="bellN" hidden></span></button></div>
        <button class="user-chip" id="userChip">
          <span id="chipAv">${avatarHtml(p)}</span>
          <span class="meta"><b>${esc(p.full_name || p.email)}</b><span>${esc(p.job_title || ROLE_LABEL[p.role])}</span></span>
          ${icon('down')}
        </button>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`;
  shellBuilt = true;
  renderNav();
  document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('userChip').onclick = (e) => {
    e.stopPropagation();
    const old = document.querySelector('.dropdown'); if (old) return old.remove();
    const d = document.createElement('div'); d.className = 'dropdown';
    d.innerHTML = `<a href="#/account">${icon('user')} My profile &amp; photo</a><a href="#/resources">${icon('book')} Resources</a><button id="lo">${icon('logout')} Sign out</button>`;
    e.currentTarget.appendChild(d);
    d.querySelector('#lo').onclick = async () => { await db.auth.signOut(); location.hash = ''; location.reload(); };
    setTimeout(() => document.addEventListener('click', () => d.remove(), { once: true }));
  };
  setupSearch();
  setupNewMenu();
  setupBell();
  setupChatAlerts();
  refreshCounts();
}

// New team-chat messages: update the unread count and show a toast when not on the chat page.
let chatAlerts = null;
function setupChatAlerts() {
  if (chatAlerts) db.removeChannel(chatAlerts);
  chatAlerts = db.channel('team-chat-alerts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: m }) => {
    if (m.author_id === state.profile.id) return;
    refreshCounts();
    if (!location.hash.startsWith('#/chat')) {
      const who = state.staff.find((s) => s.id === m.author_id);
      toast(`💬 ${who?.full_name || 'Team'}: ${m.body.length > 70 ? m.body.slice(0, 70) + '…' : m.body}`);
    }
  }).subscribe();
}

// Profile changes (e.g. a new photo) refresh the chip without a reload.
window.addEventListener('profile-changed', () => {
  const p = state.profile, av = document.getElementById('chipAv');
  if (!av) return;
  av.innerHTML = avatarHtml(p);
  const meta = document.querySelector('#userChip .meta');
  meta.innerHTML = `<b>${esc(p.full_name || p.email)}</b><span>${esc(p.job_title || ROLE_LABEL[p.role])}</span>`;
});

function setupBell() {
  const btn = document.getElementById('bell');
  btn.onclick = async (e) => {
    e.stopPropagation();
    const old = document.querySelector('.bellmenu'); if (old) return old.remove();
    const d = document.createElement('div'); d.className = 'dropdown bellmenu';
    d.innerHTML = '<div class="dk-muted" style="padding:10px">Loading…</div>';
    btn.parentElement.appendChild(d);
    setTimeout(() => document.addEventListener('click', (ev) => { if (!d.contains(ev.target)) d.remove(); }, { once: true }));
    const in30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA');
    const [a, t, k] = await Promise.all([
      can('intake.view') ? db.from('intake_submissions').select('id, triage_level, created_at, contacts(full_name)').eq('status', 'new').order('created_at', { ascending: false }).limit(5) : { data: [] },
      db.from('tasks').select('id, title, due_date').eq('done', false).eq('assigned_to', state.profile.id).lte('due_date', new Date().toLocaleDateString('en-CA')).order('due_date').limit(5),
      can('crm.view') ? db.from('key_dates').select('id, doc_type, expires_on, contacts(full_name)').lte('expires_on', in30).order('expires_on').limit(5) : { data: [] },
    ]);
    const item = (href, ico, title, sub, cls = '') => `<a href="${href}" class="bm-i ${cls}">${icon(ico)}<span>${title}<small>${sub}</small></span></a>`;
    const html = [
      ...(a.data || []).map((x) => item(`#/assessments/${x.id}`, 'clipboard', `New assessment — ${esc(x.contacts?.full_name || 'Unknown')}`, `${x.triage_level === 'RED' ? 'URGENT · ' : ''}${fmtDate(x.created_at)}`, x.triage_level === 'RED' ? 'red' : '')),
      ...(t.data || []).map((x) => item('#/tasks', 'checksq', esc(x.title), `Due ${fmtDate(x.due_date)}`)),
      ...(k.data || []).map((x) => item('#/', 'file', `${esc(x.doc_type)} expiring — ${esc(x.contacts?.full_name || '')}`, fmtDate(x.expires_on))),
    ];
    d.innerHTML = `<div class="bm-h">Notifications</div>${html.join('') || '<div class="dk-muted" style="padding:12px">Nothing needs your attention right now.</div>'}`;
    d.onclick = (ev) => { if (ev.target.closest('a')) d.remove(); };
  };
}

async function setupNewMenu() {
  const btn = document.getElementById('plusNew');
  const fin = await import('./fin.js'), crm = await import('./crm.js');
  const groups = [
    ['Clients', [[can('crm.edit'), 'Client', () => (location.hash = '#/contacts?new=1')], [can('crm.edit'), 'Appointment', () => crm.editAppointment()], [can('crm.edit'), 'Document expiry date', () => crm.editKeyDate()], [can('crm.edit'), 'Deal', () => crm.editDeal()],
      [can('crm.edit'), 'Case', () => crm.editCase()], [can('agreements.manage'), 'Agreement', async () => (await import('./views/agreements.js')).newAgreement()], [can('crm.edit'), 'Log activity', () => crm.logActivity()], [can('intake.view'), 'Assessment', () => (location.hash = '#/assessments/new')]]],
    ['Money in', [[can('finance.manage'), 'Invoice', () => fin.newInvoice()], [can('finance.manage'), 'Receive payment', () => fin.receivePayment()],
      [can('finance.manage'), 'Retainer into trust', () => fin.trustTxn('deposit')]]],
    ['Money out', [[can('finance.manage'), 'Expense', () => fin.newExpense()], [can('finance.manage'), 'Bill', () => fin.newBill()]]],
    ['Other', [[can('finance.manage'), 'Bank transfer', () => fin.newTransfer()], [can('finance.manage'), 'Journal entry', () => fin.newJournal()]]],
  ].map(([g, items]) => [g, items.filter((x) => x[0])]).filter(([, items]) => items.length);
  if (!groups.length) { btn.remove(); return; }
  btn.onclick = (e) => {
    e.stopPropagation();
    const old = document.querySelector('.newmenu'); if (old) return old.remove();
    const d = document.createElement('div'); d.className = 'dropdown newmenu';
    d.innerHTML = groups.map(([g, items]) => `<div class="nm-group"><small>${g}</small>${items.map(([, l], i) => `<button data-g="${g}" data-i="${i}">${l}</button>`).join('')}</div>`).join('');
    btn.parentElement.appendChild(d);
    d.onclick = (ev) => { const t = ev.target.closest('[data-g]'); if (!t) return; d.remove(); groups.find(([g]) => g === t.dataset.g)[1][+t.dataset.i][2](); };
    setTimeout(() => document.addEventListener('click', () => d.remove(), { once: true }));
  };
}

function renderNav() {
  const cur = location.hash.replace(/^#/, '') || '/';
  let html = '', pendingGroup = null;
  for (const n of NAV) {
    if (n.group) { pendingGroup = n.group; continue; }
    if (!n.show()) continue;
    if (pendingGroup) { html += `<div class="sb-group">${pendingGroup}</div>`; pendingGroup = null; }
    const active = n.path === '/' ? cur === '/' : cur.startsWith(n.path);
    const c = n.count && counts[n.count] ? `<span class="count${n.red ? ' red' : ''}">${counts[n.count]}</span>` : '';
    const soon = n.soon ? '<span class="count" style="background:rgba(255,255,255,.15);color:#fff">Soon</span>' : '';
    html += `<a class="sb-link${active ? ' active' : ''}" href="#${n.path}">${icon(n.icon)}<span>${n.label}</span>${c}${soon}</a>`;
  }
  document.getElementById('sbNav').innerHTML = html;
}

export async function refreshCounts() {
  try {
    const [s, u] = await Promise.all([db.rpc('dashboard_stats'), db.rpc('chat_unread')]);
    counts = { ...(s.data || {}), chat_unread: (u.data || []).reduce((n, r) => n + Number(r.unread), 0) };
  } catch { counts = {}; }
  if (shellBuilt) {
    renderNav();
    const n = (counts.new_assessments || 0) + (counts.tasks_overdue || 0), b = document.getElementById('bellN');
    if (b) { b.textContent = n > 9 ? '9+' : n; b.hidden = !n; }
  }
}
window.addEventListener('refresh-counts', refreshCounts);

function setupSearch() {
  const input = document.getElementById('gSearch'), box = document.getElementById('gResults');
  if (!isStaff()) { input.closest('.search').remove(); return; }
  let t, seq = 0;
  const q1 = (on, table, cols, filter, limit = 5) => (on ? db.from(table).select(cols).or(filter).limit(limit) : Promise.resolve({ data: [] }));
  input.oninput = () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    t = setTimeout(async () => {
      const my = ++seq, w = `%${q.replace(/[%_,()]/g, ' ').trim()}%`, crm = can('crm.view'), fin = can('finance.view');
      const [con, cas, com, inv, agr, ass, tsk, apt] = await Promise.all([
        q1(crm, 'contacts', 'id, full_name, email, phone, citizenship', `full_name.ilike.${w},email.ilike.${w},phone.ilike.${w},citizenship.ilike.${w}`, 6),
        q1(crm, 'cases', 'id, case_number, title, application_type, ircc_file_number, uci, contacts(full_name)', `case_number.ilike.${w},title.ilike.${w},application_type.ilike.${w},ircc_file_number.ilike.${w},uci.ilike.${w}`),
        q1(crm, 'companies', 'id, name', `name.ilike.${w}`),
        q1(fin, 'invoices', 'id, number, total, status, contacts(full_name)', `number.ilike.${w}`),
        q1(can('agreements.manage') || crm, 'agreements', 'id, number, title, status', `number.ilike.${w},title.ilike.${w}`),
        can('intake.view') ? db.from('intake_submissions').select('id, created_at, triage_level, contacts!inner(full_name)').ilike('contacts.full_name', w).limit(4) : { data: [] },
        q1(true, 'tasks', 'id, title, due_date', `title.ilike.${w}`, 4),
        q1(crm, 'appointments', 'id, title, starts_at', `title.ilike.${w}`, 3),
      ]);
      if (my !== seq) return;
      const group = (label, ico, rows, href, main, sub) => (rows || []).length ? `<div class="sr-g">${label}</div>` + rows.map((r) =>
        `<a href="${href(r)}">${icon(ico)}<span>${esc(main(r))}</span><small>${esc(sub(r) || '')}</small></a>`).join('') : '';
      const html = group('Clients', 'user', con.data, (r) => `#/contacts/${r.id}`, (r) => r.full_name, (r) => r.email || r.phone || r.citizenship)
        + group('Cases', 'folder', cas.data, (r) => `#/cases/${r.id}`, (r) => `${r.case_number} · ${r.title}`, (r) => r.contacts?.full_name || r.ircc_file_number)
        + group('Companies', 'briefcase', com.data, (r) => `#/companies/${r.id}`, (r) => r.name, () => '')
        + group('Invoices', 'dollar', inv.data, (r) => `#/invoices/${r.id}`, (r) => r.number, (r) => `${r.contacts?.full_name || ''} · ${r.status}`)
        + group('Agreements', 'file', agr.data, (r) => `#/agreements/${r.id}`, (r) => r.number, (r) => r.title)
        + group('Assessments', 'clipboard', ass.data, (r) => `#/assessments/${r.id}`, (r) => r.contacts?.full_name || 'Assessment', (r) => fmtDate(r.created_at))
        + group('Tasks', 'checksq', tsk.data, () => '#/tasks', (r) => r.title, (r) => (r.due_date ? 'Due ' + fmtDate(r.due_date) : ''))
        + group('Appointments', 'calendar', apt.data, () => '#/', (r) => r.title, (r) => fmtDate(r.starts_at));
      box.innerHTML = html || '<div style="padding:12px;color:var(--muted)">No matches</div>';
      box.hidden = false;
    }, 220);
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') { const a = box.querySelector('a'); if (a) { location.hash = a.getAttribute('href'); box.hidden = true; input.blur(); } } };
  box.onclick = (e) => { if (e.target.closest('a')) { box.hidden = true; input.value = ''; } };
  input.onblur = () => setTimeout(() => (box.hidden = true), 200);
  window.addEventListener('hashchange', () => { input.value = ''; box.hidden = true; });
}

async function route() {
  if (!shellBuilt) return;
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const view = document.getElementById('view');
  document.getElementById('sidebar').classList.remove('open');
  const match = ROUTES.map(([re, mod, title]) => [path.match(re), mod, title]).find(([m]) => m);
  if (!match) { location.hash = '#/'; return; }
  const [m, mod, title] = match;
  document.getElementById('pageTitle').textContent = title;
  document.querySelector('.topbar').classList.toggle('tb-home', path === '/');
  document.title = `${title} · Graceful Practice Hub`;
  renderNav();
  // Each visit renders into its own container, so a slow page that finishes after the user
  // has moved on writes into a detached element instead of over the current page.
  const seq = ++routeSeq;
  const host = document.createElement('div');
  host.innerHTML = '<div class="loading"><div class="spin"></div>Loading…</div>';
  view.replaceChildren(host);
  try {
    const page = await import(`./views/${mod}.js`);
    await page.render(host, m.slice(1), { setTitle: (t, html) => { if (seq === routeSeq) document.getElementById('pageTitle')[html ? 'innerHTML' : 'textContent'] = t; } });
  } catch (e) {
    if (await healStaleModules(e)) return;
    host.innerHTML = `<div class="alert err">Something went wrong loading this page: ${esc(e.message)}</div>`;
    if (seq === routeSeq) fail(e);
  }
}
let routeSeq = 0;

// Right after a deploy the browser can hold an old cached copy of one module next to a new copy of another
// (GitHub Pages caches for 10 minutes), which breaks imports. Re-download every app script, then reload once.
async function healStaleModules(e) {
  if (!/does not provide an export|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(e?.message || '')) return false;
  try { if (sessionStorage.getItem('gi_healed') > Date.now() - 60000) return false; sessionStorage.setItem('gi_healed', Date.now()); } catch { return false; }
  const urls = new Set(performance.getEntriesByType('resource').map((r) => r.name.split('#')[0]).filter((u) => /\/app\/js\/.+\.js(\?|$)/.test(u)));
  await Promise.all([...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  location.reload();
  return true;
}

window.addEventListener('hashchange', () => { if (!/access_token|error_description/.test(location.hash)) route(); });
window.addEventListener('auth-changed', () => { shellBuilt = false; boot(); });
db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') { shellBuilt = false; showLogin(); }
  // The code screen (auth.js showCode) sets its own password, so it ignores this event.
  if (event === 'PASSWORD_RECOVERY' && !window.__giCodeFlow) { sessionStorage.setItem('gi_auth_kind', 'recovery'); showSetPassword('recovery'); }
});

boot().catch(fail);
