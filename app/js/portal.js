// Client portal: what an invited client sees after signing in. Everything comes from the "portal" function,
// which only returns this client's own file.
import { db, esc, icon, fmtDate, fmtDateTime, toast, fail, callFn, modal } from './core.js';

const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const CASE_STEPS = [['open', 'File opened'], ['in_progress', 'Preparing'], ['submitted', 'Submitted'], ['decision_pending', 'Waiting for decision'], ['done', 'Decision']];
const AGR_KIND = { consultation: 'Initial Consultation Agreement', retainer: 'Service Agreement', amendment: 'Amendment', non_engagement: 'Letter', termination: 'Letter' };
const call = (action, p = {}) => callFn('portal', { action, ...p });

export async function renderPortal(app) {
  let tab = sessionStorage.getItem('gi_portal_tab') || 'home', data = null, poll = null;
  app.innerHTML = `<div class="cp">
    <header class="cp-top"><div class="cp-in">
      <img src="../public/img/logo-emblem.png" alt="" class="cp-logo"><div class="cp-brand"><b>Graceful Immigration</b><span>Client portal</span></div>
      <div class="cp-grow"></div><span class="cp-me" id="me"></span><button class="cp-out" id="out">${icon('logout')} <span>Sign out</span></button></div></header>
    <nav class="cp-tabs" id="tabs"><div class="cp-in">${[['home', 'Overview', 'home'], ['agreements', 'Agreements', 'file'], ['documents', 'Documents', 'folder'], ['invoices', 'Invoices', 'dollar'], ['messages', 'Messages', 'chat']]
      .map(([k, l, ic]) => `<button data-t="${k}">${icon(ic)}<span>${l}</span><em data-badge="${k}" hidden></em></button>`).join('')}</div></nav>
    <main class="cp-main"><div class="cp-in" id="body"><div class="loading"><div class="spin"></div>Loading your file…</div></div></main>
    <footer class="cp-foot"><div class="cp-in" id="foot"></div></footer></div>`;
  const $ = (s) => app.querySelector(s);
  $('#out').onclick = async () => { await db.auth.signOut(); location.reload(); };
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };

  async function load() {
    data = await call('home');
    $('#me').textContent = data.me.name;
    const f = data.firm || {};
    $('#foot').innerHTML = `<b>${esc(f.business_name || 'Graceful Immigration Consultant Inc.')}</b> · ${esc(f.rcic_name || '')}, RCIC · College ID ${esc(f.licence_number || '')}<br>
      <a href="tel:${esc(f.phone || '')}">${esc(f.phone || '')}</a> · <a href="mailto:${esc(f.email || '')}">${esc(f.email || '')}</a> · Your information is kept confidential and stored in Canada.`;
    const todo = { agreements: data.agreements.filter((a) => a.sign_url).length, documents: data.needed.filter((n) => !n.sent).length, invoices: data.invoices.filter((i) => +i.balance > 0).length };
    Object.entries(todo).forEach(([k, n]) => { const b = app.querySelector(`[data-badge="${k}"]`); b.hidden = !n; b.textContent = n; });
  }
  async function show(t) {
    tab = t; sessionStorage.setItem('gi_portal_tab', t);
    clearInterval(poll); poll = null;
    app.querySelectorAll('#tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    const body = $('#body');
    if (!data) { try { await load(); } catch (e) { body.innerHTML = `<div class="cp-card cp-err">${esc(e.message)}</div>`; return; } }
    ({ home, agreements, documents, invoices, messages })[t](body);
    window.scrollTo({ top: 0 });
  }
  const refresh = async () => { data = null; await show(tab); };

  // ── Overview ──
  function home(el) {
    const first = (data.me.name || '').split(' ')[0] || 'there';
    const sign = data.agreements.filter((a) => a.sign_url), need = data.needed.filter((n) => !n.sent), owing = data.invoices.filter((i) => +i.balance > 0);
    const lastStaff = [...data.messages].reverse().find((m) => !m.mine);
    const tasks = [
      ...sign.map((a) => `<a class="cp-task" href="${esc(a.sign_url)}" target="_blank" rel="noopener">${icon('file')}<span><b>Sign your ${esc(AGR_KIND[a.type] || 'agreement')}</b><small>${esc(a.number)} · sent ${fmtDate(a.sent_at)}</small></span><i>Review & sign →</i></a>`),
      ...(need.length ? [`<button class="cp-task" data-go="documents">${icon('folder')}<span><b>Send ${need.length} document${need.length > 1 ? 's' : ''}</b><small>${esc(need.slice(0, 3).map((n) => n.label).join(', '))}${need.length > 3 ? '…' : ''}</small></span><i>Upload →</i></button>`] : []),
      ...owing.map((i) => `<button class="cp-task" data-inv="${i.id}">${icon('dollar')}<span><b>Invoice ${esc(i.number)}: ${money(i.balance)} to pay</b><small>Due ${fmtDate(i.due_date)}</small></span><i>View →</i></button>`),
    ];
    el.innerHTML = `<section class="cp-hero"><h1>Hello, ${esc(first)}</h1><p>This is your secure space with Graceful Immigration. Here you can sign agreements, send documents, see invoices and message our office.</p></section>
      <div class="cp-grid">
        <div class="cp-card"><h2>${icon('checksq')} Your to-do list</h2>${tasks.length ? `<div class="cp-tasks">${tasks.join('')}</div>` : `<p class="cp-muted">You're all set. Nothing needs your attention right now.</p>`}</div>
        <div class="cp-card"><h2>${icon('chat')} Messages</h2>${lastStaff ? `<p class="cp-quote">“${esc(lastStaff.body.slice(0, 220))}${lastStaff.body.length > 220 ? '…' : ''}”</p><p class="cp-muted">${esc(lastStaff.who)} · ${fmtDateTime(lastStaff.at)}</p>` : '<p class="cp-muted">No messages yet. Questions about your file? Send us a message.</p>'}
          <button class="cp-btn" data-go="messages">Open messages</button></div>
      </div>
      <div class="cp-card"><h2>${icon('briefcase')} Your file</h2>${data.cases.length ? data.cases.map(caseHTML).join('') : '<p class="cp-muted">Your application file will appear here once we open it.</p>'}</div>`;
    el.onclick = (e) => { const g = e.target.closest('[data-go]'); if (g) return show(g.dataset.go); const v = e.target.closest('[data-inv]'); if (v) openInvoice(v.dataset.inv).catch(fail); };
  }
  function caseHTML(c) {
    const done = ['approved', 'refused', 'withdrawn', 'closed'].includes(c.status);
    const at = done ? 4 : Math.max(0, CASE_STEPS.findIndex(([k]) => k === c.status));
    const label = { approved: 'Approved', refused: 'Refused', withdrawn: 'Withdrawn', closed: 'Closed' }[c.status];
    return `<div class="cp-case"><div class="cp-case-h"><b>${esc(c.title || c.application_type || 'Application')}</b><small>File ${esc(c.case_number)}${c.submitted_on ? ` · submitted ${fmtDate(c.submitted_on)}` : ''}</small></div>
      <div class="cp-steps">${CASE_STEPS.map(([, l], i) => `<div class="${i < at ? 'done' : i === at ? 'cur' : ''}"><i>${i < at ? '✓' : i + 1}</i><span>${i === 4 && label ? label : l}</span></div>`).join('')}</div></div>`;
  }

  // ── Agreements ──
  function agreements(el) {
    el.innerHTML = `<div class="cp-card"><h2>${icon('file')} Your agreements</h2><p class="cp-muted">Agreements are signed online. Signed copies are kept here for you.</p>
      ${data.agreements.length ? data.agreements.map((a) => `<div class="cp-row"><span class="cp-ico">${icon('file')}</span><span class="cp-rt"><b>${esc(a.title || AGR_KIND[a.type])}</b><small>${esc(a.number)} · ${a.status === 'signed' ? `signed ${fmtDate(a.signed_at)}` : `sent ${fmtDate(a.sent_at)}`}</small></span>
        ${a.status === 'signed' ? `<span class="cp-chip ok">Signed</span><button class="cp-btn sm" data-agr="${a.id}">Download</button>` : a.sign_url ? `<span class="cp-chip wait">To sign</span><a class="cp-btn sm gold" href="${esc(a.sign_url)}" target="_blank" rel="noopener">Review & sign</a>` : '<span class="cp-chip">Link expired: message us for a new one</span>'}</div>`).join('')
        : '<p class="cp-muted">No agreements yet.</p>'}</div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-agr]'); if (b) openAgreement(b.dataset.agr, b).catch(fail); };
  }
  async function openAgreement(id, btn) {
    btn.disabled = true;
    try {
      const r = await call('agreement_open', { id });
      if (r.url) { location.href = r.url; return; }
      const { withSignatures } = await import('./agreement-templates.js');
      printHtml(withSignatures(r.agreement.body_html || '', r.agreement), r.agreement.number);
    } finally { btn.disabled = false; }
  }

  // ── Documents ──
  function documents(el) {
    const need = data.needed;
    el.innerHTML = `<div class="cp-card"><h2>${icon('checksq')} Documents we need from you</h2>
        ${need.length ? `<p class="cp-muted">Upload a clear scan or photo of each document. PDF, JPG, PNG or Word, up to 50 MB.</p>${need.map((n) => `<div class="cp-row"><span class="cp-ico ${n.sent ? 'ok' : ''}">${n.sent ? '✓' : icon('file')}</span>
          <span class="cp-rt"><b>${esc(n.label)}</b><small>${n.sent ? 'Received. We will review it.' : esc(n.note || n.section || n.list)}</small></span>
          <button class="cp-btn sm ${n.sent ? '' : 'gold'}" data-up="${n.id}">${n.sent ? 'Send another' : 'Upload'}</button></div>`).join('')}`
        : '<p class="cp-muted">We don\'t need any documents from you right now.</p>'}
        <div class="cp-drop" id="drop">${icon('folder')}<div><b>Send us another document</b><small>Drag a file here, or choose one</small></div><button class="cp-btn sm" data-up="">Choose file</button></div></div>
      <div class="cp-card"><h2>${icon('folder')} Your documents</h2>
        ${data.documents.length ? data.documents.map((d) => `<div class="cp-row"><span class="cp-ico">${icon('file')}</span><span class="cp-rt"><b>${esc(d.doc_type || d.name)}</b><small>${esc(d.name)} · ${d.from_client ? 'sent by you' : 'shared by our office'} · ${fmtDate(d.created_at)}</small></span>
          <button class="cp-btn sm" data-doc="${d.id}">Open</button></div>`).join('') : '<p class="cp-muted">Documents you send us, and documents our office shares with you, appear here.</p>'}</div>
      <input type="file" id="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx,.txt,image/*">`;
    let target = '';
    const file = el.querySelector('#file');
    el.onclick = (e) => {
      const u = e.target.closest('[data-up]'); if (u) { target = u.dataset.up; file.click(); return; }
      const d = e.target.closest('[data-doc]'); if (d) call('doc_open', { id: d.dataset.doc }).then((r) => window.open(r.url, '_blank', 'noopener')).catch(fail);
    };
    file.onchange = () => { upload([...file.files], target); file.value = ''; };
    const drop = el.querySelector('#drop');
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files], ''); };
  }
  async function upload(files, itemId) {
    if (!files.length) return;
    const { putChunks } = await import('./files.js');
    const m = modal({ title: 'Sending your documents', body: '<div id="up"></div>' });
    const box = m.el.querySelector('#up');
    let ok = 0;
    for (const f of files) {
      const row = document.createElement('div'); row.className = 'cp-up'; row.innerHTML = `<b>${esc(f.name)}</b><div class="cp-bar"><i></i></div><small>Uploading…</small>`; box.appendChild(row);
      try {
        if (!f.size) throw new Error('This file is empty.');
        const { upload_url } = await call('upload_session', { file_name: f.name, size: f.size, checklist_item_id: itemId || null });
        const item = await putChunks(upload_url, f, (p) => (row.querySelector('i').style.width = `${Math.round(p * 100)}%`));
        await call('register', { item_id: item.id, checklist_item_id: itemId || null });
        row.querySelector('small').textContent = 'Sent ✓'; row.classList.add('ok'); ok++;
      } catch (e) { row.querySelector('small').textContent = e.message; row.classList.add('bad'); }
    }
    if (ok) { toast(`${ok} document${ok > 1 ? 's' : ''} sent. Thank you!`); setTimeout(() => m.close(), 900); await refresh(); }
  }

  // ── Invoices ──
  function invoices(el) {
    const f = data.firm || {};
    el.innerHTML = `<div class="cp-card"><h2>${icon('dollar')} Your invoices</h2>
      ${data.invoices.length ? data.invoices.map((i) => `<div class="cp-row"><span class="cp-ico">${icon('dollar')}</span><span class="cp-rt"><b>Invoice ${esc(i.number)}</b><small>${fmtDate(i.issue_date)} · total ${money(i.total)}${+i.balance > 0 ? ` · due ${fmtDate(i.due_date)}` : ''}</small></span>
        ${+i.balance > 0 ? `<span class="cp-chip wait">${money(i.balance)} to pay</span>` : '<span class="cp-chip ok">Paid</span>'}<button class="cp-btn sm" data-inv="${i.id}">View</button></div>`).join('') : '<p class="cp-muted">No invoices yet.</p>'}</div>
      <div class="cp-card cp-pay"><h2>${icon('check')} How to pay</h2><p><b>Interac e-Transfer</b> to <b>${esc(f.email || 'info@gracefulimmigration.ca')}</b>. Please put the invoice number in the message.</p>
        <p class="cp-muted">Prefer another way? Call us at ${esc(f.phone || '')}. Payments usually show here within one business day.</p></div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-inv]'); if (b) openInvoice(b.dataset.inv).catch(fail); };
  }
  async function openInvoice(id) {
    const { invoice: i, lines, firm: f, client } = await call('invoice', { id });
    const html = `<div class="inv"><div class="inv-h"><img src="${location.origin}/public/img/logo-emblem.png" alt=""><div><b>${esc(f.business_name)}</b><span>${esc(f.address || '')}<br>${esc(f.phone || '')} · ${esc(f.email || '')}${f.gst_number ? `<br>GST/HST no. ${esc(f.gst_number)}` : ''}</span></div>
      <div class="inv-t"><h1>INVOICE</h1><span>No. <b>${esc(i.number)}</b><br>Date ${fmtDate(i.issue_date)}<br>Due ${fmtDate(i.due_date)}</span></div></div>
      <div class="inv-to"><small>BILL TO</small><b>${esc(client.name)}</b><br>${esc(client.email || '')}</div>
      <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
      ${lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${+l.quantity}</td><td class="r">${money(l.unit_price)}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(i.subtotal)}</td></tr><tr><td colspan="3" class="r">GST</td><td class="r">${money(i.tax_total)}</td></tr>
        <tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>${money(i.total)}</b></td></tr><tr><td colspan="3" class="r">Paid</td><td class="r">${money(i.amount_paid)}</td></tr>
        <tr class="due"><td colspan="3" class="r"><b>Balance due</b></td><td class="r"><b>${money(i.balance)}</b></td></tr></tfoot></table>
      ${i.notes ? `<p>${esc(i.notes)}</p>` : ''}<p class="inv-terms">${esc(i.terms || '')}<br>Pay by Interac e-Transfer to ${esc(f.email || '')} with the invoice number in the message.</p></div>`;
    const m = modal({ title: `Invoice ${i.number}`, wide: true, body: `<div class="cp-invwrap">${html}</div>`,
      actions: [{ label: 'Close' }, { label: 'Print or save PDF', cls: 'btn-primary', onClick: () => { printHtml(`<style>${INV_CSS}</style>${html}`, `Invoice ${i.number}`); return false; } }] });
    m.el.querySelector('.cp-invwrap').insertAdjacentHTML('afterbegin', `<style>${INV_CSS}</style>`);
  }

  // ── Messages ──
  function messages(el) {
    el.innerHTML = `<div class="cp-card cp-chat"><h2>${icon('chat')} Messages with our office</h2><p class="cp-muted">Secure and private. We usually reply within 2 business days. For anything urgent, call ${esc(data.firm?.phone || 'the office')}.</p>
      <div class="cp-thread" id="th"></div>
      <form class="cp-send" id="sf"><textarea id="msg" rows="3" maxlength="5000" placeholder="Write your message…" required></textarea><button class="cp-btn gold" type="submit">${icon('send')} Send</button></form></div>`;
    const draw = () => {
      const th = el.querySelector('#th');
      th.innerHTML = data.messages.length ? data.messages.map((m) => `<div class="cp-msg ${m.mine ? 'me' : ''}"><div class="cp-bub">${esc(m.body).replace(/\n/g, '<br>')}</div><small>${m.mine ? 'You' : esc(m.who)} · ${fmtDateTime(m.at)}</small></div>`).join('')
        : '<p class="cp-muted" style="text-align:center;padding:20px">No messages yet. Send the first one below.</p>';
      th.scrollTop = th.scrollHeight;
    };
    draw();
    el.querySelector('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const t = el.querySelector('#msg'), btn = e.target.querySelector('button');
      if (!t.value.trim()) return;
      btn.disabled = true;
      try { await call('send', { body: t.value }); t.value = ''; data = await call('home'); draw(); } catch (er) { fail(er); } finally { btn.disabled = false; }
    };
    poll = setInterval(async () => { if (tab !== 'messages' || !app.isConnected) return clearInterval(poll); try { const n = await call('home'); if (n.messages.length !== data.messages.length) { data = n; draw(); } } catch { /* next time */ } }, 30000);
  }

  function printHtml(html, title) {
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups for this site to print', true);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:24px;background:#fff}@media print{body{margin:0}}</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  }
  show(tab);
}

const INV_CSS = `.inv{font-family:Arial,Helvetica,sans-serif;color:#1C2333;font-size:13.5px;max-width:760px;margin:0 auto}
.inv-h{display:flex;gap:16px;align-items:flex-start;border-bottom:3px double #C9A24A;padding-bottom:14px}.inv-h img{width:64px}.inv-h b{display:block;font-family:Georgia,serif;font-size:20px;color:#0B2A5C}.inv-h span{font-size:12px;color:#5B6476}
.inv-h>div:nth-child(2){flex:1}.inv-t{text-align:right}.inv-t h1{font-family:Georgia,serif;letter-spacing:.14em;color:#0B2A5C;font-size:24px;margin:0 0 4px}.inv-t span{font-size:12px;color:#3B4456}
.inv-to{margin:18px 0 12px}.inv-to small{display:block;font-size:10px;letter-spacing:.16em;color:#9A7420;font-weight:700}.inv-to b{font-size:15px;color:#0B2A5C}
.inv table{width:100%;border-collapse:collapse;margin:10px 0}.inv th,.inv td{padding:8px 10px;border-bottom:1px solid #E3DCCD;text-align:left}.inv thead th{background:#0B2A5C;color:#fff;font-weight:600}
.inv .r{text-align:right}.inv tfoot td{border:0;padding:4px 10px}.inv tr.due td{background:#FBF1DC;border-top:2px solid #C9A24A;padding:8px 10px;color:#0B2A5C}.inv-terms{font-size:12px;color:#5B6476;margin-top:16px}`;
