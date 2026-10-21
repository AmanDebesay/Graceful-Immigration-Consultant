import { db, state, can, esc, icon, fmtDateTime, rpc, toast, fail, modal, confirmBox } from '../core.js';
import { render as renderDoc, requiredMissing, withSignatures, certificate } from '../agreement-templates.js';
import { agrBadge, AGR_TYPE } from './agreements.js';

export async function signaturePad(container) {
  container.innerHTML = `<div class="seg" style="margin-bottom:8px"><button type="button" data-m="draw" class="on">Draw</button><button type="button" data-m="type">Type</button></div>
    <div data-p="draw"><canvas width="520" height="150" style="width:100%;max-width:520px;height:150px;border:1px dashed #B9C2D3;border-radius:10px;background:#fff;touch-action:none"></canvas>
      <div><button type="button" class="btn btn-sm" data-clear>Clear</button></div></div>
    <div data-p="type" hidden><input class="input" placeholder="Type your full name" style="font-family:'Brush Script MT',cursive;font-size:28px"></div>`;
  let mode = 'draw', drawn = false;
  const cv = container.querySelector('canvas'), ctx = cv.getContext('2d');
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#0B2A5C';
  let down = false;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.onpointerdown = (e) => { down = true; drawn = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  cv.onpointermove = (e) => { if (!down) return; ctx.lineTo(...pos(e)); ctx.stroke(); };
  cv.onpointerup = () => { down = false; };
  container.querySelector('[data-clear]').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; };
  container.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
    mode = b.dataset.m; container.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b));
    container.querySelector('[data-p="draw"]').hidden = mode !== 'draw'; container.querySelector('[data-p="type"]').hidden = mode !== 'type';
  }));
  return () => mode === 'draw' ? (drawn ? cv.toDataURL('image/png') : '') : container.querySelector('[data-p="type"] input').value.trim();
}

const signLink = (token) => `${location.origin}${location.pathname.replace(/app\/?.*$/, '')}public/sign.html?t=${token}`;

export async function render(el, [id], { setTitle }) {
  const { data: a, error } = await db.from('agreements').select('*, contacts(id, full_name, email, phone), cases(case_number)').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Agreement not found.</div>'; return; }
  setTitle(`${a.number} · ${AGR_TYPE[a.type]}`);
  const manage = can('agreements.manage');
  if (a.status === 'draft' && manage) return editor(el, a, setTitle);

  const { data: events } = await db.from('agreement_events').select('*').eq('agreement_id', id).order('created_at');
  const doc = withSignatures(a.body_html || '', a);
  el.innerHTML = `<div class="toolbar no-print"><a class="btn btn-sm" href="#/agreements">← Agreements</a>${agrBadge(a.status)}<div class="grow"></div>
      <a class="btn" href="#/contacts/${a.contact_id}">${icon('user')} ${esc(a.contacts?.full_name || '')}</a>
      <button class="btn" onclick="window.print()">${icon('file')} Print / PDF</button>
      ${manage && ['sent', 'viewed'].includes(a.status) ? `<button class="btn btn-primary" id="share">${icon('mail')} Share signing link</button>` : ''}
      ${manage && a.status !== 'void' ? `<button class="btn btn-danger" id="void">Void</button>` : ''}</div>
    ${a.status === 'void' ? `<div class="alert err no-print">Voided ${fmtDateTime(a.voided_at)}: ${esc(a.void_reason || '')}</div>` : ''}
    <div class="grid g-main">
      <div class="card" style="padding:34px 30px"><div id="doc">${doc}</div>${a.status === 'signed' ? certificate(a, events || []) : ''}</div>
      <div class="grid no-print" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Progress</h3></div><div class="card-b timeline">
          ${(events || []).map((v) => `<div class="tl"><div class="tl-dot">${icon(v.event === 'signed' ? 'check' : v.event === 'viewed' ? 'search' : v.event === 'voided' ? 'x' : 'file')}</div>
            <div class="tl-body"><div class="meta">${fmtDateTime(v.created_at)}${v.ip ? ' · IP ' + esc(v.ip) : ''}</div><b>${esc({ created: 'Draft created', sent: 'Signed by RCIC and sent', viewed: 'Opened by client', signed: 'Signed by client', voided: 'Voided', link_renewed: 'Signing link renewed' }[v.event] || v.event)}</b>
            ${v.details?.signed_by ? ` · ${esc(v.details.signed_by)}` : ''}${v.details?.name ? ` · ${esc(v.details.name)}` : ''}</div></div>`).join('')}</div></div>
        ${a.body_sha256 ? `<div class="card"><div class="card-b" style="font-size:12px;word-break:break-all"><b>Document fingerprint (SHA-256)</b><br>${esc(a.body_sha256)}</div></div>` : ''}
        ${a.status === 'signed' ? `<div class="alert ok">Signed ${fmtDateTime(a.client_signed_at)}. RA 5.5: send the client a copy of the signed agreement by email and keep the confirmation on file.</div>
          ${a.contacts?.email ? `<a class="btn btn-primary" href="mailto:${esc(a.contacts.email)}?subject=${encodeURIComponent(`Your signed ${AGR_TYPE[a.type]} (${a.number})`)}&body=${encodeURIComponent(`Hello ${a.contacts.full_name.split(' ')[0]},\n\nThank you for signing. Your signed copy of ${a.number} is available at this secure link (valid until ${new Date(a.token_expires_at).toLocaleDateString('en-CA')}):\n\n${signLink(a.signing_token)}\n\nYou can print it or save it as a PDF from that page.\n\nKind regards,\n${a.rcic_name}`)}">${icon('mail')} Email signed copy to client</a>` : ''}` : ''}
      </div></div>`;
  el.querySelector('#share')?.addEventListener('click', () => shareModal(a.signing_token, a));
  el.querySelector('#void')?.addEventListener('click', () => modal({
    title: `Void ${a.number}`, body: `<p style="margin-bottom:10px">The signing link stops working and the agreement is kept for your records. To change terms, void it and create a new one.</p><div class="field"><label>Reason</label><input class="input" id="r"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Void agreement', cls: 'btn-danger', onClick: async (m) => { await rpc('void_agreement', { p_id: id, p_reason: m.querySelector('#r').value || null }); toast('Agreement voided'); render(el, [id], { setTitle }); } }],
  }));
}

function shareModal(token, a) {
  const link = signLink(token);
  const first = (a.contacts?.full_name || '').split(' ')[0];
  const msg = `Hello ${first}, please review and sign your ${AGR_TYPE[a.type]} (${a.number}) from Graceful Immigration Consultant Inc. here: ${link}  The link is private to you and valid for 30 days.`;
  modal({
    title: 'Send to client for signature',
    body: `<p style="margin-bottom:10px">Share this private link with <b>${esc(a.contacts?.full_name || '')}</b>. Anyone with the link can view and sign, so send it only to the client.</p>
      <div class="row" style="flex-wrap:nowrap"><input class="input" id="lk" value="${esc(link)}" readonly><button class="btn" id="cp">Copy</button></div>
      <div class="row" style="margin-top:14px">
        ${a.contacts?.email ? `<a class="btn btn-primary" href="mailto:${esc(a.contacts.email)}?subject=${encodeURIComponent(`Please sign: ${AGR_TYPE[a.type]} ${a.number}`)}&body=${encodeURIComponent(msg)}">${icon('mail')} Email link</a>` : ''}
        ${a.contacts?.phone ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${String(a.contacts.phone).replace(/\D/g, '').replace(/^(?=\d{10}$)/, '1')}?text=${encodeURIComponent(msg)}">WhatsApp link</a>` : ''}
        <button class="btn" id="rn">Issue new link</button></div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px">Sending by email from the dashboard itself will be enabled once your email service is connected.</p>`,
    onOpen: (m) => {
      m.querySelector('#cp').onclick = async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast('Link copied'); };
      m.querySelector('#rn').onclick = async () => { try { const r = await rpc('renew_agreement_link', { p_id: a.id }); toast('New link issued — the old link no longer works'); m.closest('.overlay').remove(); shareModal(r.token, a); } catch (e) { fail(e); } };
    },
  });
}

async function editor(el, a, setTitle) {
  const d = { ...a.data };
  const T = a.type;
  const f = (k, label, type = 'text', extra = '') => `<div class="field"><label>${label}</label>${type === 'textarea'
    ? `<textarea class="input" data-k="${k}" ${extra}>${esc(d[k] ?? '')}</textarea>` : `<input class="input" type="${type}" data-k="${k}" value="${esc(d[k] ?? '')}" ${extra}>`}</div>`;
  const sec = (title, inner, open = false) => `<details class="agr-sec" ${open ? 'open' : ''}><summary>${title}</summary><div class="agr-sec-b">${inner}</div></details>`;
  const msRows = () => (d.milestones || []).map((m, i) => `<div class="ms-row" data-i="${i}"><input class="input" data-m="name" placeholder="Milestone" value="${esc(m.name)}">
    <input class="input" data-m="included" placeholder="What is included" value="${esc(m.included)}"><input class="input" data-m="fee" type="number" step="0.01" placeholder="Fee" value="${esc(m.fee)}" style="max-width:110px">
    <button class="btn btn-ghost btn-sm" data-delm="${i}" aria-label="Remove">${icon('trash')}</button></div>`).join('');

  const parties = sec('Parties & date', `<div class="row-2">${f('agreement_date', 'Agreement date', 'date')}${f('language', 'Language of service (English or French)')}</div>
    <div class="row-2">${f('client_name', 'Client full legal name')}${f('client_dob', 'Client date of birth', 'date')}</div>
    ${f('client_address', 'Client home address')}<div class="row-2">${f('client_phone', 'Client phone')}${f('client_email', 'Client email')}</div>
    <div class="row-2">${f('rcic_name', 'RCIC name')}${f('rcic_id', 'College ID')}</div>${f('business_name', 'Business name')}${f('business_address', 'Business address (street, city, postal code)')}
    <div class="row-2">${f('business_phone', 'Business phone')}${f('business_email', 'Business email')}</div>
    <div class="row-2">${f('gst_rate', 'GST rate % (0 = not applicable)', 'number', 'step="0.01"')}${f('province', 'Governing law (province)')}</div>`, true);
  const body = T === 'consultation'
    ? parties + sec('Consultation', `${f('purpose', 'Purpose of the consultation', 'textarea')}<div class="row-2">${f('consult_date', 'Consultation date', 'date')}${f('consult_length', 'Length')}</div>
      <div class="row-2">${f('consult_method', 'Method (phone, video, in person)')}${f('fee', 'Fee before tax (CAD)', 'number', 'step="0.01"')}</div>${f('payment_method', 'Payment method')}`, true)
    : parties
      + sec('1–2. Preliminary advice & general provisions', `${f('file_number', 'File number')}${f('preliminary_advice', 'Summary of preliminary advice given to the client', 'textarea', 'rows="4"')}
        ${f('consultation_ref', 'Initial Consultation Agreement no. (if any)')}${f('assistants', 'People who will assist (names and their role)')}
        <div class="row-2">${f('response_time', 'Respond to client inquiries within')}${f('update_time', 'Share government updates within')}</div>${f('comm_methods', 'How you will communicate')}`)
      + sec('3–6. Services, instructions & exclusions', `${f('program', 'Immigration/citizenship category and program (be specific, e.g. “Permanent Residence — Family Class, spousal, outland”)')}
        ${f('scope', 'Scope of services & major steps (one per line)', 'textarea', 'rows="6"')}${f('timeframes', 'Estimated timeframes (one per line)', 'textarea', 'rows="3"')}
        ${f('instructions', 'Client instructions', 'textarea')}${f('designate', 'Designate who may receive updates (name and access)')}${f('excluded', 'Services NOT included (one per line)', 'textarea', 'rows="3"')}`)
      + sec('7. Fees & billing method', `<div class="field"><label>Billing method (choose one — cannot be switched later)</label><select class="input" data-k="billing">
          <option value="flat" ${d.billing === 'flat' ? 'selected' : ''}>Flat fee with payment by milestones</option><option value="hourly" ${d.billing === 'hourly' ? 'selected' : ''}>Hourly</option></select></div>
        <div id="flatBox" ${d.billing === 'hourly' ? 'hidden' : ''}><label style="font-size:12.5px;font-weight:600">Milestones (fee is earned when each is completed)</label><div id="ms">${msRows()}</div>
          <button class="btn btn-sm" id="addMs">${icon('plus')} Add milestone</button></div>
        <div id="hourBox" ${d.billing === 'hourly' ? '' : 'hidden'}><div class="row-2">${f('hourly_rate', 'Hourly rate (CAD)', 'number', 'step="0.01"')}${f('est_hours', 'Anticipated hours', 'number', 'step="0.5"')}</div>${f('hourly_schedule', 'Schedule of payments')}</div>
        <div class="row-2" style="margin-top:12px">${f('retainer', 'Advance payment held in trust (CAD, 0 = none)', 'number', 'step="0.01"')}${f('payment_days', 'Invoices payable within (days)', 'number')}</div>
        ${f('retainer_replenish', 'When the retainer is replenished')}`)
      + sec('8–10. Disbursements, payment terms & refunds', `${f('disbursements', 'Expected disbursements with estimates (one per line)', 'textarea', 'rows="3"')}${f('payment_methods', 'Payment methods')}
        <div class="row-2">${f('interest', 'Interest on overdue amounts (% per month, 0 = none)', 'number', 'step="0.1"')}${f('admin_fee', 'Admin fee for client-initiated discharge (CAD, 0 = none)', 'number', 'step="0.01"')}</div>
        <label class="row" style="gap:8px"><input type="checkbox" data-k="cooling_off" ${d.cooling_off ? 'checked' : ''}> Include 48-hour cooling-off period with full refund</label>`)
      + sec('15–16. Absence & disputes', `${f('successor', 'Arrangement if you become unavailable (e.g. designated successor RCIC)', 'textarea')}${f('dispute_days', 'Respond to written complaints within (business days)', 'number')}`);

  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/agreements">← Agreements</a>${agrBadge('draft')}<span style="color:var(--muted)">${esc(AGR_TYPE[T])} · ${esc(a.contacts?.full_name || '')}</span>
      <div class="grow"></div><button class="btn btn-danger" id="del">${icon('trash')}</button><button class="btn" id="save">Save draft</button><button class="btn btn-gold" id="send">${icon('check')} Sign & send</button></div>
    <div id="missing"></div>
    <div class="agr-layout"><div class="card agr-form">${body}</div><div class="card agr-preview"><div class="card-h"><h3>Live preview</h3><small style="color:var(--muted)">Exactly what the client will sign</small></div><div class="card-b" id="pv"></div></div></div>`;

  const read = () => {
    el.querySelectorAll('[data-k]').forEach((i) => { d[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; });
    d.milestones = [...el.querySelectorAll('.ms-row')].map((r) => ({ name: r.querySelector('[data-m="name"]').value, included: r.querySelector('[data-m="included"]').value, fee: Number(r.querySelector('[data-m="fee"]').value || 0) }));
  };
  const preview = () => {
    read();
    el.querySelector('#pv').innerHTML = renderDoc(T, d);
    const miss = requiredMissing(T, d);
    el.querySelector('#missing').innerHTML = miss.length ? `<div class="alert info">Still needed before sending: <b>${miss.map(esc).join(', ')}</b></div>` : '';
  };
  let t; el.querySelector('.agr-form').addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 250); });
  el.querySelector('.agr-form').addEventListener('change', (e) => {
    if (e.target.dataset.k === 'billing') { el.querySelector('#flatBox').hidden = e.target.value === 'hourly'; el.querySelector('#hourBox').hidden = e.target.value !== 'hourly'; }
    preview();
  });
  const wireMs = () => el.querySelectorAll('[data-delm]').forEach((b) => (b.onclick = () => { b.closest('.ms-row').remove(); preview(); }));
  el.querySelector('#addMs')?.addEventListener('click', () => { read(); d.milestones.push({ name: '', included: '', fee: 0 }); el.querySelector('#ms').innerHTML = msRows(); wireMs(); });
  wireMs(); preview();

  const save = async () => { read(); const { error } = await db.from('agreements').update({ data: d }).eq('id', a.id); if (error) throw error; };
  el.querySelector('#save').onclick = async () => { try { await save(); toast('Draft saved'); } catch (e) { fail(e); } };
  el.querySelector('#del').onclick = async () => {
    if (!(await confirmBox('Delete draft', 'Delete this draft agreement?', 'Delete', true))) return;
    const { error } = await db.from('agreements').delete().eq('id', a.id); if (error) return fail(error);
    toast('Draft deleted'); location.hash = '#/agreements';
  };
  el.querySelector('#send').onclick = async () => {
    try { await save(); } catch (e) { return fail(e); }
    const miss = requiredMissing(T, d);
    if (miss.length) return fail(new Error('Complete these first: ' + miss.join(', ')));
    let getSig;
    modal({
      title: 'Sign & send', body: `<p style="margin-bottom:10px">By signing, you confirm the terms as the RCIC. The document is then <b>frozen</b> (fingerprinted with SHA-256) and a private signing link is created for the client. It can no longer be edited, only voided.</p>
        <div id="pad"></div>`,
      onOpen: async (m) => { getSig = await signaturePad(m.querySelector('#pad')); },
      actions: [{ label: 'Cancel' }, { label: 'Sign & create link', cls: 'btn-gold', onClick: async () => {
        const sig = getSig(); if (!sig) throw new Error('Add your signature.');
        const r = await rpc('send_agreement', { p_id: a.id, p_body_html: renderDoc(T, d), p_rcic_signature: sig });
        toast('Agreement signed and ready to send');
        const { data: fresh } = await db.from('agreements').select('*, contacts(id, full_name, email, phone)').eq('id', a.id).single();
        await render(el, [a.id], { setTitle });
        shareModal(r.token, fresh);
      } }],
    });
  };
}
