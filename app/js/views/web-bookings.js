// Online Bookings: every consultation booked on the website (paid, awaiting payment, released, refunded),
// and the promo codes clients can use when booking.
import { db, can, esc, icon, modal, toast, fmtDate, fmtDateTime, confirmBox, state } from '../core.js';
import { money } from '../fin.js';

const STATUS = {
  awaiting_payment: ['Awaiting payment', 'b-gold'], paid: ['Paid', 'b-GREEN'], free: ['Free (promo)', 'b-blue'],
  cancelled_unpaid: ['Released: not paid', 'b-RED'], paid_after_cancel: ['Paid after release: rebook or refund', 'b-AMBER'],
  cancelled: ['Cancelled', ''], refunded: ['Refunded', 'b-navy'], expired: ['Not completed', ''],
};
const badge = (s) => `<span class="badge ${STATUS[s]?.[1] || ''}">${STATUS[s]?.[0] || esc(s)}</span>`;
const total = (d) => Number(d?.net ?? 0) + Number(d?.gst ?? 0);
const at = (d) => d?.start ? fmtDateTime(new Date(d.start)) : '—';

export async function render(el, _p, { setTitle } = {}) {
  let tab = 'bookings', filter = 'all';
  const manage = can('finance.manage');
  el.innerHTML = `<div class="toolbar"><div class="seg" id="tab"><button data-k="bookings">Bookings</button><button data-k="promo">Promo codes</button></div><div class="grow"></div><span id="tools"></span></div>
    <div class="alert info">Clients book on the website, then have <b>2 hours to pay by card</b>. Unpaid bookings are released automatically (the client is emailed and the meeting is cancelled) and stay here as history.
      <b>Refund policy:</b> cancelled 3+ hours before the start = full refund; later or no-show = no refund. Refunds are made in Stripe (Payments → the payment → Refund), then marked here.</div>
    <div id="body"></div>`;
  el.querySelector('#tab').onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; draw(); } };

  async function draw() {
    el.querySelectorAll('#tab button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    return tab === 'bookings' ? bookings() : promos();
  }

  async function bookings() {
    const tools = el.querySelector('#tools');
    tools.innerHTML = `<div class="seg" id="f">${[['all', 'All'], ['awaiting_payment', 'Awaiting payment'], ['paid', 'Paid'], ['cancelled_unpaid', 'Released'], ['refunded', 'Refunded']]
      .map(([k, l]) => `<button data-k="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    tools.querySelector('#f').onclick = (e) => { if (e.target.dataset.k) { filter = e.target.dataset.k; bookings(); } };
    let q = db.from('pending_bookings').select('*').neq('status', 'expired').order('created_at', { ascending: false }).limit(300);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data: rows = [], error } = await q;
    const body = el.querySelector('#body');
    if (error) { body.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    body.innerHTML = `<div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Appointment</th><th>Client</th><th>Status</th><th style="text-align:right">Amount</th><th>Booked</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const d = r.details || {}; return `<tr>
        <td><b>${esc(at(d))}</b><br><small style="color:var(--muted)">${d.serviceId === 'cal-30' ? '30-minute' : d.serviceId === 'cal-60' ? '1-hour' : ''} consultation${d.inCanada === false ? ' · lives outside Canada' : ''}</small></td>
        <td>${esc(d.name || '')}<br><small style="color:var(--muted)">${esc(d.email || '')}${d.phone ? ' · ' + esc(d.phone) : ''}</small></td>
        <td>${badge(r.status)}${r.status === 'awaiting_payment' && r.pay_deadline ? `<br><small style="color:var(--muted)">pay by ${esc(fmtDateTime(r.pay_deadline))}</small>` : ''}
          ${r.cancel_reason ? `<br><small style="color:var(--muted)">${esc(r.cancel_reason)}</small>` : ''}</td>
        <td style="text-align:right">${money(total(d))}${r.promo_code ? `<br><small style="color:var(--muted)">${esc(r.promo_code)} −${money(r.discount)}</small>` : ''}</td>
        <td>${esc(fmtDateTime(r.booked_at || r.created_at))}${r.paid_at ? `<br><small style="color:var(--muted)">paid ${esc(fmtDateTime(r.paid_at))}</small>` : ''}</td>
        <td style="text-align:right">${manage && ['paid', 'paid_after_cancel', 'free', 'awaiting_payment'].includes(r.status) ? `<button class="btn btn-sm" data-m="${r.id}">Mark…</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table>` : `<div class="empty">${icon('calendar')}<div>No website bookings ${filter === 'all' ? 'yet' : 'with this status'}.</div></div>`}</div></div>`;
    body.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => mark(rows.find((x) => x.id === b.dataset.m))));
  }

  function mark(r) {
    const d = r.details || {}, paid = ['paid', 'paid_after_cancel'].includes(r.status);
    modal({
      title: `${d.name}: ${at(d)}`,
      body: `<p>Record what happened to this booking. This only updates the record here.</p>
        <ul style="margin:8px 0 0 18px;color:var(--muted);font-size:13.5px"><li>Cancel the meeting in Outlook/Calendar yourself if it is still there.</li>
        ${paid ? '<li>Make the refund in Stripe first (Payments → find the payment → Refund), then mark it Refunded here. Then record a credit note on the invoice in Sales &amp; Invoices.</li>' : ''}</ul>
        <div class="field" style="margin-top:12px"><label>Note (optional)</label><input class="input" id="why" placeholder="e.g. Client cancelled by phone 5 hours before"></div>`,
      actions: [{ label: 'Close' }, { label: 'Cancelled (no refund)', onClick: (m) => save(r, 'cancelled', m) },
        ...(paid ? [{ label: 'Refunded', cls: 'btn-primary', onClick: (m) => save(r, 'refunded', m) }] : [])],
    });
  }
  async function save(r, status, m) {
    const { error } = await db.from('pending_bookings').update({ status, cancelled_at: new Date().toISOString(), cancel_reason: m.querySelector('#why').value.trim() || null }).eq('id', r.id);
    if (error) throw error; toast('Saved'); bookings();
  }

  // Promo codes are the same ones as in Business Settings → Pricing (one list): % or $ off, for chosen services.
  async function promos() {
    const tools = el.querySelector('#tools');
    tools.innerHTML = manage ? `<button class="btn btn-primary" id="newp">${icon('plus')} New promo code</button>` : '';
    const [{ data: rows = [], error }, { data: org }, { data: items = [] }] = await Promise.all([
      db.from('promo_codes').select('*').order('created_at', { ascending: false }),
      db.from('org_settings').select('consult_item_30, consult_item_60').eq('id', 1).single(),
      db.from('items').select('id, name').eq('active', true).order('name')]);
    const body = el.querySelector('#body');
    if (error) { body.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    const c30 = org?.consult_item_30, c60 = org?.consult_item_60;
    const nameOf = (id) => (items || []).find((x) => x.id === id)?.name || 'a removed service';
    const forText = (p) => { const ids = p.item_ids || []; if (!ids.length) return 'All services';
      if (ids.length === 2 && ids.includes(c30) && ids.includes(c60)) return 'Both consultations';
      return ids.map(nameOf).join(', '); };
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
    const status = (p) => !p.active ? 'Off' : p.ends_on && p.ends_on < today ? 'Expired' : p.starts_on && p.starts_on > today ? 'Not started' : p.use_limit && p.uses >= p.use_limit ? 'Used up' : 'Active';
    const disc = (p) => p.kind === 'fixed' ? `${money(p.value)} off` : `${Number(p.value)}% off`;
    body.innerHTML = `<div class="alert">Clients type the code when booking a consultation on the website. The discount comes off the fee before GST and shows on the client's invoice and in the books. These are the same codes as in <b>Business Settings → Pricing</b>, where they can also be used on quotes.</div>
      <div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Code</th><th>Discount</th><th>For</th><th>Valid</th><th>Used</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((p) => `<tr style="${status(p) === 'Active' ? '' : 'opacity:.6'}"><td><b>${esc(p.code)}</b>${p.terms ? `<br><small style="color:var(--muted)">${esc(p.terms.slice(0, 90))}</small>` : ''}</td><td>${disc(p)}</td>
        <td>${esc(forText(p))}</td>
        <td>${p.starts_on || p.ends_on ? `${p.starts_on ? esc(fmtDate(p.starts_on)) : 'now'} – ${p.ends_on ? esc(fmtDate(p.ends_on)) : 'no end'}` : 'No end date'}</td>
        <td>${p.uses}${p.use_limit ? ` of ${p.use_limit}` : ''}</td><td><span class="badge ${status(p) === 'Active' ? 'b-GREEN' : ''}">${status(p)}</span></td>
        <td style="text-align:right">${manage ? `<button class="btn btn-sm" data-e="${p.id}">Edit</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${icon('dollar')}<div>No promo codes yet.${manage ? ' Click <b>New promo code</b> to make one.' : ''}</div></div>`}</div></div>`;
    tools.querySelector('#newp')?.addEventListener('click', () => editPromo({}, { c30, c60 }));
    body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => editPromo(rows.find((x) => x.id === b.dataset.e), { c30, c60 })));
  }

  function editPromo(p, { c30, c60 }) {
    const ids = p.item_ids || [];
    const cur = !p.id ? 'both' : !ids.length ? 'all' : ids.length === 2 && ids.includes(c30) && ids.includes(c60) ? 'both'
      : ids.length === 1 && ids[0] === c30 ? '30' : ids.length === 1 && ids[0] === c60 ? '60' : 'custom';
    const opt = (v, l) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
    modal({
      title: p.id ? `Edit ${p.code}` : 'New promo code',
      body: `<div class="row-2"><div class="field"><label>Code</label><input class="input" id="c" value="${esc(p.code || '')}" ${p.id ? 'disabled' : ''} placeholder="e.g. WELCOME10" style="text-transform:uppercase"></div>
        <div class="field"><label>Discount</label><div class="row" style="gap:6px"><select class="input" id="k" style="max-width:96px"><option value="percent">%</option><option value="fixed" ${p.kind === 'fixed' ? 'selected' : ''}>$ off</option></select>
          <input class="input" id="v" type="number" min="0.01" step="0.01" value="${p.value ?? 10}"></div></div></div>
        <div class="field"><label>Applies to</label><select class="input" id="ap">${opt('both', 'Both consultations (30-minute and 1-hour)')}${opt('30', '30-minute consultation only')}${opt('60', '1-hour consultation only')}${opt('all', 'All services (consultations, and quotes for other services)')}${cur === 'custom' ? opt('custom', 'Services chosen in Business Settings → Pricing') : ''}</select></div>
        <div class="row-2"><div class="field"><label>Starts (optional)</label><input class="input" id="s" type="date" value="${esc(p.starts_on || '')}"></div>
        <div class="field"><label>Ends (optional)</label><input class="input" id="e" type="date" value="${esc(p.ends_on || '')}"></div></div>
        <div class="row-2"><div class="field"><label>Maximum uses (blank = unlimited)</label><input class="input" id="mx" type="number" min="1" step="1" value="${p.use_limit ?? ''}"></div>
        <label class="row" style="gap:8px;margin-top:26px"><input type="checkbox" id="on" ${p.active ?? true ? 'checked' : ''}> Active</label></div>
        <div class="field"><label>Terms of the promotion (kept on record, optional)</label><textarea class="input" id="t" rows="2" placeholder="e.g. Community event Dec 2026. One use per client. Leave blank to write it automatically.">${esc(p.terms || '')}</textarea></div>`,
      actions: [
        ...(p.id && !p.uses ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => {
          if (!(await confirmBox('Delete promo code', `Delete ${p.code}? It has not been used.`, 'Delete', true))) return false;
          const { error } = await db.from('promo_codes').delete().eq('id', p.id); if (error) throw error; toast('Deleted'); promos(); } }] : []),
        { label: 'Cancel' },
        { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
          const v = (id) => m.querySelector(id).value.trim();
          const ap = v('#ap');
          if (((ap === 'both' || ap === '30') && !c30) || ((ap === 'both' || ap === '60') && !c60)) throw new Error('The consultation services are not linked yet. Please contact support.');
          const item_ids = ap === 'both' ? [c30, c60] : ap === '30' ? [c30] : ap === '60' ? [c60] : ap === 'all' ? [] : ids;
          const row = { kind: v('#k'), value: Number(v('#v')), item_ids, starts_on: v('#s') || null, ends_on: v('#e') || null,
            use_limit: v('#mx') ? Number(v('#mx')) : null, active: m.querySelector('#on').checked, terms: v('#t') || null };
          if (!(row.value > 0)) throw new Error('Enter the discount.');
          if (row.kind === 'percent' && row.value > 100) throw new Error('A percentage cannot be over 100.');
          if (row.starts_on && row.ends_on && row.ends_on < row.starts_on) throw new Error('The end date is before the start date.');
          const label = row.kind === 'fixed' ? `$${row.value} off` : `${row.value}% off`;
          const forL = { both: 'consultations booked online', 30: 'the 30-minute consultation', 60: 'the 1-hour consultation', all: 'professional fees', custom: 'the chosen services' }[ap];
          if (!row.terms) row.terms = `${label} ${forL}${row.starts_on ? `, from ${row.starts_on}` : ''}${row.ends_on ? ` until ${row.ends_on}` : ''}${row.use_limit ? `, limited to ${row.use_limit} use${row.use_limit > 1 ? 's' : ''}` : ''}. Applied before GST. Not combinable with other discounts.`;
          let error;
          if (p.id) ({ error } = await db.from('promo_codes').update(row).eq('id', p.id));
          else {
            const code = v('#c').toUpperCase().replace(/\s+/g, '');
            if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error('Use 3–30 letters, numbers, - or _ (no spaces).');
            ({ error } = await db.from('promo_codes').insert({ ...row, code, created_by: state.profile?.id ?? null }));
            if (error?.code === '23505') throw new Error('That code already exists.');
          }
          if (error) throw error; toast('Promo code saved'); promos();
        } }],
    });
  }

  setTitle?.('Online Bookings');
  draw();
}
