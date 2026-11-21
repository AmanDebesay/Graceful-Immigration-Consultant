// Submission letters: list, and the "new letter" chooser used from the client file and cases.
import { db, can, esc, icon, fmtDate, modal, fail, staffName } from '../core.js';
import { TYPES, newLetterData } from '../letter-templates.js';

export const letterBadge = (s) => s === 'final' ? '<span class="badge b-GREEN">Final</span>' : '<span class="badge">Draft</span>';
export const canLetters = () => can('letters.edit');

/** Pick a letter type (and case), create the draft prefilled from the client file, and open it. */
export async function newLetter({ contactId, caseId } = {}) {
  if (!canLetters()) return fail(new Error('You don’t have permission to draft submission letters.'));
  const [{ data: contact }, { data: cases }, { data: org }] = await Promise.all([
    db.from('contacts').select('id, full_name, date_of_birth, citizenship, country, location, status_in_canada').eq('id', contactId).single(),
    db.from('cases').select('id, case_number, title, application_type, uci, ircc_file_number').eq('contact_id', contactId).order('created_at', { ascending: false }),
    db.from('org_settings').select('*').eq('id', 1).single(),
  ]);
  let type = 'hc';
  const card = (k, t) => `<button type="button" class="sl-type${k === type ? ' on' : ''}" data-t="${k}"><b>${esc(t.label)}</b><small>${esc(t.blurb)}</small>
    <span class="badge plain ${t.kind === 'rules' ? 'b-blue' : 'b-gold'}">${t.kind === 'rules' ? 'Rules-based' : 'Persuasive'}</span></button>`;
  modal({
    title: `New submission letter · ${contact?.full_name || ''}`, wide: true,
    body: `<p class="dk-muted" style="margin-bottom:10px">Choose the kind of letter. It starts with the legal test, the right headings and a guided draft, filled in from the client file.</p>
      <div class="sl-types">${Object.entries(TYPES).map(([k, t]) => card(k, t)).join('')}</div>
      <div class="row-2" style="margin-top:14px"><div class="field"><label>Case</label><select class="input" id="lc"><option value="">— Not linked to a case —</option>
        ${(cases || []).map((c) => `<option value="${c.id}" ${c.id === caseId ? 'selected' : ''}>${esc(c.case_number)} · ${esc(c.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Title (for your list)</label><input class="input" id="lt" placeholder="e.g. H&C submission — first filing"></div></div>`,
    onOpen: (m) => m.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      type = b.dataset.t; m.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
    })),
    actions: [{ label: 'Cancel' }, { label: 'Create draft', cls: 'btn-primary', onClick: async (m) => {
      const cid = m.querySelector('#lc').value || null;
      const caseRow = (cases || []).find((c) => c.id === cid) || null;
      const title = m.querySelector('#lt').value.trim() || `${TYPES[type].short}${caseRow ? ' · ' + caseRow.case_number : ''}`;
      const { data, error } = await db.from('submission_letters').insert({ contact_id: contactId, case_id: cid, type, title, data: newLetterData(type, { contact, caseRow, org }) }).select('id').single();
      if (error) throw error;
      location.hash = `#/letters/${data.id}`;
    } }],
  });
}

/** List for a client's file (contact tab). */
export async function lettersPanel(body, contactId) {
  const { data } = await db.from('submission_letters').select('id, number, type, title, status, updated_at, cases(case_number)').eq('contact_id', contactId).order('updated_at', { ascending: false });
  body.innerHTML = `${canLetters() ? `<div class="row" style="justify-content:space-between;margin-bottom:10px"><small class="dk-muted">Submission letters, cover letters and reconsideration requests for this client.</small><button class="btn btn-primary btn-sm" id="nl">${icon('plus')} New submission letter</button></div>` : ''}
    ${(data || []).length ? `<table class="t"><tbody>${data.map((l) => `<tr class="click" onclick="location.hash='#/letters/${l.id}'"><td><b>${esc(l.title)}</b><br><small style="color:var(--muted)">${esc(l.number)} · ${esc(TYPES[l.type]?.short || l.type)}${l.cases ? ' · ' + esc(l.cases.case_number) : ''}</small></td>
      <td>${letterBadge(l.status)}</td><td>${fmtDate(l.updated_at)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No submission letters yet.</div>'}`;
  body.querySelector('#nl')?.addEventListener('click', () => newLetter({ contactId }));
}

/** All letters. */
export async function render(el) {
  const { data, error } = await db.from('submission_letters').select('id, number, type, title, status, updated_at, updated_by, contact_id, contacts(full_name), cases(case_number)').order('updated_at', { ascending: false }).limit(300);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  let f = { q: '', type: '', status: '' };
  el.innerHTML = `<div class="toolbar"><input class="input" id="q" placeholder="Search client or title" style="max-width:260px">
      <select class="input" id="ty" style="max-width:240px"><option value="">All letter types</option>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${esc(t.short)}</option>`).join('')}</select>
      <select class="input" id="st" style="max-width:150px"><option value="">Draft & final</option><option value="draft">Drafts</option><option value="final">Final</option></select>
      <div class="grow"></div><small class="dk-muted">Start a new letter from the client’s file (Letters tab).</small></div>
    <div class="card"><div id="list"></div></div>`;
  const draw = () => {
    const rows = (data || []).filter((l) => (!f.type || l.type === f.type) && (!f.status || l.status === f.status)
      && (!f.q || `${l.title} ${l.contacts?.full_name || ''} ${l.number}`.toLowerCase().includes(f.q.toLowerCase())));
    el.querySelector('#list').innerHTML = rows.length ? `<table class="t"><thead><tr><th>Letter</th><th>Client</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows.map((l) => `<tr class="click" onclick="location.hash='#/letters/${l.id}'">
      <td><b>${esc(l.title)}</b><br><small style="color:var(--muted)">${esc(l.number)} · ${esc(TYPES[l.type]?.short || l.type)}${l.cases ? ' · ' + esc(l.cases.case_number) : ''}</small></td>
      <td>${esc(l.contacts?.full_name || '')}</td><td>${letterBadge(l.status)}</td><td>${fmtDate(l.updated_at)}<br><small style="color:var(--muted)">${esc(staffName(l.updated_by) || '')}</small></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No submission letters yet. Open a client’s file and choose the Letters tab to start one.</div>';
  };
  el.querySelector('#q').oninput = (e) => { f.q = e.target.value; draw(); };
  el.querySelector('#ty').onchange = (e) => { f.type = e.target.value; draw(); };
  el.querySelector('#st').onchange = (e) => { f.status = e.target.value; draw(); };
  draw();
}
