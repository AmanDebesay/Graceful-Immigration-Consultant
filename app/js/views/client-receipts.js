// Client receipts: a receipt for every payment received (PMT-) and every retainer paid into trust (TRD-).
// Receipts are addressed to whoever paid: the client, or the fee payer named in the agreement / on the invoice.
// The client stays on the receipt as the person the services are for.
import { db, state, can, esc, icon, fmtDate, toast, fail, rpc, modal, today, confirmBox } from '../core.js';
import { receiptHtml, receiptEmailHtml, receiptPdf } from '../receipt-template.js';
import { money, num, METHOD_LABEL, orgSettings, receivePayment, trustTxn, quickSale, payerFor, downloadCsv, accounts, itemsList, clearFinCache } from '../fin.js';

export async function render(el, [kind, id] = [], ctx = {}) {
  if (kind && id) return receipt(el, kind, id, ctx);
  return list(el);
}

// ── List ──
async function list(el) {
  const manage = can('finance.manage');
  let filter = 'all', q = '', rows = [];
  el.innerHTML = `<div class="toolbar">
      <div class="seg" id="flt"><button data-f="all">All</button><button data-f="unsent">Not sent yet</button><button data-f="payment">Payments</button><button data-f="trust">Retainers in trust</button></div>
      <input class="input" id="q" placeholder="Search name or number" style="max-width:240px">
      <div class="grow"></div><button class="btn" id="csv">${icon('file')} Export</button>
      ${manage ? `<button class="btn btn-gold" id="issue">${icon('plus')} Issue a receipt</button>` : ''}</div>
    <div class="alert info" style="margin-bottom:14px">Every payment you record gets a receipt here, addressed to whoever paid. When a fee payer (a spouse, parent or employer) pays for a client, the receipt is issued to the payer and names the client as the person the services are for.</div>
    <div class="card"><div class="table-wrap" id="tbl"></div></div>`;

  el.querySelector('#issue')?.addEventListener('click', () => modal({
    title: 'Issue a receipt',
    body: `<p style="margin-bottom:12px">What was the money for? The payment is recorded in the books, then the receipt opens.</p>
      <div class="grid" style="gap:10px">
        <button class="card kpi" data-k="inv" style="text-align:left;cursor:pointer;font:inherit;padding:14px"><b>${icon('file')} Payment of an invoice</b><br><small class="dk-muted">The client (or payer) paid an invoice you already sent.</small></button>
        <button class="card kpi" data-k="quick" style="text-align:left;cursor:pointer;font:inherit;padding:14px"><b>${icon('dollar')} Payment without an invoice</b><br><small class="dk-muted">For example a consultation fee paid before the meeting.</small></button>
        <button class="card kpi" data-k="trust" style="text-align:left;cursor:pointer;font:inherit;padding:14px"><b>${icon('lock')} Retainer paid in advance (trust)</b><br><small class="dk-muted">Money for work not done yet. It goes into the trust account.</small></button></div>`,
    onOpen: (m) => m.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      m.closest('.overlay').remove();
      ({ inv: () => receivePayment(), quick: () => quickSale(), trust: () => trustTxn('deposit') })[b.dataset.k]();
    })),
  }));
  el.querySelector('#flt').onclick = (e) => { if (e.target.dataset.f) { filter = e.target.dataset.f; draw(); } };
  el.querySelector('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  window.addEventListener('books-changed', () => load(), { once: true });

  async function load() {
    const [{ data: pays }, { data: trust }] = await Promise.all([
      db.from('payments').select('id, number, payment_date, amount, method, reference, voided, moved_to_trust, received_from, receipt_sent_at, contacts(full_name), payment_applications(invoices(number, bill_to))')
        .order('payment_date', { ascending: false }).limit(1000),
      db.from('trust_transactions').select('id, number, txn_date, amount, method, reference, received_from, receipt_sent_at, moved_to_payment, contacts(full_name)')
        .eq('type', 'deposit').order('txn_date', { ascending: false }).limit(1000),
    ]);
    rows = [
      ...(pays || []).map((p) => ({ kind: 'payment', id: p.id, number: p.number, date: p.payment_date, amount: p.amount, method: p.method, ref: p.reference, voided: p.voided, moved: !!p.moved_to_trust, sent: p.receipt_sent_at,
        client: p.contacts?.full_name || '', from: p.received_from || p.payment_applications?.find((a) => a.invoices?.bill_to?.name)?.invoices.bill_to.name || p.contacts?.full_name || '',
        what: (p.payment_applications || []).map((a) => a.invoices?.number).filter(Boolean).join(', ') })),
      ...(trust || []).map((t) => ({ kind: 'trust', id: t.id, number: t.number, date: t.txn_date, amount: t.amount, method: t.method, ref: t.reference, voided: !!t.moved_to_payment, moved: !!t.moved_to_payment, sent: t.receipt_sent_at,
        client: t.contacts?.full_name || '', from: t.received_from || t.contacts?.full_name || '', what: 'Retainer held in trust' })),
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.number).localeCompare(String(a.number)));
    draw();
  }
  function draw() {
    el.querySelectorAll('#flt button').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
    const shown = rows.filter((r) => (filter === 'all' || (filter === 'unsent' ? !r.sent && !r.voided : r.kind === filter))
      && (!q || [r.number, r.client, r.from].some((x) => String(x || '').toLowerCase().includes(q))));
    el.querySelector('#tbl').innerHTML = shown.length ? `<table class="t"><thead><tr><th>Date</th><th>Receipt no.</th><th>Received from</th><th>Client</th><th>For</th><th>Method</th><th style="text-align:right">Amount</th><th>Receipt</th></tr></thead><tbody>
      ${shown.map((r) => `<tr class="click" data-k="${r.kind}" data-id="${r.id}" style="${r.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${fmtDate(r.date)}</td><td><b>${esc(r.number || '')}</b></td>
        <td>${esc(r.from)}</td><td>${r.from !== r.client ? esc(r.client) : '<span class="dk-muted">same</span>'}</td><td>${esc(r.what || '—')}</td>
        <td>${esc(METHOD_LABEL[r.method] || r.method || '')}</td><td style="text-align:right"><b>${money(r.amount)}</b></td>
        <td>${r.moved ? '<span class="badge b-blue">Moved</span>' : r.voided ? '<span class="badge">Void</span>' : r.sent ? `<span class="badge b-GREEN" title="${esc(fmtDate(r.sent))}">Sent</span>` : '<span class="badge b-AMBER">Not sent</span>'}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('dollar')}<div>${rows.length ? 'Nothing matches.' : 'No payments received yet. Use “Issue a receipt” when a client pays you.'}</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/client-receipts/${tr.dataset.k}/${tr.dataset.id}`)));
  }
  el.querySelector('#csv').onclick = () => downloadCsv('client-receipts.csv', [['Date', 'Receipt no.', 'Received from', 'Client', 'For', 'Method', 'Reference', 'Amount', 'Sent', 'Void'],
    ...rows.map((r) => [r.date, r.number, r.from, r.client, r.what, METHOD_LABEL[r.method] || r.method, r.ref, r.amount, r.sent ? String(r.sent).slice(0, 10) : '', r.voided ? 'yes' : ''])]);
  load();
}

// ── One receipt ──
// Issued by whoever prints or sends it: their name, title and saved handwritten signature go on the receipt.
async function receipt(el, kind, id, { setTitle } = {}) {
  const manage = can('finance.manage');
  const [s, { data: mine }, { data: prof }] = await Promise.all([orgSettings(),
    db.from('user_signatures').select('signature').eq('user_id', state.profile.id).maybeSingle(),
    db.from('profiles').select('full_name, job_title, email_sig').eq('id', state.profile.id).single()]);
  let r, apps = [], payer = null;
  if (kind === 'payment') {
    const { data, error } = await db.from('payments').select('*, contacts(id, full_name, email, phone, address, city, province, postal_code), payment_applications(amount, invoices(id, number, issue_date, total, tax_total, balance, bill_to, status))').eq('id', id).single();
    if (error || !data) { el.innerHTML = '<div class="alert err">Receipt not found.</div>'; return; }
    r = { ...data, date: data.payment_date };
    apps = data.payment_applications || [];
    payer = apps.find((a) => a.invoices?.bill_to?.name)?.invoices.bill_to || null;
  } else {
    const { data, error } = await db.from('trust_transactions').select('*, contacts(id, full_name, email, phone, address, city, province, postal_code)').eq('id', id).eq('type', 'deposit').single();
    if (error || !data) { el.innerHTML = '<div class="alert err">Receipt not found.</div>'; return; }
    r = { ...data, date: data.txn_date, voided: !!data.moved_to_payment };
    payer = await payerFor(data.contact_id);
  }
  const c = r.contacts || {}, ed = r.receipt_edits || {};
  const fromName = r.received_from || payer?.name || c.full_name || '';
  const byPayer = payer && fromName === payer.name;              // the payer's address and email go on the receipt
  const fromClient = fromName === c.full_name;
  const email = byPayer ? payer.email : fromClient ? c.email : (payer?.email || c.email || '');
  const gst = apps.reduce((t, a) => t + (Number(a.invoices?.total) ? num(Number(a.amount) * Number(a.invoices.tax_total) / Number(a.invoices.total)) : 0), 0);
  const sg = prof?.email_sig || {};
  const autoLines = byPayer ? [payer.address, payer.email, payer.phone] : fromClient ? [[c.address, c.city, c.province, c.postal_code].filter(Boolean).join(', '), c.email] : [];
  const clientName = ed.client_name || c.full_name || '';
  const model = {
    org: s, number: r.number || '', date: ed.date || r.date, amount: r.amount, method: ed.method || METHOD_LABEL[r.method] || r.method || '', reference: ed.reference ?? r.reference, kind, memo: r.memo, voided: r.voided,
    from: { name: fromName, lines: ed.from_lines != null ? String(ed.from_lines).split('\n') : autoLines },
    client: fromName === clientName ? '' : clientName,
    desc: ed.desc_title || ed.desc_detail ? { title: ed.desc_title || '', detail: ed.desc_detail || '' } : null, note: ed.note || '',
    apps: apps.map((a) => ({ number: a.invoices?.number, date: a.invoices?.issue_date, total: a.invoices?.total, paid: a.amount, balance: a.invoices?.status === 'void' ? 0 : a.invoices?.balance })),
    gst, issuer: { name: prof?.full_name || state.profile.full_name, credentials: sg.credentials || '', title: sg.title || prof?.job_title || '' },
    signature: mine?.signature || '', issued: today(),
  };
  const html = receiptHtml(model);
  // Which account the money is recorded in, and links between moved receipts.
  const accs = await accounts();
  const heldIn = kind === 'trust' ? (accs.find((a) => a.subtype === 'trust_bank')?.name || 'Trust bank account')
    : r.method === 'trust' ? 'Paid from trust into the operating account' : (accs.find((a) => a.id === r.deposit_account_id)?.name || 'Operating bank account');
  let movedBanner = '';
  if (kind === 'trust' && r.moved_to_payment) {
    const { data: np } = await db.from('payments').select('id, number').eq('id', r.moved_to_payment).maybeSingle();
    movedBanner = `<div class="alert info">This money was moved out of trust on ${esc(fmtDate(r.moved_at))} (it was recorded in trust by mistake). This receipt is no longer valid. ${np ? `The receipt now is <a href="#/client-receipts/payment/${np.id}"><b>${esc(np.number)}</b></a>.` : ''}</div>`;
  } else if (kind === 'payment' && r.moved_to_trust) {
    const { data: nt } = await db.from('trust_transactions').select('id, number').eq('id', r.moved_to_trust).maybeSingle();
    movedBanner = `<div class="alert info">This payment was moved into trust (it was really a retainer). This receipt is no longer valid. ${nt ? `The receipt now is <a href="#/client-receipts/trust/${nt.id}"><b>${esc(nt.number)}</b></a>.` : ''}</div>`;
  } else if (kind === 'payment' && r.moved_from_trust) {
    const { data: ot } = await db.from('trust_transactions').select('id, number').eq('id', r.moved_from_trust).maybeSingle();
    movedBanner = ot ? `<div class="alert info" style="margin-bottom:8px">Moved here from trust receipt <a href="#/client-receipts/trust/${ot.id}"><b>${esc(ot.number)}</b></a>.</div>` : '';
  }
  const fileName = `Receipt ${model.number}.pdf`;
  setTitle?.(`Receipt ${model.number}`);

  el.innerHTML = `
    <div class="toolbar"><a class="btn btn-sm" href="#/client-receipts">← Client Receipts</a><div class="grow"></div>
      ${r.receipt_sent_at ? `<span class="badge b-GREEN">Sent ${esc(fmtDate(r.receipt_sent_at))}</span>` : ''}
      ${manage && !r.voided ? `<button class="btn btn-primary" id="edit">${icon('edit')} Edit</button><button class="btn" id="from">${icon('users')} Received from</button>` : ''}
      <button class="btn" id="print">${icon('file')} Print</button><button class="btn" id="pdf">${icon('file')} Download PDF</button>
      ${manage && !r.voided ? `${r.receipt_sent_at ? '' : '<button class="btn" id="given" title="You gave or sent it another way">Mark as sent</button>'}<button class="btn btn-gold" id="mail">${icon('mail')} Email receipt</button>` : ''}
    </div>
    ${movedBanner}${r.voided && !movedBanner ? '<div class="alert err">This payment was voided, so this receipt is no longer valid.</div>' : ''}
    ${!r.voided ? `<div class="row" style="gap:8px;margin-bottom:12px;font-size:14px"><span class="dk-muted">Held in:</span><b>${esc(heldIn)}</b>${manage ? `<button class="btn btn-sm" id="move">${icon('wallet')} Change account</button>` : ''}</div>` : ''}
    ${!mine?.signature && !r.voided ? `<div class="alert info">Your handwritten signature isn't saved yet, so your name is printed in script. <button class="btn btn-sm" id="addSig">Add my signature</button></div>` : ''}
    <div class="card" style="padding:0;overflow:auto;max-width:818px"><div id="doc">${html}</div></div>`;

  const again = () => receipt(el, kind, id, { setTitle });
  el.querySelector('#print').onclick = async () => (await import('./agreement.js')).printDoc(html, fileName.replace(/\.pdf$/, ''));
  el.querySelector('#pdf').onclick = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try { const { blob } = await receiptPdf(html); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    catch (e) { fail(e); } finally { b.disabled = false; }
  };
  el.querySelector('#addSig')?.addEventListener('click', async () => {
    const { signaturePad } = await import('./agreement.js');
    let pad;
    modal({ title: 'Your handwritten signature', body: '<p class="dk-muted" style="margin-bottom:10px">Saved to your profile and printed on the receipts you issue. Only you can use it.</p><div id="pad"></div>',
      onOpen: async (m) => { pad = await signaturePad(m.querySelector('#pad')); },
      actions: [{ label: 'Cancel' }, { label: 'Save signature', cls: 'btn-primary', onClick: async () => {
        const sig = pad?.(); if (!sig) throw new Error('Draw or type your signature first.');
        const { error } = await db.from('user_signatures').upsert({ user_id: state.profile.id, signature: sig, updated_at: new Date().toISOString() });
        if (error) throw error; toast('Signature saved'); again();
      } }] });
  });
  el.querySelector('#given')?.addEventListener('click', async () => {
    try { await rpc('update_receipt', { p_kind: kind, p_id: id, p_sent: true }); toast('Marked as sent'); again(); } catch (e) { fail(e); }
  });
  // Correct what the receipt shows. The amount stays tied to the payment record so the books always match.
  el.querySelector('#edit')?.addEventListener('click', () => {
    const f = (id, label, v, extra = '') => `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(v ?? '')}" ${extra}></div>`;
    const defDesc = kind === 'trust' ? ['Retainer paid in advance', "Held in the RCIC's client (trust) account until earned"] : apps.length ? ['', ''] : ['Immigration and citizenship services', r.memo || ''];
    modal({ title: `Edit receipt ${model.number}`,
      body: `${r.receipt_sent_at ? `<div class="alert info" style="margin-bottom:10px">This receipt was already sent on ${esc(fmtDate(r.receipt_sent_at))}. After saving, email the corrected receipt again.</div>` : ''}
        <div class="row-2">${f('e_from', 'Received from (name)', fromName)}${f('e_client', 'Client (name)', clientName)}</div>
        ${c.id ? `<label class="row" style="gap:8px;margin:-4px 0 10px"><input type="checkbox" id="e_fix"> Also correct the client’s name in Contacts${c.full_name ? ` (now “${esc(c.full_name)}”)` : ''}</label>` : ''}
        <div class="field"><label>Details under “Received from” (one per line: address, email, phone)</label><textarea class="input" id="e_lines" rows="3">${esc(model.from.lines.filter(Boolean).join('\n'))}</textarea></div>
        <div class="row-2">${f('e_date', 'Date received', model.date, 'type="date"')}${f('e_method', 'Paid by', model.method)}</div>
        ${f('e_ref', 'Reference', model.reference || '')}
        <div class="row-2">${f('e_dt', 'Description', ed.desc_title || defDesc[0], apps.length && !ed.desc_title ? 'placeholder="Blank = list the invoices paid"' : '')}${f('e_dd', 'Description details', ed.desc_detail || defDesc[1])}</div>
        <div class="field"><label>Extra note on the receipt (optional)</label><textarea class="input" id="e_note" rows="2">${esc(ed.note || '')}</textarea></div>
        <p class="dk-muted" style="font-size:12.5px">Amount: <b>${money(r.amount)}</b> (cannot be edited here). If the amount is wrong, void the payment and record it again, so the books and trust records stay correct. Every edit is kept in the Audit Log.</p>`,
      actions: [
        ...(Object.keys(ed).length ? [{ label: 'Undo all edits', onClick: async () => { await rpc('edit_receipt', { p_kind: kind, p_id: id, p_edits: {}, p_received_from: null }); toast('Receipt back to the original'); again(); } }] : []),
        { label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
          const v = (q) => m.querySelector(q).value.trim();
          const from = v('#e_from'); if (!from) throw new Error('Enter who the money was received from.');
          const edits = {};
          const put = (k, val, orig) => { if (val !== String(orig ?? '').trim()) edits[k] = val; };
          put('client_name', v('#e_client'), c.full_name);
          put('from_lines', v('#e_lines'), autoLines.filter(Boolean).join('\n'));
          put('date', v('#e_date'), r.date);
          put('method', v('#e_method'), METHOD_LABEL[r.method] || r.method || '');
          put('reference', v('#e_ref'), r.reference);
          put('desc_title', v('#e_dt'), defDesc[0]); put('desc_detail', v('#e_dd'), defDesc[1]);
          if (edits.desc_title !== undefined || edits.desc_detail !== undefined) { edits.desc_title = v('#e_dt'); edits.desc_detail = v('#e_dd'); }
          if (v('#e_note')) edits.note = v('#e_note');
          if (edits.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(edits.date)) throw new Error('Choose the date received.');
          await rpc('edit_receipt', { p_kind: kind, p_id: id, p_edits: edits, p_received_from: from });
          if (m.querySelector('#e_fix')?.checked && v('#e_client') && v('#e_client') !== c.full_name) {
            const { error } = await db.from('contacts').update({ full_name: v('#e_client') }).eq('id', c.id); if (error) throw error;
          }
          toast('Receipt updated'); again();
        } }] });
  });
  el.querySelector('#move')?.addEventListener('click', () => moveAccount());
  async function moveAccount() {
    const banks = accs.filter((a) => a.subtype === 'bank' && a.active !== false);
    const opt = (list, sel) => list.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.code ? a.code + ' · ' : '')}${esc(a.name)}</option>`).join('');
    const realMoney = `<div class="alert" style="margin-top:10px;font-size:13px"><b>This fixes the records only.</b> Make sure the real money is in that bank account too. A retainer for work not done yet must be in the trust account (CICC rules); if it went into the operating account, transfer it to the trust account. Everything is kept in the Audit Log.</div>`;
    if (kind === 'trust') {
      const [{ data: open }, items] = await Promise.all([db.from('invoices').select('id, number, issue_date, balance').eq('contact_id', r.contact_id).in('status', ['open', 'partial']).order('issue_date'), itemsList()]);
      const gstOn = !!s.gst_number;
      modal({ title: `Move ${model.number} out of trust`, wide: true,
        body: `<p style="margin-bottom:10px">Use this when this money was <b>recorded in trust by mistake</b>, for example a consultation fee that was paid into the operating account. ${money(r.amount)} is taken out of ${esc(c.full_name || 'the client')}’s trust balance and recorded as a payment in the account you choose. You get a new receipt (PMT-…) and this one is marked as moved.</p>
          <div class="alert info" style="font-size:13px;margin-bottom:10px">If the money really is in the trust account and the work is now done, don’t use this: invoice the client and pay the invoice <b>from trust</b> (Sales &amp; Invoices → Receive payment → “Transfer from trust”).</div>
          <div class="field"><label>Money is in</label><select class="input" id="mv_acc">${opt(banks, accs.find((a) => a.system_key === 'operating_bank')?.id)}</select></div>
          ${(open || []).length ? `<div class="field"><label>Apply to open invoices</label>${open.map((i) => `<div class="row" style="gap:8px;margin-bottom:4px"><label class="row" style="gap:6px;min-width:220px"><input type="checkbox" data-inv="${i.id}"> ${esc(i.number)} · ${esc(fmtDate(i.issue_date))} · balance ${money(i.balance)}</label><input class="input" type="number" step="0.01" data-amt="${i.id}" style="max-width:120px" placeholder="0.00" data-max="${i.balance}"></div>`).join('')}</div>` : ''}
          <div class="field"><label>For the rest: what was it for? (a paid invoice is made for it)</label><div class="row-2"><select class="input" id="mv_item"><option value="">— Product / service —</option>${items.map((it) => `<option value="${it.id}">${esc(it.name)}</option>`).join('')}</select>
            <input class="input" id="mv_desc" placeholder="e.g. 1-hour consultation, Nov 27"></div></div>
          ${gstOn ? `<label class="row" style="gap:8px"><input type="checkbox" id="mv_gst"> GST is included in this amount (the client lives in Canada)</label>` : ''}
          <p class="dk-muted" style="font-size:13px;margin-top:8px" id="mv_sum"></p>${realMoney}`,
        onOpen: (m) => {
          const sum = () => { let ap = 0; m.querySelectorAll('[data-amt]').forEach((x) => { if (m.querySelector(`[data-inv="${x.dataset.amt}"]`).checked) ap += num(x.value); });
            m.querySelector('#mv_sum').textContent = `Applied to invoices: ${money(ap)} · New paid invoice: ${money(Math.max(0, num(r.amount) - ap))} · Total ${money(r.amount)}`; };
          let left = num(r.amount);
          m.querySelectorAll('[data-inv]').forEach((cb) => (cb.onchange = () => { const a = m.querySelector(`[data-amt="${cb.dataset.inv}"]`);
            if (cb.checked && !num(a.value)) { const used = [...m.querySelectorAll('[data-inv]:checked')].filter((x) => x !== cb).reduce((t, x) => t + num(m.querySelector(`[data-amt="${x.dataset.inv}"]`).value), 0);
              a.value = Math.min(num(a.dataset.max), Math.max(0, left - used)).toFixed(2); } if (!cb.checked) a.value = ''; sum(); }));
          m.querySelectorAll('[data-amt]').forEach((x) => (x.oninput = sum));
          m.querySelector('#mv_item').onchange = (e) => { const it = items.find((x) => x.id === e.target.value); if (it && !m.querySelector('#mv_desc').value) m.querySelector('#mv_desc').value = it.description || it.name; if (it && m.querySelector('#mv_gst')) m.querySelector('#mv_gst').checked = !!it.taxable; };
          sum();
        },
        actions: [{ label: 'Cancel' }, { label: 'Move out of trust', cls: 'btn-gold', onClick: async (m) => {
          const apps = [...m.querySelectorAll('[data-inv]:checked')].map((cb) => ({ invoice_id: cb.dataset.inv, amount: num(m.querySelector(`[data-amt="${cb.dataset.inv}"]`).value) })).filter((a) => a.amount > 0);
          const applied = apps.reduce((t, a) => t + a.amount, 0), desc = m.querySelector('#mv_desc').value.trim();
          if (applied > num(r.amount) + 0.001) throw new Error('The invoice amounts are more than the money received.');
          if (applied < num(r.amount) - 0.001 && !desc) throw new Error('Describe what the rest was for (or apply it all to invoices).');
          if (!(await confirmBox('Move out of trust', `Take ${money(r.amount)} out of the trust records and record it in ${m.querySelector('#mv_acc').selectedOptions[0].textContent}?`, 'Move'))) return false;
          const pid = await rpc('move_trust_to_operating', { p_trust: id, p_deposit_account: m.querySelector('#mv_acc').value, p_apps: apps,
            p_item: m.querySelector('#mv_item').value || null, p_desc: desc || null, p_gst_included: !!m.querySelector('#mv_gst')?.checked });
          clearFinCache(); toast('Moved out of trust. Here is the new receipt.');
          location.hash = `#/client-receipts/payment/${pid}`;
        } }] });
    } else {
      if (r.method === 'trust') return toast('This payment was paid out of trust for earned fees, so it is already in the operating account.');
      const trustBank = accs.find((a) => a.subtype === 'trust_bank');
      const invs = apps.map((a) => a.invoices?.number).filter(Boolean);
      modal({ title: `Change the account for ${model.number}`,
        body: `<div class="field"><label>Money is in</label><select class="input" id="mv_to"><option value="trust">${esc(trustBank?.name || 'Trust Bank Account (Client Funds)')} — it was a retainer</option>${opt(accs.filter((a) => a.subtype === 'bank' && a.active !== false), r.deposit_account_id)}</select></div>
          <div id="mv_note" class="dk-muted" style="font-size:13px"></div>${realMoney}`,
        onOpen: (m) => { const note = () => { m.querySelector('#mv_note').innerHTML = m.querySelector('#mv_to').value === 'trust'
            ? `This payment is voided and the money is recorded as a retainer in trust for ${esc(c.full_name || 'the client')}, with a new trust receipt (TRD-…).${invs.length ? ` Invoice ${esc(invs.join(', '))} becomes unpaid again: void it if it was only made for this payment.` : ''}`
            : 'The receipt stays the same; the books record that the money is in this account instead.'; };
          m.querySelector('#mv_to').onchange = note; note(); },
        actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-gold', onClick: async (m) => {
          const to = m.querySelector('#mv_to').value;
          if (to === 'trust') {
            if (!(await confirmBox('Move into trust', `Void ${model.number} and record ${money(r.amount)} as a retainer held in trust?`, 'Move into trust'))) return false;
            const tid = await rpc('move_payment_to_trust', { p_payment: id });
            clearFinCache(); toast('Moved into trust. Here is the new trust receipt.'); location.hash = `#/client-receipts/trust/${tid}`;
          } else {
            if (to === r.deposit_account_id) return;
            await rpc('change_payment_account', { p_payment: id, p_account: to }); clearFinCache(); toast('Account changed'); again();
          }
        } }] });
    }
  }
  el.querySelector('#from')?.addEventListener('click', () => modal({
    title: 'Received from',
    body: `<div class="field"><label>Name shown on the receipt</label><input class="input" id="rf" value="${esc(fromName)}"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${[c.full_name, payer?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map((v) => `<button class="btn btn-sm" type="button" data-v="${esc(v)}">${esc(v)}${v === c.full_name ? ' (client)' : ' (fee payer)'}</button>`).join('')}</div>`,
    onOpen: (m) => m.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => (m.querySelector('#rf').value = b.dataset.v))),
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
      const v = m.querySelector('#rf').value.trim(); if (!v) throw new Error('Enter a name.');
      await rpc('update_receipt', { p_kind: kind, p_id: id, p_received_from: v }); toast('Saved'); again();
    } }],
  }));
  el.querySelector('#mail')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget; b.disabled = true; toast('Preparing the PDF receipt…');
    let pdf;
    try { pdf = await receiptPdf(html); } catch (e) { b.disabled = false; return fail(e); }
    b.disabled = false;
    const first = String(fromName).split(' ')[0] || 'there';
    const body = `Hello ${first},\n\nThank you for your payment of ${money(r.amount)} received on ${fmtDate(model.date, { year: 'numeric', month: 'long', day: 'numeric' })}${model.client ? ` on behalf of ${model.client}` : ''}. Your official receipt is attached as a PDF, and the details are below.\n\nIf you have any questions, please reply to this email or call ${s.phone}.`;
    (await import('../crm.js')).composeEmail({ contact: { ...c, email }, to: email || '', subject: `Official receipt ${model.number} · ${s.business_name}`, body,
      html: (text) => receiptEmailHtml(model, text), files: [{ name: fileName, contentType: 'application/pdf', contentBytes: pdf.base64 }],
      onSent: async () => { await rpc('update_receipt', { p_kind: kind, p_id: id, p_sent: true }).catch(() => {}); again(); } });
  });
}
