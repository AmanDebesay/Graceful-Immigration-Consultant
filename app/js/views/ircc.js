// IRCC Portal: one-click access to the Representative Portal plus a tracker of every client application
// submitted to IRCC. IRCC offers no API and the RCIC must sign in personally, so no IRCC credentials are stored.
import { db, can, esc, icon, fmtDate, toast, modal, state, today } from '../core.js';
import { CASE_LABEL } from '../crm.js';

const PORTAL = 'https://portal-portail.apps.cic.gc.ca/signin?lang=en';
const PORTALS = ['IRCC Portal (Representative)', 'PR Portal', 'IRCC secure account (GCKey)', 'Paper', 'Other'];
const STATUSES = ['Submitted — acknowledgement received', 'In progress', 'Biometrics requested', 'Medical exam requested', 'Additional documents requested',
  'Interview / hearing scheduled', 'Eligibility review', 'Background check', 'Decision made', 'Approved', 'Refused', 'Withdrawn'];
const LINKS = [
  ['IRCC Portal (Representatives)', 'Submit and manage client applications', PORTAL],
  ['IRCC secure account (GCKey)', 'Applications not available in the portal', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account.html'],
  ['Check application status', 'Status trackers by application type', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-status.html'],
  ['Processing times', 'Current IRCC processing times', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html'],
  ['Application forms & guides', 'Including IMM 5476 (Use of a Representative)', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides.html'],
  ['IRCC web form', 'Case-specific enquiries and updates', 'https://www.cic.gc.ca/english/contacts/web-form.asp'],
  ['Representatives at IRCC', 'Rules for authorized representatives', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigration-citizenship-representative.html'],
  ['Program delivery instructions', 'IRCC operational instructions and guidelines', 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals.html'],
];
const daysSince = (d) => (d ? Math.round((new Date(today() + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000) : null);

export async function render(el) {
  let filter = 'active';
  const [{ data: org }] = await Promise.all([db.from('org_settings').select('ircc_rep_id, rcic_name, licence_number').eq('id', 1).single()]);

  el.innerHTML = `<div class="ircc-hero">
      <div class="ircc-flag"><span></span><span>${icon('maple')}</span><span></span></div>
      <div class="ircc-hero-t"><h2>IRCC Representative Portal</h2>
        <p>Sign in with your representative account to submit and manage client applications. ${org?.ircc_rep_id ? `Representative IRCC ID: <b class="ircc-id">${esc(org.ircc_rep_id)}</b> <button class="dk-link" id="copyId">${icon('file')} Copy</button>` : can('settings.manage') ? '<a class="dk-link" href="#/settings?tab=integrations">Add your Representative IRCC ID</a>' : ''}</p></div>
      <button class="btn btn-gold ircc-open" id="openPortal">${icon('external')} Open IRCC Portal</button>
    </div>
    <div class="alert info ircc-note">${icon('lock')} <span>For security, you sign in to IRCC yourself in a separate window. The dashboard never stores your IRCC password or security answers, and you should never share your representative account; the CICC Code and IRCC's terms require you to control it personally. IRCC does not offer a way for other software to connect to the portal.</span></div>

    <div class="ircc-grid">
      <div class="dk-card"><div class="dk-h"><h3>Client applications at IRCC</h3>
          <div class="seg" id="flt"><button data-f="active">Active</button><button data-f="stale">Not checked 14+ days</button><button data-f="all">All</button></div></div>
        <div id="tbl"><div class="loading" style="min-height:120px"><div class="spin"></div></div></div>
        <p class="dk-muted" style="margin-top:10px">Tip: open the portal, check a file, then click <b>Update</b> here. The update is saved on the case and in the client's activity.</p></div>
      <div class="dk-card"><div class="dk-h"><h3>IRCC quick links</h3></div>
        <div class="ircc-links">${LINKS.map(([t, d, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer"><span><b>${esc(t)}</b><small>${esc(d)}</small></span>${icon('external')}</a>`).join('')}</div></div>
    </div>`;

  el.querySelector('#openPortal').onclick = () => { const w = window.open(PORTAL, 'ircc-portal', 'noopener'); if (w) w.focus?.(); };
  el.querySelector('#copyId')?.addEventListener('click', () => navigator.clipboard.writeText(org.ircc_rep_id).then(() => toast('Representative ID copied')));
  el.querySelectorAll('#flt button').forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));

  async function draw() {
    el.querySelectorAll('#flt button').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
    let q = db.from('cases').select('id, case_number, title, application_type, status, ircc_file_number, uci, submitted_on, decision_on, ircc_portal, ircc_status, ircc_checked_on, contact_id, contacts(full_name)')
      .order('submitted_on', { ascending: false, nullsFirst: false }).limit(500);
    if (filter !== 'all') q = q.in('status', ['open', 'in_progress', 'submitted', 'decision_pending']);
    let { data: rows, error } = await q;
    if (error) { el.querySelector('#tbl').innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    rows = (rows || []).filter((r) => filter === 'all' || r.ircc_file_number || r.submitted_on || ['submitted', 'decision_pending'].includes(r.status));
    if (filter === 'stale') rows = rows.filter((r) => (daysSince(r.ircc_checked_on) ?? 999) >= 14);
    const copy = (v) => v ? `<button class="ircc-copy" data-copy="${esc(v)}" title="Copy">${esc(v)} ${icon('file')}</button>` : '<span class="dk-muted">—</span>';
    el.querySelector('#tbl').innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Client / application</th><th>Application no.</th><th>UCI</th><th>Submitted</th><th>IRCC status</th><th>Last checked</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const d = daysSince(r.ircc_checked_on); return `<tr>
        <td><a href="#/cases/${r.id}"><b>${esc(r.contacts?.full_name || '')}</b></a><br><small class="dk-muted">${esc(r.application_type || r.title)} · ${esc(CASE_LABEL[r.status] || r.status)}</small></td>
        <td>${copy(r.ircc_file_number)}</td><td>${copy(r.uci)}</td>
        <td>${r.submitted_on ? fmtDate(r.submitted_on) : '<span class="dk-muted">Not yet</span>'}<br><small class="dk-muted">${esc(r.ircc_portal || '')}</small></td>
        <td>${r.ircc_status ? `<span class="pill ${/Approved/.test(r.ircc_status) ? 'p-green' : /Refused/.test(r.ircc_status) ? 'p-red' : /requested|Interview/.test(r.ircc_status) ? 'p-amber' : 'p-navy'}">${esc(r.ircc_status)}</span>` : '<span class="dk-muted">—</span>'}</td>
        <td>${d === null ? '<span class="pill p-grey">Never</span>' : `<span class="pill ${d >= 14 ? 'p-amber' : 'p-green'}">${d === 0 ? 'Today' : d + ' days ago'}</span>`}</td>
        <td>${can('crm.edit') ? `<button class="btn btn-sm" data-up="${r.id}">Update</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="dk-empty">${icon('globe')}<p>${filter === 'stale' ? 'Every active application was checked in the last 14 days.' : 'No applications at IRCC yet. When you submit one, add the application number on the case (or click Update here).'}</p></div>`;
    el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied'))));
    el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => update(rows.find((r) => r.id === b.dataset.up))));
  }

  function update(r) {
    modal({
      title: `IRCC update — ${r.contacts?.full_name || r.case_number}`,
      body: `<div class="row-2"><div class="field"><label>Application number</label><input class="input" id="an" value="${esc(r.ircc_file_number || '')}" placeholder="e.g. E001234567"></div>
        <div class="field"><label>UCI</label><input class="input" id="uc" value="${esc(r.uci || '')}" placeholder="e.g. 1234-5678"></div></div>
        <div class="row-2"><div class="field"><label>Submitted through</label><select class="input" id="po"><option value="">—</option>${PORTALS.map((p) => `<option ${p === r.ircc_portal ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="field"><label>Submitted on</label><input class="input" type="date" id="so" value="${esc(r.submitted_on || '')}"></div></div>
        <div class="field"><label>Status shown at IRCC</label><select class="input" id="st"><option value="">—</option>${STATUSES.map((s) => `<option ${s === r.ircc_status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Note for the file (optional)</label><textarea class="input" id="nt" placeholder="e.g. Biometrics instruction letter issued; client to book within 30 days"></textarea></div>
        <label class="row" style="gap:8px"><input type="checkbox" id="ck" checked> I checked the portal today</label>`,
      actions: [{ label: 'Cancel' }, { label: 'Save update', cls: 'btn-primary', onClick: async (m) => {
        const v = (s) => m.querySelector(s).value.trim() || null;
        const patch = { ircc_file_number: v('#an'), uci: v('#uc'), ircc_portal: v('#po'), submitted_on: v('#so'), ircc_status: v('#st') };
        if (m.querySelector('#ck').checked) patch.ircc_checked_on = today();
        if (patch.submitted_on && ['open', 'in_progress'].includes(r.status)) patch.status = 'submitted';
        if (patch.ircc_status === 'Approved') { patch.status = 'approved'; patch.decision_on = r.decision_on || today(); }
        if (patch.ircc_status === 'Refused') { patch.status = 'refused'; patch.decision_on = r.decision_on || today(); }
        const { error } = await db.from('cases').update(patch).eq('id', r.id);
        if (error) throw error;
        const note = v('#nt');
        if (patch.ircc_status !== r.ircc_status || note) {
          await db.from('activities').insert({ type: 'note', contact_id: r.contact_id, author_id: state.profile.id,
            subject: `IRCC update — ${r.application_type || r.title}`, body: `${patch.ircc_status ? `Status at IRCC: ${patch.ircc_status}` : ''}${note ? `\n${note}` : ''}`.trim() });
        }
        toast('IRCC update saved'); draw();
      } }],
    });
  }
  draw();
}
