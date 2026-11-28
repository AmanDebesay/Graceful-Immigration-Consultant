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
// Drafting is open to assistants; signing and sending stay with agreements.manage (the RCIC).
export const canDraftAgreements = () => can('agreements.manage') || can('agreements.draft');

export const ROLE_LABEL = {
  owner: 'Owner', rcic: 'RCIC', case_manager: 'Case Manager', bookkeeper: 'Bookkeeper', assistant: 'Assistant', marketing: 'Marketing', client: 'Client',
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
export const avatarHtml = (p, cls = 'avatar') => p?.avatar_url
  ? `<span class="${cls} photo"><img src="${esc(p.avatar_url)}" alt=""></span>`
  : `<span class="${cls}">${esc(initials(p?.full_name || p?.email))}</span>`;
// Client avatars: every client gets their own picture — a colour pair and a pattern chosen from their id/name,
// so two clients rarely look alike and the same client always looks the same.
const AV_COLORS = [['#0B2A5C', '#2F6FD0'], ['#7A1F3D', '#D0506F'], ['#0E5E55', '#2FB39C'], ['#5B2A86', '#A46BE0'], ['#8A4B12', '#E39A3B'], ['#1F4E3D', '#56A57B'],
  ['#2B3A67', '#6C83D9'], ['#7C2D12', '#E0703C'], ['#134E6F', '#3BA3D6'], ['#4A4F12', '#A9B33A'], ['#6B1F5F', '#D35BB8'], ['#23313F', '#6F8AA6'], ['#9A6B12', '#F2C462'], ['#3F2A1E', '#A9744F']];
const AV_PATTERNS = [
  '<circle cx="80" cy="20" r="34" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="6"/><circle cx="80" cy="20" r="20" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="5"/>',
  '<path d="M-10 70 L70 -10 M10 90 L90 10 M30 110 L110 30" stroke="#fff" stroke-opacity=".13" stroke-width="9"/>',
  '<path d="M0 72 Q25 58 50 72 T100 72 V100 H0Z" fill="#fff" fill-opacity=".13"/><path d="M0 84 Q25 70 50 84 T100 84 V100 H0Z" fill="#fff" fill-opacity=".1"/>',
  '<g fill="#fff" fill-opacity=".16">' + [0, 1, 2, 3, 4].map((i) => [0, 1, 2, 3, 4].map((j) => `<circle cx="${10 + i * 20}" cy="${10 + j * 20}" r="2.6"/>`).join('')).join('') + '</g>',
  '<path d="M0 100 L30 62 L48 80 L70 50 L100 86 V100Z" fill="#fff" fill-opacity=".15"/>',
  '<path d="M78 6l3.6 7.2 3.6-1.9-1.3 9.2 6-5.6 1.9 3.6 6.5-1-2.7 7.3 3.6 1.9-10.1 7.3 1.9 3.6-11.1-1.9V50h-3.6V35.1l-11.1 1.9 1.9-3.6-10.1-7.3 3.6-1.9-2.7-7.3 6.5 1 1.9-3.6 6 5.6-1.3-9.2 3.6 1.9z" fill="#fff" fill-opacity=".16"/>',
];
const avHash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function avatarArt(seed) {
  const h = avHash(seed), [a, b] = AV_COLORS[h % AV_COLORS.length], pat = AV_PATTERNS[(h >>> 8) % AV_PATTERNS.length], ang = (h >>> 16) % 2 ? '0 0 1 1' : '1 0 0 1';
  const [x1, y1, x2, y2] = ang.split(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${pat}</svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}') center/cover`;
}
/** A client's avatar: their unique pattern with initials on top. */
export const clientAvatar = (c, cls = 'avatar') => `<span class="${cls} cav" style="background:${avatarArt(c?.id || c?.full_name || '?')}">${esc(initials(c?.full_name))}</span>`;
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
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/><path d="M5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z"/><path d="M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1ZM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  arrowr: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  pen: '<path d="M20 19.5c-1.5 1-3 1.5-4.5 1.5-2 0-2.5-2-4-2s-2 1-3.5 1"/><path d="M15.2 3.8a2.1 2.1 0 0 1 3 3L8 17l-4 1 1-4Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  bars: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M14 10h5M14 13h4"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
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
  const { data } = await db.from('profiles').select('id, full_name, email, role, active, job_title, avatar_url').neq('role', 'client').order('full_name');
  state.staff = data || [];
}
export function staffOptions(selected, { blank = 'Unassigned' } = {}) {
  return `<option value="">${esc(blank)}</option>` + state.staff.filter((s) => s.active)
    .map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.full_name || s.email)}</option>`).join('');
}
