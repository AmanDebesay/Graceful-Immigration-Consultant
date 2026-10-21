import { db, esc, icon, fmtDateTime, timeAgo } from '../core.js';

export async function render(el) {
  const { data, error } = await db.from('newsletter_subscribers').select('*').order('created_at', { ascending: false });
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const active = data.filter((s) => !s.unsubscribed_at);
  el.innerHTML = `
    <div class="grid g-3" style="margin-bottom:18px">
      <div class="card kpi"><div class="kpi-ico gold">${icon('mail')}</div><div><small>Subscribed</small><b>${active.length}</b></div></div>
      <div class="card kpi"><div class="kpi-ico">${icon('trend')}</div><div><small>Joined last 30 days</small><b>${data.filter((s) => Date.now() - new Date(s.created_at) < 30 * 86400000).length}</b></div></div>
      <div class="card kpi"><div class="kpi-ico red">${icon('x')}</div><div><small>Unsubscribed</small><b>${data.length - active.length}</b></div></div>
    </div>
    <div class="alert info">Every subscriber gave express consent on the website, with the wording and time recorded below, as Canada's anti-spam law (CASL) requires. Sending campaigns from the dashboard is coming in a later phase. Until then, export the list to send from your email tool, and always include an unsubscribe link.</div>
    <div class="toolbar"><div class="grow"></div><button class="btn" id="csv">${icon('file')} Export subscribed (CSV)</button></div>
    <div class="card"><div class="table-wrap">${data.length ? `<table class="t"><thead><tr><th>Email</th><th>Name</th><th>Language</th><th>Consent given</th><th>Status</th></tr></thead><tbody>
      ${data.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(s.full_name || '—')}</td><td>${esc(s.language || '—')}</td>
        <td title="${esc(s.consent_text)}">${fmtDateTime(s.consent_at)}</td>
        <td>${s.unsubscribed_at ? `<span class="badge">Unsubscribed ${timeAgo(s.unsubscribed_at)}</span>` : '<span class="badge b-GREEN">Subscribed</span>'}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${icon('mail')}<div>No subscribers yet. The sign-up form is in the website footer.</div></div>`}</div></div>`;
  el.querySelector('#csv').onclick = () => {
    const csv = ['email,name,language,consent_at', ...active.map((s) => [s.email, s.full_name || '', s.language || '', s.consent_at].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'newsletter-subscribers.csv'; a.click();
  };
}
