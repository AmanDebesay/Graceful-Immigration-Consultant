// Client portal, staff side: who has access, unread client messages, and the Portal tab on a client's page
// (invite, turn access on/off, share documents, secure messages).
import { db, can, esc, icon, fmtDate, fmtDateTime, timeAgo, toast, fail, callFn, modal, confirmBox } from '../core.js';

const call = (action, p = {}) => callFn('portal', { action, ...p });
const STATE = { none: ['Not invited', ''], invited: ['Invited, not signed in yet', 'b-gold'], active: ['Active', 'b-GREEN'], off: ['Access turned off', 'b-RED'] };

export async function render(el) {
  const [{ data: cs, error }, { data: unread }] = await Promise.all([
    db.from('contacts').select('id, full_name, email, portal_invited_at').not('client_user_id', 'is', null).order('full_name'),
    db.from('portal_messages').select('contact_id, created_at').eq('from_client', true).is('read_by_staff_at', null)]);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const by = {};
  (unread || []).forEach((m) => { (by[m.contact_id] ||= { n: 0, at: m.created_at }).n++; if (m.created_at > by[m.contact_id].at) by[m.contact_id].at = m.created_at; });
  const list = [...(cs || [])].sort((a, b) => (by[b.id]?.at || '').localeCompare(by[a.id]?.at || '') || a.full_name.localeCompare(b.full_name));
  el.innerHTML = `<div class="alert info">Clients you invite sign in at <b>gracefulimmigration.ca/app</b> and see only their own file: agreements to sign, documents you share and the ones you ask for, invoices, case status and secure messages. Invite a client from the <b>Portal</b> tab on their page.</div>
    <div class="card"><div class="table-wrap">${list.length ? `<table class="t"><thead><tr><th>Client</th><th>Email</th><th>Invited</th><th>New messages</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.full_name)}</b></td><td>${esc(c.email || '')}</td><td>${c.portal_invited_at ? fmtDate(c.portal_invited_at) : '—'}</td>
        <td>${by[c.id] ? `<span class="badge b-RED">${by[c.id].n} new</span> <small style="color:var(--muted)">${timeAgo(by[c.id].at)}</small>` : '—'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('shield')}<div>No clients have portal access yet.</div></div>`}</div></div>`;
  el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => { sessionStorage.setItem('gi_contact_tab', 'portal'); location.hash = `#/contacts/${tr.dataset.id}`; }));
}

// The Portal tab on a client's page
export async function portalPanel(el, c) {
  const manage = can('portal.manage');
  const [st, docs, th] = await Promise.all([call('status', { contact_id: c.id }).catch((e) => ({ error: e.message })),
    can('documents.view') ? db.from('client_documents').select('id, name, doc_type, category, shared, from_client, created_at').eq('contact_id', c.id).order('created_at', { ascending: false }) : { data: null },
    call('thread', { contact_id: c.id }).catch(() => ({ messages: [] }))]);
  if (st.error) { el.innerHTML = `<div class="alert err">${esc(st.error)}</div>`; return; }
  window.dispatchEvent(new Event('refresh-counts'));
  const [label, cls] = STATE[st.state];
  el.innerHTML = `<div class="grid g-2" style="gap:16px;align-items:start">
    <div>
      <div class="row" style="justify-content:space-between;margin-bottom:10px"><div><span class="badge ${cls}">${label}</span>
        ${st.last_sign_in ? `<small style="color:var(--muted);margin-left:6px">Last signed in ${timeAgo(st.last_sign_in)}</small>` : st.invited_at ? `<small style="color:var(--muted);margin-left:6px">Invited ${fmtDate(st.invited_at)}</small>` : ''}</div>
        ${manage ? `<div class="row" style="gap:6px">${st.state === 'none' ? `<button class="btn btn-gold btn-sm" id="inv">${icon('mail')} Invite to portal</button>`
          : `<button class="btn btn-sm" id="inv">${icon('mail')} ${st.state === 'active' ? 'Send password link' : 'Resend invite'}</button>
             <button class="btn btn-sm ${st.state === 'off' ? 'btn-primary' : 'btn-danger'}" id="acc">${st.state === 'off' ? 'Turn access on' : 'Turn access off'}</button>`}</div>` : ''}</div>
      ${!c.email ? '<div class="alert err">Add the client\'s email address (Edit) before inviting them.</div>' : ''}
      <div class="pm-thread" id="th">${th.messages.length ? th.messages.map((m) => `<div class="pm-msg ${m.from_client ? '' : 'me'}"><div class="pm-bub">${esc(m.body).replace(/\n/g, '<br>')}</div>
        <small>${esc(m.who)} · ${fmtDateTime(m.at)}${!m.from_client ? (m.read ? ' · read' : ' · not read yet') : ''}</small></div>`).join('') : '<div class="empty" style="padding:18px">No portal messages yet.</div>'}</div>
      ${manage && st.state !== 'none' ? `<form class="pm-send" id="rf"><textarea class="input" id="rb" rows="3" placeholder="Message to ${esc(c.full_name.split(' ')[0])}… (they get an email saying a message is waiting, not the message itself)"></textarea><button class="btn btn-primary" type="submit">${icon('send')} Send</button></form>` : ''}
    </div>
    <div class="card"><div class="card-h"><h3>Shared in the portal</h3><small style="color:var(--muted)">Ticked documents are visible to the client</small></div><div class="card-b" style="padding-top:4px">
      ${docs.data ? (docs.data.length ? docs.data.map((d) => `<label class="check" style="cursor:${manage && !d.from_client ? 'pointer' : 'default'}"><input type="checkbox" data-share="${d.id}" ${d.shared || d.from_client ? 'checked' : ''} ${manage && !d.from_client ? '' : 'disabled'}>
        <span style="flex:1"><b>${esc(d.doc_type || d.name)}</b><br><small style="color:var(--muted)">${esc(d.name)} · ${d.from_client ? 'uploaded by the client' : fmtDate(d.created_at)}</small></span></label>`).join('')
        : '<div class="empty" style="padding:14px">No documents yet.</div>') : '<div class="empty" style="padding:14px">You don\'t have access to client documents.</div>'}
      <p style="color:var(--muted);font-size:12px;margin-top:10px">Signed agreements, open invoices, case status and the documents still needed on checklists appear in the portal automatically.</p></div></div></div>`;
  const th_ = el.querySelector('#th'); th_.scrollTop = th_.scrollHeight;
  const again = () => portalPanel(el, c);
  el.querySelector('#inv')?.addEventListener('click', async (e) => {
    if (!c.email) return fail(new Error('Add the client\'s email address first.'));
    e.currentTarget.disabled = true;
    try {
      const r = await call('invite', { contact_id: c.id });
      modal({ title: r.emailed ? 'Invitation sent' : 'Send this link to the client', body: `${r.emailed ? `<div class="alert ok">We emailed ${esc(c.email)} a private link to set a password.</div>`
          : `<div class="alert info">The email could not be sent from Microsoft 365${r.email_error ? ` (${esc(r.email_error.slice(0, 160))})` : ''}. Copy this private link and send it to ${esc(c.full_name)} yourself, for example by WhatsApp or text.</div>`}
        <div class="field"><label>Private link (works once)</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="lk" value="${esc(r.link)}" readonly><button class="btn" id="cp">Copy</button></div></div>
        <p class="dk-muted">After setting a password, the client signs in at gracefulimmigration.ca/app with ${esc(c.email)}.</p>`,
        onOpen: (m) => { m.querySelector('#cp').onclick = async () => { await navigator.clipboard.writeText(r.link).catch(() => {}); toast('Link copied'); }; } });
      again();
    } catch (er) { fail(er); e.currentTarget && (e.currentTarget.disabled = false); }
  });
  el.querySelector('#acc')?.addEventListener('click', async () => {
    const on = st.state === 'off';
    if (!on && !(await confirmBox('Turn off portal access', `${c.full_name} won't be able to sign in until you turn access on again. Their file is not changed.`, 'Turn off', true))) return;
    try { await call('access', { contact_id: c.id, on }); toast(on ? 'Portal access on' : 'Portal access off'); again(); } catch (er) { fail(er); }
  });
  el.querySelectorAll('[data-share]').forEach((cb) => (cb.onchange = () => call('share', { document_id: cb.dataset.share, shared: cb.checked })
    .then(() => toast(cb.checked ? 'Shared with the client' : 'No longer shared')).catch((er) => { cb.checked = !cb.checked; fail(er); })));
  el.querySelector('#rf')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = el.querySelector('#rb'); if (!t.value.trim()) return;
    try { await call('reply', { contact_id: c.id, body: t.value }); toast('Message sent'); again(); } catch (er) { fail(er); }
  });
}
