// Pathway assessments: the RCIC's route assessment (Pathway map tool) for each client, saved to the client file.
import { db, state, can, esc, icon, fmtDate, timeAgo, staffName, modal, fail } from '../core.js';
import { contactsList, contactOptions, clearFinCache } from '../fin.js';

export const PA_BADGE = (s) => s === 'final' ? '<span class="badge b-GREEN">Final</span>' : '<span class="badge b-gold">Draft</span>';

// Start a new assessment. It can also be the client's intake: choose "New client" and the contact is created here.
// After the Initial Consultation Agreement is signed, it links to that agreement.
export async function startPathway({ contactId, caseId, agreementId, newClient = false } = {}) {
  const contacts = await contactsList();
  modal({
    title: 'New pathway assessment',
    body: `<div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, newClient ? null : contactId)}<option value="__new" ${newClient ? 'selected' : ''}>＋ New client (take their intake now)</option></select></div>
      <div id="nc" hidden>
        <div class="row-2"><div class="field"><label>First name *</label><input class="input" id="nf"></div><div class="field"><label>Last name *</label><input class="input" id="nl"></div></div>
        <div class="row-2"><div class="field"><label>Email</label><input class="input" id="ne" type="email"></div><div class="field"><label>Phone</label><input class="input" id="np" type="tel"></div></div>
        <div class="row-2"><div class="field"><label>Date of birth</label><input class="input" id="nd" type="date"></div>
          <div class="field"><label>How they reached us</label><select class="input" id="ns"><option value="phone">Phone call</option><option value="walk-in">Walk-in</option><option value="referral">Referral</option><option value="whatsapp">WhatsApp</option><option value="social">Social media</option><option value="website">Website</option><option value="other">Other</option></select></div></div>
        <div class="alert info" style="margin:0 0 12px">You can take the intake now. Give advice only after the client signs the Initial Consultation Agreement.</div>
      </div>
      <div id="ex"><div class="row-2"><div class="field"><label>Case (optional)</label><select class="input" id="k"></select></div>
      <div class="field"><label>Agreement</label><select class="input" id="g"></select></div></div>
      <div id="warn"></div></div>`,
    onOpen: (m) => {
      const load = async () => {
        const cid = m.querySelector('#c').value, isNew = cid === '__new';
        m.querySelector('#nc').hidden = !isNew; m.querySelector('#ex').hidden = isNew;
        if (isNew) { m.querySelector('#nf').focus(); return; }
        const [{ data: cs }, { data: ags }] = await Promise.all([
          cid ? db.from('cases').select('id, case_number, title').eq('contact_id', cid) : { data: [] },
          cid ? db.from('agreements').select('id, number, type, status').eq('contact_id', cid).in('type', ['consultation', 'retainer']).neq('status', 'void').order('created_at', { ascending: false }) : { data: [] }]);
        m.querySelector('#k').innerHTML = '<option value="">None</option>' + (cs || []).map((x) => `<option value="${x.id}" ${x.id === caseId ? 'selected' : ''}>${esc(x.case_number)} · ${esc(x.title)}</option>`).join('');
        const signed = (ags || []).filter((a) => a.status === 'signed');
        const pick = agreementId || signed.find((a) => a.type === 'consultation')?.id || signed[0]?.id;
        m.querySelector('#g').innerHTML = (ags || []).map((a) => `<option value="${a.id}" ${a.id === pick ? 'selected' : ''}>${esc(a.number)} · ${a.type === 'consultation' ? 'Consultation' : 'Retainer'} · ${esc(a.status)}</option>`).join('') + `<option value="" ${pick ? '' : 'selected'}>Not linked</option>`;
        m.querySelector('#warn').innerHTML = cid && !signed.length
          ? '<div class="alert err" style="margin:0">No signed consultation or retainer agreement for this client yet. You can take the intake now, but the Code requires a written agreement before you give advice, so get the Initial Consultation Agreement signed first.</div>' : '';
      };
      m.querySelector('#c').onchange = load; load();
    },
    actions: [{ label: 'Cancel' }, { label: 'Start assessment', cls: 'btn-primary', onClick: async (m) => {
      const v = (q) => m.querySelector(q).value.trim();
      let contact_id = v('#c'), row = { case_id: v('#k') || null, agreement_id: v('#g') || null };
      if (contact_id === '__new') {
        if (!v('#nf') || !v('#nl')) throw new Error('Enter the client\'s first and last name.');
        const { data: c, error: ce } = await db.from('contacts').insert({ full_name: `${v('#nf')} ${v('#nl')}`, email: v('#ne').toLowerCase() || null, phone: v('#np') || null,
          date_of_birth: v('#nd') || null, source: v('#ns'), assigned_to: state.profile.id, created_by: state.profile.id }).select('id').single();
        if (ce) throw new Error(ce.code === '23505' ? 'A client with this email already exists. Choose them from the list instead.' : ce.message);
        clearFinCache();
        contact_id = c.id; row = { case_id: null, agreement_id: null };
      }
      if (!contact_id) throw new Error('Choose a client.');
      const { data, error } = await db.from('pathway_assessments').insert({ contact_id, ...row }).select('id').single();
      if (error) throw error;
      location.hash = `#/pathways/${data.id}`;
    } }],
  });
}

// A short, plain-language summary for the client, drafted from the results: the best option, why, and what happens next.
// The tool's notes are written for the RCIC, so only lines that suit a client are kept, and "the client" becomes "you".
const STAFF_ONLY = /retainer|your client|conflict|^(enter|add|record|confirm|check the noc|calculate)\b|before (advising|quoting)|give the client|in writing|declared and examined|secondary source|one source/i;
const toClient = (t) => String(t).replace(/\bThe client’s\b|\bThe client's\b/g, 'Your').replace(/\bthe client’s\b|\bthe client's\b/g, 'your')
  .replace(/\bThe client (holds|has|is|was|meets|appears)\b/g, (m, v) => `You ${({ holds: 'hold', has: 'have', is: 'are', was: 'were', meets: 'meet', appears: 'appear' })[v]}`)
  .replace(/\bthe client\b/g, 'you').replace(/\bThe client\b/g, 'You').replace(/\bThe couple live\b/g, 'You and your partner live').replace(/^Appears to\b/, 'You appear to');
const forClient = (a, n) => (a || []).filter((x) => x && !STAFF_ONLY.test(x)).slice(0, n).map((x) => `• ${toClient(x)}`);
const KEY_FACTS = [[/^Where is the client now/, ''], [/^Main goal/, 'Goal: '], [/^Relationship to a Canadian/, ''], [/^Sponsor/, 'Sponsor: '], [/^Current status|^Status in Canada|^Immigration status/i, 'Status: ']];
export function draftSummary(r, first = '', facts = []) {
  const ranked = r?.ranked || [];
  if (!ranked.length) return '';
  const top = ranked.find((x) => x.tier === 'rec') || ranked.find((x) => x.tier === 'poss');
  const others = ranked.filter((x) => x !== top && (x.tier === 'rec' || x.tier === 'poss')).slice(0, 3).map((x) => x.name);
  const urgent = (r?.flags || []).filter((f) => f.sev === 'urgent').map((f) => f.t || f.title);
  const out = [first ? `Dear ${first},` : 'Dear client,', ''];
  if (!top) {
    out.push('Thank you for meeting with us. Based on what you told us, we did not find an immigration option that is open to you right now.',
      'We will review your situation in more detail and contact you about what could change and when.');
  } else {
    out.push(`Thank you for meeting with us. Based on what you told us, the option that ${top.tier === 'rec' ? 'fits your situation best' : 'looks most promising'} is: ${top.name}.`);
    if (top.blurb) out.push('', toClient(top.blurb));
    const why = forClient(top.why, 3);
    if (!why.length) {
      const told = KEY_FACTS.map(([re, label]) => { const f = (facts || []).find(([q, v]) => re.test(q) && v); return f ? label + f[1] : ''; }).filter(Boolean);
      if (told.length) why.push(`• It matches what you told us: ${told.join(' · ')}.`);
    }
    out.push('', 'Why we recommend it:', ...why,
      `• It is the strongest match of the ${ranked.length} options we checked against your answers.`);
    const risks = forClient(top.risks, 2);
    if (risks.length) out.push('', 'What to keep in mind:', ...risks);
    const next = forClient(top.next, 2);
    out.push('', 'Next steps:', ...next, '• We will confirm the plan with you and send you a document checklist.');
    if (others.length) out.push('', `Other options we also looked at: ${others.join('; ')}.`);
  }
  if (urgent.length) out.push('', 'Time-sensitive:', ...urgent.slice(0, 3).map((x) => `• ${toClient(x)}`));
  out.push('', 'This summary is based on the information you gave us. If anything changes, please tell us, because the best option may change too.');
  return out.join('\n');
}

// Table rows shared with the contact page.
export const pathwayRows = (list, withClient = true) => `<table class="t"><thead><tr><th>Number</th>${withClient ? '<th>Client</th>' : ''}<th>Top route</th><th>Urgent</th><th>Status</th><th>Updated</th><th>By</th></tr></thead><tbody>
  ${list.map((p) => `<tr class="click" onclick="location.hash='#/pathways/${p.id}'"><td><b>${esc(p.number)}</b></td>
    ${withClient ? `<td>${esc(p.contacts?.full_name || '—')}</td>` : ''}<td style="max-width:300px">${esc(p.top_route || '—')}</td>
    <td>${p.urgent_flags ? `<span class="badge b-RED">${p.urgent_flags}</span>` : '—'}</td><td>${PA_BADGE(p.status)}</td>
    <td title="${fmtDate(p.updated_at)}">${timeAgo(p.updated_at)}</td><td>${esc(staffName(p.updated_by || p.created_by))}</td></tr>`).join('')}</tbody></table>`;

export async function render(el) {
  let status = 'all';
  el.innerHTML = `<div class="toolbar">
      <div class="seg" id="seg">${[['all', 'All'], ['draft', 'Drafts'], ['final', 'Final']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="grow"></div>
      <a class="btn" href="/app/tools/pathway-map.html" target="_blank" rel="noopener">${icon('external')} Open tool on its own</a>
      ${can('pathway.edit') ? `<button class="btn btn-primary" id="new">${icon('plus')} New pathway assessment</button>` : ''}</div>
    <div class="alert info">Use this as the client's intake too: choose <b>New client</b> and the client file is created for you. Give advice after the Initial Consultation Agreement is signed. Answers save to the client file as you go; the RCIC marks the assessment <b>final</b> once reviewed.</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;
  const seg = el.querySelector('#seg');
  seg.onclick = (e) => { if (e.target.dataset.k) { status = e.target.dataset.k; load(); } };
  el.querySelector('#new')?.addEventListener('click', () => startPathway().catch(fail));
  async function load() {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === status));
    let q = db.from('pathway_assessments').select('id, number, status, top_route, urgent_flags, updated_at, updated_by, created_by, contacts(full_name)').order('updated_at', { ascending: false }).limit(300);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q, box = el.querySelector('#list');
    if (error) { box.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    box.innerHTML = data.length ? pathwayRows(data) : `<div class="empty">${icon('route')}<div>No pathway assessments yet.</div></div>`;
  }
  load();
}
