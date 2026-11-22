// Client file tabs: File (people, scope, risk & complexity, representation forms, closing),
// Deadlines & IRCC (deadlines and the correspondence log with the scope question) and Forms (data sheet, history, checker, signing packet).
import { db, state, can, esc, icon, fmtDate, modal, confirmBox, toast, fail, today, rpc, staffName, staffOptions } from '../core.js';
import { RISK, points, tierOf, factorFor, REP_STATE, REP_FORM, repBadge, DL_KIND, DL_OWNER, PAYMENT_MODEL, duePill, daysTo, loadFile, saveFile, orgRules,
  checkFile, dataSheet, BACKGROUND, signingPacket } from '../practice.js';

const editOK = () => can('crm.edit');
const contactsSelect = (list, sel, blank) => `<option value="">${esc(blank)}</option>` + list.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.full_name)}</option>`).join('');

// ───────────────────────── File tab ─────────────────────────
export async function filePanel(body, c) {
  const [f, s, { data: reps }, { data: cases }, { data: people }, checks] = await Promise.all([loadFile(c.id), orgRules(),
    db.from('rep_forms').select('*').eq('contact_id', c.id).order('created_at', { ascending: false }),
    db.from('cases').select('*').eq('contact_id', c.id).order('created_at', { ascending: false }),
    db.from('contacts').select('id, full_name').neq('id', c.id).order('full_name').limit(1000),
    rpc('file_closing_check', { p_contact: c.id }).catch(() => [])]);
  const ed = editOK() && !f.closed_at, pricing = s.pricing || {}, flags = f.risk_flags || [], pts = points(flags);
  const related = f.related || [];
  body.innerHTML = `
    ${f.closed_at ? `<div class="alert info"><b>File closed ${fmtDate(f.closed_at)}</b> by ${esc(staffName(f.closed_by))}. Keep until ${fmtDate(f.retention_until)}. ${can('files.close') ? '<button class="btn btn-sm" id="reopen" style="margin-left:8px">Reopen file</button>' : ''}</div>` : ''}
    <div class="grid g-2" style="align-items:start;gap:16px">
      <div class="card"><div class="card-h"><h3>${icon('users')} People on this file</h3></div><div class="card-b">
        <p class="dk-muted" style="font-size:12.5px;margin-bottom:10px">The client and the payer are always separate, even when they are the same person. Only the client gives instructions.</p>
        <div class="row-2"><div class="field"><label>Client</label><input class="input" value="${esc(c.full_name)}" disabled></div>
          <div class="field"><label>Payer</label><select class="input" id="fpay" ${ed ? '' : 'disabled'}>${contactsSelect(people || [], f.payer_contact_id, 'The client pays')}</select></div></div>
        <div class="row-2"><div class="field"><label>Sponsor or related party</label><select class="input" id="fsp" ${ed ? '' : 'disabled'}>${contactsSelect(people || [], f.sponsor_contact_id, 'None')}</select></div>
          <div class="field"><label>Other names used (aliases)</label><input class="input" id="fal" value="${esc(f.aliases || '')}" ${ed ? '' : 'disabled'}></div></div>
        <div class="field"><label>Joint clients and other people</label><div id="frel">${related.map((r, i) => `<div class="row" style="gap:6px;margin-bottom:6px"><span class="badge plain">${esc(r.role)}</span> <a href="#/contacts/${r.contact_id}">${esc(r.name)}</a>${ed ? ` <button class="btn btn-ghost btn-sm" data-delrel="${i}" aria-label="Remove">${icon('x')}</button>` : ''}</div>`).join('') || '<small class="dk-muted">None</small>'}</div>
          ${ed ? `<div class="row" style="gap:6px;margin-top:6px"><select class="input" id="frelc" style="max-width:220px">${contactsSelect(people || [], null, 'Add a person…')}</select>
            <select class="input" id="frelr" style="max-width:170px">${['Joint client', 'Spouse / partner', 'Dependent child', 'Sponsor', 'Co-signer', 'Employer', 'Other'].map((x) => `<option>${x}</option>`).join('')}</select></div>` : ''}</div>
        <div class="row-2"><label class="row" style="gap:8px;margin-top:6px"><input type="checkbox" id="fint" ${f.interpreter_needed ? 'checked' : ''} ${ed ? '' : 'disabled'}> Interpreter needed</label>
          <div class="field"><input class="input" id="fintl" placeholder="Interpreter language" value="${esc(f.interpreter_language || '')}" ${ed ? '' : 'disabled'}></div></div>
        <div class="field"><label>Payment model</label><select class="input" id="fpm" ${ed ? '' : 'disabled'}><option value="">Not chosen</option>${Object.entries(PAYMENT_MODEL).map(([k, l]) => `<option value="${k}" ${f.payment_model === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <small class="dk-muted">For small staged work, B is simplest and safest.</small></div>
        <div class="field"><label>Scope (what we promised — from the agreement and addenda)</label><textarea class="input" id="fsc" rows="3" ${ed ? '' : 'disabled'} placeholder="e.g. Status check; ATIP request; one email to IRCC. Everything else needs an addendum.">${esc(f.scope_text || '')}</textarea></div>
        <div class="row-2"><div class="field"><label>Scope ends</label><input class="input" type="date" id="fse" value="${f.scope_end || ''}" ${ed ? '' : 'disabled'}></div><div></div></div>
        ${ed ? '<button class="btn btn-primary btn-sm" id="fsave">Save file details</button>' : ''}
      </div></div>

      <div class="card"><div class="card-h"><h3>${icon('alert')} Risk flags & complexity</h3><span class="badge ${pts >= 4 ? 'b-RED' : pts >= 2 ? 'b-AMBER' : 'b-GREEN'}">${pts} point${pts === 1 ? '' : 's'} · ×${factorFor(pts, pricing).toFixed(2)}</span></div><div class="card-b">
        ${pts >= 4 ? '<div class="alert warn" style="margin-bottom:10px">4 or more points: review personally before quoting.</div>' : ''}
        <div id="frisk">${RISK.map(([k, l, scoring, todo]) => `<label class="row" style="gap:8px;align-items:flex-start;margin-bottom:6px"><input type="checkbox" data-flag="${k}" ${flags.includes(k) ? 'checked' : ''} ${ed ? '' : 'disabled'} style="margin-top:3px">
          <span><b style="font-weight:600">${esc(l)}</b>${scoring ? ' <small class="badge plain">+1</small>' : ''}${flags.includes(k) ? `<br><small style="color:var(--navy)">→ ${esc(todo)}</small>` : ''}</span></label>`).join('')}</div>
        <div class="field" style="margin-top:8px"><label>Risk notes (stay on the file only — never in emails to a payer)</label><textarea class="input" id="frn" rows="2" ${ed ? '' : 'disabled'}>${esc(f.risk_notes || '')}</textarea></div>
        ${ed ? '<button class="btn btn-sm" id="frsave">Save risk flags</button>' : ''}
      </div></div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-h"><h3>${icon('file')} Representation — IMM 5476 and IMM 5744</h3>${ed ? `<button class="btn btn-sm btn-gold" id="addRep">${icon('plus')} Track a form</button>` : ''}</div><div class="card-b">
      <p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">Wet-ink forms: tracked as printed → signed in ink → scanned → filed, and never e-signed. IMM 5476 is needed for any communication with IRCC on the client’s behalf (not for advice only). When the work ends, record the Section D withdrawal.</p>
      ${(reps || []).length ? `<table class="t"><thead><tr><th>Form</th><th>Status</th><th>Box</th><th>Signed</th><th>Filed</th><th>Expires / withdrawn</th><th></th></tr></thead><tbody>${reps.map((r) => `<tr>
        <td><b>${esc(REP_FORM[r.form])}</b>${r.case_id ? `<br><small class="dk-muted">${esc((cases || []).find((k) => k.id === r.case_id)?.case_number || '')}</small>` : ''}</td><td>${repBadge(r.state)}</td><td>${r.paid_box ? esc(r.paid_box) : '—'}</td>
        <td>${r.signed_on || '—'}</td><td>${r.filed_on || '—'}</td><td>${r.withdrawn_on ? 'Withdrawn ' + r.withdrawn_on : r.expires_on ? `${r.expires_on} ${duePill(r.expires_on)}` : '—'}</td>
        <td>${ed ? `<button class="btn btn-sm" data-rep="${r.id}">Update</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:14px">No IMM 5476 or IMM 5744 tracked yet.</div>'}
    </div></div>

    <div class="grid g-2" style="align-items:start;gap:16px;margin-top:16px">
      <div class="card"><div class="card-h"><h3>${icon('briefcase')} Applications</h3></div><div class="card-b">
        ${(cases || []).length ? cases.map((k) => `<div style="border-bottom:1px solid var(--line);padding:8px 0"><a href="#/cases/${k.id}"><b>${esc(k.case_number)}</b> · ${esc(k.title)}</a>
          <dl class="kv" style="margin-top:4px"><dt>Program</dt><dd>${esc(k.application_type || '—')}</dd><dt>Application no.</dt><dd>${esc(k.ircc_file_number || '—')}</dd><dt>UCI</dt><dd>${esc(k.uci || '—')}</dd>
          <dt>Visa office</dt><dd>${esc(k.visa_office || '—')}</dd><dt>IRCC status</dt><dd>${esc(k.ircc_status || '—')}${k.ircc_checked_on ? ` <small class="dk-muted">(checked ${k.ircc_checked_on})</small>` : ''}</dd>
          <dt>Next action</dt><dd>${esc(k.next_action || '—')}${k.next_action_on ? ` · ${k.next_action_on} ${duePill(k.next_action_on)}` : ''}</dd></dl></div>`).join('') : '<div class="empty" style="padding:14px">No applications (cases) yet. Use New ▾ → Case.</div>'}
      </div></div>
      <div class="card"><div class="card-h"><h3>${icon('lock')} Closing the file</h3>${f.closed_at ? '<span class="badge b-GREEN">Closed</span>' : ''}</div><div class="card-b">
        ${(checks || []).map((x) => `<div class="row" style="gap:8px;margin-bottom:6px;align-items:flex-start"><span style="color:${x.ok ? 'var(--green)' : 'var(--red)'};font-weight:700">${x.ok ? '✓' : '✗'}</span><span>${esc(x.label)}${x.detail ? `<br><small class="dk-muted">${esc(x.detail)}</small>` : ''}</span></div>`).join('')}
        ${!f.closed_at ? `<div class="row-2" style="margin-top:10px"><div class="field"><label>Keep the file until</label><input class="input" type="date" id="fret" value="${f.retention_until || addYears(Number(s.rules?.retention_years || 6))}" ${ed ? '' : 'disabled'}></div><div></div></div>
          <small class="dk-muted">Retention: ${Number(s.rules?.retention_years || 6)} years (Settings → Pricing & rules — confirm the College’s period).</small>
          <div class="row" style="gap:8px;margin-top:10px">${ed ? '<button class="btn btn-sm" id="fclLetter">Closing letter</button>' : ''}${can('files.close') ? '<button class="btn btn-sm btn-primary" id="fclose">Close file</button>' : ''}</div>` : ''}
      </div></div>
    </div>`;

  const rerender = () => filePanel(body, c);
  body.querySelector('#reopen')?.addEventListener('click', () => modal({ title: 'Reopen file', body: '<div class="field"><label>Why is the file being reopened?</label><textarea class="input" id="rr" rows="3"></textarea></div>',
    actions: [{ label: 'Cancel' }, { label: 'Reopen', cls: 'btn-primary', onClick: async (m) => { await rpc('reopen_client_file', { p_contact: c.id, p_reason: m.querySelector('#rr').value }); toast('File reopened'); rerender(); } }] }));
  if (!ed) { wireClose(); return; }
  const rel = [...related];
  body.querySelector('#frelc')?.addEventListener('change', (e) => {
    const p = (people || []).find((x) => x.id === e.target.value); e.target.value = ''; if (!p) return;
    rel.push({ contact_id: p.id, name: p.full_name, role: body.querySelector('#frelr').value });
    body.querySelector('#frel').innerHTML = rel.map((r) => `<div class="row" style="gap:6px;margin-bottom:6px"><span class="badge plain">${esc(r.role)}</span> ${esc(r.name)} <small class="dk-muted">(save to keep)</small></div>`).join('');
  });
  body.querySelectorAll('[data-delrel]').forEach((b) => (b.onclick = async () => { rel.splice(+b.dataset.delrel, 1); try { await saveFile(c.id, { related: rel }); toast('Removed'); rerender(); } catch (e) { fail(e); } }));
  body.querySelector('#fsave').onclick = async () => {
    const v = (s) => body.querySelector(s).value;
    try {
      await saveFile(c.id, { payer_contact_id: v('#fpay') || null, sponsor_contact_id: v('#fsp') || null, aliases: v('#fal').trim() || null, related: rel,
        interpreter_needed: body.querySelector('#fint').checked, interpreter_language: v('#fintl').trim() || null, payment_model: v('#fpm') || null,
        scope_text: v('#fsc').trim() || null, scope_end: v('#fse') || null });
      toast('File details saved'); rerender();
    } catch (e) { fail(e); }
  };
  body.querySelector('#frsave').onclick = async () => {
    const nf = [...body.querySelectorAll('[data-flag]:checked')].map((x) => x.dataset.flag);
    try { await saveFile(c.id, { risk_flags: nf, risk_notes: body.querySelector('#frn').value.trim() || null }); toast(`Risk flags saved — ${points(nf)} complexity point(s)`); rerender(); } catch (e) { fail(e); }
  };
  body.querySelector('#addRep').onclick = () => repModal(c, null, cases || [], rerender);
  body.querySelectorAll('[data-rep]').forEach((b) => (b.onclick = () => repModal(c, reps.find((r) => r.id === b.dataset.rep), cases || [], rerender)));
  body.querySelector('#fclLetter')?.addEventListener('click', async () => (await import('./agreements.js')).newAgreement({ contactId: c.id, type: 'termination' }));
  wireClose();
  function wireClose() {
    body.querySelector('#fclose')?.addEventListener('click', async () => {
      const ret = body.querySelector('#fret')?.value;
      if (!ret) return fail(new Error('Set the retention-until date.'));
      if (!(await confirmBox('Close file', `Close ${c.full_name}'s file and keep it until ${ret}?`, 'Close file'))) return;
      try { await rpc('close_client_file', { p_contact: c.id, p_retention: ret }); toast('File closed'); rerender(); } catch (e) { fail(e); }
    });
  }
}
const addYears = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toLocaleDateString('en-CA'); };

function repModal(c, r, cases, done) {
  modal({
    title: r ? `Update ${REP_FORM[r.form]}` : 'Track a representation form',
    body: `<div class="row-2"><div class="field"><label>Form</label><select class="input" id="rf" ${r ? 'disabled' : ''}>${Object.entries(REP_FORM).map(([k, l]) => `<option value="${k}" ${r?.form === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Application (case)</label><select class="input" id="rc"><option value="">Not linked</option>${cases.map((k) => `<option value="${k.id}" ${r?.case_id === k.id ? 'selected' : ''}>${esc(k.case_number)} · ${esc(k.title)}</option>`).join('')}</select></div></div>
      <div class="row-2"><div class="field"><label>Status</label><select class="input" id="rs">${Object.entries(REP_STATE).map(([k, l]) => `<option value="${k}" ${(r?.state || 'printed') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field" id="rpw"><label>Representative box ticked</label><select class="input" id="rp"><option value="">—</option><option value="paid" ${r?.paid_box === 'paid' ? 'selected' : ''}>Paid (member of CICC)</option><option value="unpaid" ${r?.paid_box === 'unpaid' ? 'selected' : ''}>Unpaid</option></select></div></div>
      <div class="row-2"><div class="field"><label>Signed in ink on (YYYY-MM-DD)</label><input class="input" type="date" id="rsd" value="${r?.signed_on || ''}"></div>
        <div class="field"><label>Filed with IRCC on</label><input class="input" type="date" id="rfd" value="${r?.filed_on || ''}"></div></div>
      <div class="row-2"><div class="field"><label>Withdrawn (Section D) on</label><input class="input" type="date" id="rwd" value="${r?.withdrawn_on || ''}"></div><div></div></div>
      <div class="field"><label>Notes</label><input class="input" id="rn" value="${esc(r?.notes || '')}"></div>
      <div class="alert info" style="font-size:12.5px">Before printing, check your phone, address and firm name on the form against Business Settings. Signatures are original ink (blue), never electronic. IMM 5744 expiry is set automatically from the signature date.</div>`,
    onOpen: (m) => { const sync = () => { m.querySelector('#rpw').hidden = m.querySelector('#rf').value !== 'IMM5476'; }; m.querySelector('#rf').onchange = sync; sync(); },
    actions: [...(r ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!(await confirmBox('Delete', 'Remove this form record?', 'Delete', true))) return false; const { error } = await db.from('rep_forms').delete().eq('id', r.id); if (error) throw error; toast('Removed'); done(); } }] : []),
      { label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const v = (s) => m.querySelector(s).value || null;
        const row = { case_id: v('#rc'), state: v('#rs'), paid_box: m.querySelector('#rf').value === 'IMM5476' ? v('#rp') : null, signed_on: v('#rsd'), filed_on: v('#rfd'), withdrawn_on: v('#rwd'), notes: v('#rn') };
        const { error } = r ? await db.from('rep_forms').update(row).eq('id', r.id) : await db.from('rep_forms').insert({ ...row, contact_id: c.id, form: v('#rf'), created_by: state.profile.id });
        if (error) throw error; toast('Saved'); done();
      } }],
  });
}

// ───────────────────────── Deadlines & IRCC tab ─────────────────────────
export async function deadlinesPanel(body, c) {
  const [{ data: dls }, { data: corr }, { data: cases }] = await Promise.all([
    db.from('deadlines').select('*').eq('contact_id', c.id).order('done').order('due_on'),
    db.from('correspondence').select('*').eq('contact_id', c.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    db.from('cases').select('id, case_number, title').eq('contact_id', c.id)]);
  const ed = editOK();
  body.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:8px"><h4 style="margin:0;color:var(--navy)">Deadlines</h4>
      ${ed ? `<button class="btn btn-sm" id="addDl">${icon('plus')} Add deadline</button>` : ''}</div>
    ${deadlineTable(dls || [], ed)}
    <div class="row" style="justify-content:space-between;margin:22px 0 8px"><h4 style="margin:0;color:var(--navy)">Correspondence log</h4>
      ${ed ? `<button class="btn btn-sm btn-gold" id="logC">${icon('mail')} Log IRCC letter / correspondence</button>` : ''}</div>
    <p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">Everything to and from IRCC. Logging an IRCC letter with a response period creates the deadline (alerts 14, 7 and 2 days before). Letters outside the current scope create a task to forward them to the client the same day and offer an addendum.</p>
    ${(corr || []).length ? `<table class="t"><thead><tr><th>Date</th><th>Correspondence</th><th>In scope</th><th>Client informed</th><th>Addendum</th></tr></thead><tbody>${corr.map((r) => `<tr>
      <td>${r.occurred_on}</td><td><b>${r.direction === 'in' ? '↓ From' : '↑ To'} ${esc({ ircc: 'IRCC', client: 'client', payer: 'payer', sponsor: 'sponsor', other: 'other' }[r.party])}</b> · ${esc(r.channel)}<br>${esc(r.subject)}${r.summary ? `<br><small class="dk-muted">${esc(r.summary)}</small>` : ''}${r.deadline_id ? '<br><small style="color:var(--navy)">Deadline created</small>' : ''}</td>
      <td>${r.in_scope === null ? '—' : r.in_scope ? 'Yes' : '<span class="badge b-AMBER">No</span>'}</td>
      <td>${ed ? `<input type="checkbox" data-inf="${r.id}" ${r.client_informed ? 'checked' : ''}>` : r.client_informed ? 'Yes' : 'No'} ${r.client_informed_on ? `<small class="dk-muted">${r.client_informed_on}</small>` : ''}</td>
      <td>${r.addendum_status ? (ed ? `<select class="input" data-add="${r.id}" style="min-width:120px">${['pending', 'offered', 'accepted', 'declined', 'not_needed'].map((x) => `<option value="${x}" ${r.addendum_status === x ? 'selected' : ''}>${x.replace('_', ' ')}</option>`).join('')}</select>` : esc(r.addendum_status)) : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty" style="padding:14px">Nothing logged yet.</div>'}`;
  const again = () => deadlinesPanel(body, c);
  wireDeadlines(body, dls || [], again);
  body.querySelector('#addDl')?.addEventListener('click', () => deadlineModal({ contactId: c.id, cases: cases || [], done: again }));
  body.querySelector('#logC')?.addEventListener('click', () => logCorrespondence({ contact: c, cases: cases || [], done: again }));
  body.querySelectorAll('[data-inf]').forEach((cb) => (cb.onchange = async () => {
    const { error } = await db.from('correspondence').update({ client_informed: cb.checked, client_informed_on: cb.checked ? today() : null }).eq('id', cb.dataset.inf);
    if (error) fail(error); else toast(cb.checked ? 'Marked: client informed' : 'Updated');
  }));
  body.querySelectorAll('[data-add]').forEach((sel) => (sel.onchange = async () => {
    const { error } = await db.from('correspondence').update({ addendum_status: sel.value }).eq('id', sel.dataset.add);
    if (error) return fail(error);
    toast('Addendum status saved');
    if (sel.value === 'accepted' && await confirmBox('Addendum accepted', 'Prepare the amendment (addendum) now? Nothing outside the scope starts until it is signed.', 'Prepare amendment'))
      (await import('./agreements.js')).newAgreement({ contactId: c.id, type: 'amendment' });
  }));
}

export function deadlineTable(dls, ed, showClient = false) {
  if (!dls.length) return '<div class="empty" style="padding:14px">No deadlines.</div>';
  return `<table class="t"><thead><tr><th style="width:34px"></th>${showClient ? '<th>Client</th>' : ''}<th>Deadline</th><th>Due</th><th>Owner</th><th>Assigned</th><th></th></tr></thead><tbody>${dls.map((d) => `<tr style="${!d.done && daysTo(d.due_on) < 0 ? 'background:#FEF3F2' : ''}">
    <td>${ed ? `<input type="checkbox" data-dldone="${d.id}" ${d.done ? 'checked' : ''} aria-label="Done">` : ''}</td>
    ${showClient ? `<td><a href="#/contacts/${d.contact_id}">${esc(d.contacts?.full_name || '')}</a></td>` : ''}
    <td><b style="${d.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(d.title)}</b><br><small class="dk-muted">${esc(DL_KIND[d.kind] || d.kind)}${d.source ? ' · ' + esc(d.source) : ''}${d.kind === 'court' ? ' · <b style="color:var(--red)">refer to a lawyer</b>' : ''}</small></td>
    <td>${d.due_on}<br>${duePill(d.due_on, d.done)}</td><td>${esc(DL_OWNER[d.owner])}</td><td>${esc(staffName(d.assigned_to))}</td>
    <td>${ed ? `<button class="btn btn-ghost btn-sm" data-dldel="${d.id}" aria-label="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
}
export function wireDeadlines(body, dls, again) {
  body.querySelectorAll('[data-dldone]').forEach((cb) => (cb.onchange = async () => {
    const d = dls.find((x) => x.id === cb.dataset.dldone);
    const patch = { done: cb.checked, done_at: cb.checked ? new Date().toISOString() : null };
    if (cb.checked && d?.kind === 'ircc_letter') patch.response_sent = await confirmBox('Response sent?', 'Was the response sent to IRCC? (Saved on the deadline for the record.)', 'Yes, sent');
    const { error } = await db.from('deadlines').update(patch).eq('id', cb.dataset.dldone);
    if (error) return fail(error); toast(cb.checked ? 'Deadline done' : 'Reopened'); window.dispatchEvent(new Event('refresh-counts')); again();
  }));
  body.querySelectorAll('[data-dldel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Delete deadline', 'Delete this deadline?', 'Delete', true))) return;
    const { error } = await db.from('deadlines').delete().eq('id', b.dataset.dldel); if (error) return fail(error); again();
  }));
}

export async function deadlineModal({ contactId = null, cases = [], done }) {
  const contacts = contactId ? null : (await db.from('contacts').select('id, full_name').order('full_name').limit(1000)).data;
  modal({
    title: 'Add deadline',
    body: `${contacts ? `<div class="field"><label>Client</label><select class="input" id="dc">${contactsSelect(contacts, null, 'Choose…')}</select></div>` : ''}
      <div class="field"><label>Deadline</label><input class="input" id="dt" placeholder="e.g. Medical exam results valid until"></div>
      <div class="row-2"><div class="field"><label>Type</label><select class="input" id="dk">${Object.entries(DL_KIND).map(([k, l]) => `<option value="${k}" ${k === 'internal' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Due date</label><input class="input" type="date" id="dd"></div></div>
      <div class="row-2"><div class="field"><label>Owner</label><select class="input" id="do">${Object.entries(DL_OWNER).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Assigned to</label><select class="input" id="da">${staffOptions(state.profile.id)}</select></div></div>
      ${cases.length ? `<div class="field"><label>Application (case)</label><select class="input" id="dcase"><option value="">Not linked</option>${cases.map((k) => `<option value="${k.id}">${esc(k.case_number)} · ${esc(k.title)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Source document</label><input class="input" id="ds" placeholder="e.g. IRCC letter of 2026-11-20, passport, medical report"></div>
      <div class="alert info" style="font-size:12.5px">Alerts by email 14, 7 and 2 days before, and when overdue. Federal Court / appeal windows are flagged immediately — refer to a lawyer.</div>`,
    actions: [{ label: 'Cancel' }, { label: 'Add deadline', cls: 'btn-primary', onClick: async (m) => {
      const v = (s) => m.querySelector(s)?.value || '';
      const cid = contactId || v('#dc');
      if (!cid) throw new Error('Choose a client.'); if (!v('#dt').trim()) throw new Error('Describe the deadline.'); if (!v('#dd')) throw new Error('Pick the due date.');
      const { error } = await db.from('deadlines').insert({ contact_id: cid, title: v('#dt').trim(), kind: v('#dk'), due_on: v('#dd'), owner: v('#do'), assigned_to: v('#da') || state.profile.id,
        case_id: v('#dcase') || null, source: v('#ds').trim() || null, created_by: state.profile.id });
      if (error) throw error; toast('Deadline added'); window.dispatchEvent(new Event('refresh-counts')); done?.();
    } }],
  });
}

export function logCorrespondence({ contact: c, cases = [], done }) {
  modal({
    title: `Log correspondence — ${c.full_name}`, wide: true,
    body: `<div class="row-2"><div class="field"><label>Direction</label><select class="input" id="cd"><option value="in">Received (incoming)</option><option value="out">Sent (outgoing)</option></select></div>
        <div class="field"><label>With</label><select class="input" id="cp"><option value="ircc">IRCC</option><option value="client">Client</option><option value="payer">Payer</option><option value="sponsor">Sponsor</option><option value="other">Other</option></select></div></div>
      <div class="row-2"><div class="field"><label>Date of the letter / message</label><input class="input" type="date" id="co" value="${today()}"></div>
        <div class="field"><label>Channel</label><select class="input" id="cch">${['IRCC portal', 'GCKey / online account', 'Email', 'Mail', 'Web form', 'Phone', 'In person', 'Client portal'].map((x) => `<option>${x}</option>`).join('')}</select></div></div>
      ${cases.length ? `<div class="field"><label>Application (case)</label><select class="input" id="ccase"><option value="">Not linked</option>${cases.map((k) => `<option value="${k.id}">${esc(k.case_number)} · ${esc(k.title)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Subject</label><input class="input" id="cs" placeholder="e.g. Procedural fairness letter — admissibility"></div>
      <div class="field"><label>Summary</label><textarea class="input" id="csum" rows="2" placeholder="What it says / what was sent. No sensitive details if a payer could see this later."></textarea></div>
      <div id="irccBox" style="border:1px dashed var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px">
        <div class="row-2"><div class="field"><label>Response period (days, if IRCC set one)</label><input class="input" type="number" min="1" max="365" id="crd" placeholder="e.g. 30"></div>
          <div class="field"><label>Due date</label><input class="input" id="cdue" disabled></div></div>
        <div class="field"><label><b>Is this inside the current scope?</b> (required)</label>
          <div class="row" style="gap:16px"><label class="row" style="gap:6px"><input type="radio" name="sc" value="true"> Yes — inside the agreement</label><label class="row" style="gap:6px"><input type="radio" name="sc" value="false"> No — outside the scope</label></div>
          <small class="dk-muted">If not: the client gets the letter the same day and is offered an addendum before any work on it.</small></div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="cinf"> The client has already been informed</label>`,
    onOpen: (m) => {
      const sync = () => {
        m.querySelector('#irccBox').hidden = !(m.querySelector('#cd').value === 'in' && m.querySelector('#cp').value === 'ircc');
        const n = Number(m.querySelector('#crd').value), d = m.querySelector('#co').value;
        m.querySelector('#cdue').value = n > 0 && d ? new Date(new Date(d + 'T00:00:00').getTime() + n * 86400000).toLocaleDateString('en-CA') : '';
      };
      m.addEventListener('input', sync); m.addEventListener('change', sync); sync();
    },
    actions: [{ label: 'Cancel' }, { label: 'Log it', cls: 'btn-gold', onClick: async (m) => {
      const v = (s) => m.querySelector(s)?.value || '';
      const ircc = v('#cd') === 'in' && v('#cp') === 'ircc', sc = m.querySelector('input[name=sc]:checked')?.value;
      if (!v('#cs').trim()) throw new Error('Enter a subject.');
      if (ircc && !sc) throw new Error('Answer the scope question: is this IRCC letter inside the current scope?');
      const r = await rpc('log_correspondence', { p: { contact_id: c.id, case_id: v('#ccase') || null, occurred_on: v('#co'), direction: v('#cd'), party: v('#cp'), channel: v('#cch'),
        subject: v('#cs').trim(), summary: v('#csum').trim(), response_days: ircc ? v('#crd') || null : null, in_scope: ircc ? sc === 'true' : null, client_informed: m.querySelector('#cinf').checked } });
      toast(r.deadline_id ? `Logged — response deadline ${r.due_on} created` : 'Logged');
      window.dispatchEvent(new Event('refresh-counts'));
      if (r.task_id) setTimeout(async () => {
        if (await confirmBox('Outside the scope', 'A task was created to forward this letter to the client today. Prepare the addendum (amendment) to offer the client now?', 'Prepare addendum'))
          (await import('./agreements.js')).newAgreement({ contactId: c.id, type: 'amendment' });
      }, 50);
      done?.();
    } }],
  });
}

// ───────────────────────── Forms tab ─────────────────────────
export async function formsPanel(body, c) {
  const [f, s, { data: cases }, { data: reps }, { data: agreements }, { data: keyDates }] = await Promise.all([loadFile(c.id), orgRules(),
    db.from('cases').select('*').eq('contact_id', c.id).order('created_at'), db.from('rep_forms').select('*').eq('contact_id', c.id),
    db.from('agreements').select('id, type, status, data').eq('contact_id', c.id), db.from('key_dates').select('doc_type, expires_on').eq('contact_id', c.id)]);
  const ed = editOK() && !f.closed_at;
  const h = { addresses: [], activities: [], background: {}, ...(f.history || {}) };
  const issues = checkFile({ contact: c, file: f, cases: cases || [], reps: reps || [], agreements: agreements || [], keyDates: keyDates || [], settings: s });
  const sheet = dataSheet({ contact: c, file: f, cases: cases || [], settings: s });
  const rowsEd = (key, cols) => `<table class="t hist" data-h="${key}"><thead><tr><th style="width:110px">From (YYYY-MM)</th><th style="width:110px">To (empty = now)</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>
    ${(h[key] || []).map((r) => histRow(r, cols, ed)).join('')}</tbody></table>${ed ? `<button class="btn btn-sm" data-addh="${key}" type="button">${icon('plus')} Add row</button>` : ''}`;
  const ACT = [['activity', 'Activity (job, study, unemployed…)'], ['org', 'Employer / school'], ['city', 'City'], ['country', 'Country'], ['status', 'Status there']];
  const ADR = [['address', 'Street address'], ['city', 'City'], ['country', 'Country']];
  body.innerHTML = `
    <div class="toolbar" style="margin-bottom:10px"><div class="grow"></div><button class="btn" id="pk">${icon('file')} Signing packet</button><button class="btn" id="pds">${icon('file')} Print data sheet</button></div>
    <div class="card"><div class="card-h"><h3>${icon('checksq')} Consistency check</h3><span class="badge ${issues.some((x) => x.level === 'err') ? 'b-RED' : issues.some((x) => x.level === 'warn') ? 'b-AMBER' : 'b-GREEN'}">${issues.filter((x) => x.level === 'err').length} contradiction(s) · ${issues.filter((x) => x.level === 'warn').length} to check</span></div><div class="card-b">
      ${issues.map((x) => `<div class="row" style="gap:8px;align-items:flex-start;margin-bottom:6px"><span class="badge ${x.level === 'err' ? 'b-RED' : x.level === 'warn' ? 'b-AMBER' : 'b-GREEN'}" style="min-width:74px;justify-content:center">${esc(x.area)}</span><span>${esc(x.msg)}</span></div>`).join('')}
      <small class="dk-muted">Checks names, dates of birth, UCI and application numbers, personal-history and address gaps, background answers against the history and the risk flags, the IMM 5476 paid/unpaid box against the agreement, IMM 5744 expiry, passport validity, payer consent and interpreter declarations.</small></div></div>
    <div class="card" style="margin-top:16px"><div class="card-h"><h3>${icon('clipboard')} Background and history (Schedule A / IMM 5669)</h3></div><div class="card-b">
      <h4 style="color:var(--navy);margin:0 0 6px">Background questions</h4>
      ${BACKGROUND.map(([k, q]) => `<div class="row" style="justify-content:space-between;gap:12px;border-bottom:1px dotted var(--line);padding:5px 0"><span style="font-size:13px">${esc(q)}</span>
        <select class="input" data-bg="${k}" style="max-width:110px" ${ed ? '' : 'disabled'}><option value="">—</option><option value="no" ${h.background[k] === 'no' ? 'selected' : ''}>No</option><option value="yes" ${h.background[k] === 'yes' ? 'selected' : ''}>Yes</option></select></div>`).join('')}
      <label class="row" style="gap:8px;margin:10px 0"><input type="checkbox" id="hid" ${h.interpreter_declaration ? 'checked' : ''} ${ed ? '' : 'disabled'}> Interpreter declaration completed on the forms and consents</label>
      <h4 style="color:var(--navy);margin:16px 0 6px">Personal history — last 10 years (or since age 18), no gaps</h4>${rowsEd('activities', ACT)}
      <h4 style="color:var(--navy);margin:16px 0 6px">Addresses — last 10 years, no gaps</h4>${rowsEd('addresses', ADR)}
      ${ed ? '<div style="margin-top:12px"><button class="btn btn-primary" id="hsave">Save and re-check</button></div>' : ''}</div></div>
    <div class="card" style="margin-top:16px"><div class="card-h"><h3>${icon('file')} Form data sheet</h3><small class="dk-muted">Copy each answer into the IRCC form. IRCC’s PDF forms can’t be filled from a website.</small></div><div class="card-b">
      ${sheet.map((sec) => `<h4 style="color:var(--navy);margin:14px 0 4px">${esc(sec.title)}</h4><p class="dk-muted" style="font-size:12.5px;margin:0 0 6px">${esc(sec.note)}</p>
        <table class="t"><tbody>${sec.rows.map(([k, v, n]) => `<tr><th style="width:42%;font-weight:600">${esc(k)}</th><td>${v ? esc(v) : '<span style="color:var(--red)">missing</span>'}${n ? `<br><small class="dk-muted">${esc(n)}</small>` : ''}</td>
          <td style="width:44px">${v ? `<button class="btn btn-ghost btn-sm" data-copy="${esc(v)}" title="Copy">⧉</button>` : ''}</td></tr>`).join('')}</tbody></table>`).join('')}</div></div>`;

  body.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch { toast('Copy failed — select the text instead', true); } }));
  body.querySelector('#pk').onclick = () => signingPacket(c.id).catch(fail);
  body.querySelector('#pds').onclick = async () => {
    const { printDoc } = await import('./agreement.js');
    printDoc(`<div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto"><h2 style="font-family:Georgia,serif;color:#0B2A5C">Form data sheet — ${esc(c.full_name)}</h2><p style="font-size:12px;color:#5B6476">Prepared ${today()}. Confidential client information.</p>
      ${sheet.map((sec) => `<h3 style="color:#0B2A5C;border-bottom:1px solid #EFE6D2">${esc(sec.title)}</h3><table style="width:100%;border-collapse:collapse;font-size:12.5px" border="1" cellpadding="5">${sec.rows.map(([k, v]) => `<tr><th style="text-align:left;width:45%;background:#FBF7EE">${esc(k)}</th><td>${esc(v) || '—'}</td></tr>`).join('')}</table>`).join('')}</div>`, `Data sheet — ${c.full_name}`);
  };
  if (!ed) return;
  body.querySelectorAll('[data-addh]').forEach((b) => (b.onclick = () => {
    const cols = b.dataset.addh === 'activities' ? ACT : ADR;
    body.querySelector(`table[data-h="${b.dataset.addh}"] tbody`).insertAdjacentHTML('beforeend', histRow({}, cols, true));
    wireDel();
  }));
  const wireDel = () => body.querySelectorAll('[data-hdel]').forEach((x) => (x.onclick = () => x.closest('tr').remove()));
  wireDel();
  body.querySelector('#hsave').onclick = async () => {
    const read = (key) => [...body.querySelectorAll(`table[data-h="${key}"] tbody tr`)].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-c]')].map((i) => [i.dataset.c, i.value.trim()])))
      .filter((r) => Object.values(r).some(Boolean));
    const bad = [...read('activities'), ...read('addresses')].find((r) => (r.from && !/^\d{4}-\d{2}$/.test(r.from)) || (r.to && !/^\d{4}-\d{2}$/.test(r.to)));
    if (bad) return fail(new Error('Write dates as YYYY-MM (for example 2019-04).'));
    const history = { ...h, addresses: read('addresses'), activities: read('activities'), interpreter_declaration: body.querySelector('#hid').checked,
      background: Object.fromEntries([...body.querySelectorAll('[data-bg]')].map((x) => [x.dataset.bg, x.value]).filter(([, v]) => v)) };
    try { await saveFile(c.id, { history }); toast('Saved'); formsPanel(body, c); } catch (e) { fail(e); }
  };
}
function histRow(r, cols, ed) {
  const inp = (k, ph = '') => `<input class="input" data-c="${k}" value="${esc(r[k] || '')}" placeholder="${ph}" ${ed ? '' : 'disabled'}>`;
  return `<tr><td>${inp('from', '2019-04')}</td><td>${inp('to', 'present')}</td>${cols.map(([k]) => `<td>${inp(k)}</td>`).join('')}<td>${ed ? `<button class="btn btn-ghost btn-sm" data-hdel type="button" aria-label="Remove">${icon('x')}</button>` : ''}</td></tr>`;
}
