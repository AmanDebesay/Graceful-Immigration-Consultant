import { db, can, esc, icon, fmtDate, staffName } from '../core.js';
import { money, newJournal, downloadCsv } from '../fin.js';

const SRC = { invoice: 'Invoice', invoice_void: 'Invoice void', payment: 'Payment', payment_void: 'Payment void', expense: 'Expense', expense_void: 'Expense void',
  bill: 'Bill', bill_void: 'Bill void', bill_payment: 'Bill payment', trust: 'Trust', transfer: 'Transfer', manual: 'Journal entry' };

export async function render(el) {
  const { data } = await db.from('journal_entries').select('*, journal_lines(debit, credit, description, accounts(code, name), contacts(full_name))')
    .order('entry_date', { ascending: false }).order('entry_no', { ascending: false }).limit(300);
  const entries = data || [];
  el.innerHTML = `<div class="toolbar"><span style="color:var(--muted)">Every transaction creates a balanced journal entry. Entries cannot be edited; corrections are made by voiding the original document.</span>
      <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>
      ${can('finance.manage') ? `<button class="btn btn-primary" id="new">${icon('plus')} Journal entry</button>` : ''}</div>
    <div class="card"><div class="table-wrap">${entries.length ? `<table class="t"><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Account</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead><tbody>
      ${entries.map((e) => e.journal_lines.map((l, i) => `<tr style="${i === 0 ? 'border-top:2px solid var(--line)' : ''}">
        <td>${i === 0 ? e.entry_no : ''}</td><td>${i === 0 ? fmtDate(e.entry_date) : ''}</td>
        <td>${i === 0 ? `<span class="badge plain">${SRC[e.source_type] || e.source_type}</span><br><small style="color:var(--muted)">${esc(staffName(e.created_by))}</small>` : ''}</td>
        <td>${esc(l.accounts?.code)} · ${esc(l.accounts?.name)}</td><td>${esc(l.description || (i === 0 ? e.memo : '') || '')}${l.contacts ? ` <small style="color:var(--muted)">(${esc(l.contacts.full_name)})</small>` : ''}</td>
        <td style="text-align:right">${+l.debit ? money(l.debit) : ''}</td><td style="text-align:right">${+l.credit ? money(l.credit) : ''}</td></tr>`).join('')).join('')}
      </tbody></table>` : `<div class="empty">${icon('note')}<div>No journal entries yet.</div></div>`}</div></div>`;
  el.querySelector('#new')?.addEventListener('click', () => newJournal());
  el.querySelector('#csv').onclick = () => downloadCsv('journal.csv', [['Entry', 'Date', 'Type', 'Account code', 'Account', 'Description', 'Debit', 'Credit'],
    ...entries.flatMap((e) => e.journal_lines.map((l) => [e.entry_no, e.entry_date, SRC[e.source_type], l.accounts?.code, l.accounts?.name, l.description || e.memo, l.debit, l.credit]))]);
  window.addEventListener('books-changed', () => render(el), { once: true });
}
