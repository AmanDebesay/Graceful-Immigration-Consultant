// Email: each staff member's own Outlook mailbox plus the shared mailbox, via Microsoft 365.
// Messages are shown in a sandboxed frame (no scripts), and replies are sent from the same mailbox.
import { db, can, esc, icon, fmtDate, toast, fail, callFn, modal } from '../core.js';
import { composeEmail } from '../crm.js';

const FOLDERS = [['inbox', 'Inbox', 'mail'], ['sent', 'Sent', 'send'], ['drafts', 'Drafts', 'file'], ['archive', 'Archive', 'folder'], ['junk', 'Junk', 'alert']];
const when = (d) => { const x = new Date(d); return x.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA') ? x.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : fmtDate(d, { month: 'short', day: 'numeric' }); };
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export async function render(el) {
  const status = await callFn('comms', { action: 'status' }).catch((e) => ({ error: e.message }));
  if (!status.email) {
    el.innerHTML = `<div class="dk-card"><div class="dk-empty">${icon('mail')}<h3 style="color:var(--navy)">Email isn't connected yet</h3><p>${can('settings.manage') ? 'Connect Microsoft 365 in Business Settings → Integrations.' : 'Ask the owner to connect Microsoft 365.'}</p></div></div>`;
    return;
  }
  const boxes = [['me', status.mailboxes[0], 'My mailbox'], ...(can('crm.edit') && status.mailboxes[1] ? [['shared', status.mailboxes[1], 'Shared']] : [])];
  let box = sessionStorage.getItem('gi_mail_box') || 'me', folder = 'inbox', list = [], current = null, search = '';
  if (!boxes.find((b) => b[0] === box)) box = 'me';
  const contactsByEmail = {};

  el.innerHTML = `<div class="mail-wrap dk-card">
    <aside class="mail-side">
      <button class="btn btn-gold" id="compose" style="width:100%;margin-bottom:12px">${icon('plus')} New email</button>
      <div class="chat-sec"><span>Mailbox</span></div><div id="boxes"></div>
      <div class="chat-sec"><span>Folders</span></div><div id="folders"></div>
    </aside>
    <section class="mail-listpane">
      <div class="mail-search">${icon('search')}<input id="ms" placeholder="Search this mailbox…"><button class="btn btn-sm btn-ghost" id="refresh" title="Refresh">${icon('history')}</button></div>
      <div id="list" class="mail-items"></div>
      <button class="btn btn-sm" id="more" style="margin:10px auto;display:block" hidden>Load more</button>
    </section>
    <section class="mail-read" id="read"><div class="ai-empty">${icon('mail')}<h3>Select an email</h3><p>Choose a message to read it here.</p></div></section>
  </div>`;

  const drawNav = () => {
    el.querySelector('#boxes').innerHTML = boxes.map(([k, addr, l]) => `<button class="chat-item ${k === box ? 'on' : ''}" data-b="${k}">${icon(k === 'me' ? 'user' : 'users')}<span>${esc(l)}<small style="display:block;opacity:.75;font-size:11px">${esc(addr)}</small></span></button>`).join('');
    el.querySelector('#folders').innerHTML = FOLDERS.map(([k, l, ic]) => `<button class="chat-item ${k === folder ? 'on' : ''}" data-f="${k}">${icon(ic)}<span>${l}</span></button>`).join('');
  };
  async function matchContacts(msgs) {
    const emails = [...new Set(msgs.flatMap((m) => [m.from, ...m.to]).map((e) => (e || '').toLowerCase()).filter((e) => e && !(e in contactsByEmail)))];
    if (!emails.length || !can('crm.view')) return;
    const { data } = await db.from('contacts').select('id, full_name, email').in('email', emails.slice(0, 200));
    emails.forEach((e) => (contactsByEmail[e] = null));
    (data || []).forEach((c) => (contactsByEmail[c.email.toLowerCase()] = c));
  }
  const clientOf = (m) => [m.from, ...m.to].map((e) => contactsByEmail[(e || '').toLowerCase()]).find(Boolean);
  const drawList = () => {
    el.querySelector('#list').innerHTML = list.length ? list.map((m) => { const c = clientOf(m); const who = folder === 'sent' || folder === 'drafts' ? 'To: ' + (m.to[0] || '') : (m.fromName || m.from); return `<button class="mail-item ${m.isRead ? '' : 'unread'} ${current === m.id ? 'on' : ''}" data-id="${esc(m.id)}">
        <span class="mi-top"><b>${esc(who)}</b><em>${when(m.date)}</em></span>
        <span class="mi-sub">${m.hasAttachments ? icon('file') : ''}${esc(m.subject)}</span>
        <span class="mi-pre">${esc(m.preview)}</span>${c ? `<span class="chip">${icon('user')} Client: ${esc(c.full_name)}</span>` : ''}</button>`; }).join('')
      : `<div class="dk-empty">${icon('mail')}<p>${search ? 'No emails match your search.' : 'This folder is empty.'}</p></div>`;
  };
  async function load(append = false) {
    if (!append) { el.querySelector('#list').innerHTML = '<div class="loading" style="min-height:120px"><div class="spin"></div></div>'; list = []; }
    try {
      const r = await callFn('comms', { action: 'list', mailbox: box, folder, skip: append ? list.length : 0, search });
      list = append ? list.concat(r.messages) : r.messages;
      await matchContacts(r.messages);
      el.querySelector('#more').hidden = search || r.messages.length < 30;
      drawList();
    } catch (err) { el.querySelector('#list').innerHTML = `<div class="alert err" style="margin:12px">${esc(err.message)}</div>`; }
  }
  async function open(id) {
    current = id; drawList();
    const pane = el.querySelector('#read');
    pane.innerHTML = '<div class="loading" style="min-height:160px"><div class="spin"></div></div>';
    try {
      const { message: m } = await callFn('comms', { action: 'read', mailbox: box, id });
      if (current !== id) return;
      const c = clientOf(m) || (await matchContacts([m]), clientOf(m));
      const html = m.bodyType === 'html' ? m.body : `<pre style="white-space:pre-wrap;font-family:inherit">${esc(m.body)}</pre>`;
      pane.innerHTML = `<div class="mr-head"><h3>${esc(m.subject)}</h3>
          <div class="mr-meta"><b>${esc(m.fromName || m.from)}</b> &lt;${esc(m.from)}&gt;<br><small>To: ${esc(m.to.join(', '))}${m.cc.length ? ` · Cc: ${esc(m.cc.join(', '))}` : ''} · ${new Date(m.date).toLocaleString('en-CA')}</small></div>
          <div class="row" style="gap:8px;margin-top:10px">
            <button class="btn btn-sm btn-primary" id="rp">${icon('send')} Reply</button><button class="btn btn-sm" id="rpa">Reply all</button>
            ${c ? `<a class="btn btn-sm" href="#/contacts/${c.id}">${icon('user')} Open client: ${esc(c.full_name)}</a>` : can('crm.edit') && m.from && !/@gracefulimmigration\.ca$/i.test(m.from) ? `<button class="btn btn-sm" id="addc">${icon('plus')} Add sender as client</button>` : ''}
            ${m.webLink ? `<a class="btn btn-sm btn-ghost" href="${esc(m.webLink)}" target="_blank" rel="noopener">${icon('external')} Open in Outlook</a>` : ''}</div>
          ${m.attachments.length ? `<div class="mr-att">${m.attachments.map((a) => `<span class="chip">${icon('file')} ${esc(a.name)} · ${kb(a.size)}</span>`).join('')}<small class="dk-muted">Open in Outlook to download attachments.</small></div>` : ''}</div>
        <iframe class="mr-body" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Email content"></iframe>`;
      pane.querySelector('iframe').srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:14px/1.6 Arial,Helvetica,sans-serif;color:#1C2333;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${html}`;
      pane.querySelector('#rp').onclick = () => reply(m, false);
      pane.querySelector('#rpa').onclick = () => reply(m, true);
      pane.querySelector('#addc')?.addEventListener('click', async () => {
        const { error } = await db.from('contacts').insert({ full_name: m.fromName || m.from.split('@')[0], email: m.from.toLowerCase(), source: 'email' });
        if (error) return fail(new Error(error.code === '23505' ? 'A client with this email already exists.' : error.message));
        delete contactsByEmail[m.from.toLowerCase()]; toast('Client added'); open(id);
      });
      const li = list.find((x) => x.id === id); if (li) { li.isRead = true; drawList(); }
    } catch (err) { pane.innerHTML = `<div class="alert err" style="margin:16px">${esc(err.message)}</div>`; }
  }
  function reply(m, all) {
    modal({ title: `${all ? 'Reply all' : 'Reply'}: ${m.subject}`, wide: true,
      body: `<p class="dk-muted" style="margin-bottom:8px">From <b>${esc(boxes.find((b) => b[0] === box)[1])}</b> to ${esc(all ? [m.from, ...m.to, ...m.cc].join(', ') : m.from)}. Your signature is added and the original message is quoted below your reply.</p>
        <textarea class="input" id="rb" rows="10" placeholder="Write your reply…"></textarea>`,
      actions: [{ label: 'Cancel' }, { label: 'Send reply', cls: 'btn-gold', onClick: async (mm) => {
        await callFn('comms', { action: 'reply', mailbox: box, id: m.id, body: mm.querySelector('#rb').value, replyAll: all });
        toast('Reply sent');
      } }] });
  }

  el.querySelector('#boxes').onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) { box = b.dataset.b; sessionStorage.setItem('gi_mail_box', box); current = null; drawNav(); load(); } };
  el.querySelector('#folders').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { folder = b.dataset.f; current = null; drawNav(); load(); } };
  el.querySelector('#list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id); };
  el.querySelector('#more').onclick = () => load(true);
  el.querySelector('#refresh').onclick = () => load();
  let t; el.querySelector('#ms').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { search = e.target.value.trim(); load(); }, 400); };
  el.querySelector('#compose').onclick = () => composeEmail({});
  drawNav(); load();
}
