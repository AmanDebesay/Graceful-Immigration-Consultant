import { db, esc, icon, fmtDate, can, rpc, confirmBox, toast, fail, today } from '../core.js';
import { money, invoiceBadge, METHOD_LABEL, newInvoice, receivePayment, downloadCsv } from '../fin.js';

export async function render(el) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let tab = qs.get('tab') || 'invoices';
  let filter = qs.get('f') || 'all';
  const manage = can('finance.manage');

  el.innerHTML = `<div class="toolbar">
      <div class="seg" id="tabs"><button data-k="invoices">Invoices</button><button data-k="payments">Payments received</button></div>
      <div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export</button>
      ${manage ? `<button class="btn" id="pay">${icon('check')} Receive payment</button><button class="btn btn-gold" id="new">${icon('plus')} New invoice</button>` : ''}
    </div><div id="body"></div>`;
  el.querySelector('#tabs').onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => newInvoice());
  el.querySelector('#pay')?.addEventListener('click', () => receivePayment());
  window.addEventListener('books-changed', () => draw(), { once: true });
  let rows = [];

  async function draw() {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    const body = el.querySelector('#body');
    if (tab === 'payments') {
      const { data } = await db.from('payments').select('*, contacts(full_name), payment_applications(amount, invoices(number))').order('payment_date', { ascending: false }).limit(500);
      rows = data || [];
      body.innerHTML = `<div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Date</th><th>No.</th><th>Client</th><th>Method</th><th>Applied to</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>
        ${rows.map((p) => `<tr style="${p.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${fmtDate(p.payment_date)}</td><td>${esc(p.number)}</td><td>${esc(p.contacts?.full_name)}</td>
          <td>${esc(METHOD_LABEL[p.method] || p.method)}${p.reference ? `<br><small style="color:var(--muted)">${esc(p.reference)}</small>` : ''}</td>
          <td>${p.payment_applications.map((a) => `${esc(a.invoices?.number)} (${money(a.amount)})`).join(', ')}</td><td style="text-align:right"><b>${money(p.amount)}</b></td>
          <td style="text-align:right">${manage && !p.voided ? `<button class="btn btn-sm btn-danger" data-void="${p.id}">Void</button>` : p.voided ? 'Void' : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('check')}<div>No payments yet.</div></div>`}</div></div>`;
      body.querySelectorAll('[data-void]').forEach((b) => (b.onclick = async () => {
        if (!(await confirmBox('Void payment', 'This reverses the payment in the books and reopens the invoices it paid.', 'Void payment', true))) return;
        try { await rpc('void_payment', { p_payment: b.dataset.void }); toast('Payment voided'); draw(); } catch (e) { fail(e); }
      }));
      return;
    }
    const { data } = await db.from('invoices').select('*, contacts(full_name, email)').order('issue_date', { ascending: false }).order('number', { ascending: false }).limit(1000);
    const all = data || [];
    const td = today();
    const isOver = (i) => ['open', 'partial'].includes(i.status) && i.due_date < td;
    const sum = (arr, k) => arr.reduce((s, i) => s + Number(i[k] || 0), 0);
    const open = all.filter((i) => ['open', 'partial'].includes(i.status)), over = open.filter(isOver);
    const paid30 = all.filter((i) => i.status === 'paid' && i.updated_at && Date.now() - new Date(i.updated_at) < 30 * 86400000);
    const F = { all: (i) => true, draft: (i) => i.status === 'draft', open: (i) => ['open', 'partial'].includes(i.status) && !isOver(i), overdue: isOver, paid: (i) => i.status === 'paid', void: (i) => i.status === 'void' };
    rows = all.filter(F[filter] || F.all);
    body.innerHTML = `
      <div class="grid g-4" style="margin-bottom:16px">
        ${[['overdue', 'Overdue', sum(over, 'balance'), over.length, '#D92D20'], ['open', 'Open (not due)', sum(open, 'balance') - sum(over, 'balance'), open.length - over.length, '#B54708'],
          ['paid', 'Paid · last 30 days', sum(paid30, 'total'), paid30.length, '#067647'], ['draft', 'Drafts', sum(all.filter(F.draft), 'total'), all.filter(F.draft).length, '#5B6476']]
          .map(([k, l, v, n, c]) => `<button class="card kpi fbtn ${filter === k ? 'sel' : ''}" data-f="${k}" style="border-top:3px solid ${c};text-align:left;cursor:pointer;font:inherit">
            <div><small>${l} · ${n}</small><b style="color:${c}">${money(v)}</b></div></button>`).join('')}
      </div>
      <div class="toolbar"><div class="seg" id="flt">${[['all', 'All'], ['draft', 'Draft'], ['open', 'Open'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void']].map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Date</th><th>No.</th><th>Client</th><th>Due</th><th style="text-align:right">Total</th><th style="text-align:right">Balance</th><th>Status</th></tr></thead><tbody>
        ${rows.map((i) => `<tr class="click" data-id="${i.id}"><td>${fmtDate(i.issue_date)}</td><td><b>${esc(i.number)}</b></td><td>${esc(i.contacts?.full_name)}</td>
          <td style="color:${isOver(i) ? 'var(--red)' : 'inherit'}">${fmtDate(i.due_date)}</td><td style="text-align:right">${money(i.total)}</td>
          <td style="text-align:right">${i.status === 'void' ? '—' : money(i.balance)}</td><td>${invoiceBadge(i)}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('file')}<div>No invoices here.</div></div>`}</div></div>`;
    body.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));
    body.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/invoices/${tr.dataset.id}`)));
  }

  el.querySelector('#csv').onclick = () => {
    if (tab === 'payments') downloadCsv('payments.csv', [['Date', 'Number', 'Client', 'Method', 'Reference', 'Amount', 'Voided'],
      ...rows.map((p) => [p.payment_date, p.number, p.contacts?.full_name, METHOD_LABEL[p.method], p.reference, p.amount, p.voided ? 'yes' : ''])]);
    else downloadCsv('invoices.csv', [['Number', 'Date', 'Due', 'Client', 'Subtotal', 'Tax', 'Total', 'Paid', 'Balance', 'Status'],
      ...rows.map((i) => [i.number, i.issue_date, i.due_date, i.contacts?.full_name, i.subtotal, i.tax_total, i.total, i.amount_paid, i.balance, i.status])]);
  };
  draw();
}
