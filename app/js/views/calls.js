// Call Log: every phone / WhatsApp call — where it came from, what it turned into, and who still needs a call back.
// Calls on the business line (Twilio) arrive here by themselves (with recordings); other calls are logged by staff in seconds.
import { db, state, can, esc, icon, modal, toast, fail, fmtDateTime, confirmBox, SERVICE_LABEL } from '../core.js';
import { downloadCsv } from '../fin.js';
import { SOURCES, SOURCE_LABEL, CATEGORIES, CAT_LABEL, CAT_CLS, NOT_LEADS, CHANNELS, STATUSES, phoneKey, fmtPhone, abDate, AB_TZ } from '../calls-common.js';

const CSS = `<style>
.cl-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.cl-kpi{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;color:inherit;text-align:left;font:inherit}
.cl-kpi b{display:block;font-size:26px;line-height:1.1;color:var(--navy,#0B2A5C)}.cl-kpi span{font-size:12.5px;color:var(--muted)}
.cl-kpi.warn b{color:#B42318}.cl-kpi.good b{color:#067647}.cl-kpi.on{outline:2px solid var(--gold,#C9962B)}
.cl-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px;margin-bottom:14px}
@media (max-width:900px){.cl-grid{grid-template-columns:1fr}}
.cl-bars{display:flex;align-items:flex-end;gap:3px;height:110px;padding:6px 0 0}
.cl-bars div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:10px;color:var(--muted)}
.cl-bars i{display:block;width:100%;background:var(--gold,#C9962B);border-radius:4px 4px 0 0;min-height:2px}.cl-bars i.m{background:#E7A39B}
.cl-cat{font-size:12.5px;padding:4px 6px;border-radius:8px;max-width:170px}
.cl-who small{display:block;color:var(--muted)}
.cl-rec audio{height:32px;max-width:220px}
.cl-open{color:#B42318;font-weight:600;font-size:12px}
</style>`;

const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']];
const range = (p) => {
  const t = abDate(), d = (n) => abDate(Date.now() - n * 864e5);
  return p === 'today' ? [t, t] : p === 'yesterday' ? [d(1), d(1)] : [d(Number(p) - 1), t];
};
const nameOf = (c) => c.caller_name || (c.contacts?.full_name) || '';

export async function render(el, _p, { setTitle } = {}) {
  let tab = 'log', period = 'today', filter = 'all', rows = [], allRecent = [];
  const edit = can('crm.edit'), admin = can('settings.manage');
  el.innerHTML = `${CSS}<div class="toolbar"><div class="seg" id="tab"><button data-k="log">Calls</button><button data-k="back">Call back <span id="backN" class="badge b-RED" hidden></span></button>${admin ? '<button data-k="lines">Phone lines</button>' : ''}</div>
    <div class="seg" id="per">${PERIODS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div><div class="grow"></div>
    <button class="btn" id="csv">${icon('file')} Export</button>${edit ? `<button class="btn btn-primary" id="new">${icon('plus')} Log a call</button>` : ''}</div><div id="body"></div>`;
  el.querySelector('#tab').onclick = (e) => { const b = e.target.closest('button'); if (b?.dataset.k) { tab = b.dataset.k; draw(); } };
  el.querySelector('#per').onclick = (e) => { if (e.target.dataset.k) { period = e.target.dataset.k; filter = 'all'; load(); } };
  el.querySelector('#new')?.addEventListener('click', () => editCall({ direction: 'inbound', channel: 'phone', status: 'answered', source: 'unknown', category: 'unreviewed' }));
  el.querySelector('#csv').onclick = () => downloadCsv(`calls-${range(period).join('_')}.csv`, [['When', 'Direction', 'Channel', 'Status', 'Number', 'Name', 'Location', 'Source', 'Campaign', 'Category', 'Service', 'Notes', 'Called back'],
    ...rows.map((c) => [fmtDateTime(c.occurred_at), c.direction, c.channel, c.status, c.from_number, nameOf(c), c.caller_location, SOURCE_LABEL[c.source] || c.source, c.campaign, CAT_LABEL[c.category], c.service_interest, c.notes, c.called_back_at || ''])]);

  // A missed call is still open until we call back, they reach us later, or it is marked done.
  const openMissed = (list) => {
    const later = new Map();
    for (const c of list) if (c.direction === 'outbound' || c.status === 'answered') {
      const k = phoneKey(c.direction === 'outbound' ? c.to_number || c.from_number : c.from_number); const t = +new Date(c.occurred_at);
      if (k && (!later.has(k) || later.get(k) < t)) later.set(k, t);
    }
    return list.filter((c) => c.direction === 'inbound' && ['missed', 'voicemail'].includes(c.status) && !c.called_back_at && !NOT_LEADS.includes(c.category)
      && !(later.get(phoneKey(c.from_number)) > +new Date(c.occurred_at)));
  };

  async function load() {
    el.querySelectorAll('#per button').forEach((b) => b.classList.toggle('on', b.dataset.k === period));
    const [a, b] = range(period);
    const since = new Date(Date.parse(a + 'T00:00:00Z') - 864e5).toISOString(), until = new Date(Date.parse(b + 'T00:00:00Z') + 2 * 864e5).toISOString();
    const { data, error } = await db.from('calls').select('*, contacts(id, full_name, stage)').gte('occurred_at', since).lt('occurred_at', until).order('occurred_at', { ascending: false }).limit(2000);
    if (error) { el.querySelector('#body').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    rows = (data || []).filter((c) => { const d = abDate(c.occurred_at); return d >= a && d <= b; });
    // The call-back list looks at the last 14 days, whatever period is shown.
    const { data: recent } = await db.from('calls').select('*, contacts(id, full_name, stage)').gte('occurred_at', new Date(Date.now() - 14 * 864e5).toISOString()).order('occurred_at', { ascending: false }).limit(3000);
    allRecent = recent || [];
    draw();
  }

  function draw() {
    el.querySelectorAll('#tab button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    const open = openMissed(allRecent), n = el.querySelector('#backN');
    n.hidden = !open.length; n.textContent = open.length;
    el.querySelector('#per').style.visibility = tab === 'log' ? '' : 'hidden';
    if (tab === 'lines') return lines();
    if (tab === 'back') return callBack(open);
    const inb = rows.filter((c) => c.direction === 'inbound'), people = new Set(inb.map((c) => phoneKey(c.from_number) || c.id));
    const cnt = (f) => inb.filter(f).length;
    const openHere = openMissed(rows).length;
    const K = [['all', inb.length, 'Calls in', ''], ['people', people.size, 'Different people', ''], ['answered', cnt((c) => c.status === 'answered'), 'Answered', 'good'],
      ['missed', cnt((c) => ['missed', 'voicemail'].includes(c.status)), 'Missed', 'warn'], ['open', openHere, 'Still to call back', openHere ? 'warn' : 'good'],
      ['unreviewed', cnt((c) => c.category === 'unreviewed'), 'To review', ''], ['potential', cnt((c) => c.category === 'potential'), 'Potential clients', ''],
      ['booked', cnt((c) => c.category === 'booked'), 'Booked consultation', ''], ['paying', cnt((c) => c.category === 'paying'), 'Paying clients', 'good'],
      ['just_asking', cnt((c) => c.category === 'just_asking'), 'Just asking', ''], ['spam', cnt((c) => NOT_LEADS.includes(c.category)), 'Spam / not leads', '']];
    // Where calls came from, and what they turned into.
    const bySrc = {}; inb.forEach((c) => { const s = bySrc[c.source] ||= { total: 0, missed: 0, potential: 0, booked: 0, paying: 0, asking: 0 };
      s.total++; if (['missed', 'voicemail'].includes(c.status)) s.missed++; if (c.category === 'potential') s.potential++; if (c.category === 'booked') s.booked++; if (c.category === 'paying') s.paying++; if (c.category === 'just_asking') s.asking++; });
    const hours = Array.from({ length: 24 }, () => [0, 0]);
    inb.forEach((c) => { const h = Number(new Date(c.occurred_at).toLocaleString('en-CA', { timeZone: AB_TZ, hour: 'numeric', hourCycle: 'h23' })); hours[h % 24][['missed', 'voicemail'].includes(c.status) ? 1 : 0]++; });
    const lo = Math.min(7, ...hours.map((h, i) => (h[0] + h[1] ? i : 24))), hi = Math.max(18, ...hours.map((h, i) => (h[0] + h[1] ? i : 0)));
    const max = Math.max(1, ...hours.map((h) => h[0] + h[1]));
    const list = rows.filter((c) => filter === 'all' ? true : filter === 'people' ? true : filter === 'answered' ? c.status === 'answered' && c.direction === 'inbound'
      : filter === 'missed' ? c.direction === 'inbound' && ['missed', 'voicemail'].includes(c.status) : filter === 'open' ? openMissed(rows).includes(c)
      : filter === 'spam' ? NOT_LEADS.includes(c.category) : c.category === filter);
    const body = el.querySelector('#body');
    body.innerHTML = `<div class="cl-kpis">${K.map(([k, v, l, cls]) => `<button class="cl-kpi ${cls} ${filter === k ? 'on' : ''}" data-f="${k}"><b>${v}</b><span>${l}</span></button>`).join('')}</div>
      ${inb.length ? `<div class="cl-grid"><div class="card"><div class="card-h"><h3>Where the calls came from</h3><small class="dk-muted">Ask every caller “How did you hear about us?”</small></div><div class="table-wrap"><table class="t"><thead><tr><th>Source</th><th>Calls</th><th>Missed</th><th>Just asking</th><th>Potential</th><th>Booked</th><th>Paying</th></tr></thead><tbody>
        ${Object.entries(bySrc).sort((x, y) => y[1].total - x[1].total).map(([s, v]) => `<tr><td><b>${esc(SOURCE_LABEL[s] || s)}</b></td><td>${v.total}</td><td>${v.missed}</td><td>${v.asking}</td><td>${v.potential}</td><td>${v.booked}</td><td>${v.paying}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Calls by hour (Alberta time)</h3><small class="dk-muted"><span style="color:var(--gold,#C9962B)">■</span> answered <span style="color:#E7A39B">■</span> missed</small></div><div class="card-b"><div class="cl-bars">
        ${hours.slice(lo, hi + 1).map((h, i) => `<div title="${h[0]} answered, ${h[1]} missed"><i class="m" style="height:${h[1] / max * 90}px"></i><i style="height:${h[0] / max * 90}px"></i>${(lo + i) % 12 || 12}${lo + i < 12 ? 'a' : 'p'}</div>`).join('')}</div>
        <p class="dk-muted" style="font-size:12.5px;margin-top:8px">Busy hours are when to have someone answering, or when to post (calls come in soon after a post).</p></div></div></div>` : ''}
      <div class="card"><div class="table-wrap">${list.length ? table(list) : `<div class="empty">${icon('phone')}<div>No calls ${filter === 'all' ? 'in this period' : 'with this filter'}.${edit ? ' Click <b>Log a call</b> to add one.' : ''}</div></div>`}</div></div>`;
    body.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = filter === b.dataset.f ? 'all' : b.dataset.f; draw(); }));
    wireRows(body, list);
  }

  const table = (list) => `<table class="t"><thead><tr><th>When</th><th>Caller</th><th>Call</th><th>Source</th><th>What it is</th><th>Notes</th><th></th></tr></thead><tbody>
    ${list.map((c) => { const out = c.direction === 'outbound', num = out ? c.to_number || c.from_number : c.from_number; return `<tr>
      <td style="white-space:nowrap">${esc(new Date(c.occurred_at).toLocaleString('en-CA', { timeZone: AB_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td>
      <td class="cl-who">${c.contacts ? `<a href="#/contacts/${c.contacts.id}"><b>${esc(c.contacts.full_name)}</b></a>` : `<b>${esc(nameOf(c) || fmtPhone(num) || 'Unknown')}</b>`}<small>${nameOf(c) || c.contacts ? esc(fmtPhone(num)) : ''}${c.caller_location ? ' · ' + esc(c.caller_location) : ''}</small></td>
      <td><span class="badge ${c.status === 'answered' ? 'b-GREEN' : ['missed', 'voicemail'].includes(c.status) ? 'b-RED' : ''}">${out ? '↗ We called' : esc(STATUSES.find(([k]) => k === c.status)?.[1] || c.status)}</span>
        <small style="display:block;color:var(--muted)">${esc(CHANNELS.find(([k]) => k === c.channel)?.[1] || c.channel)}${c.duration_sec ? ' · ' + Math.ceil(c.duration_sec / 60) + ' min' : ''}</small>
        ${c.recording_path ? `<button class="btn btn-sm" data-play="${c.id}" style="margin-top:4px">${icon('phone')} ${c.status === 'voicemail' ? 'Voicemail' : 'Recording'}</button><span class="cl-rec" id="rec-${c.id}"></span>` : ''}</td>
      <td>${esc(SOURCE_LABEL[c.source] || c.source)}${c.campaign ? `<small style="display:block;color:var(--muted)">${esc(c.campaign)}</small>` : ''}</td>
      <td>${edit && !out ? `<select class="input cl-cat" data-cat="${c.id}">${CATEGORIES.map(([k, l]) => `<option value="${k}" ${c.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="badge ${CAT_CLS[c.category] || ''}">${esc(CAT_LABEL[c.category] || '')}</span>`}</td>
      <td style="max-width:260px;font-size:13px">${esc((c.notes || '').slice(0, 140))}${c.follow_up_on ? `<small style="display:block;color:#B42318">Follow up ${esc(c.follow_up_on)}</small>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">${num ? `<a class="btn btn-sm" href="tel:${esc(num)}" title="Call">${icon('phone')}</a>` : ''}${edit ? ` <button class="btn btn-sm" data-e="${c.id}">Open</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`;

  function wireRows(root, list) {
    root.querySelectorAll('[data-cat]').forEach((s) => (s.onchange = async () => {
      const c = list.find((x) => x.id === s.dataset.cat);
      const { error } = await db.from('calls').update({ category: s.value, handled_by: state.profile.id }).eq('id', c.id);
      if (error) return fail(error);
      c.category = s.value; await syncContactStage(c); toast(`Marked: ${CAT_LABEL[s.value]}`);
    }));
    root.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => editCall(list.find((x) => x.id === b.dataset.e))));
    root.querySelectorAll('[data-play]').forEach((b) => (b.onclick = async () => {
      const c = list.find((x) => x.id === b.dataset.play);
      const { data, error } = await db.storage.from('call-recordings').createSignedUrl(c.recording_path, 600);
      if (error) return fail(error);
      root.querySelector(`#rec-${c.id}`).innerHTML = `<audio controls autoplay src="${esc(data.signedUrl)}"></audio>`; b.remove();
    }));
  }

  // The contact's lead stage follows what the call turned into.
  async function syncContactStage(c) {
    const stage = { potential: 'contacted', booked: 'consultation_booked', paying: 'retained' }[c.category];
    if (!c.contact_id || !stage) return;
    const order = ['new', 'contacted', 'consultation_booked', 'assessed', 'retained'];
    const cur = c.contacts?.stage;
    if (order.indexOf(cur) < order.indexOf(stage)) await db.from('contacts').update({ stage }).eq('id', c.contact_id);
  }

  function callBack(open) {
    // One line per person: their latest missed call and how many times they tried.
    const by = new Map();
    for (const c of open) { const k = phoneKey(c.from_number) || c.id; const g = by.get(k); if (g) { g.tries++; g.ids.push(c.id); } else by.set(k, { c, tries: 1, ids: [c.id] }); }
    const groups = [...by.values()].sort((a, b) => +new Date(a.c.occurred_at) - +new Date(b.c.occurred_at));
    const body = el.querySelector('#body');
    body.innerHTML = `<div class="alert info">People who called and did not reach anyone in the last 14 days, oldest first. Call them back, then click <b>Done</b>. A call back logged here (or them reaching you later) also clears them.</div>
      <div class="card"><div class="table-wrap">${groups.length ? `<table class="t"><thead><tr><th>Missed</th><th>Caller</th><th>Tries</th><th>Source</th><th>What it is</th><th></th></tr></thead><tbody>
      ${groups.map(({ c, tries, ids }) => `<tr><td style="white-space:nowrap">${esc(new Date(c.occurred_at).toLocaleString('en-CA', { timeZone: AB_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}
          <small class="cl-open" style="display:block">${esc(ago(c.occurred_at))}</small></td>
        <td class="cl-who"><b>${esc(nameOf(c) || fmtPhone(c.from_number) || 'Unknown')}</b><small>${nameOf(c) ? esc(fmtPhone(c.from_number)) : ''}${c.caller_location ? ' · ' + esc(c.caller_location) : ''} · ${esc(CHANNELS.find(([k]) => k === c.channel)?.[1] || '')}</small>
          ${c.notes ? `<small>${esc(c.notes.slice(0, 120))}</small>` : ''}</td>
        <td>${tries}</td><td>${esc(SOURCE_LABEL[c.source] || c.source)}</td><td><span class="badge ${CAT_CLS[c.category] || ''}">${esc(CAT_LABEL[c.category])}</span></td>
        <td style="text-align:right;white-space:nowrap">${c.from_number ? `<a class="btn btn-sm btn-gold" href="${c.channel === 'whatsapp' ? `https://wa.me/${esc(c.from_number.replace(/\D/g, ''))}` : `tel:${esc(c.from_number)}`}" target="_blank" rel="noopener">${icon('phone')} Call</a>` : ''}
          ${edit ? `<button class="btn btn-sm btn-primary" data-done="${ids.join(',')}">${icon('check')} Done</button> <button class="btn btn-sm" data-e="${c.id}">Open</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('check')}<div>Everyone has been called back.</div></div>`}</div></div>`;
    body.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => {
      const ids = b.dataset.done.split(',');
      const { error } = await db.from('calls').update({ called_back_at: new Date().toISOString(), handled_by: state.profile.id }).in('id', ids);
      if (error) return fail(error);
      toast('Marked as called back'); load();
    }));
    body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => editCall(open.find((x) => x.id === b.dataset.e))));
  }
  const ago = (t) => { const m = Math.round((Date.now() - +new Date(t)) / 6e4); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

  async function editCall(c) {
    const local = (t) => { const d = t ? new Date(t) : new Date(); const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: AB_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
    const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const out = c.direction === 'outbound';
    modal({
      title: c.id ? (nameOf(c) || fmtPhone(c.from_number) || 'Call') : 'Log a call',
      body: `<div class="row-2"><div class="field"><label>Phone / WhatsApp number</label><input class="input" id="num" type="tel" value="${esc((out ? c.to_number : c.from_number) || '')}" placeholder="e.g. 403 555 0123"></div>
          <div class="field"><label>Name</label><input class="input" id="nm" value="${esc(nameOf(c))}" placeholder="If they said it"></div></div>
        <div class="row-2"><div class="field"><label>When (Alberta time)</label><input class="input" id="at" type="datetime-local" value="${local(c.occurred_at)}"></div>
          <div class="field"><label>How</label><div class="row" style="gap:6px"><select class="input" id="ch">${opt(CHANNELS, c.channel)}</select><select class="input" id="st">${opt([['answered', 'They called: answered'], ['missed', 'They called: missed'], ['voicemail', 'They left a voicemail'], ['outgoing', 'We called them']], out ? 'outgoing' : c.status)}</select></div></div></div>
        <div class="row-2"><div class="field"><label>How did they hear about us?</label><select class="input" id="src">${opt(SOURCES, c.source)}</select></div>
          <div class="field"><label>What is it?</label><select class="input" id="cat">${opt(CATEGORIES.map(([k, l]) => [k, l]), c.category)}</select></div></div>
        <div class="row-2"><div class="field"><label>Service they asked about</label><select class="input" id="svc"><option value="">—</option>${Object.entries(SERVICE_LABEL).map(([k, l]) => `<option value="${esc(l)}" ${c.service_interest === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label>Language</label><input class="input" id="lang" value="${esc(c.language || '')}" placeholder="e.g. Tigrinya, Amharic, English"></div></div>
        <div class="row-2"><div class="field"><label>Campaign / post (optional)</label><input class="input" id="camp" value="${esc(c.campaign || '')}" placeholder="e.g. Refugee video Nov 26"></div>
          <div class="field"><label>Follow up on</label><input class="input" id="fu" type="date" value="${esc(c.follow_up_on || '')}"></div></div>
        <div class="field"><label>Notes</label><textarea class="input" id="nt" rows="3" placeholder="What they need, their situation, what you told them…">${esc(c.notes || '')}</textarea></div>
        ${c.caller_location ? `<p class="dk-muted" style="font-size:12.5px">Caller ID location: ${esc(c.caller_location)}</p>` : ''}
        ${c.contacts ? `<p style="font-size:13.5px">Contact: <a href="#/contacts/${c.contacts.id}"><b>${esc(c.contacts.full_name)}</b></a></p>` : ''}`,
      actions: [
        ...(c.id && can('crm.delete') ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!(await confirmBox('Delete call', 'Delete this call from the log?', 'Delete', true))) return false;
          const { error } = await db.from('calls').delete().eq('id', c.id); if (error) throw error; toast('Deleted'); load(); } }] : []),
        ...(c.id && !c.contact_id ? [{ label: 'Save + add to Contacts', onClick: (m) => save(m, true) }] : []),
        { label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: (m) => save(m, false) }],
    });
    async function save(m, makeContact) {
      const v = (q) => m.querySelector(q).value.trim();
      const st = v('#st'), num = v('#num'), outgoing = st === 'outgoing';
      const at = v('#at');
      const row = { occurred_at: at ? toAB(at) : new Date().toISOString(), direction: outgoing ? 'outbound' : 'inbound', status: st, channel: v('#ch'),
        from_number: outgoing ? c.from_number || null : num || null, to_number: outgoing ? num || null : c.to_number || null,
        caller_name: v('#nm') || null, source: v('#src'), category: v('#cat'), service_interest: v('#svc') || null, language: v('#lang') || null,
        campaign: v('#camp') || null, follow_up_on: v('#fu') || null, notes: v('#nt') || null, handled_by: state.profile.id };
      if (!num && !row.caller_name) throw new Error('Enter the number or the name.');
      if (!c.contact_id && num) { const { data: cid } = await db.rpc('contact_by_phone', { p: num }); if (cid) row.contact_id = cid; }
      if (makeContact && !row.contact_id) {
        const { data: ct, error: ce } = await db.from('contacts').insert({ full_name: row.caller_name || fmtPhone(num), phone: num || null, source: row.source === 'unknown' ? 'phone' : row.source,
          stage: { booked: 'consultation_booked', paying: 'retained' }[row.category] || 'new' }).select('id').single();
        if (ce) throw ce; row.contact_id = ct.id;
      }
      const { data: saved, error } = c.id ? await db.from('calls').update(row).eq('id', c.id).select('*, contacts(id, full_name, stage)').single()
        : await db.from('calls').insert(row).select('*, contacts(id, full_name, stage)').single();
      if (error) throw error;
      await syncContactStage(saved);
      toast(makeContact ? 'Saved and added to Contacts' : 'Call saved'); load();
    }
  }
  // "2026-11-27T08:16" in Alberta time → ISO (works whatever the computer's own time zone is).
  function toAB(local) {
    const guess = Date.parse(local + ':00Z');
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: AB_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
    return new Date(guess - off).toISOString();
  }

  async function lines() {
    el.querySelector('#body').innerHTML = '<div class="loading"><div class="spin"></div></div>';
    const { data: ls = [], error } = await db.from('phone_lines').select('*').order('created_at');
    const body = el.querySelector('#body');
    if (error) { body.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    const hook = 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/phone';
    body.innerHTML = `<div class="alert info"><b>Business phone lines (Twilio).</b> Calls to these numbers ring the forwarding phone and are logged here by themselves: answered or missed, how long, the recording (with a “this call may be recorded” notice), and voicemails. Missed callers get a text with your booking link.
        Tip: put a different number on each platform (TikTok, Facebook, Instagram…) and every call shows exactly which one it came from.</div>
      <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Lines</h3><div class="grow"></div><button class="btn btn-primary btn-sm" id="addl">${icon('plus')} Add a line</button></div><div class="table-wrap">
      ${ls.length ? `<table class="t"><thead><tr><th>Number</th><th>Label</th><th>Source</th><th>Rings</th><th>Record</th><th>Text missed</th><th></th></tr></thead><tbody>${ls.map((l) => `<tr style="${l.active ? '' : 'opacity:.55'}">
        <td><b>${esc(fmtPhone(l.number))}</b></td><td>${esc(l.label)}</td><td>${esc(SOURCE_LABEL[l.source] || l.source)}</td><td>${esc(fmtPhone(l.forward_to) || 'Voicemail only')}</td>
        <td>${l.record ? 'Yes' : 'No'}</td><td>${l.text_missed ? 'Yes' : 'No'}</td><td style="text-align:right"><button class="btn btn-sm" data-l="${l.id}">Edit</button></td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('phone')}<div>No business lines yet.</div></div>`}</div></div>
      <div class="card"><div class="card-h"><h3>Connecting a Twilio number</h3></div><div class="card-b" style="font-size:14px;line-height:1.6">
        <ol style="margin-left:18px"><li>In Twilio, buy a Canadian number (Phone Numbers → Buy a number).</li>
        <li>On that number, under <b>Voice configuration</b>: “A call comes in” → Webhook → <code>${hook}?op=voice</code> (HTTP POST), and “Call status changes” → <code>${hook}?op=status</code>.</li>
        <li>In Supabase → Edge Functions → Secrets, add <code>TWILIO_ACCOUNT_SID</code> and <code>TWILIO_AUTH_TOKEN</code> (from the Twilio console). Never paste them in chat or email.</li>
        <li>Add the number here with the phone it should ring.</li><li>Call it from another phone: it shows up in <b>Calls</b> within seconds.</li></ol></div></div>`;
    body.querySelector('#addl').onclick = () => editLine({ source: 'other', record: true, text_missed: true, active: true });
    body.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => editLine(ls.find((x) => x.id === b.dataset.l))));
  }
  function editLine(l) {
    const e164 = (s) => { const d = String(s || '').replace(/\D/g, ''); return !d ? null : d.length === 10 ? '+1' + d : '+' + d; };
    modal({ title: l.id ? `Line ${fmtPhone(l.number)}` : 'Add a phone line',
      body: `<div class="row-2"><div class="field"><label>Twilio number</label><input class="input" id="n" value="${esc(l.number || '')}" placeholder="+1 403 555 0123"></div>
          <div class="field"><label>Label</label><input class="input" id="lb" value="${esc(l.label || '')}" placeholder="e.g. TikTok line"></div></div>
        <div class="row-2"><div class="field"><label>Calls on this line come from</label><select class="input" id="s">${SOURCES.map(([k, v]) => `<option value="${k}" ${l.source === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label>Ring this phone</label><input class="input" id="f" value="${esc(l.forward_to || '')}" placeholder="+1 403 915 4230 (blank = voicemail only)"></div></div>
        <label class="row" style="gap:8px"><input type="checkbox" id="r" ${l.record ? 'checked' : ''}> Record calls (callers hear “this call may be recorded”)</label>
        <label class="row" style="gap:8px"><input type="checkbox" id="t" ${l.text_missed ? 'checked' : ''}> Text missed callers the booking link</label>
        <label class="row" style="gap:8px"><input type="checkbox" id="a" ${l.active ? 'checked' : ''}> Active</label>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const v = (q) => m.querySelector(q).value.trim(), c = (q) => m.querySelector(q).checked;
        const row = { number: e164(v('#n')), label: v('#lb') || 'Business line', source: v('#s'), forward_to: e164(v('#f')), record: c('#r'), text_missed: c('#t'), active: c('#a') };
        if (!row.number) throw new Error('Enter the Twilio number.');
        const { error } = l.id ? await db.from('phone_lines').update(row).eq('id', l.id) : await db.from('phone_lines').insert(row);
        if (error) throw new Error(error.code === '23514' ? 'Check the numbers (use the full number with area code).' : error.code === '23505' ? 'That number is already added.' : error.message);
        toast('Line saved'); lines();
      } }] });
  }

  setTitle?.('Call Log');
  load();
}
