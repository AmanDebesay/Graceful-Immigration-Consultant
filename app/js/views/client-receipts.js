// Client receipts: a receipt for every payment received (PMT-) and every retainer paid into trust (TRD-).
// Receipts are addressed to whoever paid: the client, or the fee payer named in the agreement / on the invoice.
// The client stays on the receipt as the person the services are for.
import { db, can, esc, icon, fmtDate, toast, fail, rpc, modal } from '../core.js';
import { money, num, METHOD_LABEL, orgSettings, receivePayment, trustTxn, quickSale, payerFor, downloadCsv } from '../fin.js';

export async function render(el, [kind, id] = [], ctx = {}) {
  if (kind && id) return receipt(el, kind, id, ctx);
  return list(el);
}

// ── List ──
async function list(el) {
  const manage = can('finance.manage');
  let filter = 'all', q = '', rows = [];
  el.innerHTML = `<div class="toolbar">
      <div class="seg" id="flt"><button data-f="all">All</button><button data-f="unsent">Not sent yet</button><button data-f="payment">Payments</button><button data-f="trust">Retainers in trust</button></div>
      <input class="input" id="q" placeholder="Search name or number" style="max-width:240px">
      <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>
      ${manage ? `<button class="btn btn-gold" id="issue">${icon('plus')} Issue a receipt</button>` : ''}</div>
    <div class="alert info" style="margin-bottom:14px">Every payment you record gets a receipt here, addressed to whoever paid. When a fee payer (a spouse, parent or employer) pays for a client, the receipt is issued to the payer and names the client as the person the services are for.</div>
    <div class="card"><div class="table-wrap" id="tbl"></div></div>`;

  el.querySelector('#issue')?.addEventListener('click', () => modal({
    title: 'Issue a receipt',
    body: `<p style="margin-bottom:12px">What was the money for? The payment is recorded in the books, then the receipt opens.</p>
      <div class="grid" style="gap:10px">
        <button class="card kpi" data-k="inv" style="text-align:left;cursor:pointer;font:inherit;padding:14px"><b>${icon('file')} Payment of an invoice</b><br><small class="dk-muted">The client (or payer) paid an invoice you already sent.</small></button>
        <button class="card kpi" data-k="quick" style="text-align:left;cursor:pointer;font:inherit;padding:14px"><b>${icon('dollar')} Payment without an invoice</b><br><small class="dk-muted">For example a consultation fee paid before the meeting.</small></button>
        <button class="card kpi" data-k="trust" style="text-align:left;cursor:pointer;font:inherit;padding:14px"><b>${icon('lock')} Retainer paid in advance (trust)</b><br><small class="dk-muted">Money for work not done yet. It goes into the trust account.</small></button></div>`,
    onOpen: (m) => m.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      m.closest('.overlay').remove();
      ({ inv: () => receivePayment(), quick: () => quickSale(), trust: () => trustTxn('deposit') })[b.dataset.k]();
    })),
  }));
  el.querySelector('#flt').onclick = (e) => { if (e.target.dataset.f) { filter = e.target.dataset.f; draw(); } };
  el.querySelector('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  window.addEventListener('books-changed', () => load(), { once: true });

  async function load() {
    const [{ data: pays }, { data: trust }] = await Promise.all([
      db.from('payments').select('id, number, payment_date, amount, method, reference, voided, received_from, receipt_sent_at, contacts(full_name), payment_applications(invoices(number, bill_to))')
        .order('payment_date', { ascending: false }).limit(1000),
      db.from('trust_transactions').select('id, number, txn_date, amount, method, reference, received_from, receipt_sent_at, contacts(full_name)')
        .eq('type', 'deposit').order('txn_date', { ascending: false }).limit(1000),
    ]);
    rows = [
      ...(pays || []).map((p) => ({ kind: 'payment', id: p.id, number: p.number, date: p.payment_date, amount: p.amount, method: p.method, ref: p.reference, voided: p.voided, sent: p.receipt_sent_at,
        client: p.contacts?.full_name || '', from: p.received_from || p.payment_applications?.find((a) => a.invoices?.bill_to?.name)?.invoices.bill_to.name || p.contacts?.full_name || '',
        what: (p.payment_applications || []).map((a) => a.invoices?.number).filter(Boolean).join(', ') })),
      ...(trust || []).map((t) => ({ kind: 'trust', id: t.id, number: t.number, date: t.txn_date, amount: t.amount, method: t.method, ref: t.reference, voided: false, sent: t.receipt_sent_at,
        client: t.contacts?.full_name || '', from: t.received_from || t.contacts?.full_name || '', what: 'Retainer held in trust' })),
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.number).localeCompare(String(a.number)));
    draw();
  }
  function draw() {
    el.querySelectorAll('#flt button').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
    const shown = rows.filter((r) => (filter === 'all' || (filter === 'unsent' ? !r.sent && !r.voided : r.kind === filter))
      && (!q || [r.number, r.client, r.from].some((x) => String(x || '').toLowerCase().includes(q))));
    el.querySelector('#tbl').innerHTML = shown.length ? `<table class="t"><thead><tr><th>Date</th><th>Receipt no.</th><th>Received from</th><th>Client</th><th>For</th><th>Method</th><th style="text-align:right">Amount</th><th>Receipt</th></tr></thead><tbody>
      ${shown.map((r) => `<tr class="click" data-k="${r.kind}" data-id="${r.id}" style="${r.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${fmtDate(r.date)}</td><td><b>${esc(r.number || '')}</b></td>
        <td>${esc(r.from)}</td><td>${r.from !== r.client ? esc(r.client) : '<span class="dk-muted">same</span>'}</td><td>${esc(r.what || '—')}</td>
        <td>${esc(METHOD_LABEL[r.method] || r.method || '')}</td><td style="text-align:right"><b>${money(r.amount)}</b></td>
        <td>${r.voided ? '<span class="badge">Void</span>' : r.sent ? `<span class="badge b-GREEN" title="${esc(fmtDate(r.sent))}">Sent</span>` : '<span class="badge b-AMBER">Not sent</span>'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('dollar')}<div>${rows.length ? 'Nothing matches.' : 'No payments received yet. Use “Issue a receipt” when a client pays you.'}</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/client-receipts/${tr.dataset.k}/${tr.dataset.id}`)));
  }
  el.querySelector('#csv').onclick = () => downloadCsv('client-receipts.csv', [['Date', 'Receipt no.', 'Received from', 'Client', 'For', 'Method', 'Reference', 'Amount', 'Sent', 'Void'],
    ...rows.map((r) => [r.date, r.number, r.from, r.client, r.what, METHOD_LABEL[r.method] || r.method, r.ref, r.amount, r.sent ? String(r.sent).slice(0, 10) : '', r.voided ? 'yes' : ''])]);
  load();
}

// ── One receipt ──
async function receipt(el, kind, id, { setTitle } = {}) {
  const manage = can('finance.manage');
  const s = await orgSettings();
  let r, apps = [], payer = null;
  if (kind === 'payment') {
    const { data, error } = await db.from('payments').select('*, contacts(id, full_name, email, phone, address, city, province, postal_code), payment_applications(amount, invoices(id, number, issue_date, total, tax_total, balance, bill_to, status))').eq('id', id).single();
    if (error || !data) { el.innerHTML = '<div class="alert err">Receipt not found.</div>'; return; }
    r = { ...data, date: data.payment_date };
    apps = data.payment_applications || [];
    payer = apps.find((a) => a.invoices?.bill_to?.name)?.invoices.bill_to || null;
  } else {
    const { data, error } = await db.from('trust_transactions').select('*, contacts(id, full_name, email, phone, address, city, province, postal_code)').eq('id', id).eq('type', 'deposit').single();
    if (error || !data) { el.innerHTML = '<div class="alert err">Receipt not found.</div>'; return; }
    r = { ...data, date: data.txn_date, voided: false };
    payer = await payerFor(data.contact_id);
  }
  const c = r.contacts || {};
  const fromName = r.received_from || payer?.name || c.full_name || '';
  const byPayer = payer && fromName === payer.name;              // the payer's address and email go on the receipt
  const fromClient = fromName === c.full_name;
  const email = byPayer ? payer.email : fromClient ? c.email : (payer?.email || c.email || '');
  const gst = apps.reduce((t, a) => t + (Number(a.invoices?.total) ? num(Number(a.amount) * Number(a.invoices.tax_total) / Number(a.invoices.total)) : 0), 0);
  setTitle?.(`Receipt ${r.number}`);

  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/client-receipts">← Client Receipts</a><div class="grow"></div>
      ${r.receipt_sent_at ? `<span class="badge b-GREEN">Sent ${esc(fmtDate(r.receipt_sent_at))}</span>` : ''}
      ${manage && !r.voided ? `<button class="btn" id="from">${icon('users')} Received from</button>` : ''}
      <button class="btn" id="print">${icon('file')} Print / PDF</button>
      ${manage && !r.voided ? `${r.receipt_sent_at ? '' : '<button class="btn" id="given" title="You gave or sent it another way">Mark as sent</button>'}<button class="btn btn-gold" id="mail">${icon('mail')} Email receipt</button>` : ''}
    </div>
    ${r.voided ? '<div class="alert err">This payment was voided, so this receipt is no longer valid.</div>' : ''}
    <div class="card inv-sheet" id="sheet" style="position:relative">
      ${r.voided ? '<div style="position:absolute;top:40%;left:0;right:0;text-align:center;font-size:96px;font-weight:800;color:rgba(217,45,32,.18);transform:rotate(-18deg);pointer-events:none">VOID</div>' : ''}
      <div class="inv-head">
        <div><img src="../public/img/logo-emblem.png" alt="" style="width:70px"><h2 style="font-family:var(--serif);color:var(--navy);margin-top:6px">${esc(s.business_name)}</h2>
          <div class="inv-muted">${esc(s.address)}<br>${esc(s.phone)} · ${esc(s.email)}${s.gst_number ? `<br>GST/HST No. ${esc(s.gst_number)}` : ''}<br>${esc(s.rcic_name)}, RCIC-IRB · College ID ${esc(s.licence_number)}</div></div>
        <div style="text-align:right"><div class="inv-title">RECEIPT</div><div style="font-size:18px;font-weight:700">${esc(r.number || '')}</div>
          <div class="inv-muted" style="margin-top:6px">Date received<br><b style="color:var(--ink)">${fmtDate(r.date)}</b></div></div>
      </div>
      <div class="inv-meta">
        <div><small>RECEIVED FROM</small><b>${esc(fromName)}</b>
          <div class="inv-muted">${byPayer ? [payer.address, payer.email, payer.phone].filter(Boolean).map(esc).join('<br>')
            : fromClient ? esc([c.address, c.city, c.province, c.postal_code].filter(Boolean).join(', ')) + (c.email ? '<br>' + esc(c.email) : '') : ''}</div>
          ${fromClient ? '' : `<small style="margin-top:12px;display:block">ON BEHALF OF CLIENT</small><b>${esc(c.full_name)}</b>`}</div>
        <div style="text-align:right"><small>AMOUNT RECEIVED</small><div style="font-size:30px;font-weight:800;color:var(--navy)">${money(r.amount)}</div><div class="inv-muted">Canadian dollars</div></div>
      </div>
      <table class="t inv-lines"><tbody>
        <tr><td style="width:220px">Payment method</td><td><b>${esc(METHOD_LABEL[r.method] || r.method || '—')}</b>${r.reference ? ` · Reference ${esc(r.reference)}` : ''}</td></tr>
        ${kind === 'trust'
          ? `<tr><td>For</td><td><b>Retainer paid in advance</b>, held in the RCIC's client (trust) account</td></tr>`
          : `<tr><td>For</td><td>Immigration and citizenship services${!fromClient ? ` provided to ${esc(c.full_name)}` : ''}${r.memo ? ` — ${esc(r.memo)}` : ''}</td></tr>`}
      </tbody></table>
      ${apps.length ? `<table class="t inv-lines" style="margin-top:14px"><thead><tr><th>Applied to invoice</th><th>Invoice date</th><th style="text-align:right">Invoice total</th><th style="text-align:right">Paid now</th><th style="text-align:right">Balance remaining</th></tr></thead><tbody>
        ${apps.map((a) => `<tr><td>${esc(a.invoices?.number || '')}</td><td>${fmtDate(a.invoices?.issue_date)}</td><td style="text-align:right">${money(a.invoices?.total)}</td>
          <td style="text-align:right">${money(a.amount)}</td><td style="text-align:right">${money(a.invoices?.status === 'void' ? 0 : a.invoices?.balance)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="inv-foot">
        <div style="flex:1">
          ${kind === 'trust' ? '<p class="inv-muted">This money is held in trust and is not yet earned. It is used to pay invoices for services once they are provided, as set out in the service agreement, and any unearned amount is refunded.</p>' : ''}
          ${!fromClient ? `<p class="inv-muted">Paid by ${esc(fromName)} on behalf of ${esc(c.full_name)}. The client remains the person the services are provided to.</p>` : ''}
          <p class="inv-muted" style="margin-top:8px">Thank you. Please keep this receipt for your records.</p>
          <p style="margin-top:28px">Received by: <b>${esc(s.rcic_name)}</b>, RCIC-IRB<br><span class="inv-muted">${esc(s.business_name)}</span></p></div>
        <div class="inv-totals">
          ${gst > 0 ? `<div><span>Fees</span><b>${money(Number(r.amount) - gst)}</b></div><div><span>GST included</span><b>${money(gst)}</b></div>` : ''}
          <div class="grand"><span>Total received</span><b>${money(r.amount)}</b></div></div>
      </div>
    </div>`;

  const again = () => receipt(el, kind, id, { setTitle });
  el.querySelector('#print').onclick = () => window.print();
  el.querySelector('#given')?.addEventListener('click', async () => {
    try { await rpc('update_receipt', { p_kind: kind, p_id: id, p_sent: true }); toast('Marked as sent'); again(); } catch (e) { fail(e); }
  });
  el.querySelector('#from')?.addEventListener('click', () => modal({
    title: 'Received from',
    body: `<div class="field"><label>Name shown on the receipt</label><input class="input" id="rf" value="${esc(fromName)}"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${[c.full_name, payer?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map((v) => `<button class="btn btn-sm" type="button" data-v="${esc(v)}">${esc(v)}${v === c.full_name ? ' (client)' : ' (fee payer)'}</button>`).join('')}</div>`,
    onOpen: (m) => m.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => (m.querySelector('#rf').value = b.dataset.v))),
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
      const v = m.querySelector('#rf').value.trim(); if (!v) throw new Error('Enter a name.');
      await rpc('update_receipt', { p_kind: kind, p_id: id, p_received_from: v }); toast('Saved'); again();
    } }],
  }));
  el.querySelector('#mail')?.addEventListener('click', async () => {
    const first = String(fromName).split(' ')[0] || 'there';
    const lines = [
      `Receipt no.: ${r.number}`, `Date received: ${fmtDate(r.date)}`, `Amount received: ${money(r.amount)} CAD`,
      `Payment method: ${METHOD_LABEL[r.method] || r.method || ''}${r.reference ? ` (reference ${r.reference})` : ''}`, `Received from: ${fromName}`,
      ...(!fromClient ? [`On behalf of client: ${c.full_name}`] : []),
      ...(kind === 'trust' ? ['For: retainer paid in advance, held in our client (trust) account until earned'] : apps.map((a) => `Applied to invoice ${a.invoices?.number}: ${money(a.amount)} (balance remaining ${money(a.invoices?.balance)})`)),
      ...(gst > 0 ? [`GST included: ${money(gst)}${s.gst_number ? ` (GST/HST No. ${s.gst_number})` : ''}`] : []),
    ];
    const body = `Hello ${first},\n\nThank you for your payment. Here is your receipt:\n\n${lines.join('\n')}\n\nPlease keep this email for your records.\n\nThank you,\n${s.rcic_name}\n${s.business_name}`;
    (await import('../crm.js')).composeEmail({ contact: { ...c, email }, to: email || '', subject: `Receipt ${r.number} from ${s.business_name}`, body,
      onSent: async () => { await rpc('update_receipt', { p_kind: kind, p_id: id, p_sent: true }).catch(() => {}); again(); } });
    toast('Tip: use Print / PDF to save the receipt as a PDF and attach it to the email.');
  });
}
