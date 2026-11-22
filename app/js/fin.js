// Shared accounting helpers and the "+ New" transaction forms (invoice, payment, expense, bill, transfer, trust, journal).
import { db, state, can, esc, icon, modal, toast, fail, rpc, callFn, today, fmtDate, confirmBox } from './core.js';

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
// Expenses and bill payments can be paid by the business (bank, card) or by the owner personally (Shareholder Loan)
export const isPayFrom = (a) => ['bank', 'credit_card', 'shareholder_loan'].includes(a.subtype);

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
      <div class="field"><label>Received from (shown on the receipt)</label><input class="input" id="pfrom" placeholder="Who paid — the client, or the fee payer"></div>
      <div id="trustInfo"></div>
      <h4 style="margin:10px 0 8px;color:var(--navy)">Outstanding invoices</h4><div id="openInv" class="table-wrap"><div class="empty" style="padding:18px">Choose a client.</div></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px;font-size:16px">Amount received:&nbsp;<b id="ptotal">${money(0)}</b></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save payment', cls: 'btn-primary', onClick: async (el) => {
      const apps = [...el.querySelectorAll('[data-inv]')].map((i) => ({ invoice_id: i.dataset.inv, amount: num(i.value) })).filter((a) => a.amount > 0);
      if (!apps.length) throw new Error('Enter an amount against at least one invoice.');
      const pid = await rpc('receive_payment', { p_contact: el.querySelector('#pc').value, p_date: el.querySelector('#pd').value, p_method: el.querySelector('#pm').value,
        p_deposit_account: el.querySelector('#pa').value || null, p_reference: el.querySelector('#pr').value || null, p_memo: el.querySelector('#pmemo').value || null, p_applications: apps });
      const from = el.querySelector('#pfrom').value.trim();
      if (from && pid) await rpc('update_receipt', { p_kind: 'payment', p_id: pid, p_received_from: from }).catch(() => {});
      toast('Payment recorded'); changed();
      if (pid) receiptPrompt('payment', pid);
    } }],
  });
  const el = m.el;
  const total = () => { el.querySelector('#ptotal').textContent = money([...el.querySelectorAll('[data-inv]')].reduce((s, i) => s + num(i.value), 0)); };
  async function loadOpen() {
    const cid = el.querySelector('#pc').value, box = el.querySelector('#openInv');
    if (!cid) { box.innerHTML = '<div class="empty" style="padding:18px">Choose a client.</div>'; return; }
    const { data } = await db.from('invoices').select('id, number, issue_date, due_date, total, balance, status, bill_to').eq('contact_id', cid).in('status', ['open', 'partial']).order('due_date');
    const who = data?.find((i) => i.bill_to?.name)?.bill_to?.name || (await payerFor(cid))?.name || contacts.find((c) => c.id === cid)?.full_name || '';
    el.querySelector('#pfrom').value = who;
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

// ── Receipt files ──
/** Shrinks large photos to ≤2000px JPEG (also converts formats the browser can decode, e.g. iPhone photos). */
export async function prepareReceipt(file) {
  if (file.type === 'application/pdf') return { blob: file, type: 'application/pdf', ext: 'pdf' };
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: only photos and PDFs can be uploaded.`);
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error(`${file.name}: this image format can't be read. Try a JPG, PNG or PDF.`);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  return { blob, type: 'image/jpeg', ext: 'jpg' };
}
async function storeReceipt(f, row) {
  if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name} is larger than 25 MB.`);
  const p = await prepareReceipt(f);
  if (p.blob.size > 10 * 1024 * 1024) throw new Error(`${f.name} is still larger than 10 MB after compressing.`);
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${p.ext}`;
  const { error: ue } = await db.storage.from('receipts').upload(path, p.blob, { contentType: p.type });
  if (ue) throw ue;
  const { data, error } = await db.from('receipts').insert({ file_path: path, file_name: f.name.slice(0, 120), mime_type: p.type, ...row }).select('id').single();
  if (error) throw error;
  return data.id;
}
/** Uploads receipts/bills to be read by the AI and reviewed on the Receipts page. Returns the new receipt ids. */
export async function uploadForReview(files) {
  const ids = [];
  for (const f of [...files].slice(0, 20)) { try { ids.push(await storeReceipt(f, {})); } catch (err) { fail(err); } }
  return ids;
}
/** Reads uploaded receipts with the AI, up to 3 at a time. */
export async function readReceipts(ids, onEach) {
  const queue = [...ids];
  const worker = async () => { while (queue.length) { const id = queue.shift(); try { await callFn('receipt-scan', { receipt_id: id }); } catch { /* shown on the card */ } onEach?.(id); } };
  await Promise.all([worker(), worker(), worker()]);
}
/** Attaches receipt files to an expense or bill that is already in the books. */
export async function attachReceipts(files, { expenseId = null, billId = null }) {
  const user = (await db.auth.getUser()).data.user?.id;
  for (const f of files) await storeReceipt(f, { status: 'approved', expense_id: expenseId, bill_id: billId, doc_kind: billId ? 'bill' : 'receipt', approved_at: new Date().toISOString(), approved_by: user });
}
/** Opens an attached receipt (one file), or lists them when there are several. */
export async function viewReceipts(list) {
  const { data } = await db.storage.from('receipts').createSignedUrls(list.map((r) => r.file_path), 3600);
  const urls = (data || []).map((x) => x.signedUrl).filter(Boolean);
  if (urls.length === 1) return window.open(urls[0], '_blank', 'noopener');
  modal({ title: 'Receipts', body: list.map((r, i) => `<p><a href="${esc(urls[i] || '#')}" target="_blank" rel="noopener">${icon('file')} ${esc(r.file_name || `Receipt ${i + 1}`)}</a></p>`).join(''), actions: [{ label: 'Close' }] });
}
const attachField = (n) => `<div class="field"><label>${n ? `Attach another receipt (${n} attached)` : 'Attach receipt (optional)'}</label><input class="input" type="file" id="rcf" accept="image/*,application/pdf" multiple></div>`;

// ── Expense (new or edit) ──
export const newExpense = () => expenseForm();
export async function expenseForm(x = null) {
  const [accs, vendors, contacts, s] = await Promise.all([accounts(), vendorsList(), contactsList(), orgSettings()]);
  const named = x && !x.vendor_id ? x.payee || '' : '';
  modal({
    title: x ? 'Edit expense' : 'New expense',
    body: `<div class="row-2"><div class="field"><label>Payee (vendor)</label><select class="input" id="ev"><option value="">— Type a payee below —</option>${vendors.map((v) => `<option value="${v.id}" data-acct="${v.default_account_id || ''}" ${x?.vendor_id === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Or payee name</label><input class="input" id="ep" placeholder="e.g. Staples" value="${esc(named)}"></div></div>
      <div class="row-2"><div class="field"><label>Payment date</label><input class="input" type="date" id="ed" value="${x?.expense_date || today()}"></div>
      <div class="field"><label>Paid from</label><select class="input" id="epa">${acctOptions(accs, x?.payment_account_id || accs.find((a) => a.system_key === 'operating_bank')?.id, isPayFrom)}</select></div></div>
      <div class="field"><label>Category</label><select class="input" id="ea">${acctOptions(accs, x?.account_id || null, (a) => a.type === 'expense' || a.subtype === 'fixed_asset')}</select></div>
      <div class="row-2"><div class="field"><label>Total paid (incl. tax)</label><input class="input" type="number" step="0.01" id="eam" value="${x?.amount ?? ''}"></div>
      <div class="field"><label>GST/HST included</label><input class="input" type="number" step="0.01" id="etx" value="${x?.tax ?? 0}"><small style="color:var(--muted)"><a href="#" id="calcTax">Calculate ${s.gst_rate || 5}%</a></small></div></div>
      <div class="row-2"><div class="field"><label>Client (if a disbursement)</label><select class="input" id="ec">${contactOptions(contacts, x?.contact_id || null, 'None')}</select></div>
      <div class="field"><label>Reference / receipt no.</label><input class="input" id="eref" value="${esc(x?.reference || '')}"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="em" value="${esc(x?.memo || '')}"></div>
      ${attachField((x?.receipts || []).length)}`,
    onOpen: (el) => {
      el.querySelector('#calcTax').onclick = (e) => { e.preventDefault(); const t = num(el.querySelector('#eam').value); const r = Number(s.gst_rate || 5); el.querySelector('#etx').value = num(t - t / (1 + r / 100)).toFixed(2); };
      el.querySelector('#ev').onchange = (e) => { const a = e.target.selectedOptions[0]?.dataset.acct; if (a) el.querySelector('#ea').value = a; };
    },
    actions: [{ label: 'Cancel' }, { label: x ? 'Save changes' : 'Save expense', cls: 'btn-primary', onClick: async (el) => {
      const v = (s2) => el.querySelector(s2).value;
      const vendorName = el.querySelector('#ev').selectedOptions[0]?.textContent;
      const p = { date: v('#ed'), vendor_id: v('#ev') || null, payee: v('#ep') || (v('#ev') ? vendorName : null), account_id: v('#ea'),
        payment_account_id: v('#epa'), amount: num(v('#eam')), tax: num(v('#etx')), memo: v('#em') || null, contact_id: v('#ec') || null, reference: v('#eref') || null };
      const id = x ? (await rpc('update_expense', { p_expense: x.id, p }), x.id) : await rpc('record_expense', { p });
      const files = [...el.querySelector('#rcf').files];
      if (files.length) await attachReceipts(files, { expenseId: id });
      toast(x ? 'Expense updated' : 'Expense recorded'); changed();
    } }],
  });
}

// ── Bill (new or edit) ──
export const newBill = () => billForm();
export async function billForm(b = null) {
  const [accs, vendors] = await Promise.all([accounts(), vendorsList()]);
  if (!vendors.length) { toast('Add a vendor first (Expenses → Vendors).', true); return; }
  const due = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA');
  modal({
    title: b ? 'Edit bill' : 'New bill',
    body: `${b && +b.amount_paid > 0 ? `<div class="alert info" style="font-size:13px">${money(b.amount_paid)} has already been paid on this bill. The total can't go below that.</div>` : ''}
      <div class="row-2"><div class="field"><label>Vendor</label><select class="input" id="bv">${vendors.map((v) => `<option value="${v.id}" data-acct="${v.default_account_id || ''}" ${b?.vendor_id === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Bill no.</label><input class="input" id="bn" value="${esc(b?.bill_number || '')}"></div></div>
      <div class="row-2"><div class="field"><label>Bill date</label><input class="input" type="date" id="bd" value="${b?.bill_date || today()}"></div>
      <div class="field"><label>Due date</label><input class="input" type="date" id="bdd" value="${b?.due_date || due}"></div></div>
      <div class="field"><label>Category</label><select class="input" id="ba">${acctOptions(accs, b?.account_id || null, (a) => a.type === 'expense' || a.subtype === 'fixed_asset')}</select></div>
      <div class="row-2"><div class="field"><label>Bill total (incl. tax)</label><input class="input" type="number" step="0.01" id="bam" value="${b?.amount ?? ''}"></div>
      <div class="field"><label>GST/HST included</label><input class="input" type="number" step="0.01" id="btx" value="${b?.tax ?? 0}"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="bm" value="${esc(b?.memo || '')}"></div>
      ${attachField((b?.receipts || []).length)}`,
    onOpen: (el) => { const s = el.querySelector('#bv'); const f = () => { const a = s.selectedOptions[0]?.dataset.acct; if (a) el.querySelector('#ba').value = a; }; s.onchange = f; if (!b) f(); },
    actions: [{ label: 'Cancel' }, { label: b ? 'Save changes' : 'Save bill', cls: 'btn-primary', onClick: async (el) => {
      const v = (s) => el.querySelector(s).value;
      const p = { vendor_id: v('#bv'), bill_number: v('#bn') || null, bill_date: v('#bd'), due_date: v('#bdd'), account_id: v('#ba'), amount: num(v('#bam')), tax: num(v('#btx')), memo: v('#bm') || null };
      const id = b ? (await rpc('update_bill', { p_bill: b.id, p }), b.id) : await rpc('record_bill', { p });
      const files = [...el.querySelector('#rcf').files];
      if (files.length) await attachReceipts(files, { billId: id });
      toast(b ? 'Bill updated' : 'Bill saved'); changed();
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

// ── Transfer between accounts (new, or edit an existing one: t = { id, date, from, to, amount, memo }) ──
export const newTransfer = () => transferForm();
export async function transferForm(t = null) {
  const accs = await accounts();
  const xferAcct = (a) => a.subtype === 'bank' || a.subtype === 'credit_card' || a.subtype === 'shareholder_loan' || a.type === 'equity';
  modal({
    title: t ? 'Edit transfer' : 'Transfer between accounts',
    body: `<div class="alert info" style="font-size:12.5px;margin-bottom:12px">Money you put into the business: <b>From</b> Shareholder Loan <b>To</b> Operating Bank Account. When the business pays you back, do the reverse.</div>
      <div class="row-2"><div class="field"><label>From</label><select class="input" id="tf">${acctOptions(accs, t?.from || null, xferAcct)}</select></div>
      <div class="field"><label>To</label><select class="input" id="tt">${acctOptions(accs, t?.to || null, xferAcct)}</select></div></div>
      <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" id="td" value="${t?.date || today()}"></div>
      <div class="field"><label>Amount</label><input class="input" type="number" step="0.01" id="ta" value="${t?.amount ?? ''}"></div></div>
      <div class="field"><label>Memo</label><input class="input" id="tm" placeholder="e.g. Funds advanced by shareholder, credit card payment" value="${esc(t?.memo || '')}"></div>`,
    actions: [...(t ? [{ label: 'Delete transfer', cls: 'btn-danger', onClick: async () => {
      if (!confirm('Delete this transfer? Use this only for a transfer entered by mistake.')) return false;
      await rpc('delete_transfer', { p_entry: t.id }); toast('Transfer deleted'); changed();
    } }] : []), { label: 'Cancel' }, { label: t ? 'Save changes' : 'Save transfer', cls: 'btn-primary', onClick: async (el) => {
      const args = { p_date: el.querySelector('#td').value, p_from: el.querySelector('#tf').value, p_to: el.querySelector('#tt').value,
        p_amount: num(el.querySelector('#ta').value), p_memo: el.querySelector('#tm').value || null };
      if (t) await rpc('update_transfer', { p_entry: t.id, ...args }); else await rpc('record_transfer', args);
      toast(t ? 'Transfer updated' : 'Transfer recorded'); changed();
    } }],
  });
}

// ── Edit a bill payment (date, amount, account, reference) ──
export async function billPaymentForm(bp) {
  const accs = await accounts();
  modal({
    title: `Edit bill payment${bp.bills?.bill_number ? ' · bill ' + bp.bills.bill_number : ''}`,
    body: `<p style="margin-bottom:12px">${esc(bp.bills?.vendors?.name || '')} · bill total <b>${money(bp.bills?.amount)}</b></p>
      <div class="row-2"><div class="field"><label>Payment date</label><input class="input" type="date" id="d" value="${bp.pay_date}"></div>
      <div class="field"><label>Amount</label><input class="input" type="number" step="0.01" id="a" value="${bp.amount}"></div></div>
      <div class="row-2"><div class="field"><label>Paid from</label><select class="input" id="acc">${acctOptions(accs, bp.account_id, isPayFrom)}</select></div>
      <div class="field"><label>Reference</label><input class="input" id="r" value="${esc(bp.reference || '')}"></div></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save changes', cls: 'btn-primary', onClick: async (el) => {
      await rpc('update_bill_payment', { p_payment: bp.id, p_date: el.querySelector('#d').value, p_amount: num(el.querySelector('#a').value),
        p_account: el.querySelector('#acc').value, p_reference: el.querySelector('#r').value || null });
      toast('Bill payment updated'); changed();
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
      <div class="field"><label>Memo</label><input class="input" id="mm"></div>
      ${type === 'deposit' ? '<div class="field"><label>Received from (shown on the receipt)</label><input class="input" id="from" placeholder="Who paid — the client, or the fee payer"></div>'
        : '<div class="field"><label>Refund paid to</label><input class="input" id="to"><small class="dk-muted" id="toHelp">Refunds go to the payer who provided the money, unless agreed otherwise in writing.</small></div>'}`,
    onOpen: (el) => {
      const to = el.querySelector('#to');
      if (to) {
        const fillTo = async () => { const cid = el.querySelector('#c').value; const p = cid ? await payerFor(cid) : null; const cn = contacts.find((c) => c.id === cid)?.full_name || '';
          to.value = p && p.refund_to !== 'client' ? p.name : cn; to.dataset.def = to.value;
          el.querySelector('#toHelp').textContent = p ? `Default from the agreement: refunds go to ${p.refund_to === 'client' ? 'the client' : `the payer (${p.name})`}.` : 'The client paid, so the refund goes to the client.'; };
        el.querySelector('#c').addEventListener('change', fillTo); fillTo();
      }
      const from = el.querySelector('#from'); if (!from) return;
      const fill = async () => { const cid = el.querySelector('#c').value; from.value = cid ? (await payerFor(cid))?.name || contacts.find((c) => c.id === cid)?.full_name || '' : ''; };
      el.querySelector('#c').addEventListener('change', fill); fill();
    },
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (el) => {
      const v = (s) => el.querySelector(s)?.value || '';
      if (!v('#c')) throw new Error('Choose a client.');
      let memo = v('#mm') || null;
      if (type === 'refund') {
        const to = el.querySelector('#to'), who = to.value.trim();
        if (!who) throw new Error('Who is the refund paid to?');
        if (who !== to.dataset.def && !(await confirmBox('Refund to someone else?', `The agreement says refunds go to ${to.dataset.def}. Pay this refund to ${who} instead? Keep the written instruction on file.`, 'Yes, pay ' + who))) return false;
        memo = `Refund to ${who}${memo ? ' — ' + memo : ''}`;
      }
      const id = await rpc('trust_transaction', { p_contact: v('#c'), p_date: v('#d'), p_type: type, p_amount: num(v('#a')), p_method: v('#m'), p_reference: v('#r') || null, p_memo: memo });
      if (type === 'deposit' && id && v('#from').trim()) await rpc('update_receipt', { p_kind: 'trust', p_id: id, p_received_from: v('#from').trim() }).catch(() => {});
      toast(type === 'deposit' ? 'Retainer deposited to trust' : 'Trust refund recorded'); changed();
      if (type === 'deposit' && id) receiptPrompt('trust', id);
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
      const { data, error } = await db.from('invoices').insert({ contact_id: cid, created_by: state.profile.id, bill_to: await payerFor(cid) }).select('id').single();
      if (error) throw error;
      location.hash = `#/invoices/${data.id}`;
    } }],
  });
}

export function canBooks() { return can('finance.manage'); }

// ── Fee payer (someone other than the client pays) ──
// The client stays on the books (receivables, trust); the payer is who invoices and receipts are addressed to.
/** The fee payer from the client's most recent consultation or retainer agreement, or null if the client pays. */
export async function payerFor(contactId) {
  if (!contactId) return null;
  const { data } = await db.from('agreements').select('data').eq('contact_id', contactId).in('type', ['consultation', 'retainer']).neq('status', 'void')
    .order('created_at', { ascending: false }).limit(1);
  const d = data?.[0]?.data;
  if (d?.payer_other && String(d.payer_name || '').trim())
    return { name: d.payer_name.trim(), relationship: d.payer_relationship || '', email: d.payer_email || '', phone: d.payer_phone || '', address: d.payer_address || '', refund_to: d.payer_refund_to || 'payer' };
  // Otherwise the payer recorded on the client file (File tab).
  const { data: f } = await db.from('client_files').select('payer_contact_id').eq('contact_id', contactId).maybeSingle();
  if (!f?.payer_contact_id) return null;
  const { data: p } = await db.from('contacts').select('full_name, email, phone, address, city, province, postal_code, country').eq('id', f.payer_contact_id).single();
  return p ? { name: p.full_name, relationship: 'Fee payer', email: p.email || '', phone: p.phone || '', address: [p.address, p.city, p.province, p.postal_code, p.country].filter(Boolean).join(', '), refund_to: 'payer' } : null;
}

/** Edit who an invoice is billed to. Resolves with the new bill_to (null = the client), or undefined if cancelled. */
export function payerModal({ current = null, contactId, clientName = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const b = current || {};
    const fld = (k, l, t = 'text') => `<div class="field"><label>${l}</label><input class="input" type="${t}" data-b="${k}" value="${esc(b[k] || '')}"></div>`;
    const mm = modal({
      title: 'Who pays this invoice?',
      body: `<label class="row" style="gap:8px;margin-bottom:10px"><input type="radio" name="who" value="client" ${current ? '' : 'checked'}> The client${clientName ? ` (${esc(clientName)})` : ''}</label>
        <label class="row" style="gap:8px;margin-bottom:12px"><input type="radio" name="who" value="payer" ${current ? 'checked' : ''}> Someone else pays on the client's behalf</label>
        <div id="pbx" ${current ? '' : 'hidden'}>
          <div class="row" style="justify-content:flex-end;margin-bottom:6px"><button class="btn btn-sm" type="button" id="fromAgr">Use the payer from the client's agreement</button></div>
          <div class="row-2">${fld('name', 'Payer full name')}${fld('relationship', 'Relationship to the client')}</div>
          <div class="row-2">${fld('email', 'Email', 'email')}${fld('phone', 'Phone')}</div>${fld('address', 'Address')}
          <small class="dk-muted">The invoice and receipts are addressed to the payer. The client's name stays on them as the person the services are for.</small></div>`,
      onOpen: (el) => {
        el.querySelectorAll('[name="who"]').forEach((r) => (r.onchange = () => { el.querySelector('#pbx').hidden = el.querySelector('[name="who"]:checked').value !== 'payer'; }));
        el.querySelector('#fromAgr').onclick = async () => {
          const p = await payerFor(contactId);
          if (!p) return toast("The client's latest agreement doesn't name a fee payer.");
          Object.entries(p).forEach(([k, v]) => { const i = el.querySelector(`[data-b="${k}"]`); if (i) i.value = v; });
        };
      },
      actions: [{ label: 'Cancel', onClick: () => { done = true; resolve(undefined); } }, { label: 'Save', cls: 'btn-primary', onClick: async (el) => {
        if (el.querySelector('[name="who"]:checked').value === 'client') { done = true; resolve(null); return; }
        const v = Object.fromEntries([...el.querySelectorAll('[data-b]')].map((i) => [i.dataset.b, i.value.trim()]));
        if (!v.name) throw new Error("Enter the payer's name.");
        done = true; resolve(v);
      } }],
    });
    // Closing the window without choosing counts as cancel.
    const iv = setInterval(() => { if (done) return clearInterval(iv); if (!mm.el.isConnected) { clearInterval(iv); resolve(undefined); } }, 500);
  });
}

/** After money comes in: offer to open the receipt for it. */
export function receiptPrompt(kind, id) {
  modal({
    title: 'Payment recorded',
    body: '<p>Issue a receipt now? You can print it, save it as a PDF or email it to whoever paid. It is always available later under <b>Client Receipts</b>.</p>',
    actions: [{ label: 'Not now' }, { label: 'Open receipt', cls: 'btn-gold', onClick: () => { location.hash = `#/client-receipts/${kind}/${id}`; } }],
  });
}

/** Payment that has no invoice yet (for example a consultation fee): one invoice line, posted and paid in one step. */
export async function quickSale(contactId) {
  const [contacts, accs, items, s] = await Promise.all([contactsList(), accounts(), itemsList(), orgSettings()]);
  const rate = s.gst_number ? Number(s.gst_rate || 5) : 0;
  const income = accs.find((a) => a.system_key === 'service_income')?.id;
  const m = modal({
    title: 'Payment without an invoice', wide: true,
    body: `<div class="alert info" style="margin-bottom:10px">For money received before any invoice, such as a consultation fee. This creates the invoice, marks it paid and gives you the receipt. Money paid in advance for work not done yet goes into trust instead (<b>Retainer into trust</b>).</div>
      <div class="row-2"><div class="field"><label>Client</label><select class="input" id="qc">${contactOptions(contacts, contactId)}</select></div>
        <div class="field"><label>Received from (shown on the receipt)</label><input class="input" id="qfrom" placeholder="The client, or the fee payer"></div></div>
      <div class="row-2"><div class="field"><label>Product / service</label><select class="input" id="qi"><option value="">— Choose —</option>${items.map((it) => `<option value="${it.id}">${esc(it.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Description</label><input class="input" id="qd" placeholder="e.g. Initial consultation, 60 minutes"></div></div>
      <div class="row-2"><div class="field"><label>Amount before GST (CAD)</label><input class="input" type="number" step="0.01" id="qa"></div>
        <div class="field"><label>GST</label><label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" id="qt" ${rate ? 'checked' : 'disabled'}> ${rate ? `Add GST ${rate}%` : 'Not registered for GST'}</label></div></div>
      <div class="row-2"><div class="field"><label>Date received</label><input class="input" type="date" id="qdt" value="${today()}"></div>
        <div class="field"><label>Payment method</label><select class="input" id="qm">${METHODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
      <div class="row-2"><div class="field"><label>Deposit to</label><select class="input" id="qacc">${acctOptions(accs, accs.find((a) => a.system_key === 'operating_bank')?.id, (a) => a.subtype === 'bank')}</select></div>
        <div class="field"><label>Reference no.</label><input class="input" id="qr" placeholder="e-Transfer ref, cheque no."></div></div>
      <div class="row" style="justify-content:flex-end;font-size:16px">Total received:&nbsp;<b id="qtot">${money(0)}</b></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save & open receipt', cls: 'btn-gold', onClick: async (el) => {
      const v = (q) => el.querySelector(q).value;
      const cid = v('#qc'), amt = num(v('#qa')), desc = v('#qd').trim();
      if (!cid) throw new Error('Choose a client.');
      if (!desc) throw new Error('Add a description.');
      if (amt <= 0) throw new Error('Enter the amount.');
      const it = items.find((x) => x.id === v('#qi'));
      const client = contacts.find((c) => c.id === cid);
      const from = v('#qfrom').trim();
      const payer = await payerFor(cid);
      const billTo = payer && from === payer.name ? payer : from && from !== client?.full_name ? { name: from } : null;
      const { data: inv, error } = await db.from('invoices').insert({ contact_id: cid, created_by: state.profile.id, issue_date: v('#qdt'), due_date: v('#qdt'), bill_to: billTo }).select('id').single();
      if (error) throw error;
      const { error: le } = await db.from('invoice_lines').insert({ invoice_id: inv.id, position: 0, item_id: it?.id || null, description: desc, quantity: 1, unit_price: amt,
        taxable: el.querySelector('#qt').checked, tax_rate: rate, account_id: it?.income_account_id || income });
      if (le) throw le;
      await rpc('post_invoice', { p_invoice: inv.id });
      const { data: posted } = await db.from('invoices').select('total').eq('id', inv.id).single();
      const pid = await rpc('receive_payment', { p_contact: cid, p_date: v('#qdt'), p_method: v('#qm'), p_deposit_account: v('#qacc') || null, p_reference: v('#qr') || null,
        p_memo: desc, p_applications: [{ invoice_id: inv.id, amount: Number(posted.total) }] });
      if (from) await rpc('update_receipt', { p_kind: 'payment', p_id: pid, p_received_from: from }).catch(() => {});
      clearFinCache(); toast('Payment recorded'); changed();
      location.hash = `#/client-receipts/payment/${pid}`;
    } }],
  });
  const el = m.el;
  const tot = () => { const a = num(el.querySelector('#qa').value); el.querySelector('#qtot').textContent = money(a + (el.querySelector('#qt').checked ? num(a * rate / 100) : 0)); };
  el.querySelector('#qi').onchange = (e) => {
    const it = items.find((x) => x.id === e.target.value); if (!it) return;
    el.querySelector('#qd').value = it.description || it.name; el.querySelector('#qa').value = it.unit_price; if (rate) el.querySelector('#qt').checked = !!it.taxable; tot();
  };
  el.addEventListener('input', tot); el.addEventListener('change', tot);
  const fill = async () => { const cid = el.querySelector('#qc').value; el.querySelector('#qfrom').value = cid ? (await payerFor(cid))?.name || contacts.find((c) => c.id === cid)?.full_name || '' : ''; };
  el.querySelector('#qc').addEventListener('change', fill); fill();
}
