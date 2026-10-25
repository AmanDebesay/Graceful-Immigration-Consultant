// Team Chat: channels and direct messages between staff, live via Supabase Realtime.
// Messages can be linked to a client file. Only staff (company emails) can see the chat.
import { db, state, can, esc, icon, avatarHtml, fmtDate, toast, fail, rpc, modal } from '../core.js';

let sub = null;
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>');
const timeOf = (d) => new Date(d).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const dayOf = (d) => { const x = new Date(d).toLocaleDateString('en-CA'), t = new Date().toLocaleDateString('en-CA'); return x === t ? 'Today' : fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' }); };

export async function render(el) {
  if (sub) { db.removeChannel(sub); sub = null; }
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const presetContact = params.get('contact');
  const me = state.profile.id;
  const people = state.staff.filter((s) => s.active && s.id !== me && /@gracefulimmigration\.ca$/i.test(s.email));

  const [{ data: channels }, unreadRows, contactRow] = await Promise.all([
    db.from('chat_channels').select('id, name, kind, dm_key').order('created_at'),
    rpc('chat_unread').catch(() => []),
    presetContact && can('crm.view') ? db.from('contacts').select('id, full_name').eq('id', presetContact).maybeSingle() : { data: null },
  ]);
  const unread = Object.fromEntries((unreadRows || []).map((r) => [r.channel_id, Number(r.unread)]));
  const dmWith = (c) => c.kind === 'dm' ? c.dm_key.split(':').find((x) => x !== me) : null;
  const person = (id) => state.staff.find((s) => s.id === id);
  let linked = contactRow?.data || null;
  let current = params.get('c') || (linked ? channels.find((c) => c.name === 'cases')?.id : null) || channels.find((c) => c.name === 'general')?.id || channels[0]?.id;

  el.innerHTML = `<div class="chat-wrap dk-card">
    <aside class="chat-side">
      <div class="chat-sec"><span>Channels</span><button class="dk-link" id="newCh" title="New channel">${icon('plus')}</button></div>
      <div id="chList"></div>
      <div class="chat-sec"><span>Direct messages</span></div>
      <div id="dmList"></div>
    </aside>
    <section class="chat-main">
      <header class="chat-head" id="head"></header>
      <div class="chat-log" id="log"></div>
      <form class="chat-form" id="f">
        <div class="chat-link" id="linkBox"></div>
        <div class="chat-input"><textarea class="input" id="msg" rows="1" placeholder="Write a message…" maxlength="4000"></textarea>
          ${can('crm.view') ? `<button class="btn btn-sm" type="button" id="linkBtn" title="Link a client file">${icon('user')}</button>` : ''}
          <button class="btn btn-gold" type="submit" id="send" title="Send">${icon('send')}</button></div>
        <small class="dk-muted">Enter to send · Shift+Enter for a new line · Visible only to staff</small>
      </form>
    </section></div>`;

  const log = el.querySelector('#log'), msg = el.querySelector('#msg');
  const drawLists = () => {
    el.querySelector('#chList').innerHTML = channels.filter((c) => c.kind === 'channel').map((c) => `<button class="chat-item ${c.id === current ? 'on' : ''}" data-c="${c.id}">${icon('hash')}<span>${esc(c.name)}</span>${unread[c.id] && c.id !== current ? `<em>${unread[c.id]}</em>` : ''}</button>`).join('');
    el.querySelector('#dmList').innerHTML = people.map((p) => {
      const ch = channels.find((c) => c.kind === 'dm' && dmWith(c) === p.id);
      return `<button class="chat-item ${ch && ch.id === current ? 'on' : ''}" data-p="${p.id}">${avatarHtml(p, 'avatar sm')}<span>${esc(p.full_name || p.email)}</span>${ch && unread[ch.id] && ch.id !== current ? `<em>${unread[ch.id]}</em>` : ''}</button>`;
    }).join('') || '<p class="dk-muted" style="padding:6px 12px">Invite staff in Team &amp; Access to message them here.</p>';
  };
  const drawLink = () => {
    el.querySelector('#linkBox').innerHTML = linked ? `<span class="chip">${icon('user')} About: <b>${esc(linked.full_name)}</b><button type="button" id="unlink" aria-label="Remove">×</button></span>` : '';
    el.querySelector('#unlink')?.addEventListener('click', () => { linked = null; drawLink(); });
  };
  const msgHtml = (m, prev) => {
    const a = person(m.author_id) || { full_name: 'Former staff' };
    const grouped = prev && prev.author_id === m.author_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000 && dayOf(prev.created_at) === dayOf(m.created_at);
    const day = !prev || dayOf(prev.created_at) !== dayOf(m.created_at) ? `<div class="chat-day"><span>${dayOf(m.created_at)}</span></div>` : '';
    return `${day}<div class="chat-msg ${grouped ? 'grouped' : ''}" data-id="${m.id}">${grouped ? '<span class="chat-gap"></span>' : avatarHtml(a, 'avatar sm')}
      <div class="chat-body">${grouped ? '' : `<div class="chat-meta"><b>${esc(a.full_name || a.email)}</b><span>${timeOf(m.created_at)}</span></div>`}
        <div class="chat-text">${linkify(m.body)}</div>${m.contacts ? `<a class="chip" href="#/contacts/${m.contact_id}">${icon('user')} ${esc(m.contacts.full_name)}</a>` : ''}</div></div>`;
  };
  let msgs = [];
  async function open(cid) {
    current = cid; unread[cid] = 0; drawLists();
    const c = channels.find((x) => x.id === cid);
    const p = c?.kind === 'dm' ? person(dmWith(c)) : null;
    el.querySelector('#head').innerHTML = p ? `${avatarHtml(p, 'avatar sm')}<div><b>${esc(p.full_name || p.email)}</b><small>${esc(p.job_title || p.email)}</small></div>`
      : `<span class="chat-hash">${icon('hash')}</span><div><b>${esc(c?.name || '')}</b><small>${c?.name === 'cases' ? 'Discuss client files with the team' : c?.name === 'general' ? 'Everyone on the team' : 'Team channel'}</small></div>`;
    log.innerHTML = '<div class="loading" style="min-height:120px"><div class="spin"></div></div>';
    const { data } = await db.from('chat_messages').select('id, author_id, body, contact_id, created_at, contacts(full_name)').eq('channel_id', cid).order('created_at', { ascending: false }).limit(150);
    if (current !== cid) return;
    msgs = (data || []).reverse();
    log.innerHTML = msgs.length ? msgs.map((m, i) => msgHtml(m, msgs[i - 1])).join('') : `<div class="ai-empty">${icon('chat')}<h3>Start the conversation</h3><p>Messages here are visible to ${p ? esc(p.full_name || 'them') + ' and you' : 'the whole team'}.</p></div>`;
    log.scrollTop = log.scrollHeight;
    rpc('chat_mark_read', { p_channel: cid }).then(() => window.dispatchEvent(new Event('refresh-counts'))).catch(() => {});
    msg.focus();
  }

  el.querySelector('#chList').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) open(b.dataset.c); };
  el.querySelector('#dmList').onclick = async (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    try {
      const id = await rpc('open_dm', { p_other: b.dataset.p });
      if (!channels.find((c) => c.id === id)) { const { data } = await db.from('chat_channels').select('id, name, kind, dm_key').eq('id', id).single(); channels.push(data); }
      open(id);
    } catch (err) { fail(err); }
  };
  el.querySelector('#newCh').onclick = () => modal({
    title: 'New channel', body: '<div class="field"><label>Channel name</label><input class="input" id="cn" placeholder="e.g. refugee-files" maxlength="40"></div>',
    actions: [{ label: 'Cancel' }, { label: 'Create', cls: 'btn-primary', onClick: async (m) => {
      const name = m.querySelector('#cn').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
      if (!name) throw new Error('Enter a name.');
      const { data, error } = await db.from('chat_channels').insert({ name }).select('id, name, kind, dm_key').single();
      if (error) throw new Error(error.code === '23505' ? 'A channel with that name already exists.' : error.message);
      channels.push(data); open(data.id);
    } }],
  });
  el.querySelector('#linkBtn')?.addEventListener('click', async () => {
    const { contactsList, contactOptions } = await import('../fin.js');
    const list = await contactsList();
    modal({ title: 'Link a client file', body: `<div class="field"><label>Client</label><select class="input" id="lc">${contactOptions(list, linked?.id)}</select></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Link', cls: 'btn-primary', onClick: (m) => {
        const c = list.find((x) => x.id === m.querySelector('#lc').value); linked = c ? { id: c.id, full_name: c.full_name } : null; drawLink();
      } }] });
  });

  const send = async () => {
    const body = msg.value.trim();
    if (!body || !current) return;
    msg.value = ''; msg.style.height = '';
    const { error } = await db.from('chat_messages').insert({ channel_id: current, body, contact_id: linked?.id || null });
    if (error) { msg.value = body; return fail(error); }
    linked = null; drawLink();
  };
  el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); send(); };
  msg.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  msg.oninput = () => { msg.style.height = ''; msg.style.height = Math.min(msg.scrollHeight, 160) + 'px'; };

  // Live updates
  sub = db.channel('team-chat-view').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async ({ new: m }) => {
    if (!el.isConnected) { db.removeChannel(sub); sub = null; return; }
    if (m.channel_id === current) {
      if (m.contact_id) m.contacts = (await db.from('contacts').select('full_name').eq('id', m.contact_id).maybeSingle()).data;
      const empty = log.querySelector('.ai-empty'); if (empty) log.innerHTML = '';
      log.insertAdjacentHTML('beforeend', msgHtml(m, msgs[msgs.length - 1])); msgs.push(m);
      log.scrollTop = log.scrollHeight;
      rpc('chat_mark_read', { p_channel: current }).catch(() => {});
    } else if (m.author_id !== me) {
      if (!channels.find((c) => c.id === m.channel_id)) {
        const { data } = await db.from('chat_channels').select('id, name, kind, dm_key').eq('id', m.channel_id).maybeSingle();
        if (data) channels.push(data);
      }
      unread[m.channel_id] = (unread[m.channel_id] || 0) + 1; drawLists();
    }
  }).subscribe();

  drawLists(); drawLink();
  if (current) open(current);
  if (linked) toast(`New messages will be linked to ${linked.full_name}`);
}
