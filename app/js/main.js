// App bootstrap: session → profile & permissions → shell → hash router.
import { db, state, can, isStaff, esc, icon, initials, ROLE_LABEL, loadStaff, fail } from './core.js';
import { showLogin, showSetPassword, showLinkError, showMfaChallenge } from './auth.js';

const NAV = [
  { group: 'Overview' },
  { path: '/', label: 'Dashboard', icon: 'home', show: () => isStaff() },
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
  { path: '/banking', label: 'Banking', icon: 'home', show: () => can('finance.view') },
  { path: '/trust', label: 'Trust (Client Funds)', icon: 'lock', show: () => can('finance.view') },
  { path: '/reports', label: 'Reports', icon: 'trend', show: () => can('finance.view') },
  { path: '/coa', label: 'Chart of Accounts', icon: 'note', show: () => can('finance.view') },
  { path: '/journal', label: 'Journal', icon: 'history', show: () => can('finance.view') },
  { path: '/items', label: 'Products & Services', icon: 'clipboard', show: () => can('finance.view') || can('crm.edit') },
  { group: 'Business' },
  { path: '/newsletter', label: 'Newsletter', icon: 'mail', show: () => can('newsletter.view') },
  { path: '/agreements', label: 'Agreements', icon: 'file', show: () => can('agreements.manage'), soon: true },
  { group: 'Administration' },
  { path: '/team', label: 'Team & Access', icon: 'shield', show: () => can('staff.manage') },
  { path: '/settings', label: 'Business Settings', icon: 'settings', show: () => can('settings.manage') },
  { path: '/audit', label: 'Audit Log', icon: 'history', show: () => can('audit.view') },
];

const ROUTES = [
  [/^\/$/, 'dashboard', 'Dashboard'],
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
  [/^\/agreements$/, 'soon', 'Coming soon'],
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
      <div class="sb-brand"><img src="../public/img/logo-emblem.png" alt=""><div><b>Graceful</b><span>Practice Hub</span></div></div>
      <nav class="sb-nav" id="sbNav"></nav>
      <div class="sb-foot">Signed in as ${esc(ROLE_LABEL[p.role])}<br><a href="../public/index.html" style="color:rgba(255,255,255,.7)">View website ↗</a></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn btn btn-ghost btn-sm" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
        <h1 id="pageTitle">Dashboard</h1>
        <div class="search">${icon('search')}<input id="gSearch" placeholder="Search contacts…" autocomplete="off"><div class="search-results" id="gResults" hidden></div></div>
        <div style="position:relative"><button class="btn btn-gold" id="plusNew">${icon('plus')} New</button></div>
        <button class="user-chip" id="userChip">
          <span class="avatar">${esc(initials(p.full_name || p.email))}</span>
          <span class="meta"><b>${esc(p.full_name || p.email)}</b><span>${esc(ROLE_LABEL[p.role])}</span></span>
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
    d.innerHTML = `<a href="#/account">${icon('user')} My account</a><button id="lo">${icon('logout')} Sign out</button>`;
    e.currentTarget.appendChild(d);
    d.querySelector('#lo').onclick = async () => { await db.auth.signOut(); location.hash = ''; location.reload(); };
    setTimeout(() => document.addEventListener('click', () => d.remove(), { once: true }));
  };
  setupSearch();
  setupNewMenu();
  refreshCounts();
}

async function setupNewMenu() {
  const btn = document.getElementById('plusNew');
  const fin = await import('./fin.js'), crm = await import('./crm.js');
  const groups = [
    ['Clients', [[can('crm.edit'), 'Contact', () => (location.hash = '#/contacts?new=1')], [can('crm.edit'), 'Deal', () => crm.editDeal()],
      [can('crm.edit'), 'Case', () => crm.editCase()], [can('crm.edit'), 'Log activity', () => crm.logActivity()], [can('intake.view'), 'Assessment', () => (location.hash = '#/assessments/new')]]],
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
  try { counts = (await db.rpc('dashboard_stats')).data || {}; } catch { counts = {}; }
  if (shellBuilt) renderNav();
}
window.addEventListener('refresh-counts', refreshCounts);

function setupSearch() {
  const input = document.getElementById('gSearch'), box = document.getElementById('gResults');
  if (!can('crm.view')) { input.closest('.search').remove(); return; }
  let t;
  input.oninput = () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    t = setTimeout(async () => {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const { data } = await db.from('contacts').select('id, full_name, email, phone, stage')
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(8);
      box.innerHTML = (data || []).length
        ? data.map((c) => `<a href="#/contacts/${c.id}"><span>${esc(c.full_name)}</span><span style="color:var(--muted);font-size:12px">${esc(c.email || c.phone || '')}</span></a>`).join('')
        : '<div style="padding:10px;color:var(--muted)">No matches</div>';
      box.hidden = false;
    }, 220);
  };
  input.onblur = () => setTimeout(() => (box.hidden = true), 200);
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
  document.title = `${title} · Graceful Practice Hub`;
  renderNav();
  view.innerHTML = '<div class="loading"><div class="spin"></div>Loading…</div>';
  try {
    const page = await import(`./views/${mod}.js`);
    await page.render(view, m.slice(1), { setTitle: (t) => { document.getElementById('pageTitle').textContent = t; } });
  } catch (e) {
    view.innerHTML = `<div class="alert err">Something went wrong loading this page: ${esc(e.message)}</div>`;
    fail(e);
  }
}

window.addEventListener('hashchange', () => { if (!/access_token|error_description/.test(location.hash)) route(); });
window.addEventListener('auth-changed', () => { shellBuilt = false; boot(); });
db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') { shellBuilt = false; showLogin(); }
  if (event === 'PASSWORD_RECOVERY') { sessionStorage.setItem('gi_auth_kind', 'recovery'); showSetPassword('recovery'); }
});

boot().catch(fail);
