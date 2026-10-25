// Email: each staff member's own Outlook mailbox plus the shared mailbox, via Microsoft 365.
// Folders, unread/flagged filters, read pane (sandboxed), reply/forward, flag, archive, move, delete, attachments.
import { db, can, esc, icon, fmtDate, toast, fail, callFn, modal } from '../core.js';
import { composeEmail } from '../crm.js';

const WK = { inbox: ['Inbox', 'mail'], sentitems: ['Sent', 'send'], drafts: ['Drafts', 'file'], archive: ['Archive', 'folder'], deleteditems: ['Deleted', 'trash'], junkemail: ['Junk', 'alert'] };
const ORDER = ['inbox', 'sentitems', 'drafts', 'archive', 'deleteditems', 'junkemail'];
const when = (d) => { const x = new Date(d); return x.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA') ? x.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : fmtDate(d, { month: 'short', day: 'numeric' }); };
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export async function render(el) {
  const status = await callFn('comms', { action: 'status' }).catch((e) => ({ error: e.message }));
  if (!status.email) {
    el.innerHTML = `<div class="dk-card"><div class="dk-empty">${icon('mail')}<h3 style="color:var(--navy)">Email isn't connected yet</h3><p>${can('settings.manage') ? 'Connect Microsoft 365 in Business Settings → Integrations.' : 'Ask the owner to connect Microsoft 365.'}</p></div></div>`;
    return;
  }
  const boxes = [['me', status.mailboxes[0], 'My mailbox'], ...(can('crm.edit') && status.mailboxes[1] ? [['shared', status.mailboxes[1], 'Shared']] : [])];
  let box = sessionStorage.getItem('gi_mail_box') || 'me', folder = 'inbox', folders = [], list = [], current = null, search = '', show = 'all';
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
      <div class="mail-filter seg" id="show"><button data-s="all">All</button><button data-s="unread">Unread</button><button data-s="flagged">Flagged</button></div>
      <div id="list" class="mail-items"></div>
      <button class="btn btn-sm" id="more" style="margin:10px auto;display:block" hidden>Load more</button>
    </section>
    <section class="mail-read" id="read"><div class="ai-empty">${icon('mail')}<h3>Select an email</h3><p>Choose a message to read it here.</p></div></section>
  </div>`;

  const folderLabel = (f) => WK[f.wk]?.[0] || f.name;
  const drawNav = () => {
    el.querySelector('#boxes').innerHTML = boxes.map(([k, addr, l]) => `<button class="chat-item ${k === box ? 'on' : ''}" data-b="${k}">${icon(k === 'me' ? 'user' : 'users')}<span>${esc(l)}<small style="display:block;opacity:.75;font-size:11px">${esc(addr)}</small></span></button>`).join('');
    const sorted = [...folders].sort((a, b) => (ORDER.indexOf(a.wk) + 1 || 99) - (ORDER.indexOf(b.wk) + 1 || 99) || a.name.localeCompare(b.name));
    const items = sorted.length ? sorted : ORDER.map((k) => ({ id: k, wk: k, name: WK[k][0], unread: 0 }));
    el.querySelector('#folders').innerHTML = items.filter((f) => !/^(Conversation History|Outbox|RSS|Sync Issues)/i.test(f.name)).map((f) => {
      const key = f.wk || f.id;
      return `<button class="chat-item ${key === folder || f.id === folder ? 'on' : ''}" data-f="${esc(f.wk || f.id)}">${icon(WK[f.wk]?.[1] || 'folder')}<span>${esc(folderLabel(f))}</span>${f.unread && f.wk !== 'sentitems' && f.wk !== 'drafts' ? `<em>${f.unread}</em>` : ''}</button>`;
    }).join('');
  };
  async function loadFolders() {
    try { folders = (await callFn('comms', { action: 'folders', mailbox: box })).folders; } catch { folders = []; }
    drawNav();
  }
  async function matchContacts(msgs) {
    const emails = [...new Set(msgs.flatMap((m) => [m.from, ...m.to]).map((e) => (e || '').toLowerCase()).filter((e) => e && !(e in contactsByEmail)))];
    if (!emails.length || !can('crm.view')) return;
    const { data } = await db.from('contacts').select('id, full_name, email').in('email', emails.slice(0, 200));
    emails.forEach((e) => (contactsByEmail[e] = null));
    (data || []).forEach((c) => (contactsByEmail[c.email.toLowerCase()] = c));
  }
  const clientOf = (m) => [m.from, ...m.to].map((e) => contactsByEmail[(e || '').toLowerCase()]).find(Boolean);
  const drawList = () => {
    el.querySelectorAll('#show button').forEach((b) => b.classList.toggle('on', b.dataset.s === show));
    const rows = list.filter((m) => show === 'all' || (show === 'unread' ? !m.isRead : m.flagged));
    const sentLike = ['sentitems', 'drafts'].includes(folder);
    el.querySelector('#list').innerHTML = rows.length ? rows.map((m) => { const c = clientOf(m); const who = sentLike ? 'To: ' + (m.to[0] || '') : (m.fromName || m.from); return `<button class="mail-item ${m.isRead ? '' : 'unread'} ${current === m.id ? 'on' : ''}" data-id="${esc(m.id)}">
        <span class="mi-top"><b>${m.importance === 'high' ? '<i class="mi-imp" title="High importance">!</i>' : ''}${esc(who)}</b><em>${m.flagged ? `<span class="mi-flag" title="Flagged">⚑</span>` : ''}${when(m.date)}</em></span>
        <span class="mi-sub">${m.hasAttachments ? icon('file') : ''}${esc(m.subject)}</span>
        <span class="mi-pre">${esc(m.preview)}</span>${c ? `<span class="chip">${icon('user')} Client: ${esc(c.full_name)}</span>` : ''}</button>`; }).join('')
      : `<div class="dk-empty">${icon('mail')}<p>${search ? 'No emails match your search.' : show !== 'all' ? `No ${show} emails here.` : 'This folder is empty.'}</p></div>`;
  };
  async function load(append = false) {
    if (!append) { el.querySelector('#list').innerHTML = '<div class="loading" style="min-height:120px"><div class="spin"></div></div>'; list = []; }
    try {
      const r = await callFn('comms', { action: 'list', mailbox: box, folder, skip: append ? list.length : 0, search });
      list = append ? list.concat(r.messages) : r.messages;
      await matchContacts(r.messages);
      el.querySelector('#more').hidden = !!search || r.messages.length < 30;
      drawList();
    } catch (err) { el.querySelector('#list').innerHTML = `<div class="alert err" style="margin:12px">${esc(err.message)}</div>`; }
  }
  const act = (payload) => callFn('comms', { mailbox: box, ...payload });
  const removeFromList = (id) => { list = list.filter((x) => x.id !== id); current = null; drawList(); el.querySelector('#read').innerHTML = `<div class="ai-empty">${icon('mail')}<h3>Select an email</h3></div>`; loadFolders(); };

  async function open(id) {
    current = id; drawList();
    const pane = el.querySelector('#read');
    pane.innerHTML = '<div class="loading" style="min-height:160px"><div class="spin"></div></div>';
    try {
      const { message: m } = await act({ action: 'read', id });
      if (current !== id) return;
      if (!m.isRead) act({ action: 'mark', id, isRead: true }).then(() => { const li = list.find((x) => x.id === id); if (li) { li.isRead = true; drawList(); loadFolders(); } }).catch(() => {});
      await matchContacts([m]);
      const c = clientOf(m);
      const html = m.bodyType === 'html' ? m.body : `<pre style="white-space:pre-wrap;font-family:inherit">${esc(m.body)}</pre>`;
      const moveOpts = folders.filter((f) => f.wk !== folder && f.id !== folder && !/^(Conversation History|Outbox|RSS|Sync Issues)/i.test(f.name)).map((f) => `<option value="${esc(f.id)}">${esc(folderLabel(f))}</option>`).join('');
      pane.innerHTML = `<div class="mr-tools">
          <button class="btn btn-sm btn-primary" id="rp">${icon('send')} Reply</button><button class="btn btn-sm" id="rpa">Reply all</button><button class="btn btn-sm" id="fw">Forward</button>
          <span class="mr-sep"></span>
          <button class="btn btn-sm btn-ghost" id="flag" title="Flag for follow-up">${m.flagged ? '⚑ Unflag' : '⚐ Flag'}</button>
          <button class="btn btn-sm btn-ghost" id="unread">Mark unread</button>
          ${folder !== 'archive' ? `<button class="btn btn-sm btn-ghost" id="arch">${icon('folder')} Archive</button>` : ''}
          <button class="btn btn-sm btn-ghost" id="del">${icon('trash')} Delete</button>
          ${moveOpts ? `<select class="input mr-move" id="mv"><option value="">Move to…</option>${moveOpts}</select>` : ''}
          ${m.webLink ? `<a class="btn btn-sm btn-ghost" href="${esc(m.webLink)}" target="_blank" rel="noopener" title="Open in Outlook">${icon('external')}</a>` : ''}</div>
        <div class="mr-head"><h3>${m.importance === 'high' ? '<i class="mi-imp">!</i> ' : ''}${esc(m.subject)}</h3>
          <div class="mr-meta"><b>${esc(m.fromName || m.from)}</b> &lt;${esc(m.from)}&gt;<br><small>To: ${esc(m.to.join(', '))}${m.cc.length ? ` · Cc: ${esc(m.cc.join(', '))}` : ''} · ${new Date(m.date).toLocaleString('en-CA')}</small></div>
          <div class="row" style="gap:8px;margin-top:8px">${c ? `<a class="btn btn-sm" href="#/contacts/${c.id}">${icon('user')} Open client: ${esc(c.full_name)}</a>` : can('crm.edit') && m.from && !/@gracefulimmigration\.ca$/i.test(m.from) ? `<button class="btn btn-sm" id="addc">${icon('plus')} Add sender as client</button>` : ''}</div>
          ${m.attachments.length ? `<div class="mr-att">${m.attachments.map((a) => `<button class="chip mr-dl" data-att="${esc(a.id)}" title="Download">${icon('file')} ${esc(a.name)} · ${kb(a.size)} ⬇</button>`).join('')}</div>` : ''}</div>
        <iframe class="mr-body" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Email content"></iframe>`;
      pane.querySelector('iframe').srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:14px/1.6 Arial,Helvetica,sans-serif;color:#1C2333;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${html}`;
      const $ = (s) => pane.querySelector(s);
      $('#rp').onclick = () => reply(m, false);
      $('#rpa').onclick = () => reply(m, true);
      $('#fw').onclick = () => forward(m);
      $('#flag').onclick = async () => { try { await act({ action: 'mark', id, flagged: !m.flagged }); const li = list.find((x) => x.id === id); if (li) li.flagged = !m.flagged; open(id); } catch (e) { fail(e); } };
      $('#unread').onclick = async () => { try { await act({ action: 'mark', id, isRead: false }); const li = list.find((x) => x.id === id); if (li) li.isRead = false; current = null; drawList(); loadFolders(); toast('Marked unread'); } catch (e) { fail(e); } };
      $('#arch')?.addEventListener('click', async () => { try { await act({ action: 'move', id, destination: 'archive' }); toast('Archived'); removeFromList(id); } catch (e) { fail(e); } });
      $('#del').onclick = async () => { try { await act({ action: 'move', id, destination: 'deleteditems' }); toast('Moved to Deleted'); removeFromList(id); } catch (e) { fail(e); } };
      $('#mv')?.addEventListener('change', async (ev) => { if (!ev.target.value) return; try { await act({ action: 'move', id, destination: ev.target.value }); toast('Moved'); removeFromList(id); } catch (e) { fail(e); } });
      pane.querySelectorAll('[data-att]').forEach((b) => (b.onclick = async () => {
        try {
          const { attachment: a } = await act({ action: 'attachment', id, attachmentId: b.dataset.att });
          if (!a.contentBytes) throw new Error('This attachment type can only be opened in Outlook.');
          const bytes = Uint8Array.from(atob(a.contentBytes), (ch) => ch.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
          const link = document.createElement('a'); link.href = url; link.download = a.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e) { fail(e); }
      }));
      $('#addc')?.addEventListener('click', async () => {
        const { error } = await db.from('contacts').insert({ full_name: m.fromName || m.from.split('@')[0], email: m.from.toLowerCase(), source: 'email' });
        if (error) return fail(new Error(error.code === '23505' ? 'A client with this email already exists.' : error.message));
        delete contactsByEmail[m.from.toLowerCase()]; toast('Client added'); open(id);
      });
    } catch (err) { pane.innerHTML = `<div class="alert err" style="margin:16px">${esc(err.message)}</div>`; }
  }
  function reply(m, all) {
    modal({ title: `${all ? 'Reply all' : 'Reply'}: ${m.subject}`, wide: true,
      body: `<p class="dk-muted" style="margin-bottom:8px">From <b>${esc(boxes.find((b) => b[0] === box)[1])}</b> to ${esc(all ? [m.from, ...m.to, ...m.cc].join(', ') : m.from)}. Your signature is added and the original message is quoted below your reply.</p>
        <textarea class="input" id="rb" rows="10" placeholder="Write your reply…"></textarea>`,
      actions: [{ label: 'Cancel' }, { label: 'Send reply', cls: 'btn-gold', onClick: async (mm) => { await act({ action: 'reply', id: m.id, body: mm.querySelector('#rb').value, replyAll: all }); toast('Reply sent'); } }] });
  }
  function forward(m) {
    modal({ title: `Forward: ${m.subject}`, wide: true,
      body: `<div class="field"><label>To</label><input class="input" id="ft" placeholder="email addresses, separated by commas"></div>
        <div class="field"><label>Message (optional)</label><textarea class="input" id="fb" rows="6"></textarea></div><p class="dk-muted">The original email and its attachments are included.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Forward', cls: 'btn-gold', onClick: async (mm) => { await act({ action: 'forward', id: m.id, to: mm.querySelector('#ft').value, body: mm.querySelector('#fb').value }); toast('Forwarded'); } }] });
  }

  el.querySelector('#boxes').onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) { box = b.dataset.b; sessionStorage.setItem('gi_mail_box', box); folder = 'inbox'; current = null; loadFolders(); load(); } };
  el.querySelector('#folders').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { folder = b.dataset.f; current = null; drawNav(); load(); } };
  el.querySelector('#show').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { show = b.dataset.s; drawList(); } };
  el.querySelector('#list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id); };
  el.querySelector('#more').onclick = () => load(true);
  el.querySelector('#refresh').onclick = () => { loadFolders(); load(); };
  let t; el.querySelector('#ms').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { search = e.target.value.trim(); load(); }, 400); };
  el.querySelector('#compose').onclick = () => composeEmail({});
  drawNav(); loadFolders(); load();
}
