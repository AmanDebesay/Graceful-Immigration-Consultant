// Shared accounting helpers and the "+ New" transaction forms (invoice, payment, expense, bill, transfer, trust, journal).
import { db, state, can, esc, icon, modal, toast, fail, rpc, today, fmtDate } from './core.js';

export const money = (n, { sign = false } = {}) => {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
  return v < 0 ? `-${s}` : sign && v > 0 ? `+${s}` : s;
};
export const num = (v) => Math.round(Number(v || 0) * 100) / 100;
export const isoMonth = (d) => d.slice(0, 7);
export const monthLabel = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-CA', { month: 'short' });

const INV_STATUS = { draft: ['Draft', ''], open: ['Open', 'b-blue'], partial: ['Partially paid', 'b-gold'], paid: ['Paid', 'b-GREEN'], void: ['Void', ''] };
export function invoiceBadge(inv) {
  if ((inv.status === 'open' || inv.status === 'partial') && inv.due_date < today()) return '<span class="badge b-RED">Overdue</span>';
  const [l, c] = INV_STATUS[inv.status] || [inv.status, ''];
  return `<span class="badge ${c}">${l}</span>`;
}
export const METHODS = [['etransfer', 'Interac e-Transfer'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['card', 'Credit / debit card'], ['bank', 'Bank deposit'], ['other', 'Other']];
export const METHOD_LABEL = Object.fromEntries([...METHODS, ['trust', 'Transfer from trust']]);

let cache = { accounts: null, contacts: null, vendors: null, items: null, settings: null };
export function clearFinCache() { cache = { accounts: null, contacts: null, vendors: null, items: null, settings: null }; }
export async function accounts() {
  if (!cache.accounts) cache.accounts = (await db.from('accounts').select('*').order('code')).data || [];
  return cache.accounts;
}
export async function contactsList() {
  if (!cache.contacts) cache.contacts = (await db.from('contacts').select('id, full_name, email').order('full_name').limit(2000)).data || [];
  return cache.contacts;
}
export async function vendorsList() {
  if (!cache.vendors) cache.vendors = (await db.from('vendors').select('*').eq('active', true).order('name')).data || [];
  return cache.vendors;
}
export async function itemsList() {
  if (!cache.items) cache.items = (await db.from('items').select('*').eq('active', true).order('name')).data || [];
  return cache.items;
}
export async function orgSettings() {
  if (!cache.settings) cache.settings = (await db.from('org_settings').select('*').eq('id', 1).single()).data || {};
  return cache.settings;
}
export const acctOptions = (list, selected, filter = () => true, blank) =>
  (blank ? `<option value="">${esc(blank)}</option>` : '') +
  list.filter((a) => a.active && filter(a)).map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('');
export const contactOptions = (list, selected, blank = 'Choose a client') =>
  `<option value="">${esc(blank)}</option>` + list.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.full_name)}${c.email ? ' · ' + esc(c.email) : ''}</option>`).join('');
export const isBank = (a) => ['bank', 'trust_bank', 'credit_card'].includes(a.subtype);
export const isPayFrom = (a) => ['bank', 'credit_card'].includes(a.subtype);

export function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click();
}

/** Asks for a date range, then downloads the rows returned by run(fromIso, toIso) as a CSV that opens in Excel. */
export function exportRange({ title, file, note = '', run }) {
  const y = new Date().getFullYear(), pad = (n) => String(n).padStart(2, '0'), d = new Date();
  const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  modal({
    title,
    body: `${note ? `<p style="color:var(--muted);margin-bottom:12px">${note}</p>` : ''}<div class="row-2"><div class="field"><label>From</label><input class="input" type="date" id="exFrom" value="${y}-01-01"></div>
      <div class="field"><label>To</label><input class="input" type="date" id="exTo" value="${todayStr}"></div></div>
      <p style="color:var(--muted);font-size:13px">The file opens in Excel. Leave From empty to include everything.</p>`,
    actions: [{ label: 'Cancel' }, { label: 'Download for Excel', cls: 'btn-primary', onClick: async (m) => {
      const f = m.querySelector('#exFrom').value, t = m.querySelector('#exTo').value;
      const fromIso = f ? new Date(f + 'T00:00:00').toISOString() : null, toIso = t ? new Date(t + 'T23:59:59').toISOString() : null;
      const rows = await run(fromIso, toIso);
      if (rows.length < 2) throw new Error('Nothing found in that date range.');
      downloadCsv(`${file}-${f || 'all'}-to-${t || todayStr}.csv`, rows);
      toast(`Downloaded ${rows.length - 1} record${rows.length === 2 ? '' : 's'}`);
    } }],
  });
}

/** Fetches every row of a query in pages of 1000. build() must return a fresh query each time. */
export async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const changed = () => { clearFinCache(); window.dispatchEvent(new Event('books-changed')); };

// ── Receive payment ──
export async function receivePayment(contactId) {
  const [contacts, accs] = await Promise.all([contactsList(), accounts()]);
  const m = modal({
    title: 'Receive payment', wide: true,
    body: `<div class="row-2"><div class="field"><label>Client</label><select class="input" id="pc">${contactOptions(contacts, contactId)}</select></div>
      <div class="field"><label>Payment date</label><input class="input" type="date" id="pd" value="${today()}"></div></div>
      <div class="row-2"><div class="field"><label>Payment method</label><select class="input" id="pm">${METHODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}<option value="trust">Transfer from client's trust funds</option></select></div>
      <div class="field" id="depWrap"><label>Deposit to</label><select class="input" id="pa">${acctOptions(accs, accs.find((a) => a.system_key === 'operating_bank')?.id, (a) => a.subtype === 'bank')}</select></div></div>
      <div class="row-2"><div class="field"><label>Reference no.</label><input class="input" id="pr" placeholder="e-Transfer ref, cheque no."></div>
      <div class="field"><label>Memo</label><input class="input" id="pmemo"></div></div>
      <div id="trustInfo"></div>
      <h4 style="margin:10px 0 8px;color:var(--navy)">Outstanding invoices</h4><div id="openInv" class="table-wrap"><div class="empty" style="padding:18px">Choose a client.</div></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px;font-size:16px">Amount received:&nbsp;<b id="ptotal">${money(0)}</b></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save payment', cls: 'btn-primary', onClick: async (el) => {
      const apps = [...el.querySelectorAll('[data-inv]')].map((i) => ({ invoice_id: i.dataset.inv, amount: num(i.value) })).filter((a) => a.amount > 0);
      if (!apps.length) throw new Error('Enter an amount against at least one invoice.');
      await rpc('receive_payment', { p_contact: el.querySelector('#pc').value, p_date: el.querySelector('#pd').value, p_method: el.querySelector('#pm').value,
        p_deposit_account: el.querySelector('#pa').value || null, p_reference: el.querySelector('#pr').value || null, p_memo: el.querySelector('#pmemo').value || null, p_applications: apps });
      toast('Payment recorded'); changed();
    } }],
  });
  const el = m.el;
  const total = () => { el.querySelector('#ptotal').textContent = money([...el.querySelectorAll('[data-inv]')].reduce((s, i) => s + num(i.value), 0)); };
  async function loadOpen() {
    const cid = el.querySelector('#pc').value, box = el.querySelector('#openInv');
    if (!cid) { box.innerHTML = '<div class="empty" style="padding:18px">Choose a client.</div>'; return; }
    const { data } = await db.from('invoices').select('id, number, issue_date, due_date, total, balance, status').eq('contact_id', cid).in('status', ['open', 'partial']).order('due_date');
    box.innerHTML = data?.length ? `<table class="t"><thead><tr><th>Invoice</th><th>Due</th><th style="text-align:right">Original</th><th style="text-align:right">Open balance</th><th style="text-align:right;width:160px">Payment</th></tr></thead><tbody>
      ${data.map((i) => `<tr><td>${esc(i.number)}</td><td>${fmtDate(i.due_date)}</td><td style="text-align:right">${money(i.total)}</td><td style="text-align:right">${money(i.balance)}</td>
        <td><input class="input" data-inv="${i.id}" data-max="${i.balance}" type="number" step="0.01" min="0" value="${i.balance}" style="text-align:right"></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty" style="padding:18px">This client has no open invoices.</div>';
    box.querySelectorAll('[data-inv]').forEach((i) => (i.oninput = total));
    total();
    const tb = await rpc('trust_balance', { p_contact: cid }).catch(() => 0);
    el.querySelector('#trustInfo').innerHTML = Number(tb) > 0 ? `<div class="alert info">This client has <b>${money(tb)}</b> in trust. Choose “Transfer from client's trust funds” to pay earned fees from it.</div>` : '';
  }
  el.querySelector('#pc').onchange = loadOpen;
  el.querySelector('#pm').onchange = (e) => { el.querySelector('#depWrap').style.visibility = e.target.value === 'trust' ? 'hidden' : 'visible'; };
  loadOpen();
}

// ── Expense ──
export async function newExpense() {
  const [accs, vendors, contacts, s] = await Promise.all([accounts(), vendorsList(), contactsList(), orgSettings()]);
  modal({
    title: 'New expense',
    body: `<div class="row-2"><div class="field"><label>Payee (vendor)</label><select class="input" id="ev"><option value="">— Type a payee below —</option>${vendors.map((v) => `<option value="${v.id}" data-acct="${v.default_account_id || ''}">${esc(v.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Or payee name</label><input class="input" id="ep" placeholder="e.g. Staples"></div></div>
      <div class="row-2"><div class="field"><label>Payment date</label><input class="input" type="date" id="ed" value="${today()}"></div>
      <div class="field"><label>Paid from</label><select class="input" id="epa">${acctOptions(accs, accs.find((a) => a.system_key === 'operating_bank')?.id, isPayFrom)}</select></div></div>
      <div class="field"><label>Category</label><select class="input" id="ea">${acctOptions(accs, null, (a) => a.type === 'expense' || a.subtype === 'fixed_asset')}</select></div>
      <div class="row-2"><div class="field"><label>Total paid (incl. tax)</label><input class="input" type="number" step="0.01" id="eam"></div>
      <div class="field"><label>GST/HST included</label><input class="input" type="number" step="0.01" id="etx" value="0"><small style="color:var(--muted)"><a href="#" id="calcTax">Calculate ${s.gst_rate || 5}%</a></small></div></div>
      <div class="row-2"><div class="field"><label>Client (if a disbursement)</label><select class="input" id="ec">${contactOptions(contacts, null, 'None')}</select></div>
      <div class="field"><label>Reference / receipt no.</label><input class="input" id="eref"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="em"></div>`,
    onOpen: (el) => {
      el.querySelector('#calcTax').onclick = (e) => { e.preventDefault(); const t = num(el.querySelector('#eam').value); const r = Number(s.gst_rate || 5); el.querySelector('#etx').value = num(t - t / (1 + r / 100)).toFixed(2); };
      el.querySelector('#ev').onchange = (e) => { const a = e.target.selectedOptions[0]?.dataset.acct; if (a) el.querySelector('#ea').value = a; };
    },
    actions: [{ label: 'Cancel' }, { label: 'Save expense', cls: 'btn-primary', onClick: async (el) => {
      const v = (s2) => el.querySelector(s2).value;
      const vendorName = el.querySelector('#ev').selectedOptions[0]?.textContent;
      await rpc('record_expense', { p: { date: v('#ed'), vendor_id: v('#ev') || null, payee: v('#ep') || (v('#ev') ? vendorName : null), account_id: v('#ea'),
        payment_account_id: v('#epa'), amount: num(v('#eam')), tax: num(v('#etx')), memo: v('#em') || null, contact_id: v('#ec') || null, reference: v('#eref') || null } });
      toast('Expense recorded'); changed();
    } }],
  });
}

// ── Bill ──
export async function newBill() {
  const [accs, vendors] = await Promise.all([accounts(), vendorsList()]);
  if (!vendors.length) { toast('Add a vendor first (Expenses → Vendors).', true); return; }
  const due = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA');
  modal({
    title: 'New bill',
    body: `<div class="row-2"><div class="field"><label>Vendor</label><select class="input" id="bv">${vendors.map((v) => `<option value="${v.id}" data-acct="${v.default_account_id || ''}">${esc(v.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Bill no.</label><input class="input" id="bn"></div></div>
      <div class="row-2"><div class="field"><label>Bill date</label><input class="input" type="date" id="bd" value="${today()}"></div>
      <div class="field"><label>Due date</label><input class="input" type="date" id="bdd" value="${due}"></div></div>
      <div class="field"><label>Category</label><select class="input" id="ba">${acctOptions(accs, null, (a) => a.type === 'expense' || a.subtype === 'fixed_asset')}</select></div>
      <div class="row-2"><div class="field"><label>Bill total (incl. tax)</label><input class="input" type="number" step="0.01" id="bam"></div>
      <div class="field"><label>GST/HST included</label><input class="input" type="number" step="0.01" id="btx" value="0"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="bm"></div>`,
    onOpen: (el) => { const s = el.querySelector('#bv'); const f = () => { const a = s.selectedOptions[0]?.dataset.acct; if (a) el.querySelector('#ba').value = a; }; s.onchange = f; f(); },
    actions: [{ label: 'Cancel' }, { label: 'Save bill', cls: 'btn-primary', onClick: async (el) => {
      const v = (s) => el.querySelector(s).value;
      await rpc('record_bill', { p: { vendor_id: v('#bv'), bill_number: v('#bn') || null, bill_date: v('#bd'), due_date: v('#bdd'), account_id: v('#ba'), amount: num(v('#bam')), tax: num(v('#btx')), memo: v('#bm') || null } });
      toast('Bill saved'); changed();
    } }],
  });
}

export async function payBill(bill) {
  const accs = await accounts();
  modal({
    title: `Pay bill${bill.bill_number ? ' ' + bill.bill_number : ''}`,
    body: `<p style="margin-bottom:12px">Open balance: <b>${money(bill.balance)}</b></p>
      <div class="row-2"><div class="field"><label>Payment date</label><input class="input" type="date" id="d" value="${today()}"></div>
      <div class="field"><label>Amount</label><input class="input" type="number" step="0.01" id="a" value="${bill.balance}"></div></div>
      <div class="row-2"><div class="field"><label>Paid from</label><select class="input" id="acc">${acctOptions(accs, accs.find((a) => a.system_key === 'operating_bank')?.id, isPayFrom)}</select></div>
      <div class="field"><label>Reference</label><input class="input" id="r" placeholder="Cheque no., confirmation"></div></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Pay bill', cls: 'btn-primary', onClick: async (el) => {
      await rpc('pay_bill', { p_bill: bill.id, p_date: el.querySelector('#d').value, p_amount: num(el.querySelector('#a').value), p_account: el.querySelector('#acc').value, p_reference: el.querySelector('#r').value || null });
      toast('Bill payment recorded'); changed();
    } }],
  });
}

// ── Transfer between accounts ──
export async function newTransfer() {
  const accs = await accounts();
  modal({
    title: 'Transfer between accounts',
    body: `<div class="row-2"><div class="field"><label>From</label><select class="input" id="tf">${acctOptions(accs, null, (a) => a.subtype === 'bank' || a.subtype === 'credit_card' || a.type === 'equity')}</select></div>
      <div class="field"><label>To</label><select class="input" id="tt">${acctOptions(accs, null, (a) => a.subtype === 'bank' || a.subtype === 'credit_card' || a.type === 'equity')}</select></div></div>
      <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="td" value="${today()}"></div>
      <div class="field"><label>Amount</label><input class="input" type="number" step="0.01" id="ta"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="tm" placeholder="e.g. Owner contribution, credit card payment"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save transfer', cls: 'btn-primary', onClick: async (el) => {
      await rpc('record_transfer', { p_date: el.querySelector('#td').value, p_from: el.querySelector('#tf').value, p_to: el.querySelector('#tt').value,
        p_amount: num(el.querySelector('#ta').value), p_memo: el.querySelector('#tm').value || null });
      toast('Transfer recorded'); changed();
    } }],
  });
}

// ── Trust deposit / refund ──
export async function trustTxn(type = 'deposit', contactId) {
  const contacts = await contactsList();
  modal({
    title: type === 'deposit' ? 'Receive retainer into trust' : 'Refund client from trust',
    body: `<div class="alert info">${type === 'deposit'
      ? 'Money paid in advance for work not yet done is client money. It goes into the trust account and stays there until you invoice earned fees.'
      : 'Return unearned client money from the trust account.'}</div>
      <div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, contactId)}</select></div>
      <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="d" value="${today()}"></div>
      <div class="field"><label>Amount</label><input class="input" type="number" step="0.01" id="a"></div></div>
      <div class="row-2"><div class="field"><label>Method</label><select class="input" id="m">${METHODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="field"><label>Reference</label><input class="input" id="r"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="mm"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (el) => {
      const v = (s) => el.querySelector(s).value;
      if (!v('#c')) throw new Error('Choose a client.');
      await rpc('trust_transaction', { p_contact: v('#c'), p_date: v('#d'), p_type: type, p_amount: num(v('#a')), p_method: v('#m'), p_reference: v('#r') || null, p_memo: v('#mm') || null });
      toast(type === 'deposit' ? 'Retainer deposited to trust' : 'Trust refund recorded'); changed();
    } }],
  });
}

// ── Manual journal entry ──
export async function newJournal() {
  const [accs, contacts] = await Promise.all([accounts(), contactsList()]);
  const row = () => `<tr><td><select class="input jl-a">${acctOptions(accs, null, () => true, 'Account')}</select></td>
    <td><input class="input jl-d" type="number" step="0.01" placeholder="0.00"></td><td><input class="input jl-c" type="number" step="0.01" placeholder="0.00"></td>
    <td><input class="input jl-desc" placeholder="Description"></td><td><select class="input jl-n">${contactOptions(contacts, null, '—')}</select></td></tr>`;
  const m = modal({
    title: 'Journal entry', wide: true,
    body: `<div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="jd" value="${today()}"></div>
      <div class="field"><label>Memo</label><input class="input" id="jm" placeholder="e.g. Opening balances"></div></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Account</th><th style="width:130px">Debit</th><th style="width:130px">Credit</th><th>Description</th><th style="width:170px">Client</th></tr></thead>
      <tbody id="jl">${row()}${row()}${row()}</tbody></table></div>
      <div class="row" style="justify-content:space-between;margin-top:10px"><button class="btn btn-sm" id="addRow">${icon('plus')} Add line</button>
      <span id="jt">Debits $0.00 · Credits $0.00</span></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save entry', cls: 'btn-primary', onClick: async (el) => {
      const lines = [...el.querySelectorAll('#jl tr')].map((tr) => ({ account_id: tr.querySelector('.jl-a').value, debit: num(tr.querySelector('.jl-d').value),
        credit: num(tr.querySelector('.jl-c').value), description: tr.querySelector('.jl-desc').value || null, contact_id: tr.querySelector('.jl-n').value || null }))
        .filter((l) => l.account_id && (l.debit || l.credit));
      await rpc('create_journal_entry', { p_date: el.querySelector('#jd').value, p_memo: el.querySelector('#jm').value || null, p_lines: lines });
      toast('Journal entry saved'); changed();
    } }],
  });
  const el = m.el;
  const tot = () => {
    let d = 0, c = 0; el.querySelectorAll('#jl tr').forEach((tr) => { d += num(tr.querySelector('.jl-d').value); c += num(tr.querySelector('.jl-c').value); });
    el.querySelector('#jt').innerHTML = `Debits <b>${money(d)}</b> · Credits <b>${money(c)}</b> ${Math.abs(d - c) < 0.005 && d > 0 ? '<span class="badge b-GREEN">Balanced</span>' : '<span class="badge b-AMBER">Not balanced</span>'}`;
  };
  el.addEventListener('input', tot);
  el.querySelector('#addRow').onclick = () => { el.querySelector('#jl').insertAdjacentHTML('beforeend', row()); };
}

// ── New invoice (creates a draft and opens the editor) ──
export async function newInvoice(contactId) {
  const contacts = await contactsList();
  modal({
    title: 'New invoice',
    body: `<div class="field"><label>Client</label><select class="input" id="ic">${contactOptions(contacts, contactId)}</select></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Create draft', cls: 'btn-primary', onClick: async (el) => {
      const cid = el.querySelector('#ic').value; if (!cid) throw new Error('Choose a client.');
      const { data, error } = await db.from('invoices').insert({ contact_id: cid, created_by: state.profile.id }).select('id').single();
      if (error) throw error;
      location.hash = `#/invoices/${data.id}`;
    } }],
  });
}

export function canBooks() { return can('finance.manage'); }
