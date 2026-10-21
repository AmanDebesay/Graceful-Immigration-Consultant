import { db, can, esc, icon, fmtDate, rpc } from '../core.js';
import { money, trustTxn, receivePayment, downloadCsv } from '../fin.js';

export async function render(el) {
  const manage = can('finance.manage');
  const [ledger, { data: txns }] = await Promise.all([
    rpc('trust_ledger'),
    db.from('journal_lines').select('debit, credit, description, contacts(full_name), journal_entries(entry_date, source_type, memo)')
      .eq('account_id', (await db.from('accounts').select('id').eq('system_key', 'trust_liability').single()).data.id).limit(2000),
  ]);
  const total = (ledger || []).reduce((s, r) => s + +r.balance, 0);
  const rows = (txns || []).sort((a, b) => b.journal_entries.entry_date.localeCompare(a.journal_entries.entry_date));

  el.innerHTML = `<div class="alert info">Client money received before the work is done must be kept in a separate trust (client) account until it is earned, as CICC requires. Deposit retainers here, then use <b>Receive payment → Transfer from client's trust funds</b> when you invoice earned fees.</div>
    <div class="toolbar"><div class="card kpi" style="padding:12px 18px"><div><small>Total held in trust</small><b>${money(total)}</b></div></div><div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export ledger</button>
      ${manage ? `<button class="btn" id="ref">Refund from trust</button><button class="btn" id="use">Pay invoice from trust</button><button class="btn btn-gold" id="dep">${icon('plus')} Deposit retainer</button>` : ''}</div>
    <div class="grid g-2">
      <div class="card"><div class="card-h"><h3>Client trust balances</h3></div><div class="table-wrap">${(ledger || []).length ? `<table class="t"><thead><tr><th>Client</th><th style="text-align:right">Received</th><th style="text-align:right">Used / refunded</th><th style="text-align:right">Balance</th></tr></thead><tbody>
        ${ledger.map((r) => `<tr class="click" onclick="location.hash='#/contacts/${r.contact_id}'"><td><b>${esc(r.contact_name)}</b><br><small style="color:var(--muted)">Last activity ${fmtDate(r.last_activity)}</small></td>
          <td style="text-align:right">${money(r.deposits)}</td><td style="text-align:right">${money(r.withdrawals)}</td><td style="text-align:right"><b>${money(r.balance)}</b></td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('lock')}<div>No client funds in trust.</div></div>`}</div></div>
      <div class="card"><div class="card-h"><h3>Trust transactions</h3></div><div class="table-wrap">${rows.length ? `<table class="t"><tbody>
        ${rows.map((r) => `<tr><td>${fmtDate(r.journal_entries.entry_date)}</td><td>${esc(r.contacts?.full_name || '')}<br><small style="color:var(--muted)">${esc(r.description || r.journal_entries.memo || '')}</small></td>
          <td style="text-align:right;color:${+r.credit ? 'var(--green)' : 'var(--red)'}">${+r.credit ? '+' + money(r.credit) : '-' + money(r.debit)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No trust transactions yet.</div>'}</div></div>
    </div>`;
  el.querySelector('#dep')?.addEventListener('click', () => trustTxn('deposit'));
  el.querySelector('#ref')?.addEventListener('click', () => trustTxn('refund'));
  el.querySelector('#use')?.addEventListener('click', () => receivePayment());
  el.querySelector('#csv').onclick = () => downloadCsv('trust-ledger.csv', [['Date', 'Client', 'Description', 'In', 'Out'],
    ...rows.map((r) => [r.journal_entries.entry_date, r.contacts?.full_name, r.description || r.journal_entries.memo, r.credit, r.debit])]);
  window.addEventListener('books-changed', () => render(el), { once: true });
}
