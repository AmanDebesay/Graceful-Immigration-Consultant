// Flagged: people to watch for (booked or consulted and disappeared, did not pay, follow up later…).
import { db, can, esc, icon, fmtDate, staffName } from '../core.js';
import { REASONS, REASON_LABEL, flagPerson, invalidateFlags } from '../flags.js';
import { fmtPhone, countryOf, abDate, AB_TZ } from '../calls-common.js';
import { downloadXlsx } from '../fin.js';

export async function render(el, _p, { setTitle } = {}) {
  let q = '', reason = 'all', show = 'active';
  el.innerHTML = `<div class="toolbar"><input class="input" id="q" type="search" placeholder="Search name, phone or email…" style="max-width:280px">
    <select class="input" id="r" style="max-width:260px"><option value="all">All reasons</option>${REASONS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
    <div class="seg" id="s"><button data-k="active">Active</button><button data-k="off">Not active</button><button data-k="all">All</button></div><div class="grow"></div>
    <button class="btn" id="xl">${icon('file')} Excel</button>${can('crm.edit') ? `<button class="btn btn-primary" id="new">⚑ Flag someone</button>` : ''}</div>
    <div class="alert info">People in this folder are flagged everywhere: when their name, phone or email is typed in the search bar, shows up in the Call Log, is entered in <b>Log a call</b>, or matches a contact. Use it for people who booked or had a consultation and disappeared, did not pay, or should be followed up later.</div>
    <div id="body"><div class="loading"><div class="spin"></div></div></div>`;
  let rows = [], lastCall = new Map();
  const reload = async () => {
    invalidateFlags();
    const { data, error } = await db.from('flags').select('*, contacts(id, full_name)').order('created_at', { ascending: false }).limit(2000);
    if (error) { el.querySelector('#body').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    rows = data || [];
    // Their most recent call, from the Call Log.
    const phones = [...new Set(rows.flatMap((f) => f.phones || []))];
    lastCall = new Map();
    if (phones.length) {
      const { data: calls } = await db.from('calls').select('from_number, to_number, occurred_at').or(`from_number.in.(${phones.map((p) => `"${p}"`).join(',')}),to_number.in.(${phones.map((p) => `"${p}"`).join(',')})`).order('occurred_at', { ascending: false }).limit(3000);
      (calls || []).forEach((c) => [c.from_number, c.to_number].forEach((n) => { if (n && !lastCall.has(n)) lastCall.set(n, c.occurred_at); }));
    }
    draw();
  };
  const visible = () => rows.filter((f) => (show === 'all' || (show === 'active') === f.active) && (reason === 'all' || f.reason === reason)
    && (!q || [f.name, ...(f.phones || []), ...(f.emails || []), f.notes].join(' ').toLowerCase().includes(q.toLowerCase())
      || (q.replace(/\D/g, '').length >= 4 && (f.phones || []).some((p) => p.replace(/\D/g, '').includes(q.replace(/\D/g, ''))))));
  function draw() {
    el.querySelectorAll('#s button').forEach((b) => b.classList.toggle('on', b.dataset.k === show));
    const list = visible(), today = abDate();
    el.querySelector('#body').innerHTML = `<div class="card"><div class="table-wrap">${list.length ? `<table class="t"><thead><tr><th>Person</th><th>Why</th><th>Notes</th><th>Last call</th><th>Remind</th><th>Flagged</th><th></th></tr></thead><tbody>
      ${list.map((f) => { const lc = (f.phones || []).map((p) => lastCall.get(p)).filter(Boolean).sort().pop(); return `<tr style="${f.active ? '' : 'opacity:.55'}">
        <td><b>⚑ ${esc(f.name)}</b>${f.contacts ? ` <a href="#/contacts/${f.contacts.id}" style="font-size:12.5px">(contact)</a>` : ''}
          <small style="display:block;color:var(--muted)">${[...(f.phones || []).map((p) => `${fmtPhone(p)} · ${countryOf(p)}`), ...(f.emails || [])].map(esc).join('<br>')}</small></td>
        <td><span class="badge b-RED">${esc(REASON_LABEL[f.reason])}</span></td><td style="max-width:320px;font-size:13px">${esc(f.notes || '')}</td>
        <td style="white-space:nowrap;font-size:13px">${lc ? esc(new Date(lc).toLocaleString('en-CA', { timeZone: AB_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : '—'}</td>
        <td style="white-space:nowrap">${f.remind_on ? `<span class="${f.remind_on <= today ? 'badge b-RED' : ''}">${esc(fmtDate(f.remind_on))}</span>` : '—'}</td>
        <td style="font-size:12.5px;white-space:nowrap">${esc(fmtDate(f.created_at))}<small style="display:block;color:var(--muted)">${esc(staffName(f.created_by))}</small></td>
        <td style="text-align:right;white-space:nowrap">${(f.phones || [])[0] ? `<a class="btn btn-sm" href="tel:${esc(f.phones[0])}">${icon('phone')}</a> ` : ''}${can('crm.edit') ? `<button class="btn btn-sm" data-e="${f.id}">Edit</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table>` : `<div class="empty">⚑<div>No flagged people${q || reason !== 'all' ? ' match' : ' yet'}.</div></div>`}</div></div>`;
    el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => flagPerson(rows.find((f) => f.id === b.dataset.e), reload)));
  }
  el.querySelector('#q').oninput = (e) => { q = e.target.value.trim(); draw(); };
  el.querySelector('#r').onchange = (e) => { reason = e.target.value; draw(); };
  el.querySelector('#s').onclick = (e) => { if (e.target.dataset.k) { show = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => flagPerson({}, reload));
  el.querySelector('#xl').onclick = () => downloadXlsx(`flagged-${abDate()}.xlsx`, [['Flagged', [['Name', 'Phones', 'Countries', 'Emails', 'Why', 'Notes', 'Remind on', 'Active', 'Flagged on', 'Flagged by'],
    ...visible().map((f) => [f.name, (f.phones || []).join(', '), (f.phones || []).map(countryOf).join(', '), (f.emails || []).join(', '), REASON_LABEL[f.reason], f.notes || '', f.remind_on || '', f.active ? 'Yes' : 'No', abDate(f.created_at), staffName(f.created_by)])],
    [26, 26, 20, 28, 30, 60, 12, 8, 12, 18]]]).catch((e) => alert(e.message));
  setTitle?.('Flagged');
  reload();
}
