// Shared CRM forms: log activity, deal editor, case editor.
import { db, state, esc, icon, modal, toast, staffOptions, today } from './core.js';
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
