// Shared CRM forms: log activity, deal editor, case editor.
import { db, state, esc, icon, modal, toast, staffOptions, today, callFn } from './core.js';
import { money, itemsList, contactsList, contactOptions } from './fin.js';

export const ACT_TYPES = [['call', 'Call', 'phone'], ['email', 'Email', 'mail'], ['meeting', 'Meeting', 'calendar'], ['whatsapp', 'WhatsApp', 'phone'], ['sms', 'Text message', 'phone'], ['note', 'Note', 'note']];
export const ACT_LABEL = Object.fromEntries(ACT_TYPES.map(([k, l]) => [k, l]));
export const ACT_ICON = Object.fromEntries(ACT_TYPES.map(([k, , i]) => [k, i]));
export const DEAL_STAGES = [['qualified', 'Qualified'], ['consultation', 'Consultation'], ['proposal', 'Proposal sent'], ['negotiation', 'Agreement pending'], ['won', 'Won'], ['lost', 'Lost']];
export const DEAL_LABEL = Object.fromEntries(DEAL_STAGES);
export const CASE_STATUS = [['open', 'Open'], ['in_progress', 'Preparing'], ['submitted', 'Submitted to IRCC'], ['decision_pending', 'Awaiting decision'],
  ['approved', 'Approved'], ['refused', 'Refused'], ['withdrawn', 'Withdrawn'], ['closed', 'Closed']];
export const CASE_LABEL = Object.fromEntries(CASE_STATUS);
const CASE_CLS = { open: 'b-blue', in_progress: 'b-gold', submitted: 'b-navy', decision_pending: 'b-AMBER', approved: 'b-GREEN', refused: 'b-RED', withdrawn: '', closed: '' };
export const caseBadge = (s) => `<span class="badge ${CASE_CLS[s] || ''}">${esc(CASE_LABEL[s] || s)}</span>`;
export const dealBadge = (s) => `<span class="badge ${s === 'won' ? 'b-GREEN' : s === 'lost' ? 'b-RED' : 'b-gold'}">${esc(DEAL_LABEL[s] || s)}</span>`;
export const APP_TYPES = ['Spousal Sponsorship', 'Parent/Grandparent Sponsorship', 'Express Entry PR', 'Provincial Nominee (AAIP)', 'Work Permit', 'Work Permit Extension',
  'Study Permit', 'Study Permit Extension', 'Visitor Visa (TRV)', 'Super Visa', 'Visitor Record', 'PR Card Renewal', 'Citizenship', 'Refugee Claim', 'PRRA / H&C',
  'Restoration of Status', 'LMIA (Employer)', 'Other'];

const changed = () => window.dispatchEvent(new Event('crm-changed'));

export function logActivity({ contactId, companyId, dealId, type = 'call' } = {}) {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  modal({
    title: 'Log activity',
    body: `<div class="seg" id="atype" style="margin-bottom:14px;flex-wrap:wrap">${ACT_TYPES.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row-2"><div class="field"><label>Direction</label><select class="input" id="dir"><option value="outbound">Outbound (we contacted them)</option><option value="inbound">Inbound (they contacted us)</option></select></div>
      <div class="field"><label>When</label><input class="input" type="datetime-local" id="when" value="${now}"></div></div>
      <div class="field"><label>Subject</label><input class="input" id="subj" placeholder="e.g. Discussed spousal sponsorship options"></div>
      <div class="field"><label>Details</label><textarea class="input" id="body" placeholder="What was discussed, advice given, next steps"></textarea></div>
      <div class="row-2"><div class="field"><label>Outcome</label><select class="input" id="out"><option value="">—</option><option>Connected</option><option>Left voicemail</option><option>No answer</option><option>Booked consultation</option><option>Sent information</option><option>Follow-up needed</option><option>Not interested</option></select></div>
      <div class="field"><label>Duration (minutes)</label><input class="input" type="number" id="dur" min="0"></div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="fu"> Create a follow-up task for <input class="input" type="date" id="fud" value="${new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA')}" style="width:160px"></label>`,
    onOpen: (m) => { m.querySelector('#atype').onclick = (e) => { if (e.target.dataset.k) { type = e.target.dataset.k; m.querySelectorAll('#atype button').forEach((b) => b.classList.toggle('on', b.dataset.k === type)); } }; },
    actions: [{ label: 'Cancel' }, { label: 'Save activity', cls: 'btn-primary', onClick: async (m) => {
      const subj = m.querySelector('#subj').value.trim(), body = m.querySelector('#body').value.trim();
      if (!subj && !body) throw new Error('Add a subject or details.');
      const { error } = await db.from('activities').insert({ type, direction: type === 'note' ? null : m.querySelector('#dir').value, subject: subj || null, body: body || null,
        outcome: m.querySelector('#out').value || null, duration_min: Number(m.querySelector('#dur').value) || null, occurred_at: new Date(m.querySelector('#when').value).toISOString(),
        contact_id: contactId || null, company_id: companyId || null, deal_id: dealId || null, author_id: state.profile.id });
      if (error) throw error;
      if (m.querySelector('#fu').checked) {
        await db.from('tasks').insert({ title: `Follow up: ${subj || ACT_LABEL[type]}`, due_date: m.querySelector('#fud').value, contact_id: contactId || null,
          assigned_to: state.profile.id, created_by: state.profile.id });
      }
      if (contactId) await db.from('contacts').update({ stage: 'contacted' }).eq('id', contactId).eq('stage', 'new');
      toast('Activity logged'); changed(); window.dispatchEvent(new Event('refresh-counts'));
    } }],
  });
}

export async function editDeal(deal = {}, { contactId } = {}) {
  const [items, contacts, { data: companies }] = await Promise.all([itemsList(), contactsList(), db.from('companies').select('id, name').order('name')]);
  modal({
    title: deal.id ? 'Edit deal' : 'New deal',
    body: `<div class="field"><label>Deal name</label><input class="input" id="t" value="${esc(deal.title || '')}" placeholder="e.g. Spousal sponsorship — Haile family"></div>
      <div class="row-2"><div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, deal.contact_id || contactId)}</select></div>
      <div class="field"><label>Company (employer)</label><select class="input" id="co"><option value="">None</option>${(companies || []).map((x) => `<option value="${x.id}" ${x.id === deal.company_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
      <div class="row-2"><div class="field"><label>Service</label><select class="input" id="it"><option value="">—</option>${items.map((i) => `<option value="${i.id}" data-p="${i.unit_price}" ${i.id === deal.item_id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Value (CAD)</label><input class="input" type="number" step="0.01" id="v" value="${deal.value ?? ''}"></div></div>
      <div class="row-2"><div class="field"><label>Stage</label><select class="input" id="s">${DEAL_STAGES.map(([k, l]) => `<option value="${k}" ${k === (deal.stage || 'qualified') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Expected close</label><input class="input" type="date" id="ec" value="${deal.expected_close || ''}"></div></div>
      <div class="row-2"><div class="field"><label>Owner</label><select class="input" id="o">${staffOptions(deal.owner_id || state.profile.id)}</select></div>
      <div class="field" id="lrw"><label>Lost reason</label><input class="input" id="lr" value="${esc(deal.lost_reason || '')}"></div></div>`,
    onOpen: (m) => {
      m.querySelector('#it').onchange = (e) => { const p = e.target.selectedOptions[0]?.dataset.p; if (p && !m.querySelector('#v').value) m.querySelector('#v').value = p; };
      const s = m.querySelector('#s'), f = () => (m.querySelector('#lrw').style.visibility = s.value === 'lost' ? 'visible' : 'hidden'); s.onchange = f; f();
    },
    actions: [
      ...(deal.id ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { const { error } = await db.from('deals').delete().eq('id', deal.id); if (error) throw error; toast('Deal deleted'); changed(); } }] : []),
      { label: 'Cancel' },
      { label: 'Save deal', cls: 'btn-primary', onClick: async (m) => {
        const row = { title: m.querySelector('#t').value.trim(), contact_id: m.querySelector('#c').value || null, company_id: m.querySelector('#co').value || null,
          item_id: m.querySelector('#it').value || null, value: Number(m.querySelector('#v').value || 0), stage: m.querySelector('#s').value,
          expected_close: m.querySelector('#ec').value || null, owner_id: m.querySelector('#o').value || null, lost_reason: m.querySelector('#lr').value || null };
        if (!row.title) throw new Error('Name the deal.');
        if (!row.contact_id) throw new Error('Choose a client.');
        const { error } = deal.id ? await db.from('deals').update(row).eq('id', deal.id) : await db.from('deals').insert({ ...row, created_by: state.profile.id });
        if (error) throw error;
        if (row.stage === 'won') await db.from('contacts').update({ stage: 'retained' }).eq('id', row.contact_id);
        toast('Deal saved'); changed();
      } }],
  });
}

export async function editCase(c = {}, { contactId } = {}) {
  const contacts = await contactsList();
  modal({
    title: c.id ? `Edit case ${c.case_number}` : 'Open a new case',
    body: `<div class="row-2"><div class="field"><label>Client</label><select class="input" id="cl" ${c.id ? 'disabled' : ''}>${contactOptions(contacts, c.contact_id || contactId)}</select></div>
      <div class="field"><label>Application type</label><select class="input" id="ty">${APP_TYPES.map((t) => `<option ${t === c.application_type ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="field"><label>Case title</label><input class="input" id="ti" value="${esc(c.title || '')}" placeholder="e.g. Outland spousal sponsorship — sponsor & spouse"></div>
      <div class="row-2"><div class="field"><label>Status</label><select class="input" id="st">${CASE_STATUS.map(([k, l]) => `<option value="${k}" ${k === (c.status || 'open') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Priority</label><select class="input" id="pr">${['normal', 'high', 'urgent', 'low'].map((p) => `<option value="${p}" ${p === (c.priority || 'normal') ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></div></div>
      <div class="row-2"><div class="field"><label>Assigned to</label><select class="input" id="as">${staffOptions(c.assigned_to || state.profile.id)}</select></div>
      <div class="field"><label>Key deadline</label><input class="input" type="date" id="dl" value="${c.deadline || ''}"></div></div>
      <div class="row-2"><div class="field"><label>Submitted on</label><input class="input" type="date" id="so" value="${c.submitted_on || ''}"></div>
      <div class="field"><label>Decision on</label><input class="input" type="date" id="do" value="${c.decision_on || ''}"></div></div>
      <div class="row-2"><div class="field"><label>IRCC application / file no.</label><input class="input" id="fn" value="${esc(c.ircc_file_number || '')}"></div>
      <div class="field"><label>UCI</label><input class="input" id="uci" value="${esc(c.uci || '')}"></div></div>
      <div class="field"><label>Notes</label><textarea class="input" id="ds">${esc(c.description || '')}</textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: c.id ? 'Save case' : 'Open case', cls: 'btn-primary', onClick: async (m) => {
      const v = (s) => m.querySelector(s).value;
      const row = { title: v('#ti').trim() || v('#ty'), application_type: v('#ty'), status: v('#st'), priority: v('#pr'), assigned_to: v('#as') || null,
        deadline: v('#dl') || null, submitted_on: v('#so') || null, decision_on: v('#do') || null, ircc_file_number: v('#fn') || null, uci: v('#uci') || null, description: v('#ds') || null };
      if (!c.id && !v('#cl')) throw new Error('Choose a client.');
      if (row.status === 'submitted' && !row.submitted_on) row.submitted_on = today();
      const { data, error } = c.id ? await db.from('cases').update(row).eq('id', c.id).select('id').single()
        : await db.from('cases').insert({ ...row, contact_id: v('#cl'), created_by: state.profile.id }).select('id').single();
      if (error) throw error;
      if (!c.id) await db.from('contacts').update({ stage: 'retained' }).eq('id', v('#cl'));
      toast(c.id ? 'Case saved' : 'Case opened'); changed();
      if (!c.id) location.hash = `#/cases/${data.id}`;
    } }],
  });
}

export { money };

// ── Email a client from Microsoft 365 (my mailbox or the shared mailbox) ──
const EMAIL_TEMPLATES = [
  ['', 'Blank email', ''],
  ['Your consultation with Graceful Immigration', 'Consultation confirmation',
    'Hello {first},\n\nThank you for booking a consultation with Graceful Immigration Consultant Inc. Your consultation is confirmed for [date and time] by [Zoom / Microsoft Teams]. The meeting link will be sent before the call.\n\nPayment: please call (403) 915-4230 to pay the consultation fee before the meeting.\n\nPlease have your passport and any letters from IRCC nearby during the call.'],
  ['Documents needed for your file', 'Request documents',
    'Hello {first},\n\nTo continue with your application, please send us the following documents:\n\n- [document 1]\n- [document 2]\n- [document 3]\n\nPlease scan each document in colour as a PDF. Do not send passports or identity documents by WhatsApp. Reply to this email or ask us for a secure upload link.\n\nIf you have any questions, call us at (403) 915-4230.'],
  ['Update on your application', 'Application update',
    'Hello {first},\n\nI wanted to give you an update on your file: [update].\n\nNext steps: [next steps].\n\nPlease let me know if you have any questions.'],
  ['Payment reminder', 'Payment reminder',
    'Hello {first},\n\nThis is a friendly reminder that [amount] is due for [milestone/invoice number]. You can pay by Interac e-Transfer to info@gracefulimmigration.ca or by calling (403) 915-4230.\n\nThank you.'],
];

let commsStatus = null;
export async function composeEmail({ contact = null, to = '', subject = '', body = '' } = {}) {
  if (!commsStatus) commsStatus = await callFn('comms', { action: 'status' }).catch((e) => ({ error: e.message }));
  const st = commsStatus;
  const first = (contact?.full_name || '').split(' ')[0] || 'there';
  modal({
    title: contact ? `Email ${contact.full_name}` : 'New email', wide: true,
    body: `${!st.email ? `<div class="alert info">Email isn't connected to Microsoft 365 yet, so it can't be sent from here. The owner can connect it in <b>Business Settings → Integrations</b>.</div>` : ''}
      <div class="row-2"><div class="field"><label>From</label><select class="input" id="fr">
          <option value="me">${esc(state.profile.email)} (me)</option>${(st.mailboxes || []).filter((m) => m !== state.profile.email.toLowerCase()).map((m) => `<option value="shared">${esc(m)} (shared)</option>`).join('')}</select></div>
        <div class="field"><label>Template</label><select class="input" id="tp">${EMAIL_TEMPLATES.map(([, l], i) => `<option value="${i}">${esc(l)}</option>`).join('')}</select></div></div>
      <div class="row-2"><div class="field"><label>To</label><input class="input" id="to" value="${esc(to || contact?.email || '')}"></div>
        <div class="field"><label>Cc (optional)</label><input class="input" id="cc" placeholder="Separate addresses with commas"></div></div>
      <div class="field"><label>Subject</label><input class="input" id="su" value="${esc(subject)}"></div>
      <div class="field"><label>Message</label><textarea class="input" id="bo" rows="12">${esc(body)}</textarea>
        <small class="dk-muted">Your name, title and the office phone are added as a signature. The email is saved in Outlook Sent Items${contact ? ' and on this client\'s file' : ''}.</small></div>`,
    onOpen: (m) => {
      m.querySelector('#tp').onchange = (e) => {
        const [s, , b] = EMAIL_TEMPLATES[+e.target.value];
        if (s) m.querySelector('#su').value = s;
        if (b) m.querySelector('#bo').value = b.replace(/\{first\}/g, first);
      };
    },
    actions: [{ label: 'Cancel' }, { label: 'Send email', cls: 'btn-gold', onClick: async (m) => {
      if (!st.email) throw new Error('Email is not connected to Microsoft 365 yet.');
      const text = m.querySelector('#bo').value;
      if (/\[[^\]]+\]/.test(text) && !confirm('The message still has [placeholders] in square brackets. Send anyway?')) return false;
      const r = await callFn('comms', { action: 'send', contact_id: contact?.id || null, from: m.querySelector('#fr').value,
        to: m.querySelector('#to').value, cc: m.querySelector('#cc').value, subject: m.querySelector('#su').value, body: text });
      toast(`Email sent from ${r.from}`); changed();
    } }],
  });
}

// ── Appointments & client document expiry dates (dashboard widgets) ──
export const APPT_KINDS = [['consultation', 'Client consultation'], ['document_review', 'Document review'], ['follow_up', 'Follow-up meeting'], ['hearing', 'IRB hearing / interview'], ['other', 'Other']];
export const APPT_LABEL = Object.fromEntries(APPT_KINDS);
export const DOC_TYPES = ['Passport', 'Work permit', 'Study permit', 'Visitor record', 'Temporary resident visa', 'PR card', 'Medical exam', 'Police certificate', 'Biometrics', 'Language test', 'ECA report', 'Other'];
const localInput = (d) => new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export async function editAppointment(a = {}, { contactId } = {}) {
  const contacts = await contactsList();
  const start = a.starts_at ? localInput(a.starts_at) : localInput(Math.ceil(Date.now() / 3600000) * 3600000 + 86400000);
  const mins = a.starts_at && a.ends_at ? Math.round((new Date(a.ends_at) - new Date(a.starts_at)) / 60000) : 60;
  modal({
    title: a.id ? 'Edit appointment' : 'New appointment',
    body: `<div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, a.contact_id || contactId, '— No client —')}</select></div>
      <div class="row-2"><div class="field"><label>Type</label><select class="input" id="k">${APPT_KINDS.map(([k, l]) => `<option value="${k}" ${k === (a.kind || 'consultation') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Topic</label><input class="input" id="t" value="${esc(a.title || '')}" placeholder="e.g. PR eligibility assessment"></div></div>
      <div class="row-2"><div class="field"><label>Starts</label><input class="input" type="datetime-local" id="s" value="${start}"></div>
      <div class="field"><label>Length</label><select class="input" id="m">${[15, 30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${n === mins ? 'selected' : ''}>${n} minutes</option>`).join('')}</select></div></div>
      <div class="row-2"><div class="field"><label>Where</label><select class="input" id="l">${['Zoom', 'Microsoft Teams', 'Phone', 'In person', 'IRB virtual hearing'].map((x) => `<option ${x === (a.location || 'Zoom') ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Meeting link (optional)</label><input class="input" id="u" value="${esc(a.meeting_link || '')}" placeholder="https://"></div></div>
      <div class="field"><label>Notes</label><textarea class="input" id="n">${esc(a.notes || '')}</textarea></div>`,
    actions: [
      ...(a.id ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!confirm('Delete this appointment?')) return false; const { error } = await db.from('appointments').delete().eq('id', a.id); if (error) throw error; toast('Appointment deleted'); changed(); } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const v = (s) => m.querySelector(s).value;
        const startsAt = new Date(v('#s'));
        if (isNaN(startsAt)) throw new Error('Choose a start date and time.');
        const kind = v('#k');
        const row = { contact_id: v('#c') || null, kind, title: v('#t').trim() || APPT_LABEL[kind], starts_at: startsAt.toISOString(),
          ends_at: new Date(startsAt.getTime() + Number(v('#m')) * 60000).toISOString(), location: v('#l'), meeting_link: v('#u').trim() || null, notes: v('#n').trim() || null };
        if (row.meeting_link && !/^https:\/\//i.test(row.meeting_link)) throw new Error('The meeting link must start with https://');
        const { error } = a.id ? await db.from('appointments').update(row).eq('id', a.id) : await db.from('appointments').insert({ ...row, assigned_to: state.profile.id });
        if (error) throw error; toast('Appointment saved'); changed();
      } }],
  });
}

export async function editKeyDate(k = {}, { contactId } = {}) {
  const contacts = await contactsList();
  modal({
    title: k.id ? 'Edit document date' : 'Track a document expiry',
    body: `<div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, k.contact_id || contactId)}</select></div>
      <div class="row-2"><div class="field"><label>Document</label><select class="input" id="d">${DOC_TYPES.map((x) => `<option ${x === k.doc_type ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Expires on</label><input class="input" type="date" id="e" value="${esc(k.expires_on || '')}"></div></div>
      <div class="field"><label>Notes</label><input class="input" id="n" value="${esc(k.notes || '')}" placeholder="e.g. apply for extension 90 days before"></div>`,
    actions: [
      ...(k.id ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { const { error } = await db.from('key_dates').delete().eq('id', k.id); if (error) throw error; toast('Removed'); changed(); } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const row = { contact_id: m.querySelector('#c').value, doc_type: m.querySelector('#d').value, expires_on: m.querySelector('#e').value, notes: m.querySelector('#n').value.trim() || null };
        if (!row.contact_id) throw new Error('Choose a client.');
        if (!row.expires_on) throw new Error('Enter the expiry date.');
        const { error } = k.id ? await db.from('key_dates').update(row).eq('id', k.id) : await db.from('key_dates').insert(row);
        if (error) throw error; toast('Document date saved'); changed();
      } }],
  });
}
