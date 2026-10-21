import { esc, icon, rpc, can } from '../core.js';
import { money, monthLabel, newInvoice, receivePayment, newExpense, newBill, trustTxn } from '../fin.js';

const PALETTE = ['#0B2A5C', '#D6A23A', '#2E6FBF', '#7A9CC6', '#E9C46A', '#5B6476', '#B8861F', '#9DB4D3'];

export async function render(el) {
  const d = await rpc('finance_dashboard');
  const months = [];
  for (let i = 11; i >= 0; i--) { const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i); months.push(dt.toLocaleDateString('en-CA').slice(0, 7)); }
  const byM = Object.fromEntries((d.monthly || []).map((x) => [x.m, x]));
  const max = Math.max(1, ...months.map((m) => Math.max(+(byM[m]?.income || 0), +(byM[m]?.expense || 0))));
  const net = +d.ytd_income - +d.ytd_expense;

  // Money bar (QuickBooks-style)
  const overdue = +d.overdue_invoices.amount, open = +d.open_invoices.amount, notDue = open - overdue, paid = +d.paid_30d;
  const barTotal = Math.max(1, overdue + notDue + paid);

  // Expense donut
  const cats = (d.expense_categories || []).slice(0, 7);
  const catTotal = cats.reduce((s, c) => s + +c.v, 0);
  let acc = 0;
  const arcs = cats.map((c, i) => {
    const frac = +c.v / (catTotal || 1), a0 = acc * 2 * Math.PI, a1 = (acc += frac) * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0, r = 60, cx = 70, cy = 70;
    const p = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1 - 0.0001);
    return `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z" fill="${PALETTE[i]}"/>`;
  }).join('');

  const manage = can('finance.manage');
  el.innerHTML = `
    ${manage ? `<div class="toolbar"><div class="grow"></div>
      <button class="btn" data-act="exp">${icon('dollar')} New expense</button>
      <button class="btn" data-act="pay">${icon('check')} Receive payment</button>
      <button class="btn btn-gold" data-act="inv">${icon('plus')} New invoice</button></div>` : ''}

    <div class="grid g-4" style="margin-bottom:18px">
      <a class="card kpi" href="#/reports?r=pl"><div class="kpi-ico green">${icon('trend')}</div><div><small>Income this year</small><b>${money(d.ytd_income)}</b></div></a>
      <a class="card kpi" href="#/reports?r=pl"><div class="kpi-ico red">${icon('dollar')}</div><div><small>Expenses this year</small><b>${money(d.ytd_expense)}</b></div></a>
      <a class="card kpi" href="#/reports?r=pl"><div class="kpi-ico gold">${icon('briefcase')}</div><div><small>Net profit this year</small><b style="color:${net < 0 ? 'var(--red)' : 'var(--navy)'}">${money(net)}</b></div></a>
      <a class="card kpi" href="#/trust"><div class="kpi-ico">${icon('lock')}</div><div><small>Client funds held in trust</small><b>${money(d.trust_total)}</b></div></a>
    </div>

    <div class="card" style="margin-bottom:18px"><div class="card-h"><h3>Invoices</h3><a class="btn btn-sm" href="#/invoices">View all</a></div>
      <div class="card-b">
        <div class="moneybar">
          <div style="flex:${overdue / barTotal || 0.0001};background:#D92D20"></div>
          <div style="flex:${notDue / barTotal || 0.0001};background:#F79009"></div>
          <div style="flex:${paid / barTotal || 0.0001};background:#12B76A"></div>
        </div>
        <div class="grid g-3" style="margin-top:12px">
          <a href="#/invoices?f=overdue"><small style="color:var(--muted)">Overdue · ${d.overdue_invoices.n}</small><div class="mb-v" style="color:#D92D20">${money(overdue)}</div></a>
          <a href="#/invoices?f=open"><small style="color:var(--muted)">Not due yet</small><div class="mb-v" style="color:#B54708">${money(notDue)}</div></a>
          <a href="#/invoices?f=paid"><small style="color:var(--muted)">Paid · last 30 days</small><div class="mb-v" style="color:#067647">${money(paid)}</div></a>
        </div>
        ${d.drafts ? `<p style="margin-top:12px;color:var(--muted)">${d.drafts} draft invoice${d.drafts > 1 ? 's' : ''} not yet sent · <a href="#/invoices?f=draft">Review</a></p>` : ''}
      </div></div>

    <div class="grid g-main">
      <div class="card"><div class="card-h"><h3>Profit & loss — last 12 months</h3>
        <div class="row" style="gap:14px;font-size:12px"><span><i class="lg" style="background:var(--navy)"></i>Income</span><span><i class="lg" style="background:var(--gold)"></i>Expenses</span></div></div>
        <div class="card-b"><div class="pl-chart">${months.map((m) => {
          const inc = +(byM[m]?.income || 0), exp = +(byM[m]?.expense || 0);
          return `<div class="pl-col" title="${monthLabel(m)}: income ${money(inc)}, expenses ${money(exp)}">
            <div class="pl-bars"><i style="height:${(inc / max) * 100}%;background:var(--navy)"></i><i style="height:${(exp / max) * 100}%;background:var(--gold)"></i></div>
            <small>${monthLabel(m)}</small></div>`;
        }).join('')}</div></div></div>

      <div class="grid">
        <div class="card"><div class="card-h"><h3>Bank accounts</h3><a class="btn btn-sm" href="#/banking">Go to banking</a></div>
          <div class="card-b" style="padding-top:6px;padding-bottom:6px">${(d.banks || []).map((b) => `<a class="check" href="#/banking?a=${b.id}" style="color:inherit">
            <span class="kpi-ico" style="width:34px;height:34px">${icon(b.subtype === 'trust_bank' ? 'lock' : b.subtype === 'credit_card' ? 'file' : 'briefcase')}</span>
            <span style="flex:1">${esc(b.name)}</span><b>${money(b.subtype === 'credit_card' ? -b.balance : b.balance)}</b></a>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Expenses this year</h3><a class="btn btn-sm" href="#/expenses">View</a></div>
          <div class="card-b">${cats.length ? `<div class="row" style="align-items:center;gap:18px;flex-wrap:nowrap">
            <svg viewBox="0 0 140 140" width="140" height="140" style="flex:none">${arcs}<circle cx="70" cy="70" r="34" fill="#fff"/>
              <text x="70" y="74" text-anchor="middle" font-size="12" font-weight="700" fill="#0B2A5C">${money(catTotal).replace('.00', '')}</text></svg>
            <div style="flex:1;font-size:12.5px;display:grid;gap:5px">${cats.map((c, i) => `<div class="row" style="gap:6px;flex-wrap:nowrap"><i class="lg" style="background:${PALETTE[i]}"></i>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span><b>${money(c.v)}</b></div>`).join('')}</div></div>`
            : '<div class="empty" style="padding:20px">No expenses recorded this year.</div>'}</div></div>
        ${+d.bills_due.n ? `<div class="card"><div class="card-b row" style="justify-content:space-between"><span>${d.bills_due.n} unpaid bill${d.bills_due.n > 1 ? 's' : ''}</span><b>${money(d.bills_due.amount)}</b><a class="btn btn-sm" href="#/expenses?tab=bills">Pay bills</a></div></div>` : ''}
      </div>
    </div>`;

  const acts = { inv: () => newInvoice(), pay: () => receivePayment(), exp: () => newExpense(), bill: () => newBill(), trust: () => trustTxn('deposit') };
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => acts[b.dataset.act]()));
  const rerender = () => render(el);
  window.addEventListener('books-changed', rerender, { once: true });
}
