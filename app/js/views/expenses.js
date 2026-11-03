import { db, can, esc, icon, fmtDate, rpc, confirmBox, toast, fail, modal, today } from '../core.js';
import { money, accounts, acctOptions, newExpense, newBill, expenseForm, billForm, payBill, downloadCsv, clearFinCache, uploadForReview, readReceipts, viewReceipts } from '../fin.js';

export async function render(el) {
  let tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'expenses';
  const manage = can('finance.manage');
  el.innerHTML = `<div class="toolbar"><div class="seg" id="tabs"><button data-k="expenses">Expenses</button><button data-k="bills">Bills</button><button data-k="vendors">Vendors</button></div>
    <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>
    ${manage ? `<label class="btn" title="Photos or PDFs. The AI reads each one, suggests the category and whether it's paid or a bill, and waits for your review.">${icon('camera')} Upload receipts / bills<input type="file" id="upr" accept="image/*,application/pdf" multiple hidden></label>
      <button class="btn" id="nb">${icon('file')} New bill</button><button class="btn btn-gold" id="ne">${icon('plus')} New expense</button>` : ''}</div><div id="body"></div>`;
  el.querySelector('#tabs').onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; draw(); } };
  el.querySelector('#ne')?.addEventListener('click', () => newExpense());
  el.querySelector('#nb')?.addEventListener('click', () => newBill());
  // Scanned receipts and bills go to the Receipts page for review (like QuickBooks "For review")
  el.querySelector('#upr')?.addEventListener('change', async (e) => {
    const ids = await uploadForReview(e.target.files); e.target.value = '';
    if (!ids.length) return;
    toast(`${ids.length} file${ids.length > 1 ? 's' : ''} uploaded — reading now. Review them on Receipts.`);
    readReceipts(ids);
    location.hash = '#/receipts';
  });
  const clip = (list) => (list || []).length ? `<button class="btn btn-ghost btn-sm" data-rc title="View receipt${list.length > 1 ? 's' : ''}">${icon('file')}${list.length > 1 ? ` ${list.length}` : ''}</button>` : '';
  const wireRow = (body, list, edit) => {
    body.querySelectorAll('[data-row]').forEach((tr) => {
      const x = list.find((r) => r.id === tr.dataset.row);
      tr.querySelector('[data-rc]')?.addEventListener('click', () => viewReceipts(x.receipts));
      tr.querySelector('[data-ed]')?.addEventListener('click', () => edit(x));
    });
  };
  const onBooks = () => { if (el.isConnected) draw(); else window.removeEventListener('books-changed', onBooks); };
  window.addEventListener('books-changed', onBooks);
  let rows = [];

  async function draw() {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    const body = el.querySelector('#body');
    if (tab === 'expenses') {
      const { data } = await db.from('expenses').select('*, accounts!expenses_account_id_fkey(name), pay:accounts!expenses_payment_account_id_fkey(name), vendors(name), contacts(full_name), receipts(id, file_path, file_name)').order('expense_date', { ascending: false }).limit(1000);
      rows = data || [];
      body.innerHTML = `<div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Date</th><th>Payee</th><th>Category</th><th>Paid from</th><th>Client</th><th style="text-align:right">GST</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody>
        ${rows.map((x) => `<tr data-row="${x.id}" style="${x.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${fmtDate(x.expense_date)}</td><td><b>${esc(x.vendors?.name || x.payee || '—')}</b>${x.memo ? `<br><small style="color:var(--muted)">${esc(x.memo)}</small>` : ''}</td>
          <td>${esc(x.accounts?.name)}</td><td>${esc(x.pay?.name)}</td><td>${esc(x.contacts?.full_name || '')}</td><td style="text-align:right">${money(x.tax)}</td><td style="text-align:right"><b>${money(x.amount)}</b></td>
          <td style="text-align:right;white-space:nowrap">${clip(x.receipts)}${manage && !x.voided ? ` <button class="btn btn-sm" data-ed>Edit</button> <button class="btn btn-sm btn-danger" data-void="${x.id}">Void</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('dollar')}<div>No expenses yet.</div></div>`}</div></div>`;
      wireRow(body, rows, expenseForm);
      body.querySelectorAll('[data-void]').forEach((b) => (b.onclick = async () => {
        if (!(await confirmBox('Void expense', 'This reverses the expense in the books.', 'Void', true))) return;
        try { await rpc('void_expense', { p_expense: b.dataset.void }); toast('Expense voided'); draw(); } catch (e) { fail(e); }
      }));
    } else if (tab === 'bills') {
      const { data } = await db.from('bills').select('*, vendors(name), accounts(name), receipts(id, file_path, file_name)').order('due_date').limit(1000);
      rows = data || [];
      const open = rows.filter((b) => ['open', 'partial'].includes(b.status));
      body.innerHTML = `<div class="grid g-3" style="margin-bottom:16px">
          <div class="card kpi"><div><small>Unpaid bills · ${open.length}</small><b>${money(open.reduce((s, b) => s + +b.balance, 0))}</b></div></div>
          <div class="card kpi"><div><small>Overdue</small><b style="color:var(--red)">${money(open.filter((b) => b.due_date < today()).reduce((s, b) => s + +b.balance, 0))}</b></div></div></div>
        <div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Due</th><th>Vendor</th><th>Bill no.</th><th>Category</th><th style="text-align:right">Total</th><th style="text-align:right">Balance</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((b) => `<tr data-row="${b.id}"><td style="color:${['open', 'partial'].includes(b.status) && b.due_date < today() ? 'var(--red)' : 'inherit'}">${fmtDate(b.due_date)}</td><td><b>${esc(b.vendors?.name)}</b></td><td>${esc(b.bill_number || '—')}</td>
          <td>${esc(b.accounts?.name)}</td><td style="text-align:right">${money(b.amount)}</td><td style="text-align:right">${money(b.status === 'void' ? 0 : b.balance)}</td>
          <td><span class="badge ${b.status === 'paid' ? 'b-GREEN' : b.status === 'void' ? '' : 'b-gold'}">${b.status}</span></td>
          <td style="text-align:right;white-space:nowrap">${clip(b.receipts)}${manage && b.status !== 'void' ? ` <button class="btn btn-sm" data-ed>Edit</button>` : ''}${manage && ['open', 'partial'].includes(b.status) ? ` <button class="btn btn-sm btn-primary" data-pay="${b.id}">Pay</button>` : ''}
            ${manage && b.status === 'open' && +b.amount_paid === 0 ? `<button class="btn btn-sm btn-danger" data-vb="${b.id}">Void</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('file')}<div>No bills yet. Bills are for invoices you'll pay later (e.g. translator, rent).</div></div>`}</div></div>`;
      wireRow(body, rows, billForm);
      body.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => payBill(rows.find((x) => x.id === b.dataset.pay))));
      body.querySelectorAll('[data-vb]').forEach((b) => (b.onclick = async () => {
        if (!(await confirmBox('Void bill', 'This reverses the bill in the books.', 'Void', true))) return;
        try { await rpc('void_bill', { p_bill: b.dataset.vb }); toast('Bill voided'); draw(); } catch (e) { fail(e); }
      }));
    } else {
      const [{ data }, accs] = await Promise.all([db.from('vendors').select('*, accounts(name)').order('name'), accounts()]);
      rows = data || [];
      body.innerHTML = `${manage ? '<div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="nv">' + icon('plus') + ' New vendor</button></div>' : ''}
        <div class="card"><div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Vendor</th><th>Email</th><th>Phone</th><th>Default category</th><th></th></tr></thead><tbody>
        ${rows.map((v) => `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.email || '')}</td><td>${esc(v.phone || '')}</td><td>${esc(v.accounts?.name || '—')}</td>
          <td style="text-align:right">${manage ? `<button class="btn btn-sm" data-ev="${v.id}">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('users')}<div>No vendors yet.</div></div>`}</div></div>`;
      const edit = (v = {}) => modal({
        title: v.id ? 'Edit vendor' : 'New vendor',
        body: `<div class="field"><label>Name</label><input class="input" id="n" value="${esc(v.name || '')}"></div>
          <div class="row-2"><div class="field"><label>Email</label><input class="input" id="e" value="${esc(v.email || '')}"></div><div class="field"><label>Phone</label><input class="input" id="p" value="${esc(v.phone || '')}"></div></div>
          <div class="field"><label>Default expense category</label><select class="input" id="a">${acctOptions(accs, v.default_account_id, (a) => a.type === 'expense', 'None')}</select></div>
          <div class="field"><label>Address</label><input class="input" id="ad" value="${esc(v.address || '')}"></div>`,
        actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
          const row = { name: m.querySelector('#n').value.trim(), email: m.querySelector('#e').value || null, phone: m.querySelector('#p').value || null,
            default_account_id: m.querySelector('#a').value || null, address: m.querySelector('#ad').value || null };
          if (!row.name) throw new Error('Enter a name.');
          const { error } = v.id ? await db.from('vendors').update(row).eq('id', v.id) : await db.from('vendors').insert(row);
          if (error) throw error; clearFinCache(); toast('Vendor saved'); draw();
        } }],
      });
      body.querySelector('#nv')?.addEventListener('click', () => edit());
      body.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => edit(rows.find((x) => x.id === b.dataset.ev))));
    }
  }
  el.querySelector('#csv').onclick = () => {
    if (tab === 'expenses') downloadCsv('expenses.csv', [['Date', 'Payee', 'Category', 'Paid from', 'GST', 'Total', 'Memo', 'Voided'],
      ...rows.map((x) => [x.expense_date, x.vendors?.name || x.payee, x.accounts?.name, x.pay?.name, x.tax, x.amount, x.memo, x.voided ? 'yes' : ''])]);
    else if (tab === 'bills') downloadCsv('bills.csv', [['Vendor', 'Bill no', 'Date', 'Due', 'Total', 'Balance', 'Status'], ...rows.map((b) => [b.vendors?.name, b.bill_number, b.bill_date, b.due_date, b.amount, b.balance, b.status])]);
    else downloadCsv('vendors.csv', [['Name', 'Email', 'Phone'], ...rows.map((v) => [v.name, v.email, v.phone])]);
  };
  draw();
}
