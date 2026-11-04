import { db, state, can, esc, icon, fmtDateTime, rpc, callFn, toast, fail, modal, confirmBox, staffName } from '../core.js';
import { render as renderDoc, requiredMissing, withSignatures, certificate, defaultTitles, LH_DEFAULTS } from '../agreement-templates.js';
import { agrBadge, AGR_TYPE, PRO_BONO_REASON, proBonoBadge, isLetter } from './agreements.js';
import { NE_REASON, CLOSE_KIND } from '../agreement-templates.js';

// With { reuse: true } the signer's saved signature is offered first, and a new one can be saved for next time.
export async function signaturePad(container, { reuse = false } = {}) {
  const saved = reuse ? (await db.from('user_signatures').select('signature').eq('user_id', state.profile.id).maybeSingle()).data?.signature || '' : '';
  const show = (sg) => sg.startsWith('data:image') ? `<img src="${sg}" alt="Your saved signature" style="max-height:110px;max-width:100%">` : `<span style="font-family:'Brush Script MT',cursive;font-size:34px;color:#0B2A5C">${esc(sg)}</span>`;
  container.innerHTML = `<div class="seg" style="margin-bottom:8px">${saved ? '<button type="button" data-m="saved" class="on">My saved signature</button>' : ''}<button type="button" data-m="draw" ${saved ? '' : 'class="on"'}>Draw</button><button type="button" data-m="type">Type</button></div>
    ${saved ? `<div data-p="saved"><div style="border:1px solid #E3DCCD;border-radius:10px;background:#fff;padding:12px;min-height:90px;display:flex;align-items:center">${show(saved)}</div>
      <button type="button" class="btn btn-sm btn-ghost" data-forget style="margin-top:6px">Delete saved signature</button></div>` : ''}
    <div data-p="draw"><canvas width="520" height="150" style="width:100%;max-width:520px;height:150px;border:1px dashed #B9C2D3;border-radius:10px;background:#fff;touch-action:none"></canvas>
      <div><button type="button" class="btn btn-sm" data-clear>Clear</button></div></div>
    <div data-p="type" hidden><input class="input" placeholder="Type your full name" style="font-family:'Brush Script MT',cursive;font-size:28px"></div>
    ${reuse ? `<label class="row" data-keep style="gap:8px;margin-top:10px;font-size:13px" ${saved ? 'hidden' : ''}><input type="checkbox" checked> Save this signature so I can reuse it on future agreements (only you can see it)</label>` : ''}`;
  let mode = saved ? 'saved' : 'draw', drawn = false;
  if (saved) container.querySelector('[data-p="draw"]').hidden = true;
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
    const sp = container.querySelector('[data-p="saved"]'); if (sp) sp.hidden = mode !== 'saved';
    const keep = container.querySelector('[data-keep]'); if (keep) keep.hidden = mode === 'saved';
  }));
  container.querySelector('[data-forget]')?.addEventListener('click', async () => {
    const { error } = await db.from('user_signatures').delete().eq('user_id', state.profile.id);
    if (error) return fail(error);
    toast('Saved signature deleted'); signaturePad(container, { reuse }).then((g) => Object.assign(get, { inner: g }));
  });
  const own = () => mode === 'saved' ? saved : mode === 'draw' ? (drawn ? cv.toDataURL('image/png') : '') : container.querySelector('[data-p="type"] input').value.trim();
  const get = () => (get.inner ? get.inner() : own());
  // Call after a successful signature: stores a newly drawn/typed signature when "Save" is ticked.
  get.remember = async () => {
    if (get.inner) return get.inner.remember();
    const sig = own();
    if (!reuse || mode === 'saved' || !sig || !container.querySelector('[data-keep] input')?.checked) return;
    await db.from('user_signatures').upsert({ user_id: state.profile.id, signature: sig, updated_at: new Date().toISOString() });
  };
  return get;
}

// Joint agreement: every client gets their own private link.
function jointShare(token, a, co) {
  const kind = `Joint ${AGR_TYPE[a.type]}`;
  const people = [{ name: a.contacts?.full_name, email: a.contacts?.email, phone: a.contacts?.phone, token, signed_at: a.client_signed_at, contact: a.contacts }, ...co];
  const msg = (x) => `Hello ${String(x.name || '').split(' ')[0]}, please ${isLetter(a.type) ? 'read and acknowledge' : 'review and sign'} your ${kind} (${a.number}) from Graceful Immigration Consultant Inc. here: ${signLink(x.token)}  This link is private to you and valid for 30 days. Each person named in the agreement signs with their own link.`;
  const wa = (ph) => String(ph || '').replace(/\D/g, '').replace(/^(?=\d{10}$)/, '1');
  modal({
    title: 'Send to clients for signature', wide: true,
    body: `<p style="margin-bottom:12px">This is a joint agreement. Each client has their <b>own private link</b>; send each person only their link. The agreement is complete when everyone has signed.</p>
      ${people.map((x, i) => `<div class="card" style="padding:12px 14px;margin-bottom:10px"><div class="row" style="justify-content:space-between"><b>${esc(x.name || '')}</b>${x.signed_at ? '<span class="badge b-GREEN">Signed</span>' : '<span class="badge b-gold">Waiting</span>'}</div>
        <div class="row" style="flex-wrap:nowrap;margin-top:8px"><input class="input" value="${esc(signLink(x.token))}" readonly><button class="btn" data-cp="${i}">Copy</button></div>
        <div class="row" style="margin-top:8px">${x.email ? `<button class="btn btn-sm btn-primary" data-em="${i}">${icon('mail')} Email</button>` : ''}
          ${x.phone ? `<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/${wa(x.phone)}?text=${encodeURIComponent(msg(x))}">WhatsApp</a>` : ''}</div></div>`).join('')}
      <div class="row"><button class="btn" id="rn">Issue new links for everyone</button></div>`,
    onOpen: (m) => {
      m.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = async () => { await navigator.clipboard.writeText(signLink(people[b.dataset.cp].token)).catch(() => {}); toast('Link copied'); }));
      m.querySelectorAll('[data-em]').forEach((b) => (b.onclick = async () => {
        const x = people[b.dataset.em];
        (await import('../crm.js')).composeEmail({ contact: x.contact || { id: a.contact_id, full_name: x.name, email: x.email }, to: x.email, subject: `Please sign: ${kind} ${a.number}`,
          body: `Hello ${String(x.name || '').split(' ')[0]},\n\nPlease ${isLetter(a.type) ? 'read and acknowledge' : 'review and sign'} your ${kind} (${a.number}) from Graceful Immigration Consultant Inc. using this private link:\n\n${signLink(x.token)}\n\nThis link is private to you and valid for 30 days. Each person named in the agreement signs with their own link. If you have any questions before signing, reply to this email or call (403) 915-4230.` });
      }));
      m.querySelector('#rn').onclick = async () => { try { const r = await rpc('renew_agreement_link', { p_id: a.id }); toast('New links issued — the old links no longer work'); m.closest('.overlay').remove(); shareModal(r.token, a); } catch (e) { fail(e); } };
    },
  });
}

// Print one agreement on its own page (no dashboard around it); "Save as PDF" in the print window makes a PDF.
export function printDoc(html, title, banner = '') {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups for this site to print'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>body{margin:24px;background:#fff}.pbanner{font:600 13px Arial,sans-serif;color:#9A3412;background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;padding:8px 12px;margin:0 auto 14px;max-width:820px}@media print{body{margin:0}.pbanner{margin-bottom:10px}}</style></head>
    <body>${banner ? `<div class="pbanner">${banner}</div>` : ''}${html}</body></html>`);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  const imgs = [...w.document.images].filter((i) => !i.complete);
  imgs.length ? Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(go) : setTimeout(go, 150);
}

const signLink = (token) => `${location.origin}${location.pathname.replace(/app\/?.*$/, '')}public/sign.html?t=${token}`;

export async function render(el, [id], { setTitle }) {
  const { data: a, error } = await db.from('agreements').select('*, contacts(id, full_name, email, phone), cases(case_number), agreement_signers(*)').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Agreement not found.</div>'; return; }
  setTitle(`${a.number} · ${AGR_TYPE[a.type]}`);
  const manage = can('agreements.manage');
  if (a.status === 'draft' && (manage || can('agreements.draft'))) return editor(el, a, setTitle);

  const people = [{ name: a.contacts?.full_name, email: a.contacts?.email, token: a.signing_token, signed_at: a.client_signed_at },
    ...[...(a.agreement_signers || [])].sort((x, y) => x.position - y.position)];
  const { data: events } = await db.from('agreement_events').select('*').eq('agreement_id', id).order('created_at');
  const doc = withSignatures(a.body_html || '', a);
  const paperWaiting = a.sign_method === 'paper' && ['sent', 'viewed'].includes(a.status);
  el.innerHTML = `<div class="toolbar no-print"><a class="btn btn-sm" href="#/agreements">← Agreements</a>${agrBadge(a.status)}<div class="grow"></div>
      <a class="btn" href="#/contacts/${a.contact_id}">${icon('user')} ${esc(a.contacts?.full_name || '')}</a>
      ${a.status === 'signed' && ['consultation', 'retainer'].includes(a.type) && can('pathway.edit') ? `<button class="btn btn-gold" id="pathway">${icon('route')} Start pathway assessment</button>` : ''}
      ${a.status === 'signed' && a.paper_scan_path ? `<button class="btn" id="scan">${icon('file')} Signed paper copy</button>` : ''}
      <button class="btn" id="print">${icon('file')} ${paperWaiting ? 'Print for signing' : 'Print / PDF'}</button>
      ${manage && paperWaiting ? `<button class="btn btn-primary" id="upload">${icon('check')} Upload signed copy</button>` : ''}
      ${manage && ['sent', 'viewed'].includes(a.status) && a.signing_token ? `<button class="btn btn-primary" id="share">${icon('mail')} Share signing link</button>` : ''}
      ${manage && a.status !== 'void' ? `<button class="btn btn-danger" id="void">Void</button>` : ''}</div>
    ${paperWaiting ? `<div class="alert info no-print"><b>Waiting for paper signatures.</b> This document is locked exactly as it will be printed. 1) Click <b>Print for signing</b>. 2) You and ${(a.agreement_signers || []).length || /JOINT/.test(a.body_html || '') ? 'every client' : 'the client'} sign and date the last page and initial each “Client initials” box. 3) Scan or photograph every page and click <b>Upload signed copy</b>.</div>` : ''}
    ${a.status === 'void' ? `<div class="alert err no-print">Voided ${fmtDateTime(a.voided_at)}: ${esc(a.void_reason || '')}</div>` : ''}
    <div class="grid g-main">
      <div class="card" style="padding:34px 30px"><div id="doc">${doc}</div>${a.status === 'signed' ? certificate(a, events || []) : ''}</div>
      <div class="grid no-print" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Progress</h3></div><div class="card-b timeline">
          ${(events || []).map((v) => `<div class="tl"><div class="tl-dot">${icon(v.event === 'signed' ? 'check' : v.event === 'viewed' ? 'search' : v.event === 'voided' ? 'x' : 'file')}</div>
            <div class="tl-body"><div class="meta">${fmtDateTime(v.created_at)}${v.ip ? ' · IP ' + esc(v.ip) : ''}</div><b>${esc({ created: 'Draft created', sent: 'Signed by RCIC and sent', viewed: 'Opened by client', signed: 'Signed by client', client_signed: 'Signed by one client', paper_prepared: 'Locked and printed for paper signing', paper_signed: 'Signed on paper (scan uploaded)', voided: 'Voided', link_renewed: 'Signing link renewed', review_requested: 'Sent to RCIC for review', review_returned: 'Returned for changes' }[v.event] || v.event)}</b>
            ${v.details?.signed_by ? ` · ${esc(v.details.signed_by)}` : ''}${v.details?.name ? ` · ${esc(v.details.name)}` : ''}${v.details?.by ? ` · ${esc(v.details.by)}` : ''}${v.details?.note ? `<div style="font-size:12.5px;color:var(--muted)">“${esc(v.details.note)}”</div>` : ''}</div></div>`).join('')}</div></div>
        ${(a.agreement_signers || []).length ? `<div class="card"><div class="card-h"><h3>Clients signing</h3></div><div class="card-b">
          ${people.map((x, i) =>
            `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span>${esc(x.name || '')}</span><span>${x.signed_at ? `<span class="badge b-GREEN">Signed ${fmtDateTime(x.signed_at)}</span>` : '<span class="badge b-gold">Waiting</span>'}
              ${a.status === 'signed' && x.email ? `<button class="btn btn-sm" data-copy="${i}" title="RA 5.5: email this client their signed copy">${icon('mail')} Send copy</button>` : ''}</span></div>`).join('')}</div></div>` : ''}
        ${a.status === 'signed' ? `<div class="card"><div class="card-b" style="font-size:13px">${a.drive_item_id ? `${icon('folder')} Signed copy saved in the client's OneDrive folder (01 Agreements). <a href="#/contacts/${a.contact_id}">Client documents</a>`
          : manage ? `<div style="margin-bottom:8px">${icon('folder')} The signed copy is not in the client's OneDrive folder yet.</div><button class="btn btn-sm btn-primary" id="toDrive">Save signed copy to client folder</button>` : ''}</div></div>` : ''}
        ${a.body_sha256 ? `<div class="card"><div class="card-b" style="font-size:12px;word-break:break-all"><b>Document fingerprint (SHA-256)</b><br>${esc(a.body_sha256)}</div></div>` : ''}
        ${a.status === 'signed' ? `<div class="alert ok">Signed ${fmtDateTime(a.client_signed_at)}. RA 5.5: send the client a copy of the signed agreement by email and keep the confirmation on file.</div>
          ${a.contacts?.email && !(a.agreement_signers || []).length ? `<button class="btn btn-primary" id="sendCopy">${icon('mail')} Email signed copy to client</button>` : ''}` : ''}
      </div></div>`;
  el.querySelector('#share')?.addEventListener('click', () => shareModal(a.signing_token, a));
  el.querySelector('#pathway')?.addEventListener('click', async () => (await import('./pathways.js')).startPathway({ contactId: a.contact_id, caseId: a.case_id, agreementId: a.id }).catch(fail));
  el.querySelector('#print').onclick = () => printDoc(doc + (a.status === 'signed' ? certificate(a, events || []) : ''), `${a.number} ${a.title}`);
  el.querySelector('#toDrive')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try { await callFn('files', { action: 'save_agreement', agreement_id: a.id }); toast('Saved to the client folder'); render(el, [id], { setTitle }); }
    catch (e) { fail(e); ev.target.disabled = false; }
  });
  el.querySelector('#scan')?.addEventListener('click', async () => {
    const { data, error: e } = await db.storage.from('agreements').createSignedUrl(a.paper_scan_path, 600);
    e ? fail(e) : window.open(data.signedUrl, '_blank', 'noopener');
  });
  el.querySelector('#upload')?.addEventListener('click', () => modal({
    title: 'Upload the signed paper copy',
    body: `<p style="margin-bottom:10px">Upload a scan or clear photos of <b>every page</b>, with all signatures and initials. One PDF is best (phone scanner apps such as Microsoft Lens make one).</p>
      <div class="field"><label>Signed copy (PDF or photos)</label><input class="input" type="file" id="sf" accept="application/pdf,image/jpeg,image/png,image/webp" multiple></div>
      <div class="field"><label>Date it was signed</label><input class="input" type="date" id="sd" value="${new Date().toLocaleDateString('en-CA')}"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Record as signed', cls: 'btn-gold', onClick: async (m) => {
      const files = [...m.querySelector('#sf').files];
      if (!files.length) throw new Error('Choose the scanned file.');
      if (files.length > 1 && files.some((f) => f.type === 'application/pdf')) throw new Error('Upload either one PDF or several photos, not both.');
      if (files.some((f) => f.size > 15 * 1024 * 1024)) throw new Error('Each file must be under 15 MB.');
      const paths = [];
      for (const [i, f] of files.entries()) {
        const ext = (f.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${a.id}/${Date.now()}-${i + 1}.${ext}`;
        const { error: ue } = await db.storage.from('agreements').upload(path, f, { contentType: f.type });
        if (ue) throw ue;
        paths.push(path);
      }
      await rpc('record_paper_signature', { p_id: a.id, p_path: paths[0], p_signed_on: m.querySelector('#sd').value || null });
      // File the scan and the signed record in the client's OneDrive folder too (skipped quietly if storage isn't set up yet)
      const { uploadFile } = await import('../files.js');
      for (const f of files) await uploadFile(f, { contactId: a.contact_id, category: 'agreements', agreementId: a.id, caseId: a.case_id }).catch(() => {});
      await callFn('files', { action: 'save_agreement', agreement_id: a.id }).catch(() => {});
      toast('Recorded as signed'); render(el, [id], { setTitle });
    } }],
  }));
  // RA 5.5: email the signed copy as confirmation (sent from Outlook, kept in Sent Items and on the client file)
  el.querySelector('#sendCopy')?.addEventListener('click', async () => (await import('../crm.js')).composeEmail({
    contact: a.contacts, subject: `Your signed ${AGR_TYPE[a.type]} (${a.number})`,
    body: `Hello ${a.contacts.full_name.split(' ')[0]},\n\nThank you for signing. As confirmation, your signed copy of ${AGR_TYPE[a.type]} ${a.number} is available at this secure link (valid until ${new Date(a.token_expires_at).toLocaleDateString('en-CA')}):\n\n${signLink(a.signing_token)}\n\nYou can print it or save it as a PDF from that page. Please keep it for your records.` }));
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
    const x = people[b.dataset.copy];
    (await import('../crm.js')).composeEmail({ contact: { ...a.contacts, full_name: x.name }, to: x.email, subject: `Your signed ${AGR_TYPE[a.type]} (${a.number})`,
      body: `Hello ${String(x.name || '').split(' ')[0]},\n\nThank you for signing. Every client named in the agreement has now signed. As confirmation, your signed copy of ${AGR_TYPE[a.type]} ${a.number} is available at this secure link (valid until ${new Date(a.token_expires_at).toLocaleDateString('en-CA')}):\n\n${signLink(x.token)}\n\nYou can print it or save it as a PDF from that page. Please keep it for your records.` });
  }));
  el.querySelector('#void')?.addEventListener('click', () => modal({
    title: `Void ${a.number}`, body: `<p style="margin-bottom:10px">The signing link stops working and the agreement is kept for your records. To change terms, void it and create a new one.</p><div class="field"><label>Reason</label><input class="input" id="r"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Void agreement', cls: 'btn-danger', onClick: async (m) => { await rpc('void_agreement', { p_id: id, p_reason: m.querySelector('#r').value || null }); toast('Agreement voided'); render(el, [id], { setTitle }); } }],
  }));
}

async function shareModal(token, a) {
  const { data: co } = await db.from('agreement_signers').select('position, name, email, phone, token, signed_at').eq('agreement_id', a.id).order('position');
  if ((co || []).length) return jointShare(token, a, co);
  const link = signLink(token);
  const first = (a.contacts?.full_name || '').split(' ')[0];
  const msg = `Hello ${first}, please ${isLetter(a.type) ? 'read and acknowledge' : 'review and sign'} your ${AGR_TYPE[a.type]} (${a.number}) from Graceful Immigration Consultant Inc. here: ${link}  The link is private to you and valid for 30 days.`;
  modal({
    title: 'Send to client for signature',
    body: `<p style="margin-bottom:10px">Share this private link with <b>${esc(a.contacts?.full_name || '')}</b>. Anyone with the link can view and sign, so send it only to the client.</p>
      <div class="row" style="flex-wrap:nowrap"><input class="input" id="lk" value="${esc(link)}" readonly><button class="btn" id="cp">Copy</button></div>
      <div class="row" style="margin-top:14px">
        ${a.contacts?.email ? `<button class="btn btn-primary" id="em">${icon('mail')} Email link</button>` : ''}
        ${a.contacts?.phone ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${String(a.contacts.phone).replace(/\D/g, '').replace(/^(?=\d{10}$)/, '1')}?text=${encodeURIComponent(msg)}">WhatsApp link</a>` : ''}
        <button class="btn" id="rn">Issue new link</button></div>
      <p style="font-size:12.5px;color:var(--muted);margin-top:12px">Email is sent from your Outlook mailbox, saved in Sent Items and logged on the client's file.</p>`,
    onOpen: (m) => {
      m.querySelector('#cp').onclick = async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast('Link copied'); };
      m.querySelector('#em')?.addEventListener('click', async () => { m.closest('.overlay').remove(); (await import('../crm.js')).composeEmail({ contact: a.contacts, subject: `Please sign: ${AGR_TYPE[a.type]} ${a.number}`,
        body: `Hello ${first},\n\nPlease ${isLetter(a.type) ? 'read and acknowledge' : 'review and sign'} your ${AGR_TYPE[a.type]} (${a.number}) from Graceful Immigration Consultant Inc. using this private link:\n\n${link}\n\nThe link is private to you and valid for 30 days. If you have any questions before signing, reply to this email or call (403) 915-4230.` }); });
      m.querySelector('#rn').onclick = async () => { try { const r = await rpc('renew_agreement_link', { p_id: a.id }); toast('New link issued — the old link no longer works'); m.closest('.overlay').remove(); shareModal(r.token, a); } catch (e) { fail(e); } };
    },
  });
}

async function editor(el, a, setTitle) {
  const d = { ...a.data };
  const T = a.type;
  // Where each field shows up in the document: 'lh' letterhead, 'title', 'parties', 'glance' (key terms) or a section number.
  const LH = ['business_name', 'tagline', 'rcic_name', 'rcic_designation', 'rcic_id', 'business_address', 'business_phone', 'business_email', 'website'];
  const SEC = Object.assign(Object.fromEntries(LH.map((k) => [k, ['lh', 'parties']])), { doc_title: ['title'], doc_subtitle: ['title'], agreement_date: ['title'],
    client_name: ['parties'], client_dob: ['parties'], client_address: ['parties'], client_phone: ['parties'], client_email: ['parties'], co: ['parties', 'glance', T === 'consultation' ? '1' : '2'] },
    T === 'consultation'
      ? { language: ['glance', '6'], gst_rate: ['glance', '4'], province: ['8'], fee_basis: ['glance', '4'], pro_bono_reason: ['4'], relationship: ['1'], pro_bono_note: ['4'], continuing_relationship: ['1'],
          purpose: ['glance', '1'], consult_date: ['glance', '1'], consult_length: ['glance', '1'], consult_method: ['glance', '1'], fee: ['glance', '4'], payment_method: ['4'] }
      : { language: ['glance', '2'], gst_rate: ['glance', '7'], province: ['7', '13', '16'], fee_basis: ['glance', '7'], pro_bono_reason: ['7'], relationship: ['2'], pro_bono_note: ['7'],
          joint_instructions: ['2'], continuing_relationship: ['2'], file_number: ['title'], preliminary_advice: ['1'], consultation_ref: ['1'], assistants: ['2'], other_licensees: ['2'],
          response_time: ['2'], update_time: ['2'], comm_methods: ['glance', '12'], program: ['glance', '4'], scope: ['4'], timeframes: ['4'], instructions: ['5'], designate: ['5'], excluded: ['6'],
          billing: ['glance', '7'], milestones: ['glance', '7'], hourly_rate: ['glance', '7'], est_hours: ['glance', '7'], daily_rate: ['glance', '7'], est_days: ['glance', '7'],
          hourly_schedule: ['7'], invoice_frequency: ['7'], retainer: ['glance', '7'], payment_days: ['7', '9'], retainer_replenish: ['7'], disbursements: ['8'], payment_methods: ['9'],
          interest: ['9'], admin_fee: ['9', '13'], cooling_off: ['10'], successor: ['14'], dispute_days: ['15'] });
  const TAG = { lh: 'Letterhead', title: 'Title', parties: 'Parties', glance: 'Key terms' };
  const tag = (k) => { const s = (SEC[k] || []).filter((x) => x !== 'glance'); return s.length ? `<span class="sec-tag" title="Shown in: ${(SEC[k] || []).map((x) => TAG[x] || '§' + x).join(', ')}">${s.map((x) => TAG[x] || '§' + x).join(' · ')}</span>` : ''; };
  const f = (k, label, type = 'text', extra = '') => `<div class="field"><label>${label} ${tag(k)}</label>${type === 'textarea'
    ? `<textarea class="input" data-k="${k}" ${extra}>${esc(d[k] ?? '')}</textarea>` : `<input class="input" type="${type}" data-k="${k}" value="${esc(d[k] ?? '')}" ${extra}>`}</div>`;
  const sec = (title, inner, open = false, id = '') => `<details class="agr-sec" ${id ? `id="${id}"` : ''} ${open ? 'open' : ''}><summary>${title}</summary><div class="agr-sec-b">${inner}</div></details>`;
  const free = () => d.fee_basis === 'pro_bono';
  const feeArr = sec('Fee arrangement', `<div class="row-2"><div class="field"><label>Paying or pro bono</label><select class="input" data-k="fee_basis">
      <option value="paid" ${free() ? '' : 'selected'}>Paying client — professional fees apply</option><option value="pro_bono" ${free() ? 'selected' : ''}>Pro bono — no professional fees</option></select></div>
    <div class="field pb-only" ${free() ? '' : 'hidden'}><label>Why pro bono</label><select class="input" data-k="pro_bono_reason">
      ${Object.entries(PRO_BONO_REASON).map(([k, l]) => `<option value="${k}" ${(d.pro_bono_reason || 'family') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="pb-only" ${free() ? '' : 'hidden'}><div class="row-2">${f('relationship', 'Relationship to you (family/friend, e.g. “cousin”, “friend for 10 years”)')}${f('pro_bono_note', 'Reason in your words (used for “Other reason”)')}</div>
      <small style="color:var(--muted)">Family and friend files add a personal-relationship disclosure the client consents to. Government fees stay the client's responsibility.</small></div>`, true);
  const msRows = () => (d.milestones || []).map((m, i) => `<div class="ms-row" data-i="${i}"><input class="input" data-m="name" placeholder="Milestone" value="${esc(m.name)}">
    <input class="input" data-m="included" placeholder="What is included" value="${esc(m.included)}"><input class="input" data-m="fee" type="number" step="0.01" placeholder="Fee" value="${esc(m.fee)}" style="max-width:100px" title="Professional fee">
    <input class="input" data-m="disb" type="number" step="0.01" placeholder="Disb." value="${esc(m.disb ?? '')}" style="max-width:90px" title="Estimated disbursements for this milestone">
    <input class="input ms-due" data-m="due" type="date" value="${esc(m.due ?? '')}" style="max-width:150px" title="Due date (predetermined-date billing)" ${d.billing === 'flat_dates' ? '' : 'hidden'}>
    <button class="btn btn-ghost btn-sm" data-delm="${i}" aria-label="Remove">${icon('trash')}</button></div>`).join('');

  d.co_clients = d.co_clients || [];
  const coRows = () => d.co_clients.map((c, i) => `<div class="co-row" data-i="${i}" style="display:grid;grid-template-columns:1fr 1fr 34px;gap:8px;margin-bottom:8px;padding:10px;border:1px solid var(--line);border-radius:10px">
      <input class="input" data-c="name" placeholder="Full legal name" value="${esc(c.name || '')}"><input class="input" data-c="relationship" placeholder="Relationship (e.g. spouse)" value="${esc(c.relationship || '')}">
      <button class="btn btn-ghost btn-sm" type="button" data-delc="${i}" aria-label="Remove client" title="Remove">${icon('trash')}</button>
      <input class="input" data-c="email" type="email" placeholder="Email" value="${esc(c.email || '')}"><input class="input" data-c="phone" placeholder="Phone" value="${esc(c.phone || '')}"><span></span>
      <input class="input" data-c="dob" type="date" title="Date of birth" value="${esc(c.dob || '')}"><input class="input" data-c="address" placeholder="Address (if different)" value="${esc(c.address || '')}"><span></span>
      <input type="hidden" data-c="contact_id" value="${esc(c.contact_id || '')}"></div>`).join('');
  // The number's code follows the client list (SA/JA, CA/JC); the database applies the same rule on save.
  const number = () => !/^[A-Z]{2}-\d{8}-/.test(a.number || '') || !['retainer', 'consultation'].includes(T) ? a.number
    : (T === 'retainer' ? (d.co_clients.length ? 'JA' : 'SA') : (d.co_clients.length ? 'JC' : 'CA')) + a.number.slice(2);
  const [defTitle, defSub] = defaultTitles(T, d);
  const ph = (v) => `placeholder="${esc(v)}"`;
  const letter = sec('Letterhead & title', `<p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Changes apply to this agreement only. Leave a box empty to use the standard wording shown in grey. Your usual details are set in Business Settings.</p>
    ${f('doc_title', 'Document title', 'text', ph(defTitle))}${f('doc_subtitle', 'Subtitle under the title', 'text', ph(defSub))}
    ${f('business_name', 'Business name')}${f('tagline', 'Tagline', 'text', ph(LH_DEFAULTS.tagline))}
    <div class="row-2">${f('rcic_name', 'RCIC name')}${f('rcic_id', 'College ID')}</div>${f('rcic_designation', 'Your designation', 'text', ph(LH_DEFAULTS.rcic_designation))}
    ${f('business_address', 'Business address (street, city, postal code)')}
    <div class="row-2">${f('business_phone', 'Business phone')}${f('business_email', 'Business email')}</div>${f('website', 'Website', 'text', ph(LH_DEFAULTS.website))}`);
  const parties = letter + sec('Parties & date', `<div class="row-2">${f('agreement_date', 'Agreement date', 'date')}${f('language', 'Language of service (English or French)')}</div>
    <div class="row-2">${f('client_name', 'Client full legal name')}${f('client_dob', 'Client date of birth', 'date')}</div>
    ${f('client_address', 'Client home address')}<div class="row-2">${f('client_phone', 'Client phone')}${f('client_email', 'Client email')}</div>
    <div class="row-2">${f('gst_rate', 'GST rate % (0 = not applicable)', 'number', 'step="0.01"')}${f('province', 'Governing law (province)')}</div>
    <div class="co-wrap"><label style="font-size:12.5px;font-weight:600;display:block;margin:14px 0 6px">Additional clients — joint ${T === 'consultation' ? 'consultation' : 'retainer'} (e.g. spouse, dependent adult child) ${tag('co')}</label>
      <div id="co">${coRows()}</div>
      <div class="row" style="gap:8px;margin-bottom:12px"><select class="input" id="coPick" style="max-width:320px"><option value="">Add a client from Contacts…</option></select>
        <button class="btn btn-sm" type="button" id="coNew">${icon('plus')} Add a person not in Contacts</button></div>
      <div id="coInstr" ${(d.co_clients || []).length ? '' : 'hidden'}>${T === 'retainer' ? f('joint_instructions', 'How instructions are given by the clients') : ''}
        ${f('continuing_relationship', 'Continuing relationship to disclose (RA 6.2) — only if you already act regularly for one of these clients, e.g. “The RCIC has represented the main client on other files since 2025.”')}
        <div class="alert info" style="font-size:12.5px">RA 6.3: avoid a joint agreement if a dispute between these clients is likely, or their interests may split as the file progresses (for example a separating couple).</div></div></div>`, true);
  const opts = (k, map, def) => `<div class="field"><label>${{ reason_kind: 'Why you are not taking the matter', close_kind: 'Type of letter' }[k]}</label><select class="input" data-k="${k}">
    ${Object.entries(map).map(([v, l]) => `<option value="${v}" ${(d[k] || def) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  const chk = (k, label) => `<label class="row" style="gap:8px;margin-bottom:10px"><input type="checkbox" data-k="${k}" ${d[k] ? 'checked' : ''}> ${label}</label>`;
  const ref = `<div class="row-2">${f('parent_number', 'Agreement no. this relates to')}${f('parent_date', 'Date of that agreement', 'date')}</div>`;
  const LETTER = {
    amendment: () => sec('Amendment', `${ref}${f('reason', 'Reason for the amendment', 'textarea')}${f('changes', 'What changes — one per line (scope, services, timelines…)', 'textarea', 'rows="5"')}
      ${f('fee_change', 'Fee changes — one per line (leave empty if the fees stay the same)', 'textarea', 'rows="3"')}${f('effective_date', 'Effective date', 'date')}
      <div class="alert info" style="font-size:12.5px">Everyone who signed the original agreement signs the amendment. Changing fees or scope without a signed amendment is not allowed.</div>`, true),
    non_engagement: () => sec('Non-engagement letter', `<div class="row-2">${f('contact_date', 'Date they contacted you (or the consultation)', 'date')}${opts('reason_kind', NE_REASON, 'scope')}</div>
      ${f('reason_note', 'Reason in your words (used for “Other reason”)')}${f('matter', 'What they asked about (e.g. “a spousal sponsorship for your husband”)', 'textarea', 'rows="2"')}
      ${chk('advice_given', 'General preliminary information was shared (adds a “do not rely on it” statement)')}
      ${f('deadlines', 'Deadlines you know of — one per line (the letter warns the person about them)', 'textarea', 'rows="3"')}
      ${f('documents', 'Documents', 'textarea', 'rows="2"')}${f('fees_note', 'Fees (e.g. “The consultation fee of $60 was earned; nothing else is owing.”)', 'textarea', 'rows="2"')}
      <div class="alert info" style="font-size:12.5px">Send this whenever you decline a matter, including after a consultation, so the person knows in writing that you are not acting for them and that deadlines may apply.</div>`, true),
    termination: () => sec('Closing / termination letter', `${opts('close_kind', CLOSE_KIND, 'completed')}${ref}${f('effective_date', 'Effective date', 'date')}
      ${f('reason', 'Reason (required when you withdraw; the client’s instructions when they end the services)', 'textarea', 'rows="2"')}
      ${f('file_status', 'Status of the file — one per line (what was done, what was submitted, the application status)', 'textarea', 'rows="4"')}
      ${f('deadlines', 'Upcoming deadlines — one per line (write “None” if there are none)', 'textarea', 'rows="3"')}${f('next_steps', 'Next steps for the client — one per line', 'textarea', 'rows="3"')}
      ${f('documents', 'Original documents returned (what, how and when)', 'textarea', 'rows="2"')}${f('final_account', 'Final account — one per line (fees earned, final invoice no., unearned fees refunded)', 'textarea', 'rows="3"')}
      <div class="row-2">${f('trust_refund', 'Money held in trust to refund (CAD, 0 = none)', 'number', 'step="0.01"')}${f('refund_days', 'Refunded within (days)', 'number')}</div>
      ${chk('notify_ircc', 'Tell the client you will notify the authority that you no longer represent them (withdraw the Use of a Representative form)')}
      <div class="row-2">${f('authority', 'Authority to notify')}${f('retention_years', 'Years the file copy is kept', 'number')}</div>`, true),
  };
  const body = LETTER[T] ? parties + LETTER[T]() : T === 'consultation'
    ? parties + feeArr + sec('Consultation', `${f('purpose', 'Purpose of the consultation', 'textarea')}<div class="row-2">${f('consult_date', 'Consultation date', 'date')}${f('consult_length', 'Length')}</div>
      <div class="row-2">${f('consult_method', 'Method (phone, video, in person)')}${f('fee', 'Fee before tax (CAD)', 'number', 'step="0.01"')}</div>${f('payment_method', 'Payment method')}`, true)
    : parties + feeArr
      + sec('1–2. Preliminary advice & general provisions', `${f('file_number', 'File number')}${f('preliminary_advice', 'Summary of preliminary advice given to the client', 'textarea', 'rows="4"')}
        ${f('consultation_ref', 'Initial Consultation Agreement no. (if any)')}${f('assistants', 'People who will assist (names and their role)')}
        ${f('other_licensees', 'Other RCICs of the firm working on this file — name, College ID and what each will do (RA 6.5; leave blank if none)')}
        <div class="row-2">${f('response_time', 'Respond to client inquiries within')}${f('update_time', 'Share government updates within')}</div>${f('comm_methods', 'Preferred method of correspondence')}`)
      + sec('3–6. Services, instructions & exclusions', `${f('program', 'Immigration/citizenship category and program (be specific, e.g. “Permanent Residence — Family Class, spousal, outland”)')}
        ${f('scope', 'Scope of services & major steps (one per line)', 'textarea', 'rows="6"')}${f('timeframes', 'Estimated timeframes (one per line)', 'textarea', 'rows="3"')}
        ${f('instructions', 'Client instructions', 'textarea')}${f('designate', 'Designate who may receive updates (name and access)')}${f('excluded', 'Services NOT included (one per line)', 'textarea', 'rows="3"')}`)
      + sec('7. Fees & billing method', `<div class="field"><label>Billing method (choose one — cannot be switched later)</label><select class="input" data-k="billing">
          ${[['flat', 'Flat fee with payment by milestones'], ['flat_dates', 'Flat fee with payment on predetermined dates'], ['hourly', 'By the hour'], ['daily', 'By the day']].map(([k, l]) => `<option value="${k}" ${(d.billing || 'flat') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div id="flatBox" ${['hourly', 'daily'].includes(d.billing) ? 'hidden' : ''}><label style="font-size:12.5px;font-weight:600">Milestones in chronological order: fee, estimated disbursements${d.billing === 'flat_dates' ? ' and due date' : ''}</label><div id="ms">${msRows()}</div>
          <button class="btn btn-sm" id="addMs">${icon('plus')} Add milestone</button> ${tag('milestones')}</div>
        <div id="hourBox" ${d.billing === 'hourly' ? '' : 'hidden'}><div class="row-2">${f('hourly_rate', 'Hourly rate (CAD)', 'number', 'step="0.01"')}${f('est_hours', 'Anticipated hours', 'number', 'step="0.5"')}</div></div>
        <div id="dayBox" ${d.billing === 'daily' ? '' : 'hidden'}><div class="row-2">${f('daily_rate', 'Daily rate (CAD)', 'number', 'step="0.01"')}${f('est_days', 'Anticipated days', 'number', 'step="0.5"')}</div></div>
        <div id="schedBox" ${['hourly', 'daily'].includes(d.billing) ? '' : 'hidden'}><div class="row-2">${f('hourly_schedule', 'Schedule of payments')}${f('invoice_frequency', 'How often invoices are provided (e.g. monthly)')}</div></div>
        <div class="row-2" style="margin-top:12px">${f('retainer', 'Advance payment held in trust (CAD, 0 = none)', 'number', 'step="0.01"')}${f('payment_days', 'Invoices payable within (days)', 'number')}</div>
        ${f('retainer_replenish', 'When the retainer is replenished')}`, false, 'feeSec')
      + sec('8–10. Disbursements, payment terms & refunds', `${f('disbursements', 'Expected disbursements with estimates (one per line)', 'textarea', 'rows="3"')}${f('payment_methods', 'Payment methods')}
        <div class="row-2">${f('interest', 'Interest on overdue amounts (% per month, 0 = none)', 'number', 'step="0.1"')}${f('admin_fee', 'Admin fee for client-initiated discharge (CAD, 0 = none)', 'number', 'step="0.01"')}</div>
        <label class="row" style="gap:8px"><input type="checkbox" data-k="cooling_off" ${d.cooling_off ? 'checked' : ''}> Include 48-hour cooling-off period with full refund</label>`)
      + sec('15–16. Absence & disputes', `${f('successor', 'Arrangement if you become unavailable (e.g. designated successor RCIC)', 'textarea')}${f('dispute_days', 'Respond to written complaints within (business days)', 'number')}`);

  const manage = can('agreements.manage');
  const reviewBanner = a.review_requested_at
    ? `<div class="alert ${manage ? 'warn' : 'info'}"><b>${manage ? `${esc(staffName(a.review_requested_by))} prepared this draft for your review` : `Sent to ${esc(staffName(a.reviewer_id))} for review`}</b> · ${fmtDateTime(a.review_requested_at)}${a.review_note ? `<br>Note: “${esc(a.review_note)}”` : ''}
        ${manage ? '<br>Check every section in the live preview, make any changes, then <b>Sign &amp; send</b> (or <b>Sign on paper</b>). Use <b>Return for changes</b> to send it back.' : '<br>You can still make changes. The RCIC reviews, signs and sends it to the client.'}</div>`
    : a.review_note ? `<div class="alert warn"><b>Changes requested by the RCIC:</b> “${esc(a.review_note)}”<br>Make the changes, then click <b>Send to RCIC again</b>.</div>`
    : manage ? '' : '<div class="alert info">You are preparing a draft. When it is complete, click <b>Send to RCIC for review</b>. Only the RCIC signs and sends agreements to clients.</div>';
  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/agreements">← Agreements</a>${agrBadge('draft')}<span style="color:var(--muted)">${esc(AGR_TYPE[T])} · ${esc(a.contacts?.full_name || '')}</span><span id="pbb">${proBonoBadge(d.fee_basis)}</span>
      <div class="grow"></div><button class="btn btn-danger" id="del">${icon('trash')}</button><button class="btn" id="save">Save draft</button><button class="btn" id="printDraft" title="Print or save as PDF to review">${icon('file')} Print</button>
      ${manage && a.review_requested_at ? `<button class="btn" id="ret">Return for changes</button>` : ''}
      ${manage ? '' : `<button class="btn btn-gold" id="review">${icon('check')} ${a.review_requested_at ? 'Send to RCIC again' : 'Send to RCIC for review'}</button>`}
      <button class="btn" id="paper" title="Lock it, print it and sign by hand" ${manage ? '' : 'hidden'}>Sign on paper</button><button class="btn btn-gold" id="send" ${manage ? '' : 'hidden'}>${icon('check')} Sign & send</button></div>
    ${reviewBanner}
    <div id="missing"></div>
    <div class="agr-layout"><div class="card agr-form">${body}</div><div class="card agr-preview"><div class="card-h"><h3>Live preview</h3><small style="color:var(--muted)">Exactly what the client will sign</small></div><div class="card-b" id="pv"></div></div></div>`;

  const read = () => {
    el.querySelectorAll('[data-k]').forEach((i) => { d[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; });
    d.co_clients = [...el.querySelectorAll('.co-row')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-c]')].map((i) => [i.dataset.c, i.value.trim()])));
    d.milestones = [...el.querySelectorAll('.ms-row')].map((r) => ({ disb: Number(r.querySelector('[data-m="disb"]')?.value || 0), due: r.querySelector('[data-m="due"]')?.value || '', name: r.querySelector('[data-m="name"]').value, included: r.querySelector('[data-m="included"]').value, fee: Number(r.querySelector('[data-m="fee"]').value || 0) }));
  };
  // "You are editing here": mark the parts of the preview that the focused field changes, and bring the first one into view.
  let active = null;
  const keyOf = (t) => t?.dataset?.k || (t?.closest?.('.ms-row') ? 'milestones' : t?.closest?.('.co-wrap') ? 'co' : null);
  const highlight = (scroll) => {
    const pv = el.querySelector('#pv');
    pv.querySelectorAll('.pv-hl').forEach((x) => x.classList.remove('pv-hl'));
    const marks = [];
    for (const s of SEC[active] || []) pv.querySelectorAll(`[data-sec="${s}"]`).forEach((h) => {
      h.classList.add('pv-hl'); marks.push(h);
      if (h.tagName === 'H2') for (let n = h.nextElementSibling; n && n.tagName !== 'H2' && !n.classList.contains('sigpage'); n = n.nextElementSibling) n.classList.add('pv-hl');
    });
    const first = marks.find((m) => !m.classList.contains('glance')) || marks[0];
    if (scroll && first && matchMedia('(min-width:1181px)').matches) {
      const r = first.getBoundingClientRect();
      if (r.top < 90 || r.top > innerHeight * 0.6) scrollTo({ top: scrollY + r.top - 110, behavior: 'smooth' });
    }
  };
  el.querySelector('.agr-form').addEventListener('focusin', (e) => { const k = keyOf(e.target); if (k && k !== active) { active = k; highlight(true); } });
  const preview = () => {
    read();
    el.querySelector('#pv').innerHTML = renderDoc(T, { ...d, number: number() });
    if (active) highlight(false);
    const [dt, ds] = defaultTitles(T, d), ti = el.querySelector('[data-k="doc_title"]'), si = el.querySelector('[data-k="doc_subtitle"]');
    if (ti) ti.placeholder = dt; if (si) si.placeholder = ds;
    if (number() !== a.number) { a.number = number(); setTitle(`${a.number} · ${AGR_TYPE[T]}`); }
    const miss = requiredMissing(T, d);
    el.querySelector('#missing').innerHTML = miss.length ? `<div class="alert info">Still needed before sending: <b>${miss.map(esc).join(', ')}</b></div>` : '';
  };
  let t; el.querySelector('.agr-form').addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 250); });
  const syncFree = () => {
    el.querySelectorAll('.pb-only').forEach((x) => (x.hidden = !free()));
    const fs = el.querySelector('#feeSec'); if (fs) fs.hidden = free();
    el.querySelector('#pbb').innerHTML = proBonoBadge(d.fee_basis);
  };
  el.querySelector('.agr-form').addEventListener('change', (e) => {
    if (e.target.dataset.k === 'fee_basis') { read(); syncFree(); }
    if (e.target.dataset.k === 'billing') {
      const b = e.target.value;
      el.querySelector('#flatBox').hidden = ['hourly', 'daily'].includes(b); el.querySelector('#hourBox').hidden = b !== 'hourly';
      el.querySelector('#dayBox').hidden = b !== 'daily'; el.querySelector('#schedBox').hidden = !['hourly', 'daily'].includes(b);
      el.querySelectorAll('.ms-due').forEach((i) => (i.hidden = b !== 'flat_dates'));
    }
    preview();
  });
  const wireMs = () => el.querySelectorAll('[data-delm]').forEach((b) => (b.onclick = () => { b.closest('.ms-row').remove(); preview(); }));
  el.querySelector('#addMs')?.addEventListener('click', () => { read(); d.milestones.push({ name: '', included: '', fee: 0, disb: 0, due: '' }); el.querySelector('#ms').innerHTML = msRows(); wireMs(); });
  const drawCo = () => {
    el.querySelector('#co').innerHTML = coRows();
    el.querySelectorAll('[data-delc]').forEach((b) => (b.onclick = () => { read(); d.co_clients.splice(Number(b.dataset.delc), 1); drawCo(); }));
    const ci = el.querySelector('#coInstr'); if (ci) ci.hidden = !d.co_clients.length;
    preview();
  };
  el.querySelector('#coNew').onclick = () => { read(); d.co_clients.push({ name: '', relationship: '', dob: '', email: '', phone: '', address: '', contact_id: '' }); drawCo(); };
  import('../fin.js').then(({ contactsList }) => contactsList()).then((list) => {
    const pick = el.querySelector('#coPick');
    pick.innerHTML += (list || []).filter((c) => c.id !== a.contact_id).map((c) => `<option value="${c.id}">${esc(c.full_name)}${c.email ? ' · ' + esc(c.email) : ''}</option>`).join('');
    pick.onchange = async () => {
      if (!pick.value) return;
      const { data: c } = await db.from('contacts').select('*').eq('id', pick.value).single();
      pick.value = ''; if (!c) return;
      read();
      d.co_clients.push({ contact_id: c.id, name: c.full_name || '', relationship: '', dob: c.date_of_birth || '', email: c.email || '', phone: c.phone || '',
        address: [c.address, c.city, c.province, c.postal_code, c.country].filter(Boolean).join(', ') });
      drawCo();
    };
  }).catch(() => {});
  wireMs(); syncFree(); drawCo();

  const save = async () => { read(); d.co_clients = d.co_clients.filter((c) => Object.entries(c).some(([k, v]) => k !== 'contact_id' && v)); const { error } = await db.from('agreements').update({ data: d }).eq('id', a.id); if (error) throw error; };
  el.querySelector('#save').onclick = async () => { try { await save(); toast('Draft saved'); } catch (e) { fail(e); } };
  el.querySelector('#del').onclick = async () => {
    if (!(await confirmBox('Delete draft', 'Delete this draft agreement?', 'Delete', true))) return;
    const { error } = await db.from('agreements').delete().eq('id', a.id); if (error) return fail(error);
    toast('Draft deleted'); location.hash = '#/agreements';
  };
  el.querySelector('#review')?.addEventListener('click', async () => {
    try { await save(); } catch (e) { return fail(e); }
    const miss = requiredMissing(T, d);
    const rcics = state.staff.filter((x) => x.active && ['owner', 'rcic'].includes(x.role));
    modal({
      title: 'Send to RCIC for review',
      body: `${miss.length ? `<div class="alert warn" style="margin-bottom:10px">Still missing: <b>${miss.map(esc).join(', ')}</b>. You can send it anyway and say why in the note.</div>` : '<div class="alert ok" style="margin-bottom:10px">All required details are filled in.</div>'}
        <div class="field"><label>Reviewer (RCIC)</label><select class="input" id="rv">${rcics.map((x) => `<option value="${x.id}" ${x.id === a.reviewer_id ? 'selected' : ''}>${esc(x.full_name || x.email)}</option>`).join('')}</select></div>
        <div class="field"><label>Note for the RCIC (optional)</label><textarea class="input" id="rn" rows="3" placeholder="e.g. Client asked about paying in two instalments; spouse's date of birth to confirm.">${esc(a.review_requested_at ? a.review_note || '' : '')}</textarea></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Send for review', cls: 'btn-gold', onClick: async (m) => {
        await rpc('request_agreement_review', { p_id: a.id, p_reviewer: m.querySelector('#rv').value, p_note: m.querySelector('#rn').value });
        toast('Sent to the RCIC for review'); render(el, [a.id], { setTitle });
      } }],
    });
  });
  el.querySelector('#ret')?.addEventListener('click', () => modal({
    title: 'Return for changes',
    body: `<p style="margin-bottom:10px">${esc(staffName(a.review_requested_by))} gets a task with your note.</p><div class="field"><label>What needs to change</label><textarea class="input" id="rn" rows="4"></textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Return draft', cls: 'btn-primary', onClick: async (m) => {
      await save();
      await rpc('return_agreement_draft', { p_id: a.id, p_note: m.querySelector('#rn').value });
      toast('Returned with your note'); render(el, [a.id], { setTitle });
    } }],
  }));
  el.querySelector('#printDraft').onclick = () => { read(); printDoc(renderDoc(T, { ...d, number: number() }), `${number()} draft`, 'DRAFT for review — not for signing. To sign on paper, use “Sign on paper” so the printed copy is the one kept on file.'); };
  el.querySelector('#paper').onclick = async () => {
    try { await save(); } catch (e) { return fail(e); }
    const miss = requiredMissing(T, d);
    if (miss.length) return fail(new Error('Complete these first: ' + miss.join(', ')));
    if (!(await confirmBox('Sign on paper', 'This locks the agreement exactly as shown (it can no longer be edited, only voided) and opens it for printing. Everyone signs the printout, then you upload the scan. Continue?', 'Lock and print'))) return;
    try {
      const html = renderDoc(T, { ...d, number: number() });
      await rpc('prepare_paper_agreement', { p_id: a.id, p_body_html: html });
      printDoc(html, `${number()} ${a.title}`);
      toast('Locked for paper signing'); render(el, [a.id], { setTitle });
    } catch (e) { fail(e); }
  };
  el.querySelector('#send').onclick = async () => {
    try { await save(); } catch (e) { return fail(e); }
    const miss = requiredMissing(T, d);
    if (miss.length) return fail(new Error('Complete these first: ' + miss.join(', ')));
    let getSig;
    modal({
      title: 'Sign & send', body: `<p style="margin-bottom:10px">By signing, you confirm the terms as the RCIC. The document is then <b>frozen</b> (fingerprinted with SHA-256) and a private signing link is created for the client. It can no longer be edited, only voided.</p>
        <div id="pad"></div>`,
      onOpen: async (m) => { getSig = await signaturePad(m.querySelector('#pad'), { reuse: true }); },
      actions: [{ label: 'Cancel' }, { label: 'Sign & create link', cls: 'btn-gold', onClick: async () => {
        const sig = getSig(); if (!sig) throw new Error('Add your signature.');
        const r = await rpc('send_agreement', { p_id: a.id, p_body_html: renderDoc(T, { ...d, number: number() }), p_rcic_signature: sig });
        await getSig.remember().catch(() => {});
        toast('Agreement signed and ready to send');
        const { data: fresh } = await db.from('agreements').select('*, contacts(id, full_name, email, phone)').eq('id', a.id).single();
        await render(el, [a.id], { setTitle });
        shareModal(r.token, fresh);
      } }],
    });
  };
}
