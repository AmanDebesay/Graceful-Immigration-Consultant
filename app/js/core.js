// Shared state, Supabase client and UI helpers for the practice dashboard.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';

export const SUPABASE_URL = 'https://bmzhcprthrocbqluxpwa.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ZcaXkELPK820lTD41ffw2Q_iMTta3uT';
export const FN_URL = `${SUPABASE_URL}/functions/v1`;

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

export const state = { user: null, profile: null, perms: new Set(), staff: [], settings: null };

export const can = (p) => state.profile?.role === 'owner' || state.perms.has(p);
export const isStaff = () => state.profile && state.profile.role !== 'client';

export const ROLE_LABEL = {
  owner: 'Owner', rcic: 'RCIC', case_manager: 'Case Manager', bookkeeper: 'Bookkeeper', assistant: 'Assistant', client: 'Client',
};
export const STAGES = [
  ['new', 'New'], ['contacted', 'Contacted'], ['consultation_booked', 'Consultation booked'],
  ['assessed', 'Assessed'], ['retained', 'Retained'], ['closed_lost', 'Closed / lost'],
];
export const STAGE_LABEL = Object.fromEntries(STAGES);
export const SERVICE_LABEL = {
  refugee: 'Refugee claim / IRB hearing', protectedPR: 'PR as protected person', resettle: 'Refugee resettlement / sponsorship',
  family: 'Family sponsorship', visitor: 'Visitor visa / Super Visa', study: 'Study permit', work: 'Work permit',
  economic: 'Express Entry / PNP', citizenship: 'Citizenship', review: 'Refusal review', notsure: 'Not sure',
};

// ── Escaping & formatting ──
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const initials = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export function fmtDate(d, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!d) return '—';
  const dt = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
  return dt.toLocaleDateString('en-CA', opts);
}
export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
}
export const today = () => new Date().toLocaleDateString('en-CA');
export const staffName = (id) => state.staff.find((s) => s.id === id)?.full_name || '—';

// ── Icons (inline SVG paths) ──
const P = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checksq: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.1 13a9 9 0 1 0 2.2-8.4L3 8"/><path d="M12 7v5l4 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  arrowL: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  maple: '<path fill="currentColor" stroke="none" d="M12 1.5l1.9 3.8 1.9-1-.7 4.8 3.1-2.9 1 1.9 3.4-.5-1.4 3.8 1.9 1-5.3 3.8 1 1.9-5.8-1v7.2h-1.9v-7.2l-5.8 1 1-1.9L1.9 13l1.9-1-1.4-3.8 3.4.5 1-1.9 3.1 2.9-.7-4.8 1.9 1z"/>',
};
export const icon = (name, cls = 'i') => `<svg class="${cls} svg" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

// ── Badges ──
export const triageBadge = (lvl) => lvl ? `<span class="badge b-${lvl}">${lvl}</span>` : '<span class="badge plain">—</span>';
const STAGE_CLS = { new: 'b-blue', contacted: 'b-navy', consultation_booked: 'b-gold', assessed: 'b-navy', retained: 'b-GREEN', closed_lost: '' };
export const stageBadge = (s) => `<span class="badge ${STAGE_CLS[s] || ''}">${esc(STAGE_LABEL[s] || s)}</span>`;
export const priorityBadge = (p) => `<span class="badge b-${p}">${esc(p[0].toUpperCase() + p.slice(1))}</span>`;
export const roleBadge = (r) => `<span class="badge plain ${r === 'owner' ? 'b-gold' : r === 'client' ? '' : 'b-navy'}">${ROLE_LABEL[r] || r}</span>`;

// ── Toasts ──
export function toast(msg, isErr = false) {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3500);
}
export const fail = (e) => { console.error(e); toast(e?.message || String(e), true); };

// ── Modal ──
export function modal({ title, body, actions = [], wide = false, onOpen }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="btn btn-ghost btn-sm" data-x aria-label="Close">${icon('x')}</button></div>
    <div class="modal-b">${body}</div>
    ${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-a="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-x]').onclick = close;
  actions.forEach((a, i) => {
    ov.querySelector(`[data-a="${i}"]`).onclick = async (e) => {
      const btn = e.currentTarget;
      if (!a.onClick) return close();
      btn.disabled = true;
      try { const keep = await a.onClick(ov.querySelector('.modal'), close); if (keep !== false) close(); }
      catch (err) { fail(err); }
      finally { btn.disabled = false; }
    };
  });
  document.body.appendChild(ov);
  onOpen?.(ov.querySelector('.modal'));
  ov.querySelector('input,select,textarea')?.focus();
  return { el: ov.querySelector('.modal'), close };
}
export const confirmBox = (title, message, label = 'Confirm', danger = false) => new Promise((resolve) => {
  modal({
    title, body: `<p>${esc(message)}</p>`,
    actions: [{ label: 'Cancel', onClick: () => resolve(false) }, { label, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) }],
  });
});

// ── Data helpers ──
export async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function callFn(name, body) {
  const { data: { session } } = await db.auth.getSession();
  const res = await fetch(`${FN_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
export async function loadStaff() {
  const { data } = await db.from('profiles').select('id, full_name, email, role, active, job_title').neq('role', 'client').order('full_name');
  state.staff = data || [];
}
export function staffOptions(selected, { blank = 'Unassigned' } = {}) {
  return `<option value="">${esc(blank)}</option>` + state.staff.filter((s) => s.active)
    .map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.full_name || s.email)}</option>`).join('');
}
