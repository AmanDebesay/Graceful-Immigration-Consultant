// Mail: an Outlook-style mailbox (Microsoft 365) for each staff member's own mailbox and the shared mailbox.
// Ribbon (Home, View, Help; Message, Insert, Format text, Options while writing), folder tree with favourites,
// Focused/Other, filters, conversations, bulk actions, categories, flags, sweep, junk, rich-text compose with
// drafts, attachments and scheduled send, automatic replies and inbox rules. Client emails link to the client file.
import { db, state, can, esc, icon, toast, fail, callFn, modal, confirmBox } from '../core.js';
import { EMAIL_TEMPLATES } from '../crm.js';

// ── Icons (24px stroke icons) ──
const P = {
  reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  replyAll: '<polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>',
  forward: '<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  junk: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  sweep: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
  move: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
  open: '<path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  paneR: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M14 3v18"/>',
  paneB: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 13h18"/>',
  paneOff: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  rows: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  rowsC: '<path d="M3 5h18M3 9h18M3 13h18M3 17h18M3 21h18"/>',
  convo: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  avatar: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/>',
  side: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  sort: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>',
  key: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  rule: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  check: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  ul: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  ol: '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  al: '<path d="M3 6h18M3 12h12M3 18h16"/>', ac: '<path d="M3 6h18M6 12h12M4 18h16"/>', ar: '<path d="M3 6h18M9 12h12M5 18h16"/>',
  indent: '<path d="M3 6h18M11 12h10M11 18h10M3 10l4 3-4 3"/>', outdent: '<path d="M3 6h18M11 12h10M11 18h10M7 10l-4 3 4 3"/>',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  hr: '<path d="M4 12h16"/>', undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>', redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  receipt: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>', menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', back: '<path d="m15 18-6-6 6-6"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  todo: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  files: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  draft: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m10 15.5 4-4 1.5 1.5-4 4H10v-1.5z"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  outbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M12 3v7M9 6l3-3 3 3"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/>', ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>', book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>', block: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
};
const ic = (n, s = 16) => `<svg class="svg" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

const WK = { inbox: ['Inbox', 'inbox'], drafts: ['Drafts', 'draft'], sentitems: ['Sent Items', 'send'], outbox: ['Outbox', 'outbox'], deleteditems: ['Deleted Items', 'trash'],
  junkemail: ['Junk Email', 'junk'], archive: ['Archive', 'archive'] };
const ORDER = ['inbox', 'drafts', 'sentitems', 'outbox', 'deleteditems', 'junkemail', 'archive'];
const HIDE = /^(Conversation History|RSS (Feeds|Subscriptions)|Sync Issues|Scheduled|Notes|Snoozed)$/i;
const CAT = { preset0: '#E74856', preset1: '#F7630C', preset2: '#8E562E', preset3: '#EAB308', preset4: '#16A34A', preset5: '#0E9384', preset6: '#6B8E23', preset7: '#2563EB',
  preset8: '#7C3AED', preset9: '#B42363', preset10: '#475467', preset11: '#1E3A8A', preset12: '#9CA3AF', preset13: '#4B5563', preset14: '#111827', preset15: '#991B1B',
  preset16: '#C2410C', preset17: '#78350F', preset18: '#A16207', preset19: '#166534', preset20: '#115E59', preset21: '#3F6212', preset22: '#1D4ED8', preset23: '#5B21B6', preset24: '#9D174D' };
const AV = ['#0B2A5C', '#B8861F', '#175CD3', '#067647', '#B42318', '#6941C6', '#0E9384', '#C11574', '#B54708', '#344054'];
const avColor = (s = '') => AV[[...s.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AV.length];
const inits = (name, email) => { const n = (name || email || '?').replace(/[<>"]/g, '').trim(); const w = n.split(/[\s.@_-]+/).filter(Boolean); return ((w[0]?.[0] || '?') + (w[1]?.[0] || '')).toUpperCase(); };
const avatar = (name, email, size = 34) => `<span class="ol-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${avColor(email || name)}">${esc(inits(name, email))}</span>`;
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA');
function when(d) {
  const x = new Date(d), now = new Date(), days = (new Date(dayKey(now)) - new Date(dayKey(x))) / 864e5;
  if (days === 0) return x.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return x.toLocaleDateString('en-CA', { weekday: 'short' }) + ' ' + x.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  return x.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(x.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
function group(d) {
  const x = new Date(d), now = new Date(), days = (new Date(dayKey(now)) - new Date(dayKey(x))) / 864e5;
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < now.getDay() + 1) return 'This week';
  if (days < now.getDay() + 8) return 'Last week';
  if (x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear()) return 'Earlier this month';
  return x.toLocaleDateString('en-CA', { month: 'long', ...(x.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
const fullDate = (d) => new Date(d).toLocaleString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const toB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onerror = () => rej(new Error(`Could not read ${f.name}`)); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(f); });

// View settings (per browser, like Outlook's View tab)
const VIEW_DEF = { layout: 'right', density: 'full', convo: true, preview: true, avatars: true, focused: true, zoom: 100, folders: true, order: 'newest' };
const loadView = () => { try { return { ...VIEW_DEF, ...JSON.parse(localStorage.getItem('gi_mail_view') || '{}') }; } catch { return { ...VIEW_DEF }; } };
const saveView = (v) => { try { localStorage.setItem('gi_mail_view', JSON.stringify(v)); } catch { /* private window */ } };
const loadFav = () => { try { return JSON.parse(localStorage.getItem('gi_mail_fav') || 'null') || ['inbox', 'sentitems', 'drafts']; } catch { return ['inbox', 'sentitems', 'drafts']; } };

// Small dropdown menu under a button
function menu(anchor, items) {
  document.querySelector('.ol-menu')?.remove();
  const d = document.createElement('div'); d.className = 'ol-menu';
  d.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.head ? `<div class="ol-mhd">${esc(it.head)}</div>`
    : `<button data-i="${i}" ${it.disabled ? 'disabled' : ''} class="${it.on ? 'on' : ''}">${it.color ? `<i class="ol-dot" style="background:${it.color}"></i>` : it.icon ? ic(it.icon) : '<i class="ol-sp"></i>'}<span>${esc(it.label)}</span>${it.on ? ic('receipt', 14) : ''}</button>`).join('');
  document.body.appendChild(d);
  const r = anchor.getBoundingClientRect();
  d.style.top = `${Math.min(r.bottom + 4, innerHeight - d.offsetHeight - 8)}px`;
  d.style.left = `${Math.max(8, Math.min(r.left, innerWidth - d.offsetWidth - 8))}px`;
  const close = () => { d.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', esc_); };
  const out = (e) => { if (!d.contains(e.target)) close(); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', esc_); });
  d.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; close(); Promise.resolve(items[+b.dataset.i].run()).catch(fail); };
}

export async function render(el) {
  const status = await callFn('comms', { action: 'status' }).catch((e) => ({ error: e.message }));
  if (!status.email) {
    el.innerHTML = `<div class="dk-card"><div class="dk-empty">${icon('mail')}<h3 style="color:var(--navy)">Email isn't connected yet</h3><p>${status.error ? esc(status.error) : can('settings.manage') ? 'Connect Microsoft 365 in Business Settings → Integrations.' : 'Ask the owner to connect Microsoft 365.'}</p></div></div>`;
    return;
  }
  const boxes = [['me', status.mailboxes[0], 'My mailbox'], ...(can('crm.edit') && status.mailboxes[1] ? [['shared', status.mailboxes[1], 'Shared mailbox']] : [])];
  const addrOf = (k) => boxes.find((b) => b[0] === k)?.[1] || '';
  const V = loadView();
  let fav = loadFav();
  let box = sessionStorage.getItem('gi_mail_box') || 'me';
  if (!boxes.find((b) => b[0] === box)) box = 'me';
  let folder = 'inbox', folders = [], list = [], rows = [], cur = null, thread = [], sel = new Set(), filter = 'all', focus = 'focused', search = '', searchAll = false;
  let tab = 'home', comp = null, cats = [], loading = false, endReached = false, lastAnchor = null;
  const contactsByEmail = {};
  const mx = (op, p = {}) => callFn('comms', { action: 'mx', op, mailbox: box, ...p });

  el.innerHTML = `<div class="ol" id="ol">
    <div class="ol-top">
      <div class="ol-brand">${ic('mail', 18)}<b>Mail</b></div>
      <div class="ol-search">${ic('search')}<input id="q" placeholder="Search mail" autocomplete="off"><button class="ol-sscope" id="scope" title="Where to search"></button><button class="ol-sx" id="qx" hidden>${ic('x', 14)}</button></div>
      <div class="ol-topr"><button class="ol-iconbtn" id="sync" title="Refresh (sync)">${ic('refresh')}</button><a class="ol-iconbtn" href="https://outlook.office.com/mail/" target="_blank" rel="noopener" title="Open Outlook on the web">${ic('ext')}</a></div>
    </div>
    <div class="ol-ribbon"><div class="ol-tabs" id="tabs" role="tablist"></div><div class="ol-cmds" id="cmds"></div></div>
    <div class="ol-body">
      <nav class="ol-rail" aria-label="Apps">
        <a class="on" href="#/email" title="Mail">${ic('mail', 20)}<span>Mail</span></a>
        <a href="#/calendar" title="Calendar">${ic('calendar', 20)}<span>Calendar</span></a>
        <a href="#/contacts" title="People">${ic('people', 20)}<span>People</span></a>
        <a href="#/documents" title="Files">${ic('files', 20)}<span>Files</span></a>
        <a href="#/tasks" title="To Do">${ic('todo', 20)}<span>To Do</span></a>
        <a href="#/chat" title="Team chat">${ic('chat', 20)}<span>Chat</span></a>
      </nav>
      <aside class="ol-folders" id="fp"></aside>
      <section class="ol-list" id="lp">
        <div class="ol-lhead"><button class="ol-iconbtn ol-only-m" id="fpBtn" title="Folders">${ic('menu')}</button>
          <label class="ol-all" title="Select all"><input type="checkbox" id="selAll"></label><h2 id="ftitle">Inbox</h2>
          <button class="ol-iconbtn" id="filterBtn" title="Filter and sort">${ic('rule')}</button></div>
        <div class="ol-focus" id="focusBar"></div>
        <div class="ol-bulk" id="bulk" hidden></div>
        <div class="ol-items" id="items"></div>
      </section>
      <section class="ol-read" id="rp"></section>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const root = $('#ol');
  const applyView = () => {
    root.dataset.layout = V.layout; root.dataset.density = V.density;
    root.classList.toggle('no-fp', !V.folders); root.classList.toggle('no-av', !V.avatars); root.classList.toggle('no-pre', !V.preview);
    saveView(V);
  };
  applyView();

  // ── Folder pane ──
  const fkey = (f) => f.wk || f.id;
  const fname = (f) => WK[f.wk]?.[0] || f.name;
  const curF = () => folders.find((f) => fkey(f) === folder) || { wk: WK[folder] ? folder : null, name: WK[folder]?.[0] || 'Folder', id: folder };
  const visibleFolders = () => {
    const tops = folders.filter((f) => !f.parent && !HIDE.test(f.name) && !(f.wk === 'outbox' && !f.total));
    const sorted = tops.sort((a, b) => (ORDER.indexOf(a.wk) + 1 || 99) - (ORDER.indexOf(b.wk) + 1 || 99) || a.name.localeCompare(b.name));
    const out = [];
    const walk = (f) => { out.push(f); folders.filter((c) => c.parent === f.id).sort((a, b) => a.name.localeCompare(b.name)).forEach(walk); };
    sorted.forEach(walk);
    return out;
  };
  const fRow = (f, depth = f.depth || 0) => {
    const k = fkey(f), n = f.wk === 'drafts' ? f.total : f.wk === 'sentitems' || f.wk === 'deleteditems' ? 0 : f.unread;
    return `<button class="ol-f ${k === folder && !searchAll ? 'on' : ''}" data-f="${esc(k)}" style="padding-left:${12 + depth * 16}px" title="${esc(fname(f))}">${ic(WK[f.wk]?.[1] || 'folder')}<span>${esc(fname(f))}</span>
      ${n ? `<em class="${f.wk === 'drafts' ? 'd' : ''}">${n}</em>` : ''}<i class="ol-fmore" data-fm="${esc(k)}" title="Folder actions">${ic('more', 14)}</i></button>`;
  };
  function drawFolders() {
    const vis = visibleFolders();
    const favs = fav.map((k) => folders.find((f) => fkey(f) === k)).filter(Boolean);
    $('#fp').innerHTML = `<button class="ol-new" data-cmd="new">${ic('pen')} New mail</button>
      ${favs.length ? `<div class="ol-fsec">${ic('star', 13)} Favourites</div>${favs.map((f) => fRow(f, 0)).join('')}` : ''}
      ${boxes.map(([k, a, l]) => `<div class="ol-acct ${k === box ? 'on' : ''}" data-b="${k}">${avatar(l, a, 22)}<span><b>${esc(l)}</b><small>${esc(a)}</small></span>${ic('chev', 14)}</div>
        ${k === box ? `<div class="ol-tree">${(vis.length ? vis : ORDER.map((w) => ({ id: w, wk: w, name: WK[w][0], unread: 0 }))).map((f) => fRow(f)).join('')}
          <button class="ol-f ol-fadd" data-cmd="folderNew">${ic('plus')} <span>Create new folder</span></button></div>` : ''}`).join('')}`;
  }
  async function loadFolders() {
    try { folders = (await mx('folders')).folders; } catch (e) { folders = []; toast(e.message, true); }
    drawFolders(); drawTitle();
  }

  // ── Message list ──
  const me = () => addrOf(box).toLowerCase();
  const clientOf = (m) => [m.from, ...m.to.map((p) => p.email)].map((e) => contactsByEmail[(e || '').toLowerCase()]).find(Boolean);
  async function matchContacts(msgs) {
    if (!can('crm.view')) return;
    const emails = [...new Set(msgs.flatMap((m) => [m.from, ...(m.to || []).map((p) => p.email), ...(m.cc || []).map((p) => p.email)]).map((e) => (e || '').toLowerCase()).filter((e) => e && !(e in contactsByEmail)))];
    if (!emails.length) return;
    const { data } = await db.from('contacts').select('id, full_name, email').in('email', emails.slice(0, 200));
    emails.forEach((e) => (contactsByEmail[e] = null));
    (data || []).forEach((c) => (contactsByEmail[c.email.toLowerCase()] = c));
  }
  const sentLike = () => ['sentitems', 'drafts', 'outbox'].includes(curF().wk);
  function buildRows() {
    let ms = list;
    if (search) { // the server can't combine a search with filters, so filter here
      if (filter === 'unread') ms = ms.filter((m) => !m.isRead); else if (filter === 'flagged') ms = ms.filter((m) => m.flag === 'flagged');
      else if (filter === 'files') ms = ms.filter((m) => m.hasAttachments); else if (filter === 'high') ms = ms.filter((m) => m.importance === 'high');
    }
    if (filter === 'tome') ms = ms.filter((m) => m.to.some((p) => p.email.toLowerCase() === me()));
    if (filter === 'clients') ms = ms.filter((m) => clientOf(m));
    if (filter === 'cats') ms = ms.filter((m) => m.categories.length);
    const out = [];
    if (V.convo && !sentLike()) {
      const by = new Map();
      for (const m of ms) {
        const k = m.conversationId || m.id, g = by.get(k);
        if (g) { g.ids.push(m.id); g.count++; g.unread ||= !m.isRead; g.flagged ||= m.flag === 'flagged'; g.att ||= m.hasAttachments; g.cats = [...new Set([...g.cats, ...m.categories])]; }
        else { const r = { key: m.id, m, ids: [m.id], count: 1, unread: !m.isRead, flagged: m.flag === 'flagged', att: m.hasAttachments, cats: [...m.categories] }; by.set(k, r); out.push(r); }
      }
    } else ms.forEach((m) => out.push({ key: m.id, m, ids: [m.id], count: 1, unread: !m.isRead, flagged: m.flag === 'flagged', att: m.hasAttachments, cats: m.categories }));
    if (V.order === 'from') out.sort((a, b) => (a.m.fromName || a.m.from).localeCompare(b.m.fromName || b.m.from));
    if (V.order === 'subject') out.sort((a, b) => a.m.subject.replace(/^(re|fw|fwd):\s*/i, '').localeCompare(b.m.subject.replace(/^(re|fw|fwd):\s*/i, '')));
    rows = out;
  }
  const catColor = (n) => CAT[cats.find((c) => c.name === n)?.color] || '#8A94A6';
  const catChips = (list) => list.map((c) => `<span class="ol-cat" style="--c:${catColor(c)}">${esc(c.replace(/ category$/i, ''))}</span>`).join('');
  function itemHTML(r) {
    const m = r.m, c = clientOf(m), out = sentLike();
    const who = out ? (m.to.map((p) => p.name || p.email).join(', ') || '(no recipients)') : (m.fromName || m.from || '(unknown)');
    const on = cur === r.key, checked = sel.has(r.key);
    return `<div class="ol-item ${r.unread ? 'unread' : ''} ${on ? 'on' : ''} ${checked ? 'sel' : ''} ${r.flagged ? 'flagged' : ''}" data-id="${esc(r.key)}" role="option" aria-selected="${on}" tabindex="-1">
      <span class="ol-avwrap">${avatar(out ? m.to[0]?.name : m.fromName, out ? m.to[0]?.email : m.from)}<label class="ol-ck" title="Select"><input type="checkbox" data-ck="${esc(r.key)}" ${checked ? 'checked' : ''}></label></span>
      <div class="ol-it">
        <div class="ol-r1"><b>${out && m.isDraft ? '<span class="ol-draft">[Draft]</span> ' : ''}${esc(who)}</b>${r.count > 1 ? `<span class="ol-cnt">${r.count}</span>` : ''}<span class="ol-grow"></span>
          ${r.att ? `<span class="ol-mini" title="Has attachments">${ic('clip', 13)}</span>` : ''}${m.importance === 'high' ? '<span class="ol-imp" title="High importance">!</span>' : m.importance === 'low' ? `<span class="ol-mini" title="Low importance">${ic('down', 12)}</span>` : ''}<time>${when(m.date)}</time></div>
        <div class="ol-r2">${esc(m.subject)}</div>
        <div class="ol-r3">${esc(m.preview || '(no preview)')}</div>
        ${r.cats.length || c ? `<div class="ol-tags">${catChips(r.cats)}${c ? `<span class="ol-client">${ic('user', 11)} ${esc(c.full_name)}</span>` : ''}</div>` : ''}
      </div>
      <div class="ol-hov">
        <button data-q="del" title="Delete">${ic('trash', 15)}</button>
        <button data-q="read" title="${r.unread ? 'Mark as read' : 'Mark as unread'}">${ic(r.unread ? 'open' : 'mail', 15)}</button>
        <button data-q="flag" class="${r.flagged ? 'on' : ''}" title="${r.flagged ? 'Clear flag' : 'Flag this message'}">${ic('flag', 15)}</button>
      </div>
      ${r.flagged ? `<span class="ol-flagmark">${ic('flag', 13)}</span>` : ''}
    </div>`;
  }
  function drawList() {
    buildRows();
    const box_ = $('#items');
    if (!rows.length) {
      box_.innerHTML = loading ? skeleton() : `<div class="ol-empty">${emptyArt()}<h3>${search ? 'No results' : filter !== 'all' ? 'Nothing here' : curF().wk === 'inbox' ? 'All caught up' : 'This folder is empty'}</h3>
        <p>${search ? 'Try different words, or search all folders.' : filter !== 'all' ? 'No messages match this filter.' : 'Nothing to see here.'}</p></div>`;
    } else {
      let last = '', h = '';
      const grouped = V.order === 'newest' || V.order === 'oldest';
      for (const r of rows) {
        const g = grouped ? group(r.m.date) : '';
        if (g !== last) { h += `<div class="ol-grp">${esc(g)}</div>`; last = g; }
        h += itemHTML(r);
      }
      if (!endReached && !search) h += `<button class="ol-more" id="more">Load more</button>`;
      box_.innerHTML = h;
    }
    $('#selAll').checked = !!rows.length && rows.every((r) => sel.has(r.key));
    $('#selAll').indeterminate = sel.size > 0 && !$('#selAll').checked;
    drawBulk(); drawRibbon();
  }
  const skeleton = () => Array.from({ length: 7 }, () => `<div class="ol-sk"><i></i><div><b></b><b></b><b></b></div></div>`).join('');
  const emptyArt = () => `<svg width="120" height="90" viewBox="0 0 120 90" aria-hidden="true"><rect x="14" y="22" width="92" height="58" rx="10" fill="#EEF2F8"/><path d="M14 32l46 28 46-28" fill="none" stroke="#0B2A5C" stroke-width="3" stroke-linejoin="round" opacity=".35"/><circle cx="92" cy="22" r="13" fill="#FBF1DC"/><path d="M86 22l4 4 8-8" fill="none" stroke="#B8861F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function drawTitle() {
    $('#ftitle').textContent = searchAll && search ? 'Search: all folders' : search ? `Search: ${fname(curF())}` : fname(curF());
    const fb = $('#focusBar'), showF = curF().wk === 'inbox' && V.focused && !search;
    fb.innerHTML = `${showF ? `<div class="ol-ftabs"><button data-focus="focused" class="${focus === 'focused' ? 'on' : ''}">Focused</button><button data-focus="other" class="${focus === 'other' ? 'on' : ''}">Other</button></div>` : '<span></span>'}
      ${filter !== 'all' ? `<button class="ol-fchip" data-cmd="clearFilter">${esc(FILTERS.find((f) => f[0] === filter)?.[1] || '')} ${ic('x', 12)}</button>` : ''}`;
    $('#scope').textContent = searchAll ? 'All folders' : 'This folder';
  }
  async function load(append = false) {
    if (!append) { list = []; endReached = false; loading = true; drawList(); }
    const want = { folder: searchAll && search ? 'all' : folder, skip: append ? list.length : 0, search, filter: search ? '' : ['unread', 'flagged', 'files', 'high'].includes(filter) ? filter : '',
      focus: curF().wk === 'inbox' && V.focused && !search ? focus : '', order: V.order === 'oldest' ? 'oldest' : 'newest' };
    const sig = JSON.stringify([box, want]);
    lastLoad = sig;
    try {
      const r = await mx('list', want);
      if (lastLoad !== sig) return;
      list = append ? list.concat(r.messages) : r.messages;
      endReached = r.messages.length < 40;
      await matchContacts(r.messages);
    } catch (e) { if (lastLoad === sig) { $('#items').innerHTML = `<div class="alert err" style="margin:12px">${esc(e.message)}</div>`; loading = false; return; } }
    loading = false; drawList();
  }
  let lastLoad = '';
  const rowOf = (key) => rows.find((r) => r.key === key);
  const targets = () => (sel.size ? [...sel].map(rowOf).filter(Boolean) : cur ? [rowOf(cur)].filter(Boolean) : []);
  const targetIds = () => targets().flatMap((r) => r.ids);

  // ── Bulk bar ──
  function drawBulk() {
    const b = $('#bulk');
    b.hidden = !sel.size;
    if (sel.size) b.innerHTML = `<b>${sel.size} selected</b><span class="ol-grow"></span><button data-cmd="markRead" title="Mark as read">${ic('open', 15)}</button><button data-cmd="markUnread" title="Mark as unread">${ic('mail', 15)}</button>
      <button data-cmd="flag" title="Flag">${ic('flag', 15)}</button><button data-cmd="archive" title="Archive">${ic('archive', 15)}</button><button data-cmd="moveMenu" title="Move">${ic('move', 15)}</button>
      <button data-cmd="delete" title="Delete">${ic('trash', 15)}</button><button data-cmd="clearSel" title="Clear selection">${ic('x', 15)}</button>`;
  }

  // ── Ribbon ──
  const FILTERS = [['all', 'All'], ['unread', 'Unread'], ['flagged', 'Flagged'], ['tome', 'To me'], ['files', 'Has files'], ['high', 'High importance'], ['cats', 'Categorized'], ['clients', 'From clients']];
  const KEEP_LABEL = ['delete', 'archive', 'reply', 'replyAll', 'forward', 'moveMenu', 'c:attach'];
  const B = (cmd, label, ico, o = {}) => `<button class="ol-cmd ${o.big ? 'big' : ''} ${o.on ? 'on' : ''} ${KEEP_LABEL.includes(cmd) ? 'lab' : ''} ${o.cls || ''}" data-cmd="${cmd}" ${o.disabled ? 'disabled' : ''} ${o.keep ? 'data-keep' : ''} title="${esc(o.title || label)}">${ico ? ic(ico, o.big ? 22 : 16) : ''}${o.text ? `<span class="ol-glyph" style="${o.style || ''}">${o.text}</span>` : ''}<span class="ol-lab">${esc(label)}</span>${o.menu ? ic('chev', 12) : ''}</button>`;
  const G = (label, inner) => `<div class="ol-grp-r"><div class="ol-grp-b">${inner}</div><div class="ol-grp-l">${esc(label)}</div></div>`;
  function drawRibbon() {
    const tabs = [['home', 'Home'], ['view', 'View'], ['help', 'Help'], ...(comp ? [['message', 'Message'], ['insert', 'Insert'], ['format', 'Format text'], ['options', 'Options']] : [])];
    if (!tabs.find((t) => t[0] === tab)) tab = 'home';
    $('#tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''} ${['message', 'insert', 'format', 'options'].includes(k) ? 'ctx' : ''}" data-tab="${k}">${l}</button>`).join('');
    const has = targets().length > 0, one = !!cur && !sel.size, inJunk = curF().wk === 'junkemail', inDel = curF().wk === 'deleteditems';
    const r = rowOf(cur), unread = targets().some((x) => x.unread), flagged = targets().some((x) => x.flagged);
    let h = '';
    if (tab === 'home') h = G('New', B('new', 'New mail', 'pen', { big: true, cls: 'primary' }) + B('newMenu', 'New', null, { menu: true, title: 'New item' }))
      + G('Delete', B('delete', inDel ? 'Delete forever' : 'Delete', 'trash', { disabled: !has }) + B('archive', 'Archive', 'archive', { disabled: !has || curF().wk === 'archive' }) + B('reportMenu', 'Report', 'junk', { menu: true, disabled: !has }) + B('sweep', 'Sweep', 'sweep', { disabled: !one }))
      + G('Move', B('moveMenu', 'Move to', 'move', { menu: true, disabled: !has }))
      + G('Respond', B('reply', 'Reply', 'reply', { disabled: !one }) + B('replyAll', 'Reply all', 'replyAll', { disabled: !one }) + B('forward', 'Forward', 'forward', { disabled: !one }))
      + G('Tags', B(unread ? 'markRead' : 'markUnread', unread ? 'Read' : 'Unread', unread ? 'open' : 'mail', { disabled: !has }) + B('flagMenu', flagged ? 'Flagged' : 'Flag', 'flag', { menu: true, disabled: !has, on: flagged }) + B('catMenu', 'Categorize', 'tag', { menu: true, disabled: !has }) + B('impMenu', 'Importance', null, { menu: true, disabled: !has, text: '!' }))
      + G('Client', B('client', r && clientOf(r.m) ? 'Open client' : 'Add as client', 'user', { disabled: !one || !can('crm.view') }))
      + G('Actions', B('print', 'Print', 'print', { disabled: !one }) + B('filterMenu', 'Filter', 'rule', { menu: true, on: filter !== 'all' }) + (inJunk || inDel ? B('empty', 'Empty folder', 'trash') : '') + B('sync', 'Sync', 'refresh'));
    else if (tab === 'view') h = G('Layout', B('layout:right', 'Right', 'paneR', { on: V.layout === 'right', title: 'Reading pane on the right' }) + B('layout:bottom', 'Bottom', 'paneB', { on: V.layout === 'bottom', title: 'Reading pane at the bottom' }) + B('layout:off', 'Hidden', 'paneOff', { on: V.layout === 'off', title: 'Hide the reading pane' }))
      + G('Density', B('density:full', 'Full', 'rows', { on: V.density === 'full' }) + B('density:compact', 'Compact', 'rowsC', { on: V.density === 'compact' }))
      + G('Messages', B('toggle:convo', 'Conversations', 'convo', { on: V.convo }) + B('toggle:preview', 'Preview text', 'eye', { on: V.preview }) + B('toggle:avatars', 'Sender pictures', 'avatar', { on: V.avatars }) + B('toggle:focused', 'Focused Inbox', 'inbox', { on: V.focused }))
      + G('Sort', B('sortMenu', { newest: 'Newest first', oldest: 'Oldest first', from: 'From', subject: 'Subject' }[V.order], 'sort', { menu: true }))
      + G('Panes', B('toggle:folders', 'Folder pane', 'side', { on: V.folders }))
      + G('Zoom', B('zoom:-10', 'Smaller', null, { text: 'A−' }) + B('zoom:0', `${V.zoom}%`, null, { text: '↺', title: 'Reset text size' }) + B('zoom:10', 'Larger', null, { text: 'A+' }));
    else if (tab === 'help') h = G('Help', B('shortcuts', 'Keyboard shortcuts', 'key', { big: true }) + B('guide', 'How it works', 'book') + B('owa', 'Outlook on the web', 'ext'))
      + G('Settings', B('autoreply', 'Automatic replies', 'plane', { big: true }) + B('rules', 'Rules', 'rule') + B('cats', 'Categories', 'tag') + B('signature', 'Signature', 'pen'));
    else if (comp) {
      const c = comp;
      if (tab === 'message') h = G('Send', B('c:send', 'Send', 'send', { big: true, cls: 'primary' }) + B('c:sendMenu', 'Send later', 'clock', { menu: true }))
        + G('Draft', B('c:save', 'Save draft', 'save') + B('c:discard', 'Discard', 'trash'))
        + G('Include', B('c:attach', 'Attach file', 'clip') + B('c:sig', 'Signature', 'pen') + B('c:tpl', 'Template', 'draft', { menu: true }))
        + G('Tags', B('c:imp:high', 'High importance', null, { text: '!', on: c.importance === 'high', style: 'color:#C4320A' }) + B('c:imp:low', 'Low importance', 'down', { on: c.importance === 'low' }));
      else if (tab === 'insert') h = G('Include', B('c:attach', 'Attach file', 'clip', { big: true }) + B('c:link', 'Link', 'link', { keep: true }) + B('c:table', 'Table', 'table', { keep: true }) + B('c:hr', 'Line', 'hr', { keep: true }))
        + G('Symbols', B('c:emoji', 'Emoji', 'smile', { keep: true }) + B('c:date', 'Date & time', 'clock', { keep: true }))
        + G('Signature', B('c:sig', 'Signature', 'pen', { keep: true }) + B('c:tpl', 'Template', 'draft', { menu: true }));
      else if (tab === 'format') h = G('Font', `<select class="ol-sel" id="fFont" title="Font">${['Arial', 'Calibri', 'Segoe UI', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'].map((f) => `<option>${f}</option>`).join('')}</select>
          <select class="ol-sel" id="fSize" title="Size">${[['2', 'Small'], ['3', 'Normal'], ['4', 'Large'], ['5', 'Larger'], ['6', 'Huge']].map(([v, l]) => `<option value="${v}" ${v === '3' ? 'selected' : ''}>${l}</option>`).join('')}</select>`
          + B('x:bold', 'Bold', null, { text: '<b>B</b>', keep: true }) + B('x:italic', 'Italic', null, { text: '<i>I</i>', keep: true }) + B('x:underline', 'Underline', null, { text: '<u>U</u>', keep: true }) + B('x:strikeThrough', 'Strikethrough', null, { text: '<s>S</s>', keep: true })
          + B('x:subscript', 'Subscript', null, { text: 'x₂', keep: true }) + B('x:superscript', 'Superscript', null, { text: 'x²', keep: true })
          + `<label class="ol-cmd" title="Font colour"><span class="ol-glyph" style="border-bottom:3px solid #C4320A">A</span><span class="ol-lab">Colour</span><input type="color" id="fColor" value="#C4320A"></label>
             <label class="ol-cmd" title="Highlight"><span class="ol-glyph" style="background:#FFF59D;padding:0 3px">ab</span><span class="ol-lab">Highlight</span><input type="color" id="fHi" value="#FFF59D"></label>`)
        + G('Paragraph', B('x:insertUnorderedList', 'Bullets', 'ul', { keep: true }) + B('x:insertOrderedList', 'Numbering', 'ol', { keep: true }) + B('x:outdent', 'Decrease indent', 'outdent', { keep: true }) + B('x:indent', 'Increase indent', 'indent', { keep: true })
          + B('x:justifyLeft', 'Align left', 'al', { keep: true }) + B('x:justifyCenter', 'Center', 'ac', { keep: true }) + B('x:justifyRight', 'Align right', 'ar', { keep: true }))
        + G('Styles', B('x:h', 'Heading', null, { text: 'H', keep: true }) + B('x:p', 'Normal', null, { text: '¶', keep: true }) + B('x:quote', 'Quote', 'quote', { keep: true }) + B('x:removeFormat', 'Clear formatting', 'eraser', { keep: true }))
        + G('Edit', B('x:undo', 'Undo', 'undo', { keep: true }) + B('x:redo', 'Redo', 'redo', { keep: true }));
      else if (tab === 'options') h = G('Show fields', B('c:showBcc', 'Bcc', null, { text: 'Bcc', on: c.showBcc }) + B('c:showCc', 'Cc', null, { text: 'Cc', on: c.showCc }))
        + G('Tracking', B('c:rr', 'Request a read receipt', 'eye', { on: c.readReceipt }) + B('c:dr', 'Request a delivery receipt', 'receipt', { on: c.deliveryReceipt }))
        + G('Delivery', B('c:sendMenu', c.sendAt ? `Sends ${when(c.sendAt)}` : 'Schedule send', 'clock', { menu: true, on: !!c.sendAt }))
        + G('Importance', B('c:imp:high', 'High', null, { text: '!', on: c.importance === 'high', style: 'color:#C4320A' }) + B('c:imp:low', 'Low', 'down', { on: c.importance === 'low' }));
    }
    $('#cmds').innerHTML = h;
    $('#fFont')?.addEventListener('change', (e) => comp?.exec('fontName', e.target.value));
    $('#fSize')?.addEventListener('change', (e) => comp?.exec('fontSize', e.target.value));
    $('#fColor')?.addEventListener('input', (e) => comp?.exec('foreColor', e.target.value));
    $('#fHi')?.addEventListener('input', (e) => comp?.exec('hiliteColor', e.target.value));
  }

  // ── Reading pane ──
  const readEmpty = () => { $('#rp').innerHTML = `<div class="ol-empty ol-rempty">${emptyArt()}<h3>Select an item to read</h3><p>Nothing is selected</p></div>`; root.classList.remove('reading'); };
  async function open(key, { keepSel = false } = {}) {
    if (comp) await closeComposer({ save: true });
    const r = rowOf(key); if (!r) return;
    if (r.m.isDraft) return openComposer({ mode: 'draft', draftId: r.m.id });
    cur = key; if (!keepSel) sel.clear(); thread = [];
    drawList();
    root.classList.add('reading');
    const pane = $('#rp');
    pane.innerHTML = '<div class="loading" style="min-height:200px"><div class="spin"></div></div>';
    try {
      let msgs = r.m.conversationId && V.convo && !sentLike() ? (await mx('thread', { conversationId: r.m.conversationId })).messages : [(await mx('read', { id: r.m.id })).message];
      if (cur !== key) return;
      const delId = folders.find((f) => f.wk === 'deleteditems')?.id;
      if (curF().wk !== 'deleteditems' && msgs.length > 1) msgs = msgs.filter((m) => m.folderId !== delId || m.id === r.m.id);
      thread = msgs.length ? msgs : [(await mx('read', { id: r.m.id })).message];
      await matchContacts(thread);
      drawReader();
      const unreadIds = thread.filter((m) => !m.isRead && !m.isDraft).map((m) => m.id);
      if (unreadIds.length) mx('patch', { ids: unreadIds, isRead: true }).then(() => { list.forEach((m) => { if (unreadIds.includes(m.id)) m.isRead = true; }); drawList(); bumpCounts(); }).catch(() => {});
    } catch (e) { if (cur === key) pane.innerHTML = `<div class="alert err" style="margin:16px">${esc(e.message)}</div>`; }
  }
  const bumpCounts = () => { clearTimeout(bumpT); bumpT = setTimeout(loadFolders, 800); };
  let bumpT;
  const latest = () => [...thread].reverse().find((m) => !m.isDraft) || thread[thread.length - 1];
  function drawReader() {
    const pane = $('#rp'), last = latest(), allCats = [...new Set(thread.flatMap((m) => m.categories))];
    const c = thread.map(clientOf).find(Boolean);
    const ext = last && last.from && !/@gracefulimmigration\.ca$/i.test(last.from) ? last : null;
    pane.innerHTML = `<div class="ol-rscroll" id="rs">
      <div class="ol-rhead"><button class="ol-iconbtn ol-only-m" data-cmd="back" title="Back">${ic('back')}</button>
        <h2>${last?.importance === 'high' ? '<span class="ol-imp">!</span> ' : ''}${esc(last?.subject || '')}</h2>
        <div class="ol-rcats">${catChips(allCats)}${thread.length > 1 ? `<span class="ol-tc">${thread.length} messages</span>` : ''}</div></div>
      ${c ? `<a class="ol-cbanner" href="#/contacts/${c.id}">${ic('user')} <span>Client: <b>${esc(c.full_name)}</b> · open the client file</span>${ic('ext', 14)}</a>`
        : ext && can('crm.edit') ? `<button class="ol-cbanner add" data-cmd="client">${ic('plus')} <span>Not a client yet: add <b>${esc(ext.fromName || ext.from)}</b> as a client</span></button>` : ''}
      <div class="ol-thread">${thread.map((m, i) => msgHTML(m, i === thread.length - 1 || !m.isRead)).join('')}</div>
      <div class="ol-quick" id="quick"><button data-cmd="reply">${ic('reply')} Reply</button><button data-cmd="replyAll">${ic('replyAll')} Reply all</button><button data-cmd="forward">${ic('forward')} Forward</button></div>
      <div id="inline"></div></div>`;
    pane.querySelectorAll('.ol-msg.open').forEach((a) => mountBody(a));
  }
  function msgHTML(m, openIt) {
    const to = m.to.map((p) => p.name || p.email).join('; '), cc = m.cc.map((p) => p.name || p.email).join('; ');
    return `<article class="ol-msg ${openIt ? 'open' : ''}" data-mid="${esc(m.id)}">
      <header class="ol-mh" data-toggle="${esc(m.id)}">${avatar(m.fromName, m.from, 40)}
        <div class="ol-mwho"><div><b>${esc(m.fromName || m.from)}</b> <small>&lt;${esc(m.from)}&gt;</small>${m.isDraft ? ' <span class="ol-draft">[Draft]</span>' : ''}</div>
          <div class="ol-mto">${openIt ? `To: ${esc(to || '—')}${cc ? `<br>Cc: ${esc(cc)}` : ''}` : esc(m.preview)}</div></div>
        <div class="ol-mside"><time title="${esc(fullDate(m.date))}">${esc(fullDate(m.date))}</time>
          <div class="ol-macts">${m.flag === 'flagged' ? `<span class="ol-flagmark static">${ic('flag', 14)}</span>` : ''}
            <button data-mact="reply" title="Reply">${ic('reply')}</button><button data-mact="replyAll" title="Reply all">${ic('replyAll')}</button><button data-mact="forward" title="Forward">${ic('forward')}</button><button data-mact="more" title="More actions">${ic('more')}</button></div></div>
      </header>
      ${openIt ? `${m.attachments.length ? `<div class="ol-atts">${m.attachments.map((a) => `<button class="ol-att" data-att="${esc(a.id)}" data-attm="${esc(m.id)}" title="Open ${esc(a.name)}">
          <span class="ol-atti" style="background:${attColor(a.name)}">${esc((a.name.split('.').pop() || 'file').slice(0, 4).toUpperCase())}</span><span><b>${esc(a.name)}</b><small>${kb(a.size)}</small></span></button>`).join('')}
          ${m.attachments.length > 1 ? `<button class="ol-att all" data-allatt="${esc(m.id)}">${ic('down')} <span><b>Download all</b><small>${m.attachments.length} files</small></span></button>` : ''}</div>` : ''}
        <iframe class="ol-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Email content"></iframe>` : ''}
    </article>`;
  }
  const attColor = (n) => ({ pdf: '#D92D20', doc: '#175CD3', docx: '#175CD3', xls: '#067647', xlsx: '#067647', csv: '#067647', ppt: '#C4320A', pptx: '#C4320A', jpg: '#7A5AF8', jpeg: '#7A5AF8', png: '#7A5AF8', gif: '#7A5AF8', zip: '#475467' })[(n.split('.').pop() || '').toLowerCase()] || '#667085';
  function mountBody(art) {
    const m = thread.find((x) => x.id === art.dataset.mid), f = art.querySelector('iframe');
    if (!m || !f) return;
    const html = m.bodyType === 'html' ? m.body : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(m.body)}</pre>`;
    f.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>html{zoom:${V.zoom}%}body{font:14.5px/1.6 'Segoe UI',Arial,Helvetica,sans-serif;color:#1C2333;margin:4px 2px 12px;overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{border-left:3px solid #D0D5DD;margin:0 0 0 4px;padding-left:12px;color:#475467}table{max-width:100%}a{color:#175CD3}</style>${html}`;
    f.onload = () => {
      const size = () => { try { f.style.height = Math.max(60, f.contentDocument.documentElement.scrollHeight + 4) + 'px'; } catch { f.style.height = '480px'; } };
      size();
      try { new ResizeObserver(size).observe(f.contentDocument.body); } catch { /* old browser */ }
      f.contentDocument.querySelectorAll('img').forEach((i) => i.addEventListener('load', size));
    };
  }
  async function attachment(mid, aid, download = false) {
    const { attachment: a } = await mx('attachment', { id: mid, attachmentId: aid });
    if (!a.contentBytes) throw new Error('This attachment type can only be opened in Outlook.');
    const bytes = Uint8Array.from(atob(a.contentBytes), (ch) => ch.charCodeAt(0));
    const type = a.contentType || 'application/octet-stream', url = URL.createObjectURL(new Blob([bytes], { type }));
    const dl = () => { const l = document.createElement('a'); l.href = url; l.download = a.name; l.click(); };
    if (download || !/^image\/|application\/pdf/.test(type)) { dl(); setTimeout(() => URL.revokeObjectURL(url), 8000); return; }
    const mm = modal({ title: a.name, wide: true, body: /^image\//.test(type) ? `<div style="text-align:center"><img src="${url}" alt="" style="max-width:100%;max-height:70vh;border-radius:8px"></div>`
      : `<iframe src="${url}" title="${esc(a.name)}" style="width:100%;height:70vh;border:0;border-radius:8px"></iframe>`,
      actions: [{ label: 'Close' }, { label: 'Download', cls: 'btn-primary', onClick: () => { dl(); return false; } }] });
    new MutationObserver((_, o) => { if (!document.body.contains(mm.el)) { URL.revokeObjectURL(url); o.disconnect(); } }).observe(document.body, { childList: true });
  }

  // ── Composer ──
  const sigHTML = (addr) => `<div class="gi-sig" style="color:#5B6476;font-size:13px;margin-top:18px">--<br>${(status.signature || []).map(esc).join('<br>')}<br>${esc(addr)}</div>`;
  async function openComposer(o) {
    if (comp) await closeComposer({ save: true });
    let draft = null;
    if (o.mode === 'draft') { try { draft = (await mx('read', { id: o.draftId })).message; } catch (e) { return fail(e); } }
    const ref = o.ref || null, mode = o.mode, inline = !!ref && V.layout !== 'off';
    const quoteSubj = (p) => (s) => (new RegExp(`^${p}:`, 'i').test(s) ? s : `${p}: ${s}`);
    const subject = draft ? draft.subject.replace(/^\(no subject\)$/, '') : mode === 'forward' ? quoteSubj('FW')(ref.subject) : ref ? quoteSubj('RE')(ref.subject) : o.subject || '';
    const myAddr = me();
    const toList = draft ? draft.to.map((p) => p.email) : mode === 'reply' ? [ref.replyTo?.[0] || ref.from] : mode === 'replyAll'
      ? [...new Set([ref.replyTo?.[0] || ref.from, ...ref.to.map((p) => p.email)])].filter((a) => a && a.toLowerCase() !== myAddr) : o.to || [];
    const ccList = draft ? draft.cc.map((p) => p.email) : mode === 'replyAll' ? ref.cc.map((p) => p.email).filter((a) => a.toLowerCase() !== myAddr) : [];
    const c = comp = {
      mode: draft ? 'draft' : mode, ref, inline, box, draftId: draft?.id || null, dirty: false, importance: draft?.importance || 'normal', readReceipt: false, deliveryReceipt: false,
      sendAt: null, showCc: ccList.length > 0, showBcc: !!draft?.bcc?.length, atts: (draft?.attachments || []).map((a) => ({ id: a.id, name: a.name, size: a.size })), removed: [],
      rcp: { to: [...toList], cc: [...ccList], bcc: draft ? draft.bcc.map((p) => p.email) : [] }, savedAt: null, range: null, timer: null,
    };
    const host = inline ? $('#inline') : $('#rp');
    if (!inline) { cur = null; drawList(); root.classList.add('reading'); }
    $('#quick')?.setAttribute('hidden', '');
    const initial = draft ? (draft.bodyType === 'html' ? draft.body : `<p>${esc(draft.body).replace(/\n/g, '<br>')}</p>`)
      : `<p><br></p>${o.html || ''}<p><br></p>${sigHTML(addrOf(box))}`;
    host.innerHTML = `<div class="ol-comp ${inline ? 'inline' : ''}">
      <div class="ol-cbar"><div class="ol-split"><button class="ol-send" data-cmd="c:send">${ic('send')} Send</button><button class="ol-send dd" data-cmd="c:sendMenu" title="Send options">${ic('chev', 12)}</button></div>
        <button class="ol-cbtn" data-cmd="c:discard">${ic('trash')} Discard</button><button class="ol-cbtn" data-cmd="c:attach">${ic('clip')} Attach</button>
        <span class="ol-grow"></span><span class="ol-csaved" id="csaved"></span>
        ${!inline ? `<button class="ol-iconbtn ol-only-m" data-cmd="c:discardClose" title="Close">${ic('x')}</button>` : ''}</div>
      <div class="ol-sched" id="sched" hidden></div>
      <div class="ol-crow"><label>From</label><select id="cFrom" class="ol-csel" ${ref ? 'disabled title="Replies are sent from the mailbox that received the email"' : ''}>${boxes.map(([k, a]) => `<option value="${k}" ${k === box ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
      ${['to', 'cc', 'bcc'].map((k) => `<div class="ol-crow" id="row-${k}" ${k === 'cc' && !c.showCc || k === 'bcc' && !c.showBcc ? 'hidden' : ''}><label>${k === 'to' ? 'To' : k === 'cc' ? 'Cc' : 'Bcc'}</label>
        <div class="ol-rcp" data-rk="${k}"><span class="ol-chips"></span><input data-rin="${k}" autocomplete="off" placeholder="${k === 'to' ? 'Add recipients' : ''}"></div>
        ${k === 'to' ? `<button class="ol-cclink" data-cmd="c:showCc">Cc</button><button class="ol-cclink" data-cmd="c:showBcc">Bcc</button>` : ''}</div>`).join('')}
      <div class="ol-crow"><input id="cSubj" class="ol-csubj" placeholder="Add a subject" value="${esc(subject)}"></div>
      <div class="ol-catts" id="catts"></div>
      <div class="ol-editor" id="ed" contenteditable="true" spellcheck="true" aria-label="Message body">${initial}</div>
      ${ref ? `<div class="ol-orig">${ic(mode === 'forward' ? 'forward' : 'reply', 14)} ${mode === 'forward' ? 'The original email and its attachments are forwarded' : 'The earlier conversation is included below your reply'} when you send.</div>` : ''}
      <input type="file" id="cFile" multiple hidden>
    </div>`;
    const ed = host.querySelector('#ed');
    c.el = host.querySelector('.ol-comp'); c.ed = ed;
    c.exec = (cmd, val = null) => {
      ed.focus();
      if (c.range) { const s = getSelection(); s.removeAllRanges(); s.addRange(c.range); }
      if (cmd === 'hiliteColor' && !document.queryCommandSupported?.('hiliteColor')) cmd = 'backColor';
      document.execCommand('styleWithCSS', false, cmd === 'hiliteColor' || cmd === 'foreColor');
      document.execCommand(cmd, false, val);
      c.dirty = true;
    };
    c.insert = (html) => c.exec('insertHTML', html);
    document.addEventListener('selectionchange', c.onSel = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) c.range = s.getRangeAt(0).cloneRange(); });
    ed.addEventListener('input', () => { c.dirty = true; });
    host.querySelector('#cSubj').oninput = () => { c.dirty = true; };
    host.querySelector('#cFrom').onchange = async (e) => {
      if (c.draftId) { await callFn('comms', { action: 'mx', op: 'delete', mailbox: c.box, ids: [c.draftId] }).catch(() => {}); c.draftId = null; }
      c.box = e.target.value;
      const sig = ed.querySelector('.gi-sig'); if (sig) sig.outerHTML = sigHTML(addrOf(c.box));
      c.dirty = true;
    };
    host.querySelector('#cFile').onchange = async (e) => {
      for (const f of [...e.target.files]) {
        if (c.atts.reduce((n, a) => n + (a.size || 0), 0) + f.size > 3 * 1048576) { toast(`${f.name} is too large. Attachments are limited to about 3 MB in total; share bigger files with a OneDrive link.`, true); continue; }
        c.atts.push({ name: f.name, size: f.size, contentType: f.type || 'application/octet-stream', contentBytes: await toB64(f) });
      }
      e.target.value = ''; c.dirty = true; drawAtts();
    };
    const drawAtts = () => {
      host.querySelector('#catts').innerHTML = c.atts.map((a, i) => `<span class="ol-catt"><span class="ol-atti" style="background:${attColor(a.name)}">${esc((a.name.split('.').pop() || '').slice(0, 4).toUpperCase())}</span>${esc(a.name)} <small>${kb(a.size || 0)}</small><button data-rmatt="${i}" title="Remove">${ic('x', 12)}</button></span>`).join('');
    };
    c.drawAtts = drawAtts;
    host.querySelector('#catts').onclick = (e) => { const b = e.target.closest('[data-rmatt]'); if (!b) return; const [a] = c.atts.splice(+b.dataset.rmatt, 1); if (a.id) c.removed.push(a.id); c.dirty = true; drawAtts(); };
    drawAtts();
    ['to', 'cc', 'bcc'].forEach((k) => wireRecipients(c, host, k));
    c.timer = setInterval(() => { if (comp === c && c.dirty && document.contains(c.el)) saveDraft(c, true).catch(() => {}); }, 45000);
    tab = 'message'; drawRibbon();
    setTimeout(() => {
      if (!c.rcp.to.length && mode !== 'reply' && mode !== 'replyAll') host.querySelector('[data-rin="to"]').focus();
      else { ed.focus(); const r = document.createRange(); r.setStart(ed, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
      if (inline) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function wireRecipients(c, host, k) {
    const wrap = host.querySelector(`[data-rk="${k}"]`), inp = wrap.querySelector('input'), chips = wrap.querySelector('.ol-chips');
    const draw = () => { chips.innerHTML = c.rcp[k].map((a, i) => { const ct = contactsByEmail[a.toLowerCase()]; return `<span class="ol-chip ${EMAIL_RE.test(a) ? '' : 'bad'}" title="${esc(a)}">${avatar(ct?.full_name, a, 18)}${esc(ct?.full_name || a)}<button data-rm="${i}" aria-label="Remove">${ic('x', 11)}</button></span>`; }).join(''); };
    const add = (v) => { v.split(/[,;\s]+/).map((x) => x.trim().replace(/^<|>$/g, '')).filter(Boolean).forEach((a) => { if (!c.rcp[k].some((x) => x.toLowerCase() === a.toLowerCase())) c.rcp[k].push(a); }); inp.value = ''; c.dirty = true; draw(); closeAc(); };
    let ac = null, acIdx = 0, acList = [], t;
    const closeAc = () => { ac?.remove(); ac = null; };
    const showAc = () => {
      closeAc(); if (!acList.length) return;
      ac = document.createElement('div'); ac.className = 'ol-ac';
      ac.innerHTML = acList.map((p, i) => `<button data-ai="${i}" class="${i === acIdx ? 'on' : ''}">${avatar(p.name, p.email, 26)}<span><b>${esc(p.name || p.email)}</b><small>${esc(p.email)}${p.kind ? ' · ' + p.kind : ''}</small></span></button>`).join('');
      wrap.appendChild(ac);
      ac.onmousedown = (e) => { e.preventDefault(); const b = e.target.closest('[data-ai]'); if (b) { add(acList[+b.dataset.ai].email); inp.focus(); } };
    };
    inp.oninput = () => {
      clearTimeout(t);
      const q = inp.value.trim();
      if (/[,;]$/.test(inp.value)) return add(inp.value);
      if (q.length < 2) return closeAc();
      t = setTimeout(async () => {
        const w = `%${q.replace(/[%_,()]/g, ' ')}%`;
        const staff = (state.staff || []).filter((s) => s.email && (s.full_name + ' ' + s.email).toLowerCase().includes(q.toLowerCase())).map((s) => ({ name: s.full_name, email: s.email, kind: 'Team' }));
        const { data } = can('crm.view') ? await db.from('contacts').select('full_name, email').not('email', 'is', null).or(`full_name.ilike.${w},email.ilike.${w}`).limit(8) : { data: [] };
        (data || []).forEach((x) => (contactsByEmail[x.email.toLowerCase()] ??= x));
        acList = [...staff, ...(data || []).map((x) => ({ name: x.full_name, email: x.email, kind: 'Client' }))].filter((p, i, a) => a.findIndex((y) => y.email === p.email) === i).slice(0, 8);
        acIdx = 0; showAc();
      }, 180);
    };
    inp.onkeydown = (e) => {
      if (ac && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + acList.length) % acList.length; showAc(); return; }
      if (e.key === 'Enter' || e.key === 'Tab' || e.key === ';' || e.key === ',') {
        if (ac && acList[acIdx]) { e.preventDefault(); add(acList[acIdx].email); return; }
        if (inp.value.trim()) { e.preventDefault(); add(inp.value); }
      }
      if (e.key === 'Backspace' && !inp.value && c.rcp[k].length) { c.rcp[k].pop(); c.dirty = true; draw(); }
      if (e.key === 'Escape') closeAc();
    };
    inp.onblur = () => setTimeout(() => { if (inp.value.trim()) add(inp.value); closeAc(); }, 150);
    chips.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { c.rcp[k].splice(+b.dataset.rm, 1); c.dirty = true; draw(); } };
    wrap.onclick = (e) => { if (e.target === wrap || e.target === chips) inp.focus(); };
    draw();
  }
  const composePayload = (c, send, sendAt) => ({
    action: 'mx', op: 'compose', mailbox: c.box, mode: c.mode, draftId: c.draftId, refId: c.ref?.id || null,
    to: c.rcp.to, cc: c.rcp.cc, bcc: c.rcp.bcc, subject: c.el.querySelector('#cSubj').value.trim(), html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1C2333">${c.ed.innerHTML}</div>`,
    importance: c.importance, readReceipt: c.readReceipt, deliveryReceipt: c.deliveryReceipt, send, sendAt: sendAt || null,
    attachments: c.atts.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, contentBytes: a.contentBytes })), removeAttachments: c.removed,
  });
  async function saveDraft(c, quiet = false) {
    const st = c.el?.querySelector('#csaved'); if (st) st.textContent = 'Saving…';
    const r = await callFn('comms', composePayload(c, false));
    c.draftId = r.draftId; c.removed = []; c.dirty = false;
    // Keep the file contents locally (a reply draft is rebuilt on each save) and take the new ids
    c.atts = r.attachments.map((s) => ({ ...(c.atts.find((a) => a.name === s.name) || {}), id: s.id, name: s.name, size: s.size }));
    c.savedAt = new Date();
    if (st) st.textContent = `Draft saved at ${c.savedAt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`;
    if (!quiet) toast('Draft saved');
    if (curF().wk === 'drafts') load();
  }
  async function sendComposer(sendAt = null) {
    const c = comp; if (!c) return;
    const all = [...c.rcp.to, ...c.rcp.cc, ...c.rcp.bcc];
    const pending = c.el.querySelector('[data-rin="to"]').value.trim(); if (pending) { c.rcp.to.push(pending); }
    if (!c.rcp.to.length && !c.rcp.cc.length && !c.rcp.bcc.length) throw new Error('Add at least one recipient.');
    const bad = [...all, pending].filter(Boolean).filter((a) => !EMAIL_RE.test(a));
    if (bad.length) throw new Error(`Check these addresses: ${bad.join(', ')}`);
    if (!c.el.querySelector('#cSubj').value.trim() && !(await confirmBox('No subject', 'Send this email without a subject?', 'Send'))) return;
    if (/\[[^\]\n]{2,40}\]/.test(c.ed.innerText) && !(await confirmBox('Placeholders left', 'The message still has [placeholders] in square brackets. Send anyway?', 'Send'))) return;
    const btns = c.el.querySelectorAll('.ol-send'); btns.forEach((b) => (b.disabled = true));
    try {
      await callFn('comms', composePayload(c, true, sendAt || c.sendAt));
      const at = sendAt || c.sendAt;
      toast(at ? `Scheduled to send ${fullDate(at)}` : 'Sent');
      c.dirty = false; await closeComposer({ save: false });
      if (['drafts', 'sentitems', 'outbox'].includes(curF().wk)) load();
      if (cur) open(cur);
    } finally { btns.forEach((b) => (b.disabled = false)); }
  }
  async function closeComposer({ save }) {
    const c = comp; if (!c) return;
    clearInterval(c.timer); document.removeEventListener('selectionchange', c.onSel);
    comp = null;
    if (save && c.dirty && (c.ed.innerText.trim().length > 4 || c.rcp.to.length)) {
      try { await saveDraft(c, true); toast('Your draft was saved to Drafts'); } catch (e) { toast(`Draft not saved: ${e.message}`, true); }
    }
    if (c.inline) { c.el.parentElement && (c.el.parentElement.innerHTML = ''); $('#quick')?.removeAttribute('hidden'); }
    else if (document.contains(c.el)) readEmpty();
    if (['message', 'insert', 'format', 'options'].includes(tab)) tab = 'home';
    drawRibbon();
  }
  function scheduleMenu(anchor) {
    const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x; };
    const mon = (() => { const x = new Date(); x.setDate(x.getDate() + ((8 - x.getDay()) % 7 || 7)); x.setHours(8, 0, 0, 0); return x; })();
    const pick = (d) => { comp.sendAt = d.toISOString(); showSched(); return sendComposer(comp.sendAt); };
    menu(anchor, [{ head: 'Schedule send' }, { label: `Tomorrow morning · ${when(at(1, 8))}`, icon: 'clock', run: () => pick(at(1, 8)) }, { label: `Tomorrow afternoon · ${when(at(1, 13))}`, icon: 'clock', run: () => pick(at(1, 13)) },
      { label: `Monday morning · ${mon.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} 8:00 a.m.`, icon: 'clock', run: () => pick(mon) },
      { label: 'Custom time…', icon: 'calendar', run: () => modal({ title: 'Schedule send', body: '<div class="field"><label>Send on</label><input class="input" type="datetime-local" id="sa"></div><p class="dk-muted">Alberta time. Outlook holds the email in your Outbox and sends it then, even if this page is closed.</p>',
        actions: [{ label: 'Cancel' }, { label: 'Schedule', cls: 'btn-primary', onClick: async (m) => { const v = m.querySelector('#sa').value; if (!v) throw new Error('Pick a date and time.'); await pick(new Date(v)); } }] }) },
      ...(comp.sendAt ? ['-', { label: 'Cancel scheduled time', icon: 'x', run: () => { comp.sendAt = null; showSched(); drawRibbon(); } }] : [])]);
  }
  const showSched = () => { const s = comp?.el.querySelector('#sched'); if (!s) return; s.hidden = !comp.sendAt; s.innerHTML = comp.sendAt ? `${ic('clock', 14)} This email will be sent ${esc(fullDate(comp.sendAt))}.` : ''; };

  // ── Commands ──
  const refreshAfter = (ids, mutate) => { list.forEach((m) => { if (ids.includes(m.id)) mutate(m); }); drawList(); bumpCounts(); };
  const removeRows = (ids) => { list = list.filter((m) => !ids.includes(m.id)); if (cur && !list.some((m) => m.id === cur)) { cur = null; readEmpty(); } sel.clear(); drawList(); bumpCounts(); };
  async function moveTo(dest, label) {
    const ids = targetIds(); if (!ids.length) return;
    const r = await mx('move', { ids, destination: dest });
    removeRows(ids); toast(r.failed ? `${ids.length - r.failed} moved, ${r.failed} failed` : `${label} (${ids.length})`);
  }
  async function patch(p, mutate, label) {
    const ids = targetIds(); if (!ids.length) return;
    await mx('patch', { ids, ...p }); refreshAfter(ids, mutate); if (label) toast(label);
  }
  const folderMenuItems = (run) => visibleFolders().filter((f) => fkey(f) !== folder).map((f) => ({ label: `${'  '.repeat(f.depth || 0)}${fname(f)}`, icon: WK[f.wk]?.[1] || 'folder', run: () => run(f) }));
  const respond = (mode, m = latest()) => { if (!m) return; openComposer({ mode, ref: m }); };
  const CMD = {
    new: () => openComposer({ mode: 'new' }),
    newMenu: (a) => menu(a, [{ label: 'Email', icon: 'mail', run: () => openComposer({ mode: 'new' }) }, { label: 'Event', icon: 'calendar', run: () => (location.hash = '#/calendar') },
      ...(can('crm.edit') ? [{ label: 'Client', icon: 'user', run: () => (location.hash = '#/contacts?new=1') }] : []), { label: 'Task', icon: 'todo', run: () => (location.hash = '#/tasks') }]),
    delete: async () => {
      const ids = targetIds(); if (!ids.length) return;
      if (curF().wk === 'deleteditems') {
        if (!(await confirmBox('Delete forever', `Permanently delete ${ids.length} email${ids.length > 1 ? 's' : ''}? You won't be able to get ${ids.length > 1 ? 'them' : 'it'} back from here.`, 'Delete', true))) return;
        await mx('delete', { ids }); removeRows(ids); toast('Deleted');
      } else await moveTo('deleteditems', 'Moved to Deleted Items');
    },
    archive: () => moveTo('archive', 'Archived'),
    reportMenu: (a) => menu(a, curF().wk === 'junkemail' ? [{ label: 'Not junk', icon: 'inbox', run: () => moveTo('inbox', 'Moved to Inbox') }]
      : [{ label: 'Report junk', icon: 'junk', run: () => moveTo('junkemail', 'Moved to Junk Email') }, { label: 'Block sender', icon: 'block', run: blockSender }]),
    sweep: () => {
      const m = latest() || rowOf(cur)?.m; if (!m?.from) return;
      modal({ title: 'Sweep', body: `<p style="margin-bottom:10px">Move all emails from <b>${esc(m.fromName || m.from)}</b> &lt;${esc(m.from)}&gt; in ${esc(fname(curF()))} to Deleted Items.</p>
        <label class="row" style="gap:8px"><input type="checkbox" id="fut"> Also move future emails from this sender (creates an inbox rule)</label>`,
        actions: [{ label: 'Cancel' }, { label: 'Sweep', cls: 'btn-danger', onClick: async (mm) => {
          const r = await mx('sweep', { folder, from: m.from });
          if (mm.querySelector('#fut').checked) await mx('rule_save', { rule: { name: `Sweep: ${m.from}`, from: m.from, moveTo: folders.find((f) => f.wk === 'deleteditems')?.id, stop: true } });
          toast(`${r.moved} email${r.moved === 1 ? '' : 's'} moved to Deleted Items`); cur = null; readEmpty(); load(); bumpCounts();
        } }] });
    },
    moveMenu: (a) => menu(a, [{ head: 'Move to' }, ...folderMenuItems((f) => moveTo(f.id, `Moved to ${fname(f)}`)), '-', { label: 'New folder…', icon: 'plus', run: () => folderForm(null, async (fid) => moveTo(fid, 'Moved')) }]),
    reply: () => respond('reply'), replyAll: () => respond('replyAll'), forward: () => respond('forward'),
    markRead: () => patch({ isRead: true }, (m) => (m.isRead = true), 'Marked as read'),
    markUnread: () => patch({ isRead: false }, (m) => (m.isRead = false), 'Marked as unread'),
    flag: () => patch({ flag: 'flagged' }, (m) => (m.flag = 'flagged'), 'Flagged'),
    flagMenu: (a) => menu(a, [{ label: 'Flag', icon: 'flag', run: CMD.flag }, { label: 'Mark complete', icon: 'receipt', run: () => patch({ flag: 'complete' }, (m) => (m.flag = 'complete'), 'Marked complete') },
      { label: 'Clear flag', icon: 'x', run: () => patch({ flag: 'notFlagged' }, (m) => (m.flag = 'notFlagged'), 'Flag cleared') }]),
    catMenu: async (a) => {
      if (!cats.length) cats = (await mx('categories')).categories;
      const ts = targets(), on = (n) => ts.length && ts.every((r) => r.cats.includes(n));
      menu(a, [{ head: 'Categorize' }, ...cats.map((c) => ({ label: c.name, color: CAT[c.color] || '#8A94A6', on: on(c.name), run: async () => {
        // Toggle the category on every selected email, keeping their other categories
        for (const r of ts) for (const id of r.ids) { const m = list.find((x) => x.id === id); if (!m) continue; m.categories = on(c.name) ? m.categories.filter((x) => x !== c.name) : [...new Set([...m.categories, c.name])]; await mx('patch', { ids: [id], categories: m.categories }); }
        drawList();
        if (cur && thread.length) { thread.forEach((m) => { const l = list.find((x) => x.id === m.id); if (l) m.categories = l.categories; }); drawReader(); }
      } })), '-', { label: 'Clear categories', icon: 'eraser', run: () => patch({ categories: [] }, (m) => (m.categories = []), 'Categories cleared') }]);
    },
    impMenu: (a) => menu(a, [['high', 'High importance'], ['normal', 'Normal'], ['low', 'Low importance']].map(([k, l]) => ({ label: l, icon: k === 'low' ? 'down' : k === 'high' ? 'up' : null, run: () => patch({ importance: k }, (m) => (m.importance = k), `Marked ${l.toLowerCase()}`) }))),
    client: async () => {
      const m = latest() || rowOf(cur)?.m; if (!m) return;
      const c = clientOf(m); if (c) { location.hash = `#/contacts/${c.id}`; return; }
      if (!can('crm.edit')) return;
      const ext = [m.from, ...m.to.map((p) => p.email)].find((x) => x && !/@gracefulimmigration\.ca$/i.test(x)); if (!ext) return toast('There is no outside sender to add.', true);
      const name = ext === m.from ? m.fromName : m.to.find((p) => p.email === ext)?.name;
      const { error } = await db.from('contacts').insert({ full_name: name || ext.split('@')[0], email: ext.toLowerCase(), source: 'email' });
      if (error) throw new Error(error.code === '23505' ? 'A client with this email already exists.' : error.message);
      delete contactsByEmail[ext.toLowerCase()]; await matchContacts([m]); toast('Client added'); drawList(); drawReader();
    },
    print: () => {
      const m = latest(); if (!m) return;
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin allow-modals'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
      document.body.appendChild(f);
      f.srcdoc = `<!doctype html><meta charset="utf-8"><title>${esc(m.subject)}</title><style>body{font:13px/1.5 Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px}hr{border:0;border-top:1px solid #ccc}.h{color:#444;margin-bottom:12px}img{max-width:100%}</style>
        ${thread.filter((x) => !x.isDraft).map((x) => `<h1>${esc(x.subject)}</h1><div class="h"><b>From:</b> ${esc(x.fromName)} &lt;${esc(x.from)}&gt;<br><b>Sent:</b> ${esc(fullDate(x.date))}<br><b>To:</b> ${esc(x.to.map((p) => p.email).join('; '))}${x.cc.length ? `<br><b>Cc:</b> ${esc(x.cc.map((p) => p.email).join('; '))}` : ''}${x.attachments.length ? `<br><b>Attachments:</b> ${esc(x.attachments.map((a) => a.name).join(', '))}` : ''}</div>${x.bodyType === 'html' ? x.body : `<pre>${esc(x.body)}</pre>`}<hr>`).join('')}`;
      f.onload = () => { f.contentWindow.print(); setTimeout(() => f.remove(), 2000); };
    },
    filterMenu: (a) => menu(a, [{ head: 'Filter' }, ...FILTERS.map(([k, l]) => ({ label: l, on: filter === k, run: () => { filter = k; drawTitle(); load(); } })), '-', { head: 'Sort' },
      ...[['newest', 'Newest on top'], ['oldest', 'Oldest on top'], ['from', 'From'], ['subject', 'Subject']].map(([k, l]) => ({ label: l, on: V.order === k, run: () => { V.order = k; applyView(); load(); } }))]),
    clearFilter: () => { filter = 'all'; drawTitle(); load(); },
    sortMenu: (a) => CMD.filterMenu(a),
    empty: async () => {
      const f = curF(); if (!(await confirmBox('Empty folder', `Permanently delete everything in ${fname(f)}?`, 'Empty folder', true))) return;
      const r = await mx('empty', { folder: f.wk }); toast(`${r.deleted} email${r.deleted === 1 ? '' : 's'} deleted`); cur = null; readEmpty(); load(); bumpCounts();
    },
    sync: () => { loadFolders(); load(); },
    clearSel: () => { sel.clear(); drawList(); },
    back: () => { root.classList.remove('reading'); },
    folderNew: () => folderForm(null),
    shortcuts: () => modal({ title: 'Keyboard shortcuts', body: `<table class="t ol-keys"><tbody>${[['N', 'New email'], ['R', 'Reply'], ['Shift + R or A', 'Reply all'], ['Shift + F or F', 'Forward'], ['Delete', 'Delete'], ['E', 'Archive'], ['Q', 'Mark as read'], ['U', 'Mark as unread'], ['I', 'Flag'], ['J or ↓', 'Next email'], ['K or ↑', 'Previous email'], ['X', 'Select the open email'], ['/', 'Search'], ['Ctrl + Enter', 'Send (while writing)'], ['Esc', 'Close menus']]
      .map(([k, l]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(l)}</td></tr>`).join('')}</tbody></table>` }),
    guide: () => (location.hash = '#/guide'),
    owa: () => window.open('https://outlook.office.com/mail/', '_blank', 'noopener'),
    autoreply: autoReplies, rules: rulesDialog,
    cats: async () => { if (!cats.length) cats = (await mx('categories')).categories; modal({ title: 'Categories', body: `<p class="dk-muted" style="margin-bottom:10px">Categories come from Outlook. Add or rename them in Outlook on the web (Settings → Mail → Categories).</p><div class="ol-catlist">${cats.map((c) => `<span class="ol-cat big" style="--c:${CAT[c.color] || '#8A94A6'}">${esc(c.name)}</span>`).join('')}</div>` }); },
    signature: () => modal({ title: 'Signature', body: `<p class="dk-muted" style="margin-bottom:10px">Added to new emails and replies written here. It uses your name and job title from <a href="#/account">My profile</a> and the business details in Business Settings.</p><div class="ol-sigbox">${sigHTML(addrOf(box))}</div>` }),
    // composer
    'c:send': () => sendComposer(), 'c:sendMenu': (a) => scheduleMenu(a),
    'c:save': () => comp && saveDraft(comp),
    'c:discard': async () => {
      const c = comp; if (!c) return;
      if ((c.dirty || c.draftId) && !(await confirmBox('Discard', 'Discard this draft?', 'Discard', true))) return;
      if (c.draftId) await callFn('comms', { action: 'mx', op: 'delete', mailbox: c.box, ids: [c.draftId] }).catch(() => {});
      c.dirty = false; await closeComposer({ save: false });
      if (curF().wk === 'drafts') load();
    },
    'c:discardClose': () => CMD['c:discard'](),
    'c:attach': () => comp?.el.querySelector('#cFile').click(),
    'c:sig': () => comp?.insert(sigHTML(addrOf(comp.box))),
    'c:tpl': (a) => menu(a, EMAIL_TEMPLATES.slice(1).map(([s, l, b]) => ({ label: l, icon: 'draft', run: async () => {
      const c = comp; if (!c) return;
      const first = (contactsByEmail[(c.rcp.to[0] || '').toLowerCase()]?.full_name || '').split(' ')[0] || 'there';
      if (c.ed.innerText.trim().length > 40 && !(await confirmBox('Use template', 'Replace what you have written with this template? Your signature stays.', 'Replace'))) return;
      const subj = c.el.querySelector('#cSubj'); if (!subj.value.trim() || !c.ref) subj.value = s;
      c.ed.innerHTML = b.replace(/\{first\}/g, first).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') + sigHTML(addrOf(c.box));
      c.dirty = true;
    } }))),
    'c:imp:high': () => { comp.importance = comp.importance === 'high' ? 'normal' : 'high'; comp.dirty = true; drawRibbon(); },
    'c:imp:low': () => { comp.importance = comp.importance === 'low' ? 'normal' : 'low'; comp.dirty = true; drawRibbon(); },
    'c:showCc': () => { comp.showCc = true; comp.el.querySelector('#row-cc').hidden = false; comp.el.querySelector('[data-rin="cc"]').focus(); drawRibbon(); },
    'c:showBcc': () => { comp.showBcc = true; comp.el.querySelector('#row-bcc').hidden = false; comp.el.querySelector('[data-rin="bcc"]').focus(); drawRibbon(); },
    'c:rr': () => { comp.readReceipt = !comp.readReceipt; comp.dirty = true; drawRibbon(); },
    'c:dr': () => { comp.deliveryReceipt = !comp.deliveryReceipt; comp.dirty = true; drawRibbon(); },
    'c:link': () => {
      const c = comp, txt = String(getSelection() || '');
      modal({ title: 'Insert link', body: `<div class="field"><label>Web address</label><input class="input" id="lu" placeholder="https://"></div><div class="field"><label>Text to show</label><input class="input" id="lt" value="${esc(txt)}"></div>`,
        actions: [{ label: 'Cancel' }, { label: 'Insert', cls: 'btn-primary', onClick: (m) => {
          let u = m.querySelector('#lu').value.trim(); if (!u) throw new Error('Enter the web address.');
          if (!/^(https?:|mailto:|tel:)/i.test(u)) u = (u.includes('@') && !u.includes('/') ? 'mailto:' : 'https://') + u;
          c.insert(`<a href="${esc(u)}">${esc(m.querySelector('#lt').value.trim() || u)}</a>&nbsp;`);
        } }] });
    },
    'c:table': () => comp.insert(`<table style="border-collapse:collapse;width:100%;margin:6px 0">${Array.from({ length: 3 }, (_, r) => `<tr>${Array.from({ length: 3 }, () => `<td style="border:1px solid #D0D5DD;padding:6px 8px;${r === 0 ? 'background:#F2F4F7;font-weight:600' : ''}">&nbsp;</td>`).join('')}</tr>`).join('')}</table><p><br></p>`),
    'c:hr': () => comp.insert('<hr style="border:0;border-top:1px solid #D0D5DD;margin:12px 0"><p><br></p>'),
    'c:date': () => comp.insert(esc(new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))),
    'c:emoji': (a) => {
      document.querySelector('.ol-menu')?.remove();
      const d = document.createElement('div'); d.className = 'ol-menu ol-emoji';
      d.innerHTML = ['😀', '🙂', '😊', '😉', '😍', '🤝', '👍', '👏', '🙏', '💪', '🎉', '✅', '☑️', '❗', '❓', '📌', '📎', '📄', '📅', '⏰', '📞', '✉️', '💼', '🏠', '🍁', '🇨🇦', '✈️', '🎓', '❤️', '⭐', '➡️', '⚠️'].map((x) => `<button data-e="${x}">${x}</button>`).join('');
      document.body.appendChild(d); const r = a.getBoundingClientRect(); d.style.top = `${r.bottom + 4}px`; d.style.left = `${Math.min(r.left, innerWidth - 250)}px`;
      d.onmousedown = (e) => { e.preventDefault(); const b = e.target.closest('[data-e]'); if (b) { comp?.insert(b.dataset.e); d.remove(); } };
      setTimeout(() => document.addEventListener('mousedown', function out(e) { if (!d.contains(e.target)) { d.remove(); document.removeEventListener('mousedown', out); } }));
    },
  };
  async function blockSender() {
    const m = latest() || rowOf(cur)?.m; if (!m?.from) return;
    if (!(await confirmBox('Block sender', `Block ${m.from}? Their emails will go straight to Junk Email (an inbox rule is created).`, 'Block', true))) return;
    await mx('rule_save', { rule: { name: `Blocked: ${m.from}`, from: m.from, moveTo: folders.find((f) => f.wk === 'junkemail')?.id, stop: true } });
    await moveTo('junkemail', 'Sender blocked · moved to Junk Email');
  }
  function folderForm(f, then) {
    modal({ title: f ? `Rename ${fname(f)}` : 'New folder', body: `<div class="field"><label>Folder name</label><input class="input" id="fn" value="${esc(f ? f.name : '')}"></div>
      ${f ? '' : `<div class="field"><label>Inside</label><select class="input" id="fpar"><option value="">Top level</option>${visibleFolders().filter((x) => (x.depth || 0) < 1).map((x) => `<option value="${esc(x.id)}">${esc(fname(x))}</option>`).join('')}</select></div>`}`,
      actions: [{ label: 'Cancel' }, { label: f ? 'Rename' : 'Create', cls: 'btn-primary', onClick: async (m) => {
        const name = m.querySelector('#fn').value.trim(); if (!name) throw new Error('Name the folder.');
        if (f) await mx('folder_rename', { id: f.id, name });
        else { const r = await mx('folder_create', { name, parentId: m.querySelector('#fpar').value || null }); if (then) await then(r.folder.id); }
        toast(f ? 'Folder renamed' : 'Folder created'); loadFolders();
      } }] });
  }
  function folderMenu(anchor, key) {
    const f = folders.find((x) => fkey(x) === key); if (!f) return;
    const isFav = fav.includes(key), custom = !f.wk;
    menu(anchor, [{ head: fname(f) }, { label: isFav ? 'Remove from Favourites' : 'Add to Favourites', icon: 'star', run: () => { fav = isFav ? fav.filter((x) => x !== key) : [...fav, key]; try { localStorage.setItem('gi_mail_fav', JSON.stringify(fav)); } catch { /* private */ } drawFolders(); } },
      { label: 'Mark all as read', icon: 'open', run: async () => {
        let n = 0;
        for (let i = 0; i < 5; i++) { const r = await mx('list', { folder: key, filter: 'unread' }); if (!r.messages.length) break; await mx('patch', { ids: r.messages.map((m) => m.id), isRead: true }); n += r.messages.length; if (r.messages.length < 40) break; }
        toast(`${n} marked as read`); if (key === folder) load(); loadFolders();
      } },
      { label: 'Create subfolder', icon: 'plus', run: () => modal({ title: `New folder in ${fname(f)}`, body: '<div class="field"><label>Folder name</label><input class="input" id="fn"></div>',
        actions: [{ label: 'Cancel' }, { label: 'Create', cls: 'btn-primary', onClick: async (m) => { const name = m.querySelector('#fn').value.trim(); if (!name) throw new Error('Name the folder.'); await mx('folder_create', { name, parentId: f.id }); toast('Folder created'); loadFolders(); } }] }) },
      ...(custom ? [{ label: 'Rename', icon: 'pen', run: () => folderForm(f) }, { label: 'Delete folder', icon: 'trash', run: async () => {
        if (!(await confirmBox('Delete folder', `Delete the folder "${f.name}" and move it to Deleted Items?`, 'Delete', true))) return;
        await mx('folder_delete', { id: f.id }); toast('Folder deleted'); if (folder === key) { folder = 'inbox'; load(); } loadFolders();
      } }] : []),
      ...(['deleteditems', 'junkemail'].includes(f.wk) ? ['-', { label: 'Empty folder', icon: 'trash', run: async () => { folder = key; await CMD.empty(); } }] : [])]);
  }

  // ── Settings dialogs ──
  async function autoReplies() {
    let s;
    try { s = (await mx('autoreply_get')).settings; } catch (e) { return fail(e); }
    const strip = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    const local = (d) => (d ? d.slice(0, 16) : '');
    modal({ title: `Automatic replies · ${addrOf(box)}`, wide: true,
      body: `<label class="ol-switch"><input type="checkbox" id="arOn" ${s.status !== 'disabled' ? 'checked' : ''}><span></span> Turn on automatic replies</label>
        <div id="arBody">
          <label class="row" style="gap:8px;margin:12px 0 6px"><input type="checkbox" id="arSch" ${s.status === 'scheduled' ? 'checked' : ''}> Send replies only during a time period</label>
          <div class="row-2" id="arTimes"><div class="field"><label>Start</label><input class="input" type="datetime-local" id="arS" value="${local(s.start)}"></div><div class="field"><label>End</label><input class="input" type="datetime-local" id="arE" value="${local(s.end)}"></div></div>
          <div class="field"><label>Reply to people in the company</label><textarea class="input" id="arI" rows="4">${esc(strip(s.internal))}</textarea></div>
          <div class="field"><label>Reply to people outside the company (clients)</label><select class="input" id="arA"><option value="all" ${s.audience === 'all' ? 'selected' : ''}>Send to everyone outside</option><option value="contactsOnly" ${s.audience === 'contactsOnly' ? 'selected' : ''}>Only to my Outlook contacts</option><option value="none" ${s.audience === 'none' ? 'selected' : ''}>Don't reply outside the company</option></select></div>
          <div class="field"><textarea class="input" id="arX" rows="5" placeholder="e.g. Thank you for your email. I am out of the office until … For urgent matters call (403) 915-4230.">${esc(strip(s.external))}</textarea></div>
        </div><p class="dk-muted">Times are Alberta time.</p>`,
      onOpen: (m) => { const sync = () => { m.querySelector('#arBody').style.opacity = m.querySelector('#arOn').checked ? 1 : 0.5; m.querySelector('#arTimes').hidden = !m.querySelector('#arSch').checked; }; m.querySelector('#arOn').onchange = sync; m.querySelector('#arSch').onchange = sync; sync(); },
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const on = m.querySelector('#arOn').checked, sch = m.querySelector('#arSch').checked;
        const html = (t) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
        await mx('autoreply_set', { status: !on ? 'disabled' : sch ? 'scheduled' : 'alwaysEnabled', audience: m.querySelector('#arA').value, internal: html(m.querySelector('#arI').value), external: html(m.querySelector('#arX').value),
          start: m.querySelector('#arS').value ? m.querySelector('#arS').value + ':00' : '', end: m.querySelector('#arE').value ? m.querySelector('#arE').value + ':00' : '' });
        toast(on ? 'Automatic replies are on' : 'Automatic replies are off');
      } }] });
  }
  async function rulesDialog() {
    let rs;
    try { rs = (await mx('rules')).rules; } catch (e) { return fail(e); }
    if (!cats.length) cats = await mx('categories').then((r) => r.categories).catch(() => []);
    const desc = (r) => {
      const c = r.conditions, a = r.actions, f = (id) => fname(folders.find((x) => x.id === id) || { name: 'a folder' });
      const when_ = [c.senderContains?.length && `sender contains ${c.senderContains.join(', ')}`, c.fromAddresses?.length && `from ${c.fromAddresses.map((x) => x.emailAddress?.address).join(', ')}`, c.subjectContains?.length && `subject contains ${c.subjectContains.join(', ')}`, c.bodyContains?.length && `body contains ${c.bodyContains.join(', ')}`].filter(Boolean).join(' and ') || 'any email';
      const then_ = [a.moveToFolder && `move to ${f(a.moveToFolder)}`, a.markAsRead && 'mark as read', a.markImportance && `mark ${a.markImportance} importance`, a.assignCategories?.length && `categorize ${a.assignCategories.join(', ')}`, a.delete && 'delete'].filter(Boolean).join(', ') || 'do nothing';
      return `When ${when_}: ${then_}`;
    };
    const mm = modal({ title: `Inbox rules · ${addrOf(box)}`, wide: true,
      body: `<div class="ol-rules">${rs.map((r) => `<div class="ol-rulei"><label class="ol-switch sm"><input type="checkbox" data-tog="${esc(r.id)}" ${r.enabled ? 'checked' : ''}><span></span></label><div><b>${esc(r.name)}</b><small>${esc(desc(r))}</small></div><button class="btn btn-sm btn-ghost" data-del="${esc(r.id)}" title="Delete rule">${ic('trash', 14)}</button></div>`).join('') || '<div class="dk-muted" style="padding:12px 0">No rules yet.</div>'}</div>
        <details class="ol-newrule"><summary>${ic('plus', 14)} Add a rule</summary>
          <div class="field"><label>Name</label><input class="input" id="rN" placeholder="e.g. IRCC emails"></div>
          <div class="row-2"><div class="field"><label>Sender contains</label><input class="input" id="rF" placeholder="e.g. cic.gc.ca"></div><div class="field"><label>Subject contains</label><input class="input" id="rS" placeholder="Separate words with commas"></div></div>
          <div class="row-2"><div class="field"><label>Move to</label><select class="input" id="rM"><option value="">Don't move</option>${visibleFolders().map((f) => `<option value="${esc(f.id)}">${esc('  '.repeat(f.depth || 0) + fname(f))}</option>`).join('')}</select></div>
            <div class="field"><label>Categorize</label><select class="input" id="rC"><option value="">No category</option>${cats.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></div></div>
          <div class="row" style="gap:16px;flex-wrap:wrap"><label class="row" style="gap:6px"><input type="checkbox" id="rR"> Mark as read</label><label class="row" style="gap:6px"><input type="checkbox" id="rI"> Mark high importance</label><label class="row" style="gap:6px"><input type="checkbox" id="rX" checked> Stop processing more rules</label></div>
          <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn btn-primary" id="rSave">Save rule</button></div></details>`,
      actions: [{ label: 'Close' }] });
    const m = mm.el;
    m.querySelectorAll('[data-tog]').forEach((t) => (t.onchange = () => mx('rule_toggle', { id: t.dataset.tog, enabled: t.checked }).then(() => toast(t.checked ? 'Rule on' : 'Rule off')).catch(fail)));
    m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!(await confirmBox('Delete rule', 'Delete this rule?', 'Delete', true))) return; await mx('rule_delete', { id: b.dataset.del }).catch(fail); mm.close(); rulesDialog(); }));
    m.querySelector('#rSave').onclick = async () => {
      try {
        await mx('rule_save', { rule: { name: m.querySelector('#rN').value, from: m.querySelector('#rF').value, subject: m.querySelector('#rS').value, moveTo: m.querySelector('#rM').value || null,
          category: m.querySelector('#rC').value || null, markRead: m.querySelector('#rR').checked, importance: m.querySelector('#rI').checked ? 'high' : null, stop: m.querySelector('#rX').checked } });
        toast('Rule saved'); mm.close(); rulesDialog();
      } catch (e) { fail(e); }
    };
  }

  // ── Events ──
  root.addEventListener('mousedown', (e) => { if (e.target.closest('[data-keep]')) e.preventDefault(); }); // keep the editor selection
  root.addEventListener('click', (e) => {
    const t = e.target;
    const cmdEl = t.closest('[data-cmd]');
    if (cmdEl && !cmdEl.disabled) {
      const cmd = cmdEl.dataset.cmd, [name, arg] = /^(layout|density|toggle|zoom):/.test(cmd) ? cmd.split(':') : [cmd];
      if (name === 'layout') { V.layout = arg; applyView(); return drawRibbon(); }
      if (name === 'density') { V.density = arg; applyView(); return drawRibbon(); }
      if (name === 'toggle') { V[arg] = !V[arg]; applyView(); if (arg === 'convo' || arg === 'focused') { drawTitle(); load(); } else drawList(); return drawRibbon(); }
      if (name === 'zoom') { V.zoom = +arg === 0 ? 100 : Math.max(70, Math.min(160, V.zoom + +arg)); applyView(); drawRibbon(); if (thread.length && !comp?.inline) drawReader(); return; }
      if (name.startsWith('x:')) {
        const x = name.slice(2);
        if (x === 'h') return comp?.exec('formatBlock', 'H3');
        if (x === 'p') return comp?.exec('formatBlock', 'P');
        if (x === 'quote') return comp?.exec('formatBlock', 'BLOCKQUOTE');
        return comp?.exec(x);
      }
      const fn = CMD[name];
      if (fn) Promise.resolve(fn(cmdEl)).catch(fail);
      return;
    }
    const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; return drawRibbon(); }
    const fm = t.closest('[data-fm]'); if (fm) { e.stopPropagation(); return folderMenu(fm, fm.dataset.fm); }
    const fb = t.closest('[data-f]');
    if (fb) { folder = fb.dataset.f; searchAll = false; cur = null; sel.clear(); filter = 'all'; root.classList.remove('fp-open'); readEmptyIfNotComposing(); drawFolders(); drawTitle(); return load(); }
    const ab = t.closest('[data-b]');
    if (ab) { if (ab.dataset.b === box) return; box = ab.dataset.b; sessionStorage.setItem('gi_mail_box', box); folder = 'inbox'; cur = null; sel.clear(); cats = []; readEmptyIfNotComposing(); loadFolders(); return load(); }
    const fc = t.closest('[data-focus]'); if (fc) { focus = fc.dataset.focus; drawTitle(); return load(); }
    if (t.closest('#more')) return load(true);
    const ck = t.closest('[data-ck]');
    if (ck) {
      const k = ck.dataset.ck;
      if (e.shiftKey && lastAnchor) { const a = rows.findIndex((r) => r.key === lastAnchor), b = rows.findIndex((r) => r.key === k); rows.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((r) => sel.add(r.key)); }
      else ck.checked ? sel.add(k) : sel.delete(k);
      lastAnchor = k; return drawList();
    }
    const q = t.closest('[data-q]');
    if (q) {
      e.stopPropagation();
      const r = rowOf(q.closest('[data-id]').dataset.id), ids = r.ids;
      if (q.dataset.q === 'del') return (curF().wk === 'deleteditems' ? mx('delete', { ids }) : mx('move', { ids, destination: 'deleteditems' })).then(() => { removeRows(ids); toast('Deleted'); }).catch(fail);
      if (q.dataset.q === 'read') return mx('patch', { ids, isRead: r.unread }).then(() => refreshAfter(ids, (m) => (m.isRead = r.unread))).catch(fail);
      if (q.dataset.q === 'flag') return mx('patch', { ids: [r.m.id], flag: r.flagged ? 'notFlagged' : 'flagged' }).then(() => refreshAfter(ids, (m) => (m.flag = r.flagged ? 'notFlagged' : (m.id === r.m.id ? 'flagged' : m.flag)))).catch(fail);
    }
    const it = t.closest('.ol-item');
    if (it && !t.closest('.ol-ck')) {
      if (e.ctrlKey || e.metaKey) { sel.has(it.dataset.id) ? sel.delete(it.dataset.id) : sel.add(it.dataset.id); lastAnchor = it.dataset.id; return drawList(); }
      return open(it.dataset.id);
    }
    const tog = t.closest('[data-toggle]');
    if (tog && !t.closest('.ol-macts')) { const art = tog.closest('.ol-msg'); art.classList.toggle('open'); const m = thread.find((x) => x.id === art.dataset.mid); art.outerHTML = msgHTML(m, art.classList.contains('open')); const n = $(`.ol-msg[data-mid="${CSS.escape(m.id)}"]`); if (n.classList.contains('open')) mountBody(n); return; }
    const ma = t.closest('[data-mact]');
    if (ma) {
      const m = thread.find((x) => x.id === ma.closest('.ol-msg').dataset.mid);
      if (ma.dataset.mact === 'more') return menu(ma, [{ label: 'Reply', icon: 'reply', run: () => respond('reply', m) }, { label: 'Reply all', icon: 'replyAll', run: () => respond('replyAll', m) }, { label: 'Forward', icon: 'forward', run: () => respond('forward', m) }, '-',
        { label: m.flag === 'flagged' ? 'Clear flag' : 'Flag', icon: 'flag', run: () => mx('patch', { ids: [m.id], flag: m.flag === 'flagged' ? 'notFlagged' : 'flagged' }).then(() => { m.flag = m.flag === 'flagged' ? 'notFlagged' : 'flagged'; drawReader(); }) },
        { label: 'Mark as unread', icon: 'mail', run: () => mx('patch', { ids: [m.id], isRead: false }).then(() => refreshAfter([m.id], (x) => (x.isRead = false))) },
        { label: 'Delete this message', icon: 'trash', run: () => mx('move', { ids: [m.id], destination: 'deleteditems' }).then(() => { thread = thread.filter((x) => x.id !== m.id); list = list.filter((x) => x.id !== m.id); thread.length ? drawReader() : readEmpty(); drawList(); bumpCounts(); }) },
        { label: 'Print', icon: 'print', run: CMD.print }, ...(m.webLink ? [{ label: 'Open in Outlook', icon: 'ext', run: () => window.open(m.webLink, '_blank', 'noopener') }] : [])]);
      return respond(ma.dataset.mact, m);
    }
    const at = t.closest('[data-att]'); if (at) return attachment(at.dataset.attm, at.dataset.att).catch(fail);
    const aa = t.closest('[data-allatt]');
    if (aa) { const m = thread.find((x) => x.id === aa.dataset.allatt); return (async () => { for (const a of m.attachments) await attachment(m.id, a.id, true); })().catch(fail); }
    if (t.closest('#fpBtn')) root.classList.toggle('fp-open');
  });
  // Switching folder or mailbox keeps a new email open, but closes (and saves) a reply.
  const readEmptyIfNotComposing = () => { if (comp && !comp.inline) return; if (comp) closeComposer({ save: true }); readEmpty(); };
  $('#selAll').onchange = (e) => { if (e.target.checked) rows.forEach((r) => sel.add(r.key)); else sel.clear(); drawList(); };
  $('#filterBtn').onclick = (e) => CMD.filterMenu(e.currentTarget);
  $('#scope').onclick = () => { searchAll = !searchAll; drawTitle(); if (search) load(); };
  let qt;
  $('#q').oninput = (e) => { clearTimeout(qt); $('#qx').hidden = !e.target.value; qt = setTimeout(() => { search = e.target.value.trim(); cur = null; sel.clear(); drawTitle(); drawFolders(); load(); }, 400); };
  $('#q').onkeydown = (e) => { if (e.key === 'Escape') $('#qx').click(); };
  $('#qx').onclick = () => { $('#q').value = ''; $('#qx').hidden = true; search = ''; searchAll = false; drawTitle(); drawFolders(); load(); };

  // Keyboard shortcuts (Outlook on the web style)
  const onKey = (e) => {
    if (!el.isConnected) return document.removeEventListener('keydown', onKey);
    if (comp && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); return sendComposer().catch(fail); }
    const tg = e.target;
    if (document.querySelector('.overlay') || tg.closest?.('input,textarea,select,[contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, idx = rows.findIndex((r) => r.key === cur), go = (d) => { const n = rows[Math.max(0, Math.min(rows.length - 1, (idx < 0 ? -d : idx) + d))]; if (n) { open(n.key); el.querySelector(`.ol-item[data-id="${CSS.escape(n.key)}"]`)?.scrollIntoView({ block: 'nearest' }); } };
    const map = { n: CMD.new, r: () => (e.shiftKey ? CMD.replyAll() : CMD.reply()), R: CMD.replyAll, a: CMD.replyAll, f: CMD.forward, F: CMD.forward, Delete: CMD.delete, e: CMD.archive, q: CMD.markRead, u: CMD.markUnread, i: CMD.flag,
      j: () => go(1), ArrowDown: () => go(1), k: () => go(-1), ArrowUp: () => go(-1), x: () => { if (cur) { sel.has(cur) ? sel.delete(cur) : sel.add(cur); drawList(); } }, '/': () => $('#q').focus() };
    const fn = map[k]; if (!fn) return;
    e.preventDefault(); Promise.resolve(fn()).catch(fail);
  };
  document.addEventListener('keydown', onKey);
  // Save an unfinished email as a draft when leaving the page
  const onLeave = () => { if (comp?.dirty) closeComposer({ save: true }); if (!el.isConnected || !location.hash.startsWith('#/email')) { window.removeEventListener('hashchange', onLeave); document.removeEventListener('keydown', onKey); } };
  window.addEventListener('hashchange', onLeave);

  // New mail check every minute (Inbox, top of the list)
  const poll = setInterval(async () => {
    if (!el.isConnected) return clearInterval(poll);
    if (document.hidden || search || loading) return;
    loadFolders();
    if (curF().wk !== 'inbox' || V.order !== 'newest' || filter !== 'all') return;
    try {
      const r = await mx('list', { folder, focus: V.focused ? focus : '' });
      const fresh = r.messages.filter((m) => !list.some((x) => x.id === m.id) && new Date(m.date) > new Date(list[0]?.date || 0));
      if (!fresh.length) return;
      await matchContacts(fresh);
      list = [...fresh, ...list]; drawList();
      const u = fresh.filter((m) => !m.isRead);
      if (u.length) toast(u.length === 1 ? `✉️ New email from ${u[0].fromName || u[0].from}: ${u[0].subject}` : `✉️ ${u.length} new emails`);
    } catch { /* try again next minute */ }
  }, 60000);

  readEmpty(); drawRibbon(); drawFolders(); drawTitle();
  loadFolders(); load();
  mx('categories').then((r) => { cats = r.categories; drawList(); }).catch(() => {});
}
