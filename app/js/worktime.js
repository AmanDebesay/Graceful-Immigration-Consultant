// Work Time tracker: counts only the seconds when the dashboard is actually being worked in —
// the tab is on screen and focused, and the person moved the mouse, clicked, scrolled or typed in the last 5 minutes.
// Minimized, another tab or app in front, or idle = not counted. Totals are sent about once a minute (work_ping).
import { db } from './core.js';

const IDLE_MS = 5 * 60 * 1000;
let started = false;

function device() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${br}`;
}

export function startWorkTimer() {
  if (started) return;
  started = true;
  const id = crypto.randomUUID(), pages = {};
  let active = 0, sent = -1, lastInput = Date.now(), busy = false;
  const touch = () => { lastInput = Date.now(); };
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'pointerdown']) window.addEventListener(ev, touch, { passive: true, capture: true });
  window.addEventListener('focus', touch);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touch(); else ping(); });

  const page = () => (document.title.split(' · ')[0] || 'Dashboard').slice(0, 60);
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus() || Date.now() - lastInput > IDLE_MS) return;
    active += 1;
    const p = page(); pages[p] = (pages[p] || 0) + 1;
  }, 1000);

  async function ping() {
    if (busy || active === sent) return;
    busy = true;
    const now = active;
    try {
      const { error } = await db.rpc('work_ping', { p_id: id, p_active: now, p_pages: pages, p_device: device() });
      if (!error) sent = now;
    } catch { /* offline: the next ping sends the running total */ }
    busy = false;
  }
  sent = -1; ping();            // creates the visit right away (records the sign-in)
  setInterval(ping, 60 * 1000);
  window.addEventListener('pagehide', ping);
}
