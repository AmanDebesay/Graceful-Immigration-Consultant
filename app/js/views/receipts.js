// Receipts: upload photos/PDFs, Claude reads them, staff review and approve each one into an expense
// (posted through record_expense, the same as a manual expense). Receipt files stay attached.
import { db, can, esc, icon, fmtDate, toast, fail, callFn, rpc } from '../core.js';
import { accounts, acctOptions, isPayFrom, contactsList, contactOptions, money } from '../fin.js';

const STATUS = { processing: ['Reading…', 'p-blue'], ready: ['Ready to review', 'p-gold'], approved: ['In the books', 'p-green'], error: ['Needs attention', 'p-red'], discarded: ['Discarded', 'p-grey'] };

/** Shrinks large photos to ≤2000px JPEG (also converts formats the browser can decode, e.g. iPhone photos). */
async function prepare(file) {
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

export async function render(el) {
  const manage = can('finance.manage');
  let filter = 'review';
  const [accs, contacts] = await Promise.all([accounts(), contactsList()]);
  const expenseFilter = (a) => a.type === 'expense' || a.subtype === 'fixed_asset';
  const defaultPay = accs.find((a) => a.system_key === 'operating_bank')?.id;

  el.innerHTML = `${manage ? `<label class="rc-drop" id="drop">
      <input type="file" id="files" accept="image/*,application/pdf" multiple hidden>
      <span class="rc-drop-ico">${icon('camera')}</span>
      <span><b>Drop receipts here, or click to upload</b><small>Photos or PDFs, several at once. On a phone you can take a picture. Each receipt is read automatically and waits for your review.</small></span>
    </label>
    <div class="rc-mailbar" id="mailbar">${icon('mail')}<span>Or email receipts to <b id="rcBox">receipts@gracefulimmigration.ca</b> from your company address (forward them, or use it for Uber, Amazon and other e-receipts).</span>
      <small id="rcMailState" class="dk-muted"></small><button class="btn btn-sm" id="checkMail">Check email now</button></div>` : ''}
    <div class="toolbar"><div class="seg" id="flt">${[['review', 'For review'], ['approved', 'In the books'], ['all', 'All']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="grow"></div><span class="dk-muted" id="cnt"></span></div>
    <div id="grid" class="rc-grid"></div>`;

  const grid = el.querySelector('#grid');
  el.querySelectorAll('#flt button').forEach((b) => (b.onclick = () => { filter = b.dataset.k; draw(); }));

  async function draw() {
    el.querySelectorAll('#flt button').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    let q = db.from('receipts').select('*, expenses(id, voided)').order('created_at', { ascending: false }).limit(200);
    q = filter === 'review' ? q.in('status', ['processing', 'ready', 'error']) : filter === 'approved' ? q.eq('status', 'approved') : q.neq('status', 'discarded');
    const { data: rows, error } = await q;
    if (error) { grid.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    el.querySelector('#cnt').textContent = filter === 'review' ? `${rows.filter((r) => r.status === 'ready').length} ready to approve` : '';
    if (!rows.length) { grid.innerHTML = `<div class="dk-card dk-empty" style="grid-column:1/-1">${icon('file')}<p>${filter === 'review' ? 'No receipts waiting. Upload one above.' : 'Nothing here yet.'}</p></div>`; return; }
    const urls = {};
    const signed = await db.storage.from('receipts').createSignedUrls(rows.map((r) => r.file_path), 3600);
    (signed.data || []).forEach((s) => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
    grid.innerHTML = rows.map((r) => card(r, urls[r.file_path])).join('');
    rows.forEach((r) => wire(r));
  }

  function card(r, url) {
    const [label, cls] = STATUS[r.status] || [r.status, ''];
    const thumb = !url ? `<div class="rc-thumb">${icon('file')}</div>` : r.mime_type === 'application/pdf'
      ? `<a class="rc-thumb" href="${url}" target="_blank" rel="noopener">${icon('file')}<small>PDF · open</small></a>`
      : r.mime_type === 'text/plain' ? `<a class="rc-thumb" href="${url}" target="_blank" rel="noopener">${icon('mail')}<small>Email text · open</small></a>`
      : `<a class="rc-thumb" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Receipt"></a>`;
    const head = `<div class="rc-head"><span class="pill ${cls}">${label}</span>${r.source === 'email' ? `<span class="chip" title="${esc(r.email_subject || '')}">${icon('mail')} Emailed by ${esc(r.email_from || '')}</span>` : ''}<small>${esc(r.file_name || '')}</small></div>`;
    if (r.status === 'processing') return `<div class="dk-card rc-card" data-r="${r.id}">${head}<div class="rc-body">${thumb}<div class="rc-fields"><div class="loading" style="min-height:120px"><div class="spin"></div>Reading the receipt…</div></div></div></div>`;
    if (r.status === 'approved') return `<div class="dk-card rc-card done" data-r="${r.id}">${head}<div class="rc-body">${thumb}<div class="rc-fields">
        <h4>${esc(r.vendor || 'Receipt')}</h4><p class="dk-muted">${r.receipt_date ? fmtDate(r.receipt_date) : ''} · ${money(r.total)}${Number(r.tax) ? ` · GST ${money(r.tax)}` : ''}</p>
        <p>${esc(r.memo || '')}</p>${r.expenses?.voided ? '<span class="pill p-red">Expense voided</span>' : ''}<p class="dk-muted">Approved ${fmtDate(r.approved_at)} · <a href="#/expenses">View in Expenses</a></p></div></div></div>`;
    const ro = manage ? '' : 'disabled';
    return `<div class="dk-card rc-card" data-r="${r.id}">${head}<div class="rc-body">${thumb}<div class="rc-fields">
      ${r.status === 'error' ? `<div class="alert err">${esc(r.error || 'Could not read this receipt.')}</div>` : ''}
      ${r.ai_notes ? `<div class="alert info rc-note">${icon('sparkle')} ${esc(r.ai_notes)}</div>` : ''}
      <div class="row-2"><div class="field"><label>Vendor</label><input class="input" data-f="vendor" value="${esc(r.vendor || '')}" ${ro}></div>
        <div class="field"><label>Date</label><input class="input" type="date" data-f="receipt_date" value="${esc(r.receipt_date || '')}" ${ro}></div></div>
      <div class="row-2"><div class="field"><label>Total paid (incl. tax)</label><input class="input" type="number" step="0.01" data-f="total" value="${r.total ?? ''}" ${ro}></div>
        <div class="field"><label>GST/HST</label><input class="input" type="number" step="0.01" data-f="tax" value="${r.tax ?? 0}" ${ro}></div></div>
      <div class="field"><label>Category ${r.account_id ? '<span class="rc-ai">AI suggestion</span>' : ''}</label><select class="input" data-f="account_id" ${ro}>${acctOptions(accs, r.account_id, expenseFilter)}</select></div>
      <div class="row-2"><div class="field"><label>Paid from${r.payment_hint ? ` <small class="dk-muted">(${esc(r.payment_hint)})</small>` : ''}</label><select class="input" data-f="payment_account_id" ${ro}>${acctOptions(accs, r.payment_account_id || defaultPay, isPayFrom)}</select></div>
        <div class="field"><label>Client (if a disbursement)</label><select class="input" data-f="contact_id" ${ro}>${contactOptions(contacts, r.contact_id, 'None')}</select></div></div>
      <div class="field"><label>Memo</label><input class="input" data-f="memo" value="${esc(r.memo || '')}" ${ro}></div>
      ${(r.line_items || []).length ? `<details class="rc-lines"><summary>${r.line_items.length} line item${r.line_items.length > 1 ? 's' : ''}</summary>${r.line_items.map((l) => `<div><span>${esc(l.description)}</span><b>${l.amount == null ? '' : money(l.amount)}</b></div>`).join('')}</details>` : ''}
      ${r.currency && r.currency !== 'CAD' ? `<div class="alert err">This receipt is in ${esc(r.currency)}. Enter the Canadian-dollar amount charged to your card before approving.</div>` : ''}
      <div class="rc-dup" hidden></div>
      ${manage ? `<div class="row" style="justify-content:flex-end;gap:8px;margin-top:6px">
        <button class="btn btn-sm btn-ghost" data-a="discard">${icon('trash')} Discard</button>
        <button class="btn btn-sm" data-a="rescan">${icon('sparkle')} Read again</button>
        <button class="btn btn-sm btn-gold" data-a="approve" ${r.status === 'error' && !r.total ? '' : ''}>${icon('check')} Approve &amp; record</button></div>` : ''}
    </div></div></div>`;
  }

  async function wire(r) {
    const c = grid.querySelector(`[data-r="${r.id}"]`);
    if (!c || r.status === 'approved' || r.status === 'processing') return;
    const val = (f) => c.querySelector(`[data-f="${f}"]`)?.value;
    // Possible duplicate: an expense with the same date and total already in the books
    if (r.total && r.receipt_date) {
      const { data: d } = await db.from('expenses').select('id, payee').eq('expense_date', r.receipt_date).eq('amount', r.total).eq('voided', false).limit(1);
      if (d?.length) { const b = c.querySelector('.rc-dup'); b.hidden = false; b.innerHTML = `<div class="alert err">Possible duplicate: an expense for ${money(r.total)} on ${fmtDate(r.receipt_date)}${d[0].payee ? ` (${esc(d[0].payee)})` : ''} is already recorded.</div>`; }
    }
    // Save edits as you go
    c.querySelectorAll('[data-f]').forEach((i) => (i.onchange = async () => {
      const f = i.dataset.f; let v = i.value || null;
      if (['total', 'tax'].includes(f)) v = v === null ? null : Number(v);
      const { error } = await db.from('receipts').update({ [f]: v }).eq('id', r.id); if (error) fail(error);
    }));
    c.querySelector('[data-a="discard"]')?.addEventListener('click', async () => {
      if (!confirm('Discard this receipt? It will not be recorded.')) return;
      await db.from('receipts').update({ status: 'discarded' }).eq('id', r.id); toast('Receipt discarded'); draw();
    });
    c.querySelector('[data-a="rescan"]')?.addEventListener('click', () => scan(r.id));
    c.querySelector('[data-a="approve"]')?.addEventListener('click', async (e) => {
      const total = Number(val('total')), tax = Number(val('tax') || 0);
      if (!val('receipt_date')) return fail(new Error('Enter the receipt date.'));
      if (!(total > 0)) return fail(new Error('Enter the total paid.'));
      if (!val('account_id')) return fail(new Error('Choose a category.'));
      e.target.disabled = true;
      try {
        const vendorName = val('vendor')?.trim() || null;
        const expenseId = await rpc('record_expense', { p: { date: val('receipt_date'), vendor_id: r.vendor_id, payee: vendorName, account_id: val('account_id'),
          payment_account_id: val('payment_account_id'), amount: total, tax, memo: val('memo') || vendorName || 'Receipt', contact_id: val('contact_id') || null,
          reference: r.receipt_number || null } });
        const { error } = await db.from('receipts').update({ status: 'approved', expense_id: expenseId, total, tax, approved_at: new Date().toISOString(),
          approved_by: (await db.auth.getUser()).data.user.id }).eq('id', r.id);
        if (error) throw error;
        toast('Expense recorded'); window.dispatchEvent(new Event('books-changed')); draw();
      } catch (err) { fail(err); e.target.disabled = false; }
    });
  }

  async function scan(id) {
    await db.from('receipts').update({ status: 'processing' }).eq('id', id);
    draw();
    try { await callFn('receipt-scan', { receipt_id: id }); } catch (err) { toast(err.message, true); }
    if (el.isConnected) draw();
  }

  async function upload(files) {
    const list = [...files].slice(0, 20);
    if (!list.length) return;
    filter = 'review';
    const ids = [];
    for (const f of list) {
      try {
        if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name} is larger than 25 MB.`);
        const p = await prepare(f);
        if (p.blob.size > 10 * 1024 * 1024) throw new Error(`${f.name} is still larger than 10 MB after compressing.`);
        const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${p.ext}`;
        const { error: ue } = await db.storage.from('receipts').upload(path, p.blob, { contentType: p.type });
        if (ue) throw ue;
        const { data, error } = await db.from('receipts').insert({ file_path: path, file_name: f.name.slice(0, 120), mime_type: p.type }).select('id').single();
        if (error) throw error;
        ids.push(data.id);
      } catch (err) { fail(err); }
    }
    if (!ids.length) return;
    toast(`${ids.length} receipt${ids.length > 1 ? 's' : ''} uploaded — reading now…`);
    draw();
    await readAll(ids);
  }

  // Reads receipts up to 3 at a time
  async function readAll(ids) {
    const queue = [...ids];
    const worker = async () => { while (queue.length) { const id = queue.shift(); try { await callFn('receipt-scan', { receipt_id: id }); } catch (err) { /* shown on the card */ } if (el.isConnected) draw(); } };
    await Promise.all([worker(), worker(), worker()]);
  }

  // Receipts emailed to the receipts mailbox
  async function checkMail(quiet) {
    const state = el.querySelector('#rcMailState'), btn = el.querySelector('#checkMail');
    if (!state) return;
    btn.disabled = true; state.textContent = 'Checking…';
    try {
      const r = await callFn('receipt-inbox', {});
      el.querySelector('#rcBox').textContent = r.mailbox;
      state.textContent = `Checked ${new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}${r.skipped ? ` · ${r.skipped} ignored (not from a company address)` : ''}`;
      if (r.created.length) { toast(`${r.created.length} emailed receipt${r.created.length > 1 ? 's' : ''} imported — reading now…`); filter = 'review'; draw(); await readAll(r.created); }
      else if (!quiet) toast('No new receipts in the mailbox');
    } catch (err) { state.textContent = err.message; }
    btn.disabled = false;
  }
  el.querySelector('#checkMail')?.addEventListener('click', () => checkMail(false));

  const drop = el.querySelector('#drop');
  if (drop) {
    el.querySelector('#files').onchange = (e) => { upload(e.target.files); e.target.value = ''; };
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload(e.dataTransfer.files));
  }
  draw();
  if (manage) checkMail(true);
}
