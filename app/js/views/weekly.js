// One-page weekly report (the same data is emailed every Monday) and the monthly reconciliation sign-off.
import { db, can, esc, icon, fmtDate, modal, toast, fail, rpc } from '../core.js';

export async function render(el) {
  el.innerHTML = '<div class="loading" style="min-height:160px"><div class="spin"></div></div>';
  let w;
  try { w = await rpc('weekly_report_data'); } catch (e) { el.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; return; }
  const { money } = await import('../fin.js');
  const link = (id, t) => `<a href="#/contacts/${id}">${esc(t)}</a>`;
  const sec = (title, ic, rows, empty) => `<div class="card"><div class="card-h"><h3>${icon(ic)} ${title}</h3><span class="badge ${rows.length ? 'b-AMBER' : 'b-GREEN'}">${rows.length}</span></div><div class="card-b">
    ${rows.length ? `<table class="t"><tbody>${rows.join('')}</tbody></table>` : `<div class="dk-muted">${empty}</div>`}</div></div>`;
  const tr = (...cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const red = (d) => (d < new Date().toLocaleDateString('en-CA') ? ' style="color:var(--red);font-weight:700"' : '');
  const fin = w.unpaid_invoices !== null && w.unpaid_invoices !== undefined;
  el.innerHTML = `<div class="toolbar no-print"><small class="dk-muted">Generated ${fmtDate(w.generated_at)}. The same report is emailed to you every Monday morning.</small><div class="grow"></div>
      <button class="btn" onclick="window.print()">${icon('file')} Print</button></div>
    ${fin && w.month_open ? `<div class="alert warn no-print"><b>Last month's reconciliation is still open.</b> Match the bank statement, the journal and each client ledger, then sign it off below.</div>` : ''}
    <div class="grid g-2" style="align-items:start;gap:16px">
      ${sec('Deadlines in the next 14 days', 'clock', (w.deadlines || []).map((d) => tr(link(d.contact_id, d.client), esc(d.title), `<span${red(d.due_on)}>${d.due_on}</span>`)), 'Nothing due in the next 14 days.')}
      ${sec('Documents expiring (60 days)', 'file', (w.expiring || []).map((d) => tr(link(d.contact_id, d.client), esc(d.doc), `<span${red(d.expires_on)}>${d.expires_on}</span>`)), 'Nothing expiring.')}
      ${sec('Unsigned agreements', 'file', (w.unsigned_agreements || []).map((a) => tr(link(a.contact_id, a.client), `<a href="#/agreements/${a.id}">${esc(a.number)}</a>`, esc(a.status))), 'All agreements signed.')}
      ${sec('IMM 5476 / 5744 outstanding', 'file', (w.rep_forms || []).map((r) => tr(link(r.contact_id, r.client), esc(r.form), esc(r.state) + (r.expires_on ? ` · expires ${r.expires_on}` : ''))), 'Nothing outstanding.')}
      ${fin ? sec('Unpaid invoices', 'dollar', (w.unpaid_invoices || []).map((i) => tr(link(i.contact_id, i.client), `<a href="#/invoices/${i.id}">${esc(i.number)}</a>`, money(i.balance), `<span${red(i.due_date)}>due ${i.due_date}</span>`)), 'No unpaid invoices.') : ''}
      ${fin ? sec('Client account balances', 'lock', (w.trust_balances || []).map((t) => tr(link(t.contact_id, t.client), money(t.balance), `last ${t.last}`)), 'No money held for clients.') : ''}
      ${sec('Out-of-scope IRCC letters awaiting an addendum decision', 'mail', (w.out_of_scope || []).map((r) => tr(link(r.contact_id, r.client), esc(r.subject), r.client_informed ? 'Client informed' : '<b style="color:var(--red)">Client not informed</b>')), 'None.')}
      ${sec('Retained files with no activity for 30 days', 'history', (w.inactive || []).map((r) => tr(link(r.contact_id, r.client), r.last ? fmtDate(r.last) : 'never')), 'Every retained file has recent activity.')}
    </div>
    ${fin ? '<div class="card no-print" style="margin-top:16px" id="mc"></div>' : ''}`;
  if (fin) monthClose(el.querySelector('#mc'));
}

export async function monthClose(box) {
  const { data } = await db.from('month_closes').select('*').order('month', { ascending: false }).limit(12);
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1 - i); return d.toLocaleDateString('en-CA').slice(0, 8) + '01'; });
  const label = (m) => new Date(m + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  box.innerHTML = `<div class="card-h"><h3>${icon('checksq')} Monthly reconciliation</h3></div><div class="card-b">
    <p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">A month stays open until the bank statement, the journal and every client ledger match. Reconcile the accounts in Banking first, then sign the month off here.</p>
    <table class="t"><tbody>${months.map((m) => { const c = (data || []).find((x) => x.month === m); return `<tr><td><b>${label(m)}</b></td><td>${c ? `<span class="badge b-GREEN">Signed off ${fmtDate(c.signed_at)}</span>${c.note ? `<br><small class="dk-muted">${esc(c.note)}</small>` : ''}` : '<span class="badge b-AMBER">Open</span>'}</td>
      <td>${!c && can('finance.manage') ? `<button class="btn btn-sm" data-m="${m}">Sign off</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  box.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => modal({
    title: `Sign off ${label(b.dataset.m)}`,
    body: `<label class="row" style="gap:8px;margin-bottom:8px"><input type="checkbox" id="b1"> The bank statements (operating and client account) match the books</label>
      <label class="row" style="gap:8px;margin-bottom:8px"><input type="checkbox" id="b2"> The journal is complete and balanced for the month</label>
      <label class="row" style="gap:8px;margin-bottom:8px"><input type="checkbox" id="b3"> Every client ledger matches the client account total, and no balance is below zero</label>
      <div class="field"><label>Note (optional)</label><input class="input" id="bn" placeholder="e.g. TD statement 2026-10-31 reconciled"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Sign off month', cls: 'btn-primary', onClick: async (m) => {
      await rpc('sign_month_close', { p_month: b.dataset.m, p_bank: m.querySelector('#b1').checked, p_journal: m.querySelector('#b2').checked, p_ledgers: m.querySelector('#b3').checked, p_note: m.querySelector('#bn').value });
      toast('Month signed off'); monthClose(box);
    } }],
  })));
}
