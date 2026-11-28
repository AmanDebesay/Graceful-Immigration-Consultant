// Call Log: every phone / WhatsApp call — who, from which country, what it turned into, and who still needs a call back.
// Excel-style filters on every column, rename, bulk delete (e.g. repeat calls), and flags for people to watch for.
// The overview (where calls came from, by hour, by country) is on the Marketing page.
import { db, state, can, esc, icon, modal, toast, fail, fmtDateTime, confirmBox, SERVICE_LABEL } from '../core.js';
import { downloadCsv, downloadXlsx } from '../fin.js';
import { SOURCES, SOURCE_LABEL, CATEGORIES, CAT_LABEL, CAT_CLS, NOT_LEADS, CHANNELS, STATUSES, phoneKey, fmtPhone, abDate, AB_TZ, countryOf, otherParty } from '../calls-common.js';
import { loadFlags, matchFlags, flagBadge, flagBanner, flagPerson } from '../flags.js';

const CSS = `<style>
.cl-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.cl-kpi{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer;color:inherit;text-align:left;font:inherit}
.cl-kpi b{display:block;font-size:26px;line-height:1.1;color:var(--navy,#0B2A5C)}.cl-kpi span{font-size:12.5px;color:var(--muted)}
.cl-kpi.warn b{color:#B42318}.cl-kpi.good b{color:#067647}.cl-kpi.on{outline:2px solid var(--gold,#C9962B)}
.cl-cat{font-size:12.5px;padding:4px 6px;border-radius:8px;max-width:170px}
.cl-who small{display:block;color:var(--muted)}
.cl-rec audio{height:32px;max-width:220px}
.cl-open{color:#B42318;font-weight:600;font-size:12px}
.cl-th{display:flex;align-items:center;gap:4px;white-space:nowrap}
.cl-fb{border:1px solid var(--line);background:transparent;color:inherit;border-radius:6px;padding:1px 5px;font-size:11px;cursor:pointer;line-height:1.4}
.cl-fb.on{background:var(--gold,#C9962B);color:#1B1405;border-color:var(--gold,#C9962B)}
.cl-pop{position:fixed;z-index:200;width:270px;max-height:440px;display:flex;flex-direction:column;background:#fff;color:#1C2333;border:1px solid #D0D5DD;border-radius:12px;box-shadow:0 14px 40px rgba(16,24,40,.25);padding:10px;font-size:13.5px}
.cl-pop .lst{overflow:auto;flex:1;margin:6px 0;border:1px solid #EEF0F5;border-radius:8px;padding:4px 6px;min-height:60px}
.cl-pop label{display:flex;gap:7px;align-items:center;padding:3px 2px;cursor:pointer}.cl-pop label small{margin-left:auto;color:#667085}
.cl-pop input[type=search],.cl-pop input[type=text]{width:100%;padding:7px 9px;border:1px solid #D0D5DD;border-radius:8px;font:inherit;font-size:13px}
.cl-pop .srt{display:flex;gap:6px;margin-bottom:6px}.cl-pop .srt button,.cl-pop .ft button{flex:1;padding:6px;border-radius:8px;border:1px solid #D0D5DD;background:#fff;cursor:pointer;font:inherit;font-size:12.5px}
.cl-pop .ft{display:flex;gap:6px}.cl-pop .ft .ok{background:#0B2A5C;color:#fff;border-color:#0B2A5C}
.cl-bulk{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#FFF8E8;border:1px solid #F1DDAE;border-radius:10px;padding:8px 12px;margin-bottom:10px;color:#1C2333}
.cl-flagrow td{background:rgba(180,35,24,.05)}
</style>`;

const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All'], ['custom', 'Dates…']];
const nameOf = (c) => c.caller_name || (c.contacts?.full_name) || '';
const statusLabel = (c) => (c.direction === 'outbound' ? 'We called' : STATUSES.find(([k]) => k === c.status)?.[1] || c.status);
const chLabel = (c) => CHANNELS.find(([k]) => k === c.channel)?.[1] || c.channel;
const dayLabel = (c) => new Date(c.occurred_at).toLocaleDateString('en-CA', { timeZone: AB_TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export async function render(el, _p, { setTitle } = {}) {
  let tab = 'log', period = '7', from = abDate(Date.now() - 6 * 864e5), to = abDate(), quick = 'all', rows = [], allRecent = [], q = '', flags = [];
  let cf = {}, sort = { k: 'when', dir: -1 }, sel = new Set();
  const edit = can('crm.edit'), del = can('crm.delete'), admin = can('settings.manage');
  const range = () => {
    const t = abDate(), d = (n) => abDate(Date.now() - n * 864e5);
    return period === 'today' ? [t, t] : period === 'yesterday' ? [d(1), d(1)] : period === 'all' ? ['2000-01-01', t] : period === 'custom' ? [from, to] : [d(Number(period) - 1), t];
  };
  el.innerHTML = `${CSS}<div class="toolbar"><div class="seg" id="tab"><button data-k="log">Calls</button><button data-k="back">Call back <span id="backN" class="badge b-RED" hidden></span></button>${admin ? '<button data-k="lines">Phone lines</button>' : ''}</div>
    <div class="seg" id="per">${PERIODS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
    <span id="cust" hidden><input class="input" type="date" id="d1" style="width:150px"> – <input class="input" type="date" id="d2" style="width:150px"></span><div class="grow"></div>
    ${can('marketing.view') ? `<a class="btn" href="#/marketing?tab=calls">${icon('trend')} Overview</a>` : ''}
    <button class="btn btn-gold" id="xl">${icon('file')} Excel</button><button class="btn" id="csv">CSV</button>${edit ? `<button class="btn btn-primary" id="new">${icon('plus')} Log a call</button>` : ''}</div><div id="body"></div>`;
  el.querySelector('#tab').onclick = (e) => { const b = e.target.closest('button'); if (b?.dataset.k) { tab = b.dataset.k; draw(); } };
  el.querySelector('#per').onclick = (e) => { const k = e.target.dataset.k; if (!k) return; period = k; quick = 'all'; sel.clear(); if (k === 'custom') { el.querySelector('#d1').value = from; el.querySelector('#d2').value = to; } load(); };
  const onDates = () => { from = el.querySelector('#d1').value || from; to = el.querySelector('#d2').value || to; if (from > to) [from, to] = [to, from]; load(); };
  el.querySelector('#d1').onchange = onDates; el.querySelector('#d2').onchange = onDates;
  el.querySelector('#new')?.addEventListener('click', () => editCall({ direction: 'inbound', channel: 'phone', status: 'answered', source: 'unknown', category: 'unreviewed' }));

  // ── Columns: each can be filtered like Excel (tick the values to show) and sorted ──
  const flagsOf = (c) => matchFlags(flags, { phone: otherParty(c), name: nameOf(c) });
  const COLS = [
    { k: 'when', label: 'When', val: dayLabel, sortv: (c) => c.occurred_at },
    { k: 'caller', label: 'Caller', val: (c) => nameOf(c) || fmtPhone(otherParty(c)) || 'Unknown', text: (c) => `${nameOf(c)} ${otherParty(c)} ${otherParty(c).replace(/\D/g, '')}` },
    { k: 'country', label: 'Country', val: (c) => countryOf(otherParty(c)) },
    { k: 'call', label: 'Call', val: statusLabel },
    { k: 'channel', label: 'Channel', val: chLabel, hidden: true },
    { k: 'source', label: 'Source', val: (c) => SOURCE_LABEL[c.source] || c.source },
    { k: 'cat', label: 'What it is', val: (c) => CAT_LABEL[c.category] || c.category },
    { k: 'flag', label: 'Flag', val: (c) => (flagsOf(c).length ? 'Flagged' : 'Not flagged'), hidden: true },
    { k: 'notes', label: 'Notes', val: (c) => (c.notes ? 'Has notes' : 'No notes'), text: (c) => c.notes || '' },
  ];
  const COL = Object.fromEntries(COLS.map((c) => [c.k, c]));
  const passCol = (c, k) => { const f = cf[k]; if (!f) return true; const col = COL[k];
    if (f.vals && !f.vals.has(col.val(c))) return false;
    if (f.text && !(col.text || col.val)(c).toLowerCase().includes(f.text.toLowerCase())) return false; return true; };
  const matchesQ = (c) => { if (!q) return true; const d = q.replace(/\D/g, ''), t = q.toLowerCase();
    return (d.length >= 3 && otherParty(c).replace(/\D/g, '').includes(d)) || nameOf(c).toLowerCase().includes(t) || (c.notes || '').toLowerCase().includes(t) || countryOf(otherParty(c)).toLowerCase().includes(t); };
  const filtered = (except) => rows.filter((c) => matchesQ(c) && COLS.every((col) => col.k === except || passCol(c, col.k)));
  const activeFilters = () => Object.keys(cf).length + (q ? 1 : 0);

  const HEAD = ['When (Alberta time)', 'Direction', 'Channel', 'Status', 'Number', 'Name', 'Country', 'Location', 'Source', 'Campaign', 'What it is', 'Service', 'Language', 'Flagged', 'Notes', 'Called back'];
  const line = (c) => [new Date(c.occurred_at).toLocaleString('en-CA', { timeZone: AB_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    c.direction === 'outbound' ? 'We called' : 'They called', chLabel(c), statusLabel(c), otherParty(c), nameOf(c), countryOf(otherParty(c)), c.caller_location || '',
    SOURCE_LABEL[c.source] || c.source, c.campaign || '', CAT_LABEL[c.category] || c.category, c.service_interest || '', c.language || '',
    flagsOf(c).length ? 'Yes' : '', c.notes || '', c.called_back_at ? fmtDateTime(c.called_back_at) : ''];
  const fileBase = () => `calls-${range()[0] === '2000-01-01' ? 'all' : range().join('_')}${activeFilters() ? '-filtered' : ''}`;
  el.querySelector('#csv').onclick = () => downloadCsv(`${fileBase()}.csv`, [HEAD, ...visibleList().map(line)]);
  el.querySelector('#xl').onclick = async () => {
    const list = visibleList(), inb = list.filter((c) => c.direction === 'inbound');
    const group = (key) => { const m = {}; inb.forEach((c) => { const k = key(c); const g = m[k] ||= [0, 0, 0, 0, 0, 0, 0, 0];
      g[0]++; if (c.status === 'answered') g[1]++; if (['missed', 'voicemail'].includes(c.status)) g[2]++; if (c.category === 'just_asking') g[3]++;
      if (c.category === 'potential') g[4]++; if (c.category === 'booked') g[5]++; if (c.category === 'paying') g[6]++; if (NOT_LEADS.includes(c.category)) g[7]++; });
      return Object.entries(m).sort((a, b) => b[1][0] - a[1][0]).map(([k, v]) => [k, ...v]); };
    const H2 = ['Calls in', 'Answered', 'Missed', 'Just asking', 'Potential', 'Booked', 'Paying', 'Spam / not leads'];
    try {
      await downloadXlsx(`${fileBase()}.xlsx`, [
        ['Calls', [HEAD, ...list.map(line)], [18, 11, 10, 12, 17, 22, 20, 24, 18, 22, 18, 22, 12, 8, 50, 18]],
        ['By country', [['Country', ...H2], ...group((c) => countryOf(c.from_number))], [24, 10, 10, 10, 11, 10, 10, 10, 15]],
        ['By source', [['Source', ...H2], ...group((c) => SOURCE_LABEL[c.source] || c.source)], [26, 10, 10, 10, 11, 10, 10, 10, 15]],
      ]);
    } catch (e) { fail(e); }
  };

  // A missed call is still open until we call back, they reach us later, or it is marked done.
  const openMissed = (list) => {
    const later = new Map();
    for (const c of list) if (c.direction === 'outbound' || c.status === 'answered') {
      const k = phoneKey(otherParty(c)); const t = +new Date(c.occurred_at);
      if (k && (!later.has(k) || later.get(k) < t)) later.set(k, t);
    }
    return list.filter((c) => c.direction === 'inbound' && ['missed', 'voicemail'].includes(c.status) && !c.called_back_at && !NOT_LEADS.includes(c.category)
      && !(later.get(phoneKey(c.from_number)) > +new Date(c.occurred_at)));
  };

  async function load() {
    el.querySelectorAll('#per button').forEach((b) => b.classList.toggle('on', b.dataset.k === period));
    el.querySelector('#cust').hidden = period !== 'custom';
    const [a, b] = range();
    const since = new Date(Date.parse(a + 'T00:00:00Z') - 864e5).toISOString(), until = new Date(Date.parse(b + 'T00:00:00Z') + 2 * 864e5).toISOString();
    const [res, recent, fl] = await Promise.all([
      db.from('calls').select('*, contacts(id, full_name, stage, email)').gte('occurred_at', since).lt('occurred_at', until).order('occurred_at', { ascending: false }).limit(5000),
      db.from('calls').select('*, contacts(id, full_name, stage)').gte('occurred_at', new Date(Date.now() - 14 * 864e5).toISOString()).order('occurred_at', { ascending: false }).limit(3000),
      loadFlags(true)]);
    if (res.error) { el.querySelector('#body').innerHTML = `<div class="alert err">${esc(res.error.message)}</div>`; return; }
    rows = (res.data || []).filter((c) => { const d = abDate(c.occurred_at); return d >= a && d <= b; });
    allRecent = recent.data || []; flags = fl;
    const ids = new Set(rows.map((r) => r.id)); sel = new Set([...sel].filter((x) => ids.has(x)));
    draw();
  }

  function visibleList() {
    const base = filtered();
    const list = base.filter((c) => quick === 'all' || quick === 'people' ? true : quick === 'answered' ? c.status === 'answered' && c.direction === 'inbound'
      : quick === 'missed' ? c.direction === 'inbound' && ['missed', 'voicemail'].includes(c.status) : quick === 'open' ? openMissed(base).includes(c)
      : quick === 'spam' ? NOT_LEADS.includes(c.category) : quick === 'flagged' ? flagsOf(c).length > 0 : c.category === quick);
    const col = COL[sort.k] || COL.when, key = col.sortv || col.val;
    return list.sort((x, y) => { const a = key(x), b = key(y); return (a < b ? -1 : a > b ? 1 : 0) * sort.dir || (x.occurred_at < y.occurred_at ? 1 : -1); });
  }

  function draw() {
    el.querySelectorAll('#tab button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    const open = openMissed(allRecent), n = el.querySelector('#backN');
    n.hidden = !open.length; n.textContent = open.length;
    ['#per', '#cust'].forEach((s) => (el.querySelector(s).style.visibility = tab === 'log' ? '' : 'hidden'));
    if (tab === 'lines') return lines();
    if (tab === 'back') return callBack(open);
    const base = filtered(), inb = base.filter((c) => c.direction === 'inbound'), people = new Set(inb.map((c) => phoneKey(c.from_number) || c.id));
    const cnt = (f) => inb.filter(f).length, openHere = openMissed(base).length, flaggedN = base.filter((c) => flagsOf(c).length).length;
    const K = [['all', inb.length, 'Calls in', ''], ['people', people.size, 'Different people', ''], ['answered', cnt((c) => c.status === 'answered'), 'Answered', 'good'],
      ['missed', cnt((c) => ['missed', 'voicemail'].includes(c.status)), 'Missed', 'warn'], ['open', openHere, 'Still to call back', openHere ? 'warn' : 'good'],
      ['unreviewed', cnt((c) => c.category === 'unreviewed'), 'To review', ''], ['potential', cnt((c) => c.category === 'potential'), 'Potential clients', ''],
      ['booked', cnt((c) => c.category === 'booked'), 'Booked consultation', ''], ['paying', cnt((c) => c.category === 'paying'), 'Paying clients', 'good'],
      ['just_asking', cnt((c) => c.category === 'just_asking'), 'Just asking', ''], ['spam', cnt((c) => NOT_LEADS.includes(c.category)), 'Spam / not leads', ''],
      ...(flaggedN ? [['flagged', flaggedN, '⚑ Flagged people', 'warn']] : [])];
    const list = visibleList();
    const body = el.querySelector('#body');
    body.innerHTML = `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <input class="input" id="q" type="search" placeholder="Search number, name, country or notes…" value="${esc(q)}" style="max-width:320px">
        ${activeFilters() ? `<button class="btn btn-sm" id="clr">Clear all filters (${activeFilters()})</button>` : ''}
        <span class="dk-muted" style="font-size:13px">Showing ${list.length} of ${rows.length} calls · click ▾ on a column to filter or sort it, like in Excel. Excel/CSV export what is shown.</span>
        <div class="grow"></div>${del ? `<button class="btn btn-sm" id="reps" title="Selects every call except the newest one from each number, so you can delete the repeats">Select repeat calls</button>` : ''}</div>
      <div class="cl-kpis">${K.map(([k, v, l, cls]) => `<button class="cl-kpi ${cls} ${quick === k ? 'on' : ''}" data-f="${k}"><b>${v}</b><span>${l}</span></button>`).join('')}</div>
      <div id="bulk"></div>
      <div class="card"><div class="table-wrap">${list.length ? table(list) : `<div class="empty">${icon('phone')}<div>No calls ${activeFilters() || quick !== 'all' ? 'match these filters' : 'in this period'}.${edit ? ' Click <b>Log a call</b> to add one.' : ''}</div></div>`}</div></div>`;
    body.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { quick = quick === b.dataset.f ? 'all' : b.dataset.f; draw(); }));
    let tq = null;
    body.querySelector('#q').oninput = (e) => { clearTimeout(tq); tq = setTimeout(() => { q = e.target.value.trim(); draw(); const i = el.querySelector('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    body.querySelector('#clr')?.addEventListener('click', () => { q = ''; cf = {}; quick = 'all'; draw(); });
    body.querySelector('#reps')?.addEventListener('click', () => {
      const seen = new Set(); sel.clear();
      [...list].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)).forEach((c) => { const k = phoneKey(otherParty(c)); if (!k) return; if (seen.has(k)) sel.add(c.id); else seen.add(k); });
      draw(); toast(sel.size ? `${sel.size} repeat calls selected (the newest call from each number is kept). Check them, then click Delete.` : 'No repeat calls in this list.');
    });
    body.querySelectorAll('[data-fcol]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); colPopup(b, b.dataset.fcol); }));
    body.querySelector('#selall')?.addEventListener('change', (e) => { list.forEach((c) => (e.target.checked ? sel.add(c.id) : sel.delete(c.id))); draw(); });
    body.querySelectorAll('[data-sel]').forEach((x) => (x.onchange = () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); bulkBar(list); }));
    bulkBar(list);
    wireRows(body, list);
  }

  const th = (k, label) => { const on = !!cf[k] || sort.k === k && k !== 'when';
    return `<th><span class="cl-th">${label}<button class="cl-fb ${cf[k] ? 'on' : ''}" data-fcol="${k}" title="Filter / sort">▾${sort.k === k ? (sort.dir > 0 ? '↑' : '↓') : ''}</button></span></th>`; };
  const table = (list) => `<table class="t"><thead><tr>${edit || del ? `<th style="width:28px"><input type="checkbox" id="selall" ${list.length && list.every((c) => sel.has(c.id)) ? 'checked' : ''} aria-label="Select all"></th>` : ''}
    ${th('when', 'When')}${th('caller', 'Caller')}${th('country', 'Country')}${th('call', 'Call')}${th('source', 'Source')}${th('cat', 'What it is')}${th('notes', 'Notes')}<th></th></tr></thead><tbody>
    ${list.map((c) => { const out = c.direction === 'outbound', num = otherParty(c), fl = flagsOf(c); return `<tr class="${fl.length ? 'cl-flagrow' : ''}">
      ${edit || del ? `<td><input type="checkbox" data-sel="${c.id}" ${sel.has(c.id) ? 'checked' : ''} aria-label="Select"></td>` : ''}
      <td style="white-space:nowrap">${esc(new Date(c.occurred_at).toLocaleString('en-CA', { timeZone: AB_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td>
      <td class="cl-who">${c.contacts ? `<a href="#/contacts/${c.contacts.id}"><b>${esc(c.caller_name || c.contacts.full_name)}</b></a>` : `<b>${esc(nameOf(c) || fmtPhone(num) || 'Unknown')}</b>`}
        ${edit ? `<button class="cl-fb" data-ren="${c.id}" title="Change the name">${icon('edit')}</button>` : ''} ${flagBadge(fl)}
        <small>${nameOf(c) ? esc(fmtPhone(num)) : ''}${c.caller_location && c.caller_location !== countryOf(num) ? (nameOf(c) ? ' · ' : '') + esc(c.caller_location) : ''}</small></td>
      <td>${esc(countryOf(num))}</td>
      <td><span class="badge ${c.status === 'answered' ? 'b-GREEN' : ['missed', 'voicemail'].includes(c.status) ? 'b-RED' : ''}">${out ? '↗ We called' : esc(statusLabel(c))}</span>
        <small style="display:block;color:var(--muted)">${esc(chLabel(c))}${c.duration_sec ? ' · ' + Math.ceil(c.duration_sec / 60) + ' min' : ''}</small>
        ${c.recording_path ? `<button class="btn btn-sm" data-play="${c.id}" style="margin-top:4px">${icon('phone')} ${c.status === 'voicemail' ? 'Voicemail' : 'Recording'}</button><span class="cl-rec" id="rec-${c.id}"></span>` : ''}</td>
      <td>${esc(SOURCE_LABEL[c.source] || c.source)}${c.campaign ? `<small style="display:block;color:var(--muted)">${esc(c.campaign)}</small>` : ''}</td>
      <td>${edit && !out ? `<select class="input cl-cat" data-cat="${c.id}">${CATEGORIES.map(([k, l]) => `<option value="${k}" ${c.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="badge ${CAT_CLS[c.category] || ''}">${esc(CAT_LABEL[c.category] || '')}</span>`}</td>
      <td style="max-width:240px;font-size:13px">${esc((c.notes || '').slice(0, 140))}${c.follow_up_on ? `<small style="display:block;color:#B42318">Follow up ${esc(c.follow_up_on)}</small>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">${num ? `<a class="btn btn-sm" href="tel:${esc(num)}" title="Call">${icon('phone')}</a>` : ''}
        ${edit ? ` <button class="btn btn-sm" data-flag="${c.id}" title="${fl.length ? 'Edit flag' : 'Flag this person'}">⚑</button> <button class="btn btn-sm" data-e="${c.id}">Open</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`;

  // ── Excel-style column filter: sort, search the values, tick the ones to show ──
  function colPopup(btn, k) {
    document.querySelector('.cl-pop')?.remove();
    const col = COL[k], base = filtered(k), counts = new Map();
    base.forEach((c) => { const v = col.val(c); counts.set(v, (counts.get(v) || 0) + 1); });
    let vals = [...counts.keys()];
    vals = k === 'when' ? vals.sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0)) : vals.sort((a, b) => String(a).localeCompare(String(b)));
    const cur = cf[k]?.vals, pop = document.createElement('div');
    pop.className = 'cl-pop';
    pop.innerHTML = `<div class="srt"><button data-s="1">Sort A→Z${k === 'when' ? ' (oldest)' : ''}</button><button data-s="-1">Sort Z→A${k === 'when' ? ' (newest)' : ''}</button></div>
      ${col.text ? `<input type="text" id="ct" placeholder="Contains…" value="${esc(cf[k]?.text || '')}" style="margin-bottom:6px">` : ''}
      <input type="search" id="cs" placeholder="Search the list">
      <div class="lst"><label><input type="checkbox" id="call" ${!cur ? 'checked' : ''}> <b>(Select all)</b></label>
        ${vals.map((v) => `<label data-v="${esc(v)}"><input type="checkbox" value="${esc(v)}" ${!cur || cur.has(v) ? 'checked' : ''}> ${esc(v)}<small>${counts.get(v)}</small></label>`).join('') || '<div style="color:#667085;padding:6px">No values</div>'}</div>
      <div class="ft"><button id="cc">Clear filter</button><button class="ok" id="co">OK</button></div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 280)) + 'px';
    pop.style.top = Math.min(r.bottom + 4, innerHeight - pop.offsetHeight - 8) + 'px';
    const boxes = () => [...pop.querySelectorAll('.lst label[data-v] input')];
    pop.querySelector('#call').onchange = (e) => boxes().forEach((b) => { if (!b.closest('label').hidden) b.checked = e.target.checked; });
    pop.querySelector('#cs').oninput = (e) => { const t = e.target.value.toLowerCase(); pop.querySelectorAll('.lst label[data-v]').forEach((l) => (l.hidden = !l.dataset.v.toLowerCase().includes(t))); };
    pop.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { sort = { k, dir: Number(b.dataset.s) }; close(); draw(); }));
    pop.querySelector('#cc').onclick = () => { delete cf[k]; close(); draw(); };
    pop.querySelector('#co').onclick = () => {
      const searchT = pop.querySelector('#cs').value.trim().toLowerCase();
      // Like Excel: with a search typed, OK keeps only the ticked values that match it.
      const ticked = boxes().filter((b) => b.checked && (!searchT || b.value.toLowerCase().includes(searchT))).map((b) => b.value);
      const text = pop.querySelector('#ct')?.value.trim() || '';
      const all = ticked.length === vals.length;
      if (all && !text) delete cf[k]; else cf[k] = { vals: all ? null : new Set(ticked), text };
      close(); quick = 'all'; draw();
    };
    const away = (e) => { if (!pop.contains(e.target)) close(); };
    const close = () => { pop.remove(); document.removeEventListener('mousedown', away); };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    pop.querySelector(col.text ? '#ct' : '#cs').focus();
  }

  function bulkBar(list) {
    const box = el.querySelector('#bulk'); if (!box) return;
    const ids = [...sel];
    if (!ids.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="cl-bulk"><b>${ids.length} selected</b>
      ${edit ? `<select class="input cl-cat" id="bcat"><option value="">Set “What it is”…</option>${CATEGORIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <select class="input cl-cat" id="bsrc"><option value="">Set source…</option>${SOURCES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>` : ''}
      ${del ? `<button class="btn btn-sm btn-danger" id="bdel">${icon('trash')} Delete ${ids.length}</button>` : ''}<button class="btn btn-sm" id="bnone">Clear selection</button></div>`;
    box.querySelector('#bnone').onclick = () => { sel.clear(); draw(); };
    const setMany = async (patch, msg) => { const { error } = await db.from('calls').update({ ...patch, handled_by: state.profile.id }).in('id', ids); if (error) return fail(error); toast(msg); sel.clear(); load(); };
    box.querySelector('#bcat')?.addEventListener('change', (e) => e.target.value && setMany({ category: e.target.value }, `${ids.length} calls marked: ${CAT_LABEL[e.target.value]}`));
    box.querySelector('#bsrc')?.addEventListener('change', (e) => e.target.value && setMany({ source: e.target.value }, `${ids.length} calls: source set to ${SOURCE_LABEL[e.target.value]}`));
    box.querySelector('#bdel')?.addEventListener('click', async () => {
      if (!(await confirmBox('Delete calls', `Delete ${ids.length} call${ids.length > 1 ? 's' : ''} from the log? This cannot be undone.`, 'Delete', true))) return;
      for (let i = 0; i < ids.length; i += 200) { const { error } = await db.from('calls').delete().in('id', ids.slice(i, i + 200)); if (error) return fail(error); }
      toast(`${ids.length} deleted`); sel.clear(); load();
    });
  }

  function wireRows(root, list) {
    root.querySelectorAll('[data-cat]').forEach((s) => (s.onchange = async () => {
      const c = list.find((x) => x.id === s.dataset.cat);
      const { error } = await db.from('calls').update({ category: s.value, handled_by: state.profile.id }).eq('id', c.id);
      if (error) return fail(error);
      c.category = s.value; await syncContactStage(c); toast(`Marked: ${CAT_LABEL[s.value]}`);
    }));
    root.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => editCall(list.find((x) => x.id === b.dataset.e))));
    root.querySelectorAll('[data-ren]').forEach((b) => (b.onclick = () => rename(list.find((x) => x.id === b.dataset.ren))));
    root.querySelectorAll('[data-flag]').forEach((b) => (b.onclick = () => {
      const c = list.find((x) => x.id === b.dataset.flag), fl = flagsOf(c)[0];
      flagPerson(fl || { name: nameOf(c), phones: otherParty(c) ? [otherParty(c)] : [], emails: c.contacts?.email ? [c.contacts.email] : [], contact_id: c.contact_id,
        notes: c.notes ? `From the Call Log: ${c.notes}` : '' }, load);
    }));
    root.querySelectorAll('[data-play]').forEach((b) => (b.onclick = async () => {
      const c = list.find((x) => x.id === b.dataset.play);
      const { data, error } = await db.storage.from('call-recordings').createSignedUrl(c.recording_path, 600);
      if (error) return fail(error);
      root.querySelector(`#rec-${c.id}`).innerHTML = `<audio controls autoplay src="${esc(data.signedUrl)}"></audio>`; b.remove();
    }));
  }

  // Change the caller's name, on this call or on every call from the same number.
  function rename(c) {
    const num = otherParty(c), same = num ? rows.concat(allRecent).filter((x) => otherParty(x) === num) : [c];
    const others = new Set(same.map((x) => x.id)).size;
    modal({ title: 'Change the name',
      body: `<div class="field"><label>Name</label><input class="input" id="rn" value="${esc(nameOf(c))}" placeholder="Full name"></div>
        ${num ? `<p class="dk-muted" style="font-size:13px">${esc(fmtPhone(num))} · ${esc(countryOf(num))}</p>
        <label class="row" style="gap:8px"><input type="checkbox" id="ra" checked> Use this name for every call from this number${others > 1 ? ` (${others} calls shown, and any older ones)` : ''}</label>` : ''}
        ${c.contact_id ? `<label class="row" style="gap:8px;margin-top:6px"><input type="checkbox" id="rc"> Also change the name on their contact</label>` : ''}`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const name = m.querySelector('#rn').value.trim() || null;
        if (num && m.querySelector('#ra')?.checked) {
          for (const col of ['from_number', 'to_number']) { const { error } = await db.from('calls').update({ caller_name: name }).eq(col, num); if (error) throw error; }
        } else { const { error } = await db.from('calls').update({ caller_name: name }).eq('id', c.id); if (error) throw error; }
        if (name && c.contact_id && m.querySelector('#rc')?.checked) { const { error } = await db.from('contacts').update({ full_name: name }).eq('id', c.contact_id); if (error) throw error; }
        toast('Name changed'); load();
      } }] });
    setTimeout(() => document.querySelector('#rn')?.select(), 50);
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
      <div class="card"><div class="table-wrap">${groups.length ? `<table class="t"><thead><tr><th>Missed</th><th>Caller</th><th>Country</th><th>Tries</th><th>Source</th><th>What it is</th><th></th></tr></thead><tbody>
      ${groups.map(({ c, tries, ids }) => { const fl = flagsOf(c); return `<tr class="${fl.length ? 'cl-flagrow' : ''}"><td style="white-space:nowrap">${esc(new Date(c.occurred_at).toLocaleString('en-CA', { timeZone: AB_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}
          <small class="cl-open" style="display:block">${esc(ago(c.occurred_at))}</small></td>
        <td class="cl-who"><b>${esc(nameOf(c) || fmtPhone(c.from_number) || 'Unknown')}</b> ${flagBadge(fl)}<small>${nameOf(c) ? esc(fmtPhone(c.from_number)) + ' · ' : ''}${esc(chLabel(c))}</small>
          ${c.notes ? `<small>${esc(c.notes.slice(0, 120))}</small>` : ''}</td>
        <td>${esc(countryOf(c.from_number))}</td><td>${tries}</td><td>${esc(SOURCE_LABEL[c.source] || c.source)}</td><td><span class="badge ${CAT_CLS[c.category] || ''}">${esc(CAT_LABEL[c.category])}</span></td>
        <td style="text-align:right;white-space:nowrap">${c.from_number ? `<a class="btn btn-sm btn-gold" href="${c.channel === 'whatsapp' ? `https://wa.me/${esc(c.from_number.replace(/\D/g, ''))}` : `tel:${esc(c.from_number)}`}" target="_blank" rel="noopener">${icon('phone')} Call</a>` : ''}
          ${edit ? `<button class="btn btn-sm btn-primary" data-done="${ids.join(',')}">${icon('check')} Done</button> <button class="btn btn-sm" data-e="${c.id}">Open</button>` : ''}</td></tr>`; }).join('')}</tbody></table>`
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
      body: `<div id="flagw">${flagBanner(c.id ? flagsOf(c) : [])}</div>
        <div class="row-2"><div class="field"><label>Phone / WhatsApp number</label><input class="input" id="num" type="tel" value="${esc((out ? c.to_number : c.from_number) || '')}" placeholder="e.g. 403 555 0123"></div>
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
        <p class="dk-muted" style="font-size:12.5px" id="ctry">${otherParty(c) ? `Country: ${esc(countryOf(otherParty(c)))}` : ''}${c.caller_location ? ` · Caller ID location: ${esc(c.caller_location)}` : ''}</p>
        ${c.contacts ? `<p style="font-size:13.5px">Contact: <a href="#/contacts/${c.contacts.id}"><b>${esc(c.contacts.full_name)}</b></a></p>` : ''}`,
      actions: [
        ...(c.id && del ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!(await confirmBox('Delete call', 'Delete this call from the log?', 'Delete', true))) return false;
          const { error } = await db.from('calls').delete().eq('id', c.id); if (error) throw error; toast('Deleted'); load(); } }] : []),
        ...(c.id && !c.contact_id ? [{ label: 'Save + add to Contacts', onClick: (m) => save(m, true) }] : []),
        { label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: (m) => save(m, false) }],
    });
    // While typing: warn if this number or name is flagged, and show the country.
    setTimeout(() => {
      const m = document.querySelector('#num')?.closest('.modal, [role=dialog]') || document;
      const check = () => {
        const num = m.querySelector('#num').value, nm = m.querySelector('#nm').value;
        m.querySelector('#flagw').innerHTML = flagBanner(matchFlags(flags, { phone: num, name: nm }));
        const ct = m.querySelector('#ctry'); if (ct && num.replace(/\D/g, '').length >= 7) ct.textContent = `Country: ${countryOf(num)}`;
      };
      ['#num', '#nm'].forEach((s) => m.querySelector(s)?.addEventListener('input', check));
    }, 30);
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
