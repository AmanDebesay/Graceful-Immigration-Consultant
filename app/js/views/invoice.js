import { db, state, can, esc, icon, fmtDate, rpc, toast, fail, confirmBox, modal } from '../core.js';
import { money, num, invoiceBadge, accounts, itemsList, contactsList, contactOptions, orgSettings, receivePayment, METHOD_LABEL, clearFinCache } from '../fin.js';

export async function render(el, [id], { setTitle }) {
  const [{ data: inv, error }, accs, items, contacts, s] = await Promise.all([
    db.from('invoices').select('*, contacts(id, full_name, email, phone, address, city, province, postal_code)').eq('id', id).single(),
    accounts(), itemsList(), contactsList(), orgSettings(),
  ]);
  if (error) { el.innerHTML = '<div class="alert err">Invoice not found.</div>'; return; }
  const { data: lines } = await db.from('invoice_lines').select('*').eq('invoice_id', id).order('position');
  const { data: pays } = await db.from('payment_applications').select('amount, payments(number, payment_date, method, voided)').eq('invoice_id', id);
  setTitle(`Invoice ${inv.number}`);
  const draft = inv.status === 'draft', manage = can('finance.manage');
  const editable = draft && manage;
  const incomeAccts = accs.filter((a) => a.type === 'income' && a.active);
  const defaultIncome = accs.find((a) => a.system_key === 'service_income')?.id;
  const rate = s.gst_number ? Number(s.gst_rate || 5) : 0;
  const c = inv.contacts || {};

  const lineRow = (l = {}) => `<tr class="ln">
    <td><select class="input li-item"><option value="">— Product/service —</option>${items.map((it) => `<option value="${it.id}" ${it.id === l.item_id ? 'selected' : ''}>${esc(it.name)}</option>`).join('')}</select></td>
    <td><input class="input li-desc" value="${esc(l.description || '')}" placeholder="Description"></td>
    <td><input class="input li-qty" type="number" step="0.01" value="${l.quantity ?? 1}" style="width:80px"></td>
    <td><input class="input li-price" type="number" step="0.01" value="${l.unit_price ?? ''}" style="width:110px"></td>
    <td><select class="input li-acct">${incomeAccts.map((a) => `<option value="${a.id}" ${a.id === (l.account_id || defaultIncome) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></td>
    <td style="text-align:center"><input type="checkbox" class="li-tax" ${l.taxable ?? true ? 'checked' : ''} aria-label="Taxable"></td>
    <td class="li-amt" style="text-align:right;white-space:nowrap">${money(num(l.quantity ?? 1) * num(l.unit_price))}</td>
    <td><button class="btn btn-ghost btn-sm li-del" aria-label="Remove line">${icon('trash')}</button></td></tr>`;

  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/invoices">← Invoices</a><div class="grow"></div>
      <button class="btn" id="print">${icon('file')} Print / PDF</button>
      ${c.email && !draft ? `<a class="btn" id="mail" href="#">${icon('mail')} Email</a>` : ''}
      ${editable ? `<button class="btn btn-danger" id="delDraft">${icon('trash')}</button><button class="btn" id="save">Save draft</button><button class="btn btn-gold" id="post">${icon('check')} Approve & post</button>` : ''}
      ${manage && ['open', 'partial'].includes(inv.status) ? `<button class="btn btn-primary" id="recv">${icon('dollar')} Receive payment</button>` : ''}
      ${manage && !draft && inv.status !== 'void' && Number(inv.amount_paid) === 0 ? `<button class="btn btn-danger" id="void">Void</button>` : ''}
    </div>

    <div class="card inv-sheet" id="sheet">
      <div class="inv-head">
        <div><img src="../public/img/logo-emblem.png" alt="" style="width:70px"><h2 style="font-family:var(--serif);color:var(--navy);margin-top:6px">${esc(s.business_name)}</h2>
          <div class="inv-muted">${esc(s.address)}<br>${esc(s.phone)} · ${esc(s.email)}${s.gst_number ? `<br>GST/HST No. ${esc(s.gst_number)}` : ''}<br>${esc(s.rcic_name)}, RCIC-IRB · College ID ${esc(s.licence_number)}</div></div>
        <div style="text-align:right"><div class="inv-title">INVOICE</div><div style="font-size:18px;font-weight:700">${esc(inv.number)}</div><div style="margin-top:6px">${invoiceBadge(inv)}</div></div>
      </div>
      <div class="inv-meta">
        <div><small>BILL TO</small>${editable ? `<select class="input" id="client" style="margin-top:6px;max-width:320px">${contactOptions(contacts, inv.contact_id)}</select>`
          : `<b>${esc(c.full_name)}</b><div class="inv-muted">${esc([c.address, c.city, c.province, c.postal_code].filter(Boolean).join(', '))}${c.email ? '<br>' + esc(c.email) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}</div>`}</div>
        <div class="inv-dates">
          <div><small>INVOICE DATE</small>${editable ? `<input class="input" type="date" id="idate" value="${inv.issue_date}">` : `<b>${fmtDate(inv.issue_date)}</b>`}</div>
          <div><small>DUE DATE</small>${editable ? `<input class="input" type="date" id="ddate" value="${inv.due_date}">` : `<b>${fmtDate(inv.due_date)}</b>`}</div>
        </div>
      </div>
      ${editable ? `<div class="table-wrap"><table class="t inv-lines"><thead><tr><th style="width:200px">Product / service</th><th>Description</th><th>Qty</th><th>Rate</th><th>Income account</th><th>GST</th><th style="text-align:right">Amount</th><th></th></tr></thead>
        <tbody id="lines">${(lines.length ? lines : [{}]).map(lineRow).join('')}</tbody></table></div>
        <button class="btn btn-sm" id="addLine" style="margin:10px 0">${icon('plus')} Add line</button>`
      : `<table class="t inv-lines"><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${esc(l.description)}${l.taxable && Number(l.tax_rate) ? ' <small class="inv-muted">· GST</small>' : ''}</td><td style="text-align:right">${num(l.quantity)}</td>
          <td style="text-align:right">${money(l.unit_price)}</td><td style="text-align:right">${money(l.amount)}</td></tr>`).join('')}</tbody></table>`}
      <div class="inv-foot">
        <div style="flex:1">${editable ? `<div class="field"><label>Message on invoice</label><textarea class="input" id="notes">${esc(inv.notes || '')}</textarea></div>
          <div class="field"><label>Terms</label><input class="input" id="terms" value="${esc(inv.terms || '')}"></div>`
          : `${inv.notes ? `<p style="white-space:pre-wrap">${esc(inv.notes)}</p>` : ''}<p class="inv-muted" style="margin-top:8px">${esc(inv.terms || '')}</p>
             <p class="inv-muted" style="margin-top:8px">Pay by Interac e-Transfer to ${esc(s.email)}, or call ${esc(s.phone)}.</p>`}</div>
        <div class="inv-totals">
          <div><span>Subtotal</span><b id="tSub">${money(inv.subtotal)}</b></div>
          <div><span>GST ${rate || ''}${rate ? '%' : ''}</span><b id="tTax">${money(inv.tax_total)}</b></div>
          <div class="grand"><span>Total</span><b id="tTot">${money(inv.total)}</b></div>
          ${!draft ? `<div><span>Amount paid</span><b>${money(inv.amount_paid)}</b></div><div class="grand"><span>Balance due</span><b>${money(inv.status === 'void' ? 0 : inv.balance)}</b></div>` : ''}
        </div>
      </div>
      ${(pays || []).length ? `<div class="no-print" style="margin-top:18px"><h4 style="color:var(--navy);margin-bottom:6px">Payments</h4>${pays.map((p) => `<div class="check" style="${p.payments.voided ? 'opacity:.5;text-decoration:line-through' : ''}">
        <span style="flex:1">${esc(p.payments.number)} · ${fmtDate(p.payments.payment_date)} · ${esc(METHOD_LABEL[p.payments.method] || '')}</span><b>${money(p.amount)}</b></div>`).join('')}</div>` : ''}
      ${!rate && editable ? `<div class="alert info no-print" style="margin-top:14px">GST is not added because no GST/HST number is set. If you are registered, add it in <a href="#/settings">Business Settings</a>.</div>` : ''}
    </div>`;

  // ── Interactions ──
  el.querySelector('#print').onclick = () => window.print();
  el.querySelector('#mail')?.addEventListener('click', (e) => {
    e.preventDefault();
    const body = `Hello ${c.full_name.split(' ')[0]},\n\nPlease find invoice ${inv.number} for ${money(inv.total)}, due ${fmtDate(inv.due_date)}. The balance due is ${money(inv.balance)}.\n\nYou can pay by Interac e-Transfer to ${s.email}, or call ${s.phone}.\n\nThank you,\n${s.rcic_name}\n${s.business_name}`;
    location.href = `mailto:${c.email}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${s.business_name}`)}&body=${encodeURIComponent(body)}`;
    toast('Tip: print the invoice to PDF and attach it to the email.');
  });
  el.querySelector('#recv')?.addEventListener('click', async () => { await receivePayment(inv.contact_id); window.addEventListener('books-changed', () => render(el, [id], { setTitle }), { once: true }); });
  el.querySelector('#void')?.addEventListener('click', () => modal({
    title: `Void ${inv.number}`, body: `<p style="margin-bottom:12px">Voiding keeps the invoice for your records but reverses it in the books. This cannot be undone.</p>
      <div class="field"><label>Reason</label><input class="input" id="vr"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Void invoice', cls: 'btn-danger', onClick: async (m) => {
      await rpc('void_invoice', { p_invoice: id, p_reason: m.querySelector('#vr').value || null }); toast('Invoice voided'); render(el, [id], { setTitle }); } }],
  }));
  if (!editable) return;

  const tbody = el.querySelector('#lines');
  const recalc = () => {
    let sub = 0, tax = 0;
    tbody.querySelectorAll('tr.ln').forEach((tr) => {
      const amt = num(num(tr.querySelector('.li-qty').value) * num(tr.querySelector('.li-price').value));
      tr.querySelector('.li-amt').textContent = money(amt);
      sub += amt; if (tr.querySelector('.li-tax').checked) tax += num(amt * rate / 100);
    });
    el.querySelector('#tSub').textContent = money(sub); el.querySelector('#tTax').textContent = money(tax); el.querySelector('#tTot').textContent = money(sub + tax);
  };
  const wire = (tr) => {
    tr.querySelector('.li-item').onchange = (e) => {
      const it = items.find((x) => x.id === e.target.value); if (!it) return;
      tr.querySelector('.li-desc').value = it.description || it.name; tr.querySelector('.li-price').value = it.unit_price;
      tr.querySelector('.li-tax').checked = it.taxable; if (it.income_account_id) tr.querySelector('.li-acct').value = it.income_account_id; recalc();
    };
    tr.querySelector('.li-del').onclick = () => { tr.remove(); recalc(); };
  };
  tbody.querySelectorAll('tr.ln').forEach(wire);
  tbody.addEventListener('input', recalc); tbody.addEventListener('change', recalc);
  el.querySelector('#addLine').onclick = () => { tbody.insertAdjacentHTML('beforeend', lineRow()); wire(tbody.lastElementChild); };
  recalc();

  async function save() {
    const rows = [...tbody.querySelectorAll('tr.ln')].map((tr, i) => ({
      invoice_id: id, position: i, item_id: tr.querySelector('.li-item').value || null, description: tr.querySelector('.li-desc').value.trim(),
      quantity: num(tr.querySelector('.li-qty').value), unit_price: num(tr.querySelector('.li-price').value),
      taxable: tr.querySelector('.li-tax').checked, tax_rate: rate, account_id: tr.querySelector('.li-acct').value,
    })).filter((r) => r.description || r.unit_price);
    if (rows.some((r) => !r.description)) throw new Error('Every line needs a description.');
    const { error: e1 } = await db.from('invoices').update({ contact_id: el.querySelector('#client').value, issue_date: el.querySelector('#idate').value,
      due_date: el.querySelector('#ddate').value, notes: el.querySelector('#notes').value || null, terms: el.querySelector('#terms').value || null }).eq('id', id);
    if (e1) throw e1;
    const { error: e2 } = await db.from('invoice_lines').delete().eq('invoice_id', id); if (e2) throw e2;
    if (rows.length) { const { error: e3 } = await db.from('invoice_lines').insert(rows); if (e3) throw e3; }
  }
  el.querySelector('#save').onclick = async () => { try { await save(); toast('Draft saved'); } catch (e) { fail(e); } };
  el.querySelector('#post').onclick = async () => {
    try {
      await save();
      if (!(await confirmBox('Approve & post invoice', 'Posting records this invoice in your books (accounts receivable and income). After posting it can only be voided, not edited.', 'Post invoice'))) return;
      await rpc('post_invoice', { p_invoice: id }); clearFinCache(); toast(`Invoice ${inv.number} posted`); render(el, [id], { setTitle });
    } catch (e) { fail(e); }
  };
  el.querySelector('#delDraft').onclick = async () => {
    if (!(await confirmBox('Delete draft', 'Delete this draft invoice?', 'Delete', true))) return;
    const { error: e } = await db.from('invoices').delete().eq('id', id); if (e) return fail(e);
    toast('Draft deleted'); location.hash = '#/invoices';
  };
}
