import { db, state, can, esc, icon, fmtDateTime, staffName, rpc, toast, fail, modal, confirmBox } from '../core.js';
import { CL_STAGE, CL_LABEL, ITEM_STAGE, clBadge, stepProgress, progressBar } from './checklists.js';
import { uploadFile, openDoc, canUploadDocs } from '../files.js';

const PART = [['documents', '1. Documents from the client', 'folder'], ['forms', '2. Forms', 'file'], ['review', '3. RCIC final review', 'checksq']];
// Who can receive each step (the default roles; the owner can widen this on Team & Access).
const WORKERS = ['owner', 'rcic', 'case_manager', 'assistant'];
const people = (stage) => state.staff.filter((s) => s.active && (['rcic_review', 'approved'].includes(stage) ? ['owner', 'rcic'] : WORKERS).includes(s.role));

export async function render(el, [id], { setTitle }) {
  const { data: c, error } = await db.from('case_checklists').select('*, case_checklist_items(*), cases(id, case_number, title, application_type, contact_id, contacts(id, full_name, email, phone))').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Checklist not found.</div>'; return; }
  const client = c.cases?.contacts || {};
  setTitle(`${c.name} · ${client.full_name || ''}`);
  const work = can('checklists.work'), approve = can('cases.approve'), locked = c.stage === 'approved';
  const items = [...(c.case_checklist_items || [])].sort((x, y) => x.sort - y.sort);
  const { data: files } = await db.from('client_documents').select('id, name, checklist_item_id').in('checklist_item_id', items.map((i) => i.id).length ? items.map((i) => i.id) : ['00000000-0000-0000-0000-000000000000']);
  const filesOf = (iid) => (files || []).filter((f) => f.checklist_item_id === iid);
  const at = CL_STAGE.findIndex(([k]) => k === c.stage);
  const p = stepProgress(c);
  const mine = c.assigned_to === state.profile.id;
  const openDocs = items.filter((i) => i.stage === 'documents' && i.status === 'todo');

  const btn = (idName, label, cls = 'btn') => `<button class="btn ${cls}" id="${idName}">${label}</button>`;
  const actions = [];
  if (c.stage === 'documents' && work) actions.push(btn('next', `${icon('arrowr')} Documents complete — hand off for forms`, 'btn-gold'));
  if (c.stage === 'forms' && work) actions.push(btn('back', 'Back to documents'), btn('next', `${icon('arrowr')} Send to RCIC for final review`, 'btn-gold'));
  if (c.stage === 'rcic_review' && approve) actions.push(btn('ret', 'Return for changes'), btn('approve', `${icon('check')} Approve — ready to submit`, 'btn-gold'));
  if (locked && approve) actions.push(btn('reopen', 'Reopen'));
  if (!locked && (c.stage === 'rcic_review' ? approve : work)) actions.unshift(btn('reassign', `${icon('user')} Reassign`));

  const itemRow = (i) => {
    const canTick = !locked && (i.stage === 'review' ? approve : work);
    return `<div class="cl-item ${i.status}" data-id="${i.id}">
      <div class="cl-tick">${canTick
        ? `<button type="button" class="cl-b ${i.status === 'done' ? 'on' : ''}" data-set="done" title="${i.stage === 'documents' ? 'Received' : 'Done'}">${icon('check')}</button><button type="button" class="cl-b na ${i.status === 'na' ? 'on' : ''}" data-set="na" title="Not applicable">N/A</button>`
        : `<span class="cl-b on static">${i.status === 'done' ? icon('check') : i.status === 'na' ? 'N/A' : ''}</span>`}</div>
      <div class="cl-main"><div class="cl-label">${esc(i.label)}${i.required ? '' : ' <small class="cl-opt">if applicable</small>'}</div>
        ${i.done_at ? `<small class="cl-meta">${i.status === 'na' ? 'Marked N/A' : i.stage === 'documents' ? 'Received' : 'Done'} by ${esc(staffName(i.done_by))} · ${fmtDateTime(i.done_at)}</small>` : ''}
        ${filesOf(i.id).map((f) => `<a href="#" class="cl-file" data-file="${f.id}">${icon('file')} ${esc(f.name)}</a>`).join('')}
        ${canTick ? `<input class="input cl-note" data-note value="${esc(i.note || '')}" placeholder="Note (e.g. expires 2027-03, waiting for translation)">` : i.note ? `<small class="cl-meta">Note: ${esc(i.note)}</small>` : ''}</div>
      ${canTick && i.stage !== 'review' && canUploadDocs() ? `<label class="btn btn-ghost btn-sm" title="Upload to the client's OneDrive folder and tick this item">${icon('plus')} File<input type="file" data-up multiple hidden></label>` : ''}
      ${canTick && work ? `<button type="button" class="btn btn-ghost btn-sm" data-del title="Remove item" aria-label="Remove item">${icon('trash')}</button>` : ''}</div>`;
  };
  const part = ([k, title, ico]) => {
    const list = items.filter((i) => i.stage === k);
    const req = list.filter((i) => i.required), done = req.filter((i) => i.status !== 'todo').length;
    const current = ITEM_STAGE[c.stage] === k;
    let section = null;
    const rows = list.map((i) => { const h = i.section && i.section !== section ? `<div class="cl-sec">${esc(i.section)}</div>` : ''; section = i.section; return h + itemRow(i); }).join('');
    return `<details class="card cl-part ${current ? 'cur' : ''}" ${current || locked ? 'open' : ''}><summary class="card-h"><h3>${icon(ico)} ${title}</h3>
        <div class="row" style="gap:8px">${current && !locked ? '<span class="badge b-gold">Current step</span>' : ''}<small style="color:var(--muted)">${done} / ${req.length} required</small></div></summary>
      <div class="card-b">${rows || '<div class="dk-muted">No items.</div>'}
        ${!locked && work && (k !== 'review' || approve) ? `<div class="row cl-add" style="margin-top:10px;flex-wrap:nowrap"><input class="input" data-add="${k}" placeholder="Add an item to this list"><button class="btn btn-sm" data-addb="${k}">${icon('plus')} Add</button></div>` : ''}</div></details>`;
  };

  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/cases/${c.case_id}">← ${esc(c.cases?.case_number || 'Case')}</a><a class="btn btn-sm" href="#/checklists">All checklists</a>${clBadge(c.stage)}<div class="grow"></div>
      ${actions.join('')}</div>
    <div class="card" style="margin-bottom:16px"><div class="card-b">
      <div class="row" style="justify-content:space-between;margin-bottom:14px"><div><small style="color:var(--muted)">${esc(c.cases?.case_number || '')} · ${esc(c.cases?.application_type || '')}</small>
        <h2 style="font-family:var(--serif);color:var(--navy);font-size:21px">${esc(c.name)}</h2><a href="#/contacts/${client.id}">${esc(client.full_name || '')}</a></div>
        <div style="text-align:right"><small style="color:var(--muted)">Assigned to</small><div><b>${mine ? 'You' : esc(staffName(c.assigned_to))}</b></div>
          ${locked ? '' : `<div class="row" style="justify-content:flex-end;gap:8px;margin-top:4px">${progressBar(p)}</div>`}</div></div>
      <div class="stepper">${CL_STAGE.map(([k, l], i) => `<div class="st ${i < at || locked ? 'done' : i === at ? 'cur' : ''}"><i>${i < at || locked ? '✓' : i + 1}</i><span>${l}</span></div>`).join('')}</div>
      <div class="alert ${locked ? 'ok' : 'info'}" style="margin:14px 0 0">${locked ? `<b>Approved by ${esc(staffName(c.approved_by))}</b> · ${fmtDateTime(c.approved_at)}. The file is ready to submit. After submitting, update the case to “Submitted” and add the IRCC file number.`
        : `<b>${esc(CL_LABEL[c.stage])}:</b> ${esc(CL_STAGE[at][2])} ${c.stage === 'rcic_review' ? '' : 'Tick each item when it is in the file, or mark it N/A with a note. When every required item is done, hand it off with the button at the top.'}`}</div>
      ${c.stage === 'documents' && openDocs.length && (client.email || client.phone) && work ? `<div class="row" style="margin-top:12px;gap:8px"><b style="font-size:13px">Ask the client for what is missing (${openDocs.length}):</b>
        ${client.email ? `<button class="btn btn-sm" id="askEm">${icon('mail')} Email list</button>` : ''}${client.phone ? `<button class="btn btn-sm" id="askWa">WhatsApp list</button>` : ''}<button class="btn btn-sm" id="askCp">Copy list</button></div>` : ''}
    </div></div>
    <div class="grid g-main"><div>${PART.map(part).join('')}</div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>History</h3></div><div class="card-b timeline">
          ${[...(c.history || [])].reverse().map((h) => `<div class="tl"><div class="tl-dot">${icon(h.to === 'approved' ? 'check' : 'arrowr')}</div><div class="tl-body"><div class="meta">${fmtDateTime(h.at)} · ${esc(staffName(h.by))}</div>
            <b>${h.from ? (h.from === h.to ? 'Reassigned' : `${esc(CL_LABEL[h.from])} → ${esc(CL_LABEL[h.to])}`) : 'Checklist started'}</b>${h.assignee && h.to !== 'approved' ? ` · to ${esc(staffName(h.assignee))}` : ''}
            ${h.note && h.note !== 'Checklist started' ? `<div style="font-size:12.5px;color:var(--muted)">“${esc(h.note)}”</div>` : ''}</div></div>`).join('')}</div></div>
        <div class="card"><div class="card-b" style="font-size:12.5px;color:var(--muted)">Lists are a guide. Always confirm against IRCC's current instruction guide and document checklist for this application before submitting.
          ${approve && !locked ? '<div style="margin-top:10px"><button class="btn btn-sm btn-danger" id="delCl">Delete checklist</button></div>' : ''}</div></div>
      </div></div>`;

  const reload = () => render(el, [id], { setTitle });
  // Ticking items
  el.querySelectorAll('.cl-item').forEach((row) => {
    const iid = row.dataset.id, it = items.find((x) => x.id === iid);
    row.querySelectorAll('[data-set]').forEach((b) => (b.onclick = async () => {
      const status = it.status === b.dataset.set ? 'todo' : b.dataset.set;
      if (status === 'na' && it.required && !row.querySelector('[data-note]').value.trim()) { toast('Add a short note saying why it is not applicable'); row.querySelector('[data-note]').focus(); return; }
      const { error: e } = await db.from('case_checklist_items').update({ status, note: row.querySelector('[data-note]')?.value.trim() || null }).eq('id', iid);
      if (e) return fail(e);
      reload();
    }));
    row.querySelector('[data-note]')?.addEventListener('change', async (ev) => {
      const { error: e } = await db.from('case_checklist_items').update({ note: ev.target.value.trim() || null }).eq('id', iid);
      e ? fail(e) : toast('Note saved');
    });
    row.querySelector('[data-up]')?.addEventListener('change', async (ev) => {
      const fs = [...ev.target.files]; if (!fs.length) return;
      const lab = ev.target.closest('label');
      try {
        for (const [n, f] of fs.entries()) await uploadFile(f, { contactId: client.id, category: it.stage === 'forms' ? 'forms' : 'documents', docType: it.label, checklistItemId: iid },
          (p) => { lab.textContent = `${fs.length > 1 ? `${n + 1}/${fs.length} ` : ''}${Math.round(p * 100)}%`; });
        if (it.status === 'todo') await db.from('case_checklist_items').update({ status: 'done' }).eq('id', iid);
        toast('Saved to the client folder'); reload();
      } catch (e) { fail(e); reload(); }
    });
    row.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmBox('Remove item', `Remove “${it.label}” from this checklist?`, 'Remove', true))) return;
      const { error: e } = await db.from('case_checklist_items').delete().eq('id', iid);
      e ? fail(e) : reload();
    });
  });
  el.querySelectorAll('[data-file]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.file); }));
  el.querySelectorAll('[data-addb]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.addb, inp = el.querySelector(`[data-add="${k}"]`), label = inp.value.trim();
    if (!label) return inp.focus();
    const last = items.filter((i) => i.stage === k).pop();
    const { error: e } = await db.from('case_checklist_items').insert({ checklist_id: id, stage: k, section: last?.section || null, label, required: true, sort: Math.max(0, ...items.map((i) => i.sort)) + 1 });
    e ? fail(e) : reload();
  }));

  // Hand-offs
  const handoff = (to, { title, intro, button, needPerson = true, cls = 'btn-gold' }) => modal({
    title,
    body: `${intro ? `<p style="margin-bottom:10px">${intro}</p>` : ''}
      ${needPerson ? `<div class="field"><label>Who works on it next</label><select class="input" id="who">${people(to).map((s) => `<option value="${s.id}">${esc(s.full_name || s.email)}${s.id === state.profile.id ? ' (me)' : ''} — ${esc(s.job_title || s.role.replace('_', ' '))}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Note${c.stage === 'rcic_review' && !['approved', 'rcic_review'].includes(to) ? ' — what needs to change' : ' (optional)'}</label><textarea class="input" id="nt" rows="3"></textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: button, cls, onClick: async (m) => {
      const note = m.querySelector('#nt').value.trim();
      if (c.stage === 'rcic_review' && to !== 'approved' && to !== c.stage && !note) throw new Error('Say what needs to change.');
      await rpc('checklist_handoff', { p_id: id, p_stage: to, p_assignee: needPerson ? m.querySelector('#who').value : null, p_note: note || null });
      toast('Done'); window.dispatchEvent(new Event('refresh-counts')); reload();
    } }],
  });
  el.querySelector('#next')?.addEventListener('click', () => {
    if (p.done < p.total) return fail(new Error(`${p.total - p.done} required item(s) in this step are still open. Tick them, or mark them N/A with a note.`));
    c.stage === 'documents'
      ? handoff('forms', { title: 'Hand off for forms', intro: 'All required documents are in. Choose the case manager or RCIC who will prepare the forms. They get a task.', button: 'Hand off' })
      : handoff('rcic_review', { title: 'Send to RCIC for final review', intro: 'Forms are complete. The RCIC gets a task to review and approve the file.', button: 'Send for review' });
  });
  el.querySelector('#back')?.addEventListener('click', () => handoff('documents', { title: 'Back to document collection', intro: 'Send it back when a document is missing or needs replacing.', button: 'Send back', cls: 'btn-primary' }));
  el.querySelector('#ret')?.addEventListener('click', () => modal({
    title: 'Return for changes',
    body: `<div class="field"><label>Send back to</label><select class="input" id="to"><option value="forms">Forms preparation</option><option value="documents">Document collection</option></select></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Next', cls: 'btn-primary', onClick: async (m) => {
      const to = m.querySelector('#to').value;
      setTimeout(() => handoff(to, { title: `Return to ${CL_LABEL[to].toLowerCase()}`, intro: 'Say exactly what needs to change. The person you choose gets a task with your note.', button: 'Return', cls: 'btn-primary' }));
    } }],
  }));
  el.querySelector('#approve')?.addEventListener('click', () => {
    if (p.done < p.total) return fail(new Error(`${p.total - p.done} final review item(s) are still open.`));
    handoff('approved', { title: 'Approve — ready to submit', intro: 'You confirm the package is complete and accurate and can be submitted to IRCC. The person who prepared the forms gets a task to submit it.', button: 'Approve', needPerson: false });
  });
  el.querySelector('#reopen')?.addEventListener('click', () => handoff('rcic_review', { title: 'Reopen for review', button: 'Reopen', cls: 'btn-primary' }));
  el.querySelector('#reassign')?.addEventListener('click', () => handoff(c.stage, { title: 'Reassign this step', intro: `Give “${CL_LABEL[c.stage]}” to someone else. They get a task.`, button: 'Reassign', cls: 'btn-primary' }));
  el.querySelector('#delCl')?.addEventListener('click', async () => {
    if (!(await confirmBox('Delete checklist', 'Delete this checklist and everything ticked in it?', 'Delete', true))) return;
    const { error: e } = await db.from('case_checklists').delete().eq('id', id);
    if (e) return fail(e);
    toast('Checklist deleted'); location.hash = `#/cases/${c.case_id}`;
  });

  // Ask the client for the missing documents
  const first = String(client.full_name || '').split(' ')[0];
  const listText = () => openDocs.map((i) => `• ${i.label}`).join('\n');
  const message = () => `Hello ${first},\n\nTo prepare your ${c.cases?.application_type || 'application'}, we still need the following documents:\n\n${listText()}\n\nYou can reply with clear scans or photos (every page). If anything is hard to get, let us know and we will help.\n\nThank you,\nGraceful Immigration Consultant Inc.\n(403) 915-4230`;
  el.querySelector('#askEm')?.addEventListener('click', async () => (await import('../crm.js')).composeEmail({ contact: client, subject: `Documents needed for your ${c.cases?.application_type || 'application'}`, body: message() }));
  el.querySelector('#askWa')?.addEventListener('click', () => window.open(`https://wa.me/${String(client.phone).replace(/\D/g, '').replace(/^(?=\d{10}$)/, '1')}?text=${encodeURIComponent(message())}`, '_blank', 'noopener'));
  el.querySelector('#askCp')?.addEventListener('click', async () => { await navigator.clipboard.writeText(message()).catch(() => {}); toast('Message copied'); });
}
