// Reports centre: P&L, Balance Sheet, Trial Balance, A/R Aging, GST, General Ledger, Sales by client/service, Expenses by category.
import { db, esc, icon, fmtDate, rpc, today, can } from '../core.js';
import { money, accounts, downloadCsv, orgSettings } from '../fin.js';

const REPORTS = [
  ['pl', 'Profit and Loss', 'Income, expenses and net profit for a period', 'Business overview'],
  ['bs', 'Balance Sheet', 'What you own, owe and your equity on a date', 'Business overview'],
  ['tb', 'Trial Balance', 'Debit and credit totals for every account', 'For my accountant'],
  ['gl', 'General Ledger', 'Every transaction by account', 'For my accountant'],
  ['aging', 'Accounts Receivable Aging', 'Unpaid invoices by how overdue they are', 'Who owes you'],
  ['sales_client', 'Sales by Client', 'Income from each client', 'Sales'],
  ['sales_item', 'Sales by Product/Service', 'Income by consultation and service type', 'Sales'],
  ['expense_cat', 'Expenses by Category', 'Spending by expense account', 'Expenses'],
  ['expense_vendor', 'Expenses by Vendor', 'Spending by vendor', 'Expenses'],
  ['gst', 'GST/HST Return Summary', 'Tax collected, input tax credits and net owing', 'Sales tax'],
];

export async function render(el) {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const r = qs.get('r');
  if (!r) return drawIndex(el);
  return drawReport(el, r, qs);
}

function drawIndex(el) {
  const groups = [...new Set(REPORTS.map((x) => x[3]))];
  el.innerHTML = groups.map((g) => `<h3 style="margin:6px 0 10px;color:var(--navy)">${g}</h3><div class="grid g-3" style="margin-bottom:22px">
    ${REPORTS.filter((x) => x[3] === g).map(([k, t, d]) => `<a class="card kpi" href="#/reports?r=${k}"><div class="kpi-ico gold">${icon('trend')}</div><div><b style="font-size:15px">${t}</b><em>${d}</em></div></a>`).join('')}</div>`).join('');
}

function periodPresets() {
  const t = new Date(today() + 'T00:00:00'), y = t.getFullYear(), m = t.getMonth();
  const d = (x) => x.toLocaleDateString('en-CA');
  const q = Math.floor(m / 3);
  return {
    'This month': [d(new Date(y, m, 1)), d(t)], 'Last month': [d(new Date(y, m - 1, 1)), d(new Date(y, m, 0))],
    'This quarter': [d(new Date(y, q * 3, 1)), d(t)], 'Last quarter': [d(new Date(y, q * 3 - 3, 1)), d(new Date(y, q * 3, 0))],
    'This year': [`${y}-01-01`, d(t)], 'Last year': [`${y - 1}-01-01`, `${y - 1}-12-31`], 'All time': ['2000-01-01', d(t)],
  };
}

async function drawReport(el, r, qs) {
  const meta = REPORTS.find((x) => x[0] === r);
  const presets = periodPresets();
  const pointInTime = ['bs', 'tb', 'aging'].includes(r);
  let [from, to] = [qs.get('from') || presets['This year'][0], qs.get('to') || today()];
  const s = await orgSettings();
  const accs = await accounts();
  el.innerHTML = `<div class="toolbar no-print"><a class="btn btn-sm" href="#/reports">← All reports</a>
      ${pointInTime ? '' : `<select class="input" id="preset" style="max-width:170px"><option value="">Custom dates</option>${Object.keys(presets).map((k) => `<option ${k === 'This year' && !qs.get('from') ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <input class="input" type="date" id="from" value="${from}" style="max-width:160px"><span>to</span>`}
      <input class="input" type="date" id="to" value="${to}" style="max-width:160px">
      ${r === 'gl' ? `<select class="input" id="acct" style="max-width:260px"><option value="">All accounts</option>${accs.map((a) => `<option value="${a.id}" ${a.id === qs.get('a') ? 'selected' : ''}>${esc(a.code)} · ${esc(a.name)}</option>`).join('')}</select>` : ''}
      <button class="btn btn-primary" id="run">Run report</button><div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export CSV</button><button class="btn" onclick="window.print()">Print / PDF</button></div>
    <div class="card report"><div class="report-h"><div class="inv-muted">${esc(s.business_name)}</div><h2>${meta[1]}</h2>
      <div class="inv-muted" id="period"></div></div><div id="out" class="report-b"><div class="loading" style="min-height:120px"><div class="spin"></div></div></div></div>`;
  const preset = el.querySelector('#preset');
  if (preset) preset.onchange = () => { const p = presets[preset.value]; if (p) { el.querySelector('#from').value = p[0]; el.querySelector('#to').value = p[1]; run(); } };
  el.querySelector('#run').onclick = run;
  let csv = [];
  el.querySelector('#csv').onclick = () => downloadCsv(`${r}-${to}.csv`, csv);

  async function run() {
    from = el.querySelector('#from')?.value || '2000-01-01'; to = el.querySelector('#to').value;
    el.querySelector('#period').textContent = pointInTime ? `As of ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`;
    const out = el.querySelector('#out');
    const line = (label, v, cls = '', indent = 1) => `<div class="rl ${cls}" style="padding-left:${indent * 16}px"><span>${label}</span><span>${money(v)}</span></div>`;

    if (r === 'pl' || r === 'bs' || r === 'tb') {
      const rows = await rpc('report_account_balances', { p_from: r === 'pl' ? from : null, p_to: to });
      const by = (t) => rows.filter((x) => x.type === t && Math.abs(+x.balance) > 0.004);
      const sum = (arr) => arr.reduce((s2, x) => s2 + +x.balance, 0);
      if (r === 'pl') {
        const inc = by('income'), exp = by('expense'), net = sum(inc) - sum(exp);
        out.innerHTML = `<div class="rl head"><span>Income</span></div>${inc.map((x) => line(esc(x.name), x.balance)).join('')}${line('Total income', sum(inc), 'tot', 0)}
          <div class="rl head"><span>Expenses</span></div>${exp.map((x) => line(esc(x.name), x.balance)).join('')}${line('Total expenses', sum(exp), 'tot', 0)}
          ${line('Net profit', net, 'grand', 0)}`;
        csv = [['Account', 'Amount'], ['Income', ''], ...inc.map((x) => [x.name, x.balance]), ['Total income', sum(inc)], ['Expenses', ''], ...exp.map((x) => [x.name, x.balance]), ['Total expenses', sum(exp)], ['Net profit', net]];
      } else if (r === 'bs') {
        const year = to.slice(0, 4);
        const ytd = await rpc('report_account_balances', { p_from: `${year}-01-01`, p_to: to });
        const ytdNet = ytd.filter((x) => x.type === 'income').reduce((a, x) => a + +x.balance, 0) - ytd.filter((x) => x.type === 'expense').reduce((a, x) => a + +x.balance, 0);
        const allNet = sum(by('income')) - sum(by('expense'));
        const asset = by('asset'), liab = by('liability'), eq = by('equity');
        const retained = allNet - ytdNet;
        const totalEq = sum(eq) + retained + ytdNet;
        out.innerHTML = `<div class="rl head"><span>Assets</span></div>${asset.map((x) => line(esc(x.name), x.balance)).join('')}${line('Total assets', sum(asset), 'grand', 0)}
          <div class="rl head"><span>Liabilities</span></div>${liab.map((x) => line(esc(x.name), x.balance)).join('')}${line('Total liabilities', sum(liab), 'tot', 0)}
          <div class="rl head"><span>Equity</span></div>${eq.map((x) => line(esc(x.name), x.balance)).join('')}${line('Retained earnings (prior years)', retained)}${line('Net income (this year)', ytdNet)}
          ${line('Total equity', totalEq, 'tot', 0)}${line('Total liabilities and equity', sum(liab) + totalEq, 'grand', 0)}
          ${Math.abs(sum(asset) - sum(liab) - totalEq) > 0.01 ? '<div class="alert err">Out of balance — contact support.</div>' : ''}`;
        csv = [['Section', 'Account', 'Amount'], ...asset.map((x) => ['Assets', x.name, x.balance]), ...liab.map((x) => ['Liabilities', x.name, x.balance]),
          ...eq.map((x) => ['Equity', x.name, x.balance]), ['Equity', 'Retained earnings', retained], ['Equity', 'Net income', ytdNet]];
      } else {
        const act = rows.filter((x) => +x.debit || +x.credit);
        const net = (x) => +x.debit - +x.credit;
        const d = act.reduce((a, x) => a + Math.max(net(x), 0), 0), c = act.reduce((a, x) => a + Math.max(-net(x), 0), 0);
        out.innerHTML = `<table class="t"><thead><tr><th>Account</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead><tbody>
          ${act.map((x) => `<tr><td>${esc(x.code)} · ${esc(x.name)}</td><td style="text-align:right">${net(x) > 0 ? money(net(x)) : ''}</td><td style="text-align:right">${net(x) < 0 ? money(-net(x)) : ''}</td></tr>`).join('')}
          <tr style="font-weight:700"><td>Total</td><td style="text-align:right">${money(d)}</td><td style="text-align:right">${money(c)}</td></tr></tbody></table>`;
        csv = [['Code', 'Account', 'Debit', 'Credit'], ...act.map((x) => [x.code, x.name, Math.max(net(x), 0), Math.max(-net(x), 0)])];
      }
    } else if (r === 'aging') {
      const rows = await rpc('report_ar_aging', { p_as_of: to });
      const T = (k) => rows.reduce((a, x) => a + +x[k], 0);
      out.innerHTML = rows.length ? `<table class="t"><thead><tr><th>Client</th><th style="text-align:right">Current</th><th style="text-align:right">1–30</th><th style="text-align:right">31–60</th><th style="text-align:right">61–90</th><th style="text-align:right">91+</th><th style="text-align:right">Total</th></tr></thead><tbody>
        ${rows.map((x) => `<tr><td><a href="#/contacts/${x.contact_id}">${esc(x.contact_name)}</a></td>${['current_amt', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map((k) => `<td style="text-align:right">${+x[k] ? money(x[k]) : ''}</td>`).join('')}</tr>`).join('')}
        <tr style="font-weight:700"><td>Total</td>${['current_amt', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map((k) => `<td style="text-align:right">${money(T(k))}</td>`).join('')}</tr></tbody></table>`
        : '<div class="empty">No unpaid invoices. 🎉</div>';
      csv = [['Client', 'Current', '1-30', '31-60', '61-90', '91+', 'Total'], ...rows.map((x) => [x.contact_name, x.current_amt, x.d1_30, x.d31_60, x.d61_90, x.d90_plus, x.total])];
    } else if (r === 'gst') {
      const g = await rpc('report_gst', { p_from: from, p_to: to });
      const net = +g.collected - +g.itc;
      out.innerHTML = `${line('Total sales and other revenue (line 101)', g.sales, '', 0)}${line('GST/HST collected (line 105)', g.collected, '', 0)}
        ${line('Input tax credits (line 108)', g.itc, '', 0)}${line(net >= 0 ? 'Net tax owing (line 109)' : 'Refund claimed (line 109)', Math.abs(net), 'grand', 0)}
        <p class="inv-muted" style="margin-top:12px">For your GST/HST return. Confirm figures with your accountant before filing with the CRA.</p>`;
      csv = [['Line', 'Amount'], ['Sales (101)', g.sales], ['GST collected (105)', g.collected], ['ITCs (108)', g.itc], ['Net (109)', net]];
    } else if (r === 'gl') {
      const acctId = el.querySelector('#acct').value;
      let q = db.from('journal_lines').select('debit, credit, description, accounts!inner(code, name), contacts(full_name), vendors(name), journal_entries!inner(entry_date, memo, entry_no, source_type)')
        .gte('journal_entries.entry_date', from).lte('journal_entries.entry_date', to).limit(5000);
      if (acctId) q = q.eq('account_id', acctId);
      const { data } = await q;
      const rows = (data || []).sort((a, b) => (a.accounts.code + a.journal_entries.entry_date).localeCompare(b.accounts.code + b.journal_entries.entry_date));
      const grouped = {};
      rows.forEach((x) => (grouped[`${x.accounts.code} · ${x.accounts.name}`] ||= []).push(x));
      out.innerHTML = Object.keys(grouped).length ? Object.entries(grouped).map(([a, ls]) => `<h4 style="margin:14px 0 6px;color:var(--navy)">${esc(a)}</h4>
        <table class="t"><tbody>${ls.map((x) => `<tr><td style="width:110px">${fmtDate(x.journal_entries.entry_date)}</td><td style="width:60px">#${x.journal_entries.entry_no}</td>
          <td>${esc(x.contacts?.full_name || x.vendors?.name || '')} ${esc(x.description || x.journal_entries.memo || '')}</td>
          <td style="text-align:right;width:120px">${+x.debit ? money(x.debit) : ''}</td><td style="text-align:right;width:120px">${+x.credit ? money(x.credit) : ''}</td></tr>`).join('')}
          <tr style="font-weight:700"><td colspan="3">Total</td><td style="text-align:right">${money(ls.reduce((s2, x) => s2 + +x.debit, 0))}</td><td style="text-align:right">${money(ls.reduce((s2, x) => s2 + +x.credit, 0))}</td></tr></tbody></table>`).join('')
        : '<div class="empty">No transactions in this period.</div>';
      csv = [['Account', 'Date', 'Entry', 'Name', 'Description', 'Debit', 'Credit'], ...rows.map((x) => [`${x.accounts.code} ${x.accounts.name}`, x.journal_entries.entry_date, x.journal_entries.entry_no,
        x.contacts?.full_name || x.vendors?.name, x.description || x.journal_entries.memo, x.debit, x.credit])];
    } else if (r === 'sales_client' || r === 'sales_item') {
      const { data } = await db.from('invoice_lines').select('amount, description, items(name), invoices!inner(status, issue_date, contacts(full_name))')
        .neq('invoices.status', 'void').neq('invoices.status', 'draft').gte('invoices.issue_date', from).lte('invoices.issue_date', to).limit(10000);
      const g = {};
      (data || []).forEach((x) => { const k = r === 'sales_client' ? x.invoices.contacts?.full_name || '—' : x.items?.name || x.description; g[k] = (g[k] || 0) + +x.amount; });
      const rows = Object.entries(g).sort((a, b) => b[1] - a[1]);
      const tot = rows.reduce((a, x) => a + x[1], 0);
      out.innerHTML = rows.length ? rows.map(([k, v]) => `<div class="rl"><span>${esc(k)}</span><span>${money(v)} <small class="inv-muted">${((v / tot) * 100).toFixed(0)}%</small></span></div>`).join('') + line('Total', tot, 'grand', 0)
        : '<div class="empty">No sales in this period.</div>';
      csv = [[r === 'sales_client' ? 'Client' : 'Product/service', 'Amount'], ...rows];
    } else if (r === 'expense_cat' || r === 'expense_vendor') {
      const { data } = await db.from('journal_lines').select('debit, credit, vendors(name), accounts!inner(name, type), journal_entries!inner(entry_date)')
        .eq('accounts.type', 'expense').gte('journal_entries.entry_date', from).lte('journal_entries.entry_date', to).limit(10000);
      const g = {};
      (data || []).forEach((x) => { const k = r === 'expense_cat' ? x.accounts.name : x.vendors?.name || 'No vendor'; g[k] = (g[k] || 0) + +x.debit - +x.credit; });
      const rows = Object.entries(g).filter(([, v]) => Math.abs(v) > 0.004).sort((a, b) => b[1] - a[1]);
      const tot = rows.reduce((a, x) => a + x[1], 0);
      out.innerHTML = rows.length ? rows.map(([k, v]) => `<div class="rl"><span>${esc(k)}</span><span>${money(v)}</span></div>`).join('') + line('Total', tot, 'grand', 0)
        : '<div class="empty">No expenses in this period.</div>';
      csv = [[r === 'expense_cat' ? 'Category' : 'Vendor', 'Amount'], ...rows];
    }
  }
  run();
}
