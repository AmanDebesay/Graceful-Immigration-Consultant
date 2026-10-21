// App bootstrap: session → profile & permissions → shell → hash router.
import { db, state, can, isStaff, esc, icon, initials, ROLE_LABEL, loadStaff, fail } from './core.js';
import { showLogin, showSetPassword, showLinkError, showMfaChallenge } from './auth.js';

const NAV = [
  { group: 'Overview' },
  { path: '/', label: 'Dashboard', icon: 'home', show: () => isStaff() },
  { group: 'Clients' },
  { path: '/assessments', label: 'Assessments', icon: 'clipboard', show: () => can('intake.view'), count: 'new_assessments' },
  { path: '/pipeline', label: 'Pipeline', icon: 'kanban', show: () => can('crm.view') },
  { path: '/contacts', label: 'Contacts', icon: 'users', show: () => can('crm.view') },
  { path: '/tasks', label: 'Tasks', icon: 'checksq', show: () => isStaff(), count: 'tasks_overdue', red: true },
  { group: 'Business' },
  { path: '/newsletter', label: 'Newsletter', icon: 'mail', show: () => can('newsletter.view') },
  { path: '/agreements', label: 'Agreements', icon: 'file', show: () => can('agreements.manage'), soon: true },
  { path: '/finance', label: 'Finance', icon: 'dollar', show: () => can('finance.view'), soon: true },
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
  [/^\/pipeline$/, 'pipeline', 'Pipeline'],
  [/^\/contacts$/, 'contacts', 'Contacts'],
  [/^\/contacts\/([\w-]+)$/, 'contact', 'Contact'],
  [/^\/tasks$/, 'tasks', 'Tasks'],
  [/^\/newsletter$/, 'newsletter', 'Newsletter'],
  [/^\/team$/, 'team', 'Team & Access'],
  [/^\/settings$/, 'settings', 'Business Settings'],
  [/^\/audit$/, 'audit', 'Audit Log'],
  [/^\/account$/, 'account', 'My Account'],
  [/^\/(agreements|finance)$/, 'soon', 'Coming soon'],
];

let shellBuilt = false;
let counts = {};

async function boot() {
  const app = document.getElementById('app');
  // Links from invite / reset emails arrive with tokens or errors in the URL fragment
  const authHash = window.__authHash || '';
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
  refreshCounts();
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
