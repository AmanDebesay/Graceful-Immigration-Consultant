import { db, can, esc, icon, fmtDate, rpc, toast, fail, today } from '../core.js';
import { money, num, accounts, isBank, newTransfer, downloadCsv } from '../fin.js';

const SRC = { invoice: 'Invoice', invoice_void: 'Invoice void', payment: 'Payment', payment_void: 'Payment void', expense: 'Expense', expense_void: 'Expense void',
  bill: 'Bill', bill_void: 'Bill void', bill_payment: 'Bill payment', trust: 'Trust', transfer: 'Transfer', manual: 'Journal' };

export async function render(el) {
  const accs = (await accounts()).filter((a) => isBank(a) && a.active);
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  let accountId = qs.get('a') || accs[0]?.id;
  let mode = 'register';
  const manage = can('finance.manage');

  const balances = {};
  for (const a of accs) {
    const { data } = await db.from('journal_lines').select('debit, credit').eq('account_id', a.id);
    balances[a.id] = (data || []).reduce((s, l) => s + +l.debit - +l.credit, 0);
  }

  el.innerHTML = `<div class="bank-cards">${accs.map((a) => `<button class="card bank-card" data-a="${a.id}">
      <small>${esc(a.code)} · ${a.subtype === 'trust_bank' ? 'Trust' : a.subtype === 'credit_card' ? 'Credit card' : 'Bank'}</small><b>${esc(a.name)}</b>
      <span>${money(a.subtype === 'credit_card' ? -balances[a.id] : balances[a.id])}</span><em>In books</em></button>`).join('')}</div>
    <div class="toolbar"><div class="seg" id="mode"><button data-k="register">Register</button>${manage ? '<button data-k="reconcile">Reconcile</button>' : ''}</div>
      <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>${manage ? `<button class="btn" id="xfer">Transfer</button>` : ''}</div>
    <div id="body"></div>`;
  el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { accountId = b.dataset.a; draw(); }));
  el.querySelector('#mode').onclick = (e) => { if (e.target.dataset.k) { mode = e.target.dataset.k; draw(); } };
  el.querySelector('#xfer')?.addEventListener('click', () => newTransfer());
  window.addEventListener('books-changed', () => render(el), { once: true });
  let lines = [];

  async function draw() {
    el.querySelectorAll('[data-a]').forEach((b) => b.classList.toggle('sel', b.dataset.a === accountId));
    el.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.k === mode));
    const acct = accs.find((a) => a.id === accountId);
    const body = el.querySelector('#body');
    if (!acct) { body.innerHTML = '<div class="empty">No bank accounts. Add one in Chart of Accounts.</div>'; return; }
    const { data } = await db.from('journal_lines').select('id, debit, credit, description, cleared, reconciled_id, journal_entries(entry_date, memo, source_type, entry_no), contacts(full_name), vendors(name)')
      .eq('account_id', accountId).limit(5000);
    lines = (data || []).sort((a, b) => a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date) || a.id - b.id);
    const liability = acct.subtype === 'credit_card';
    if (mode === 'register') {
      let run = 0;
      const rows = lines.map((l) => { run += +l.debit - +l.credit; return { ...l, run }; }).reverse();
      body.innerHTML = `<div class="card"><div class="card-h"><h3>${esc(acct.name)} register</h3><small style="color:var(--muted)">${lines.length} transactions</small></div>
        <div class="table-wrap">${rows.length ? `<table class="t"><thead><tr><th>Date</th><th>Type</th><th>Payee / client</th><th>Memo</th><th style="text-align:right">${liability ? 'Charge' : 'Payment'}</th><th style="text-align:right">${liability ? 'Payment' : 'Deposit'}</th><th style="text-align:center">✓</th><th style="text-align:right">Balance</th></tr></thead><tbody>
        ${rows.map((l) => `<tr><td>${fmtDate(l.journal_entries.entry_date)}</td><td><span class="badge plain">${SRC[l.journal_entries.source_type] || ''}</span></td>
          <td>${esc(l.contacts?.full_name || l.vendors?.name || '')}</td><td>${esc(l.description || l.journal_entries.memo || '')}</td>
          <td style="text-align:right">${+l.credit ? money(l.credit) : ''}</td><td style="text-align:right">${+l.debit ? money(l.debit) : ''}</td>
          <td style="text-align:center">${l.reconciled_id ? '<b title="Reconciled">R</b>' : l.cleared ? 'C' : ''}</td><td style="text-align:right"><b>${money(liability ? -l.run : l.run)}</b></td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('briefcase')}<div>No transactions in this account yet.</div></div>`}</div></div>`;
      return;
    }
    // Reconcile
    const { data: last } = await db.from('reconciliations').select('*').eq('account_id', accountId).order('statement_date', { ascending: false }).limit(1);
    const begin = lines.filter((l) => l.reconciled_id).reduce((s, l) => s + +l.debit - +l.credit, 0);
    const open = lines.filter((l) => !l.reconciled_id);
    body.innerHTML = `<div class="card"><div class="card-h"><h3>Reconcile ${esc(acct.name)}</h3><small style="color:var(--muted)">${last?.[0] ? 'Last reconciled to ' + fmtDate(last[0].statement_date) : 'Never reconciled'}</small></div>
      <div class="card-b">
        <div class="row-2" style="max-width:560px"><div class="field"><label>Statement ending date</label><input class="input" type="date" id="sd" value="${today()}"></div>
          <div class="field"><label>Statement ending balance${liability ? ' (amount owed)' : ''}</label><input class="input" type="number" step="0.01" id="sb"></div></div>
        <div class="recon-sum"><div><small>Beginning balance</small><b>${money(liability ? -begin : begin)}</b></div><div><small>Cleared</small><b id="rc">—</b></div>
          <div><small>Statement</small><b id="rs">—</b></div><div><small>Difference</small><b id="rd">—</b></div></div>
        <p style="color:var(--muted);margin:10px 0">Tick each transaction that appears on your bank statement. When the difference is $0.00, finish.</p>
        <div class="table-wrap">${open.length ? `<table class="t"><thead><tr><th style="width:40px"><input type="checkbox" id="all" aria-label="Select all"></th><th>Date</th><th>Description</th><th style="text-align:right">Out</th><th style="text-align:right">In</th></tr></thead><tbody>
          ${open.map((l) => `<tr><td><input type="checkbox" class="rl" data-id="${l.id}" data-v="${+l.debit - +l.credit}"></td><td>${fmtDate(l.journal_entries.entry_date)}</td>
            <td>${esc(l.contacts?.full_name || l.vendors?.name || '')} ${esc(l.description || l.journal_entries.memo || '')}</td>
            <td style="text-align:right">${+l.credit ? money(l.credit) : ''}</td><td style="text-align:right">${+l.debit ? money(l.debit) : ''}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">Everything is reconciled.</div>'}</div>
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn-gold" id="finish" disabled>Finish reconciliation</button></div>
      </div></div>`;
    const calc = () => {
      const cleared = begin + [...body.querySelectorAll('.rl:checked')].reduce((s, c) => s + +c.dataset.v, 0);
      const stmtRaw = body.querySelector('#sb').value;
      const stmt = stmtRaw === '' ? null : (liability ? -num(stmtRaw) : num(stmtRaw));
      body.querySelector('#rc').textContent = money(liability ? -cleared : cleared);
      body.querySelector('#rs').textContent = stmt === null ? '—' : money(liability ? -stmt : stmt);
      const diff = stmt === null ? null : num(stmt - cleared);
      body.querySelector('#rd').textContent = diff === null ? '—' : money(diff);
      body.querySelector('#rd').style.color = diff === 0 ? 'var(--green)' : 'var(--red)';
      body.querySelector('#finish').disabled = diff !== 0;
      return stmt;
    };
    body.addEventListener('input', calc); body.addEventListener('change', calc);
    body.querySelector('#all')?.addEventListener('change', (e) => { body.querySelectorAll('.rl').forEach((c) => (c.checked = e.target.checked)); calc(); });
    body.querySelector('#finish').onclick = async () => {
      try {
        await rpc('complete_reconciliation', { p_account: accountId, p_statement_date: body.querySelector('#sd').value, p_ending: calc(),
          p_line_ids: [...body.querySelectorAll('.rl:checked')].map((c) => +c.dataset.id) });
        toast('Reconciliation complete'); mode = 'register'; draw();
      } catch (e) { fail(e); }
    };
    calc();
  }
  el.querySelector('#csv').onclick = () => downloadCsv('register.csv', [['Date', 'Type', 'Payee', 'Memo', 'Debit', 'Credit', 'Cleared'],
    ...lines.map((l) => [l.journal_entries.entry_date, SRC[l.journal_entries.source_type], l.contacts?.full_name || l.vendors?.name, l.description || l.journal_entries.memo, l.debit, l.credit, l.reconciled_id ? 'R' : ''])]);
  draw();
}
