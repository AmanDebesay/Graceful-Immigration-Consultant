// Pathway assessments: the RCIC's route assessment (Pathway map tool) for each client, saved to the client file.
import { db, can, esc, icon, fmtDate, timeAgo, staffName, modal, fail } from '../core.js';
import { contactsList, contactOptions } from '../fin.js';

export const PA_BADGE = (s) => s === 'final' ? '<span class="badge b-GREEN">Final</span>' : '<span class="badge b-gold">Draft</span>';

// Start a new assessment. After the Initial Consultation Agreement is signed, it links to that agreement.
export async function startPathway({ contactId, caseId, agreementId } = {}) {
  const contacts = await contactsList();
  modal({
    title: 'New pathway assessment',
    body: `<div class="field"><label>Client</label><select class="input" id="c">${contactOptions(contacts, contactId)}</select></div>
      <div class="row-2"><div class="field"><label>Case (optional)</label><select class="input" id="k"></select></div>
      <div class="field"><label>Agreement</label><select class="input" id="g"></select></div></div>
      <div id="warn"></div>`,
    onOpen: (m) => {
      const load = async () => {
        const cid = m.querySelector('#c').value;
        const [{ data: cs }, { data: ags }] = await Promise.all([
          cid ? db.from('cases').select('id, case_number, title').eq('contact_id', cid) : { data: [] },
          cid ? db.from('agreements').select('id, number, type, status').eq('contact_id', cid).in('type', ['consultation', 'retainer']).neq('status', 'void').order('created_at', { ascending: false }) : { data: [] }]);
        m.querySelector('#k').innerHTML = '<option value="">None</option>' + (cs || []).map((x) => `<option value="${x.id}" ${x.id === caseId ? 'selected' : ''}>${esc(x.case_number)} · ${esc(x.title)}</option>`).join('');
        const signed = (ags || []).filter((a) => a.status === 'signed');
        const pick = agreementId || signed.find((a) => a.type === 'consultation')?.id || signed[0]?.id;
        m.querySelector('#g').innerHTML = (ags || []).map((a) => `<option value="${a.id}" ${a.id === pick ? 'selected' : ''}>${esc(a.number)} · ${a.type === 'consultation' ? 'Consultation' : 'Retainer'} · ${esc(a.status)}</option>`).join('') + `<option value="" ${pick ? '' : 'selected'}>Not linked</option>`;
        m.querySelector('#warn').innerHTML = cid && !signed.length
          ? '<div class="alert err" style="margin:0">No signed consultation or retainer agreement for this client yet. The Code requires a written agreement before you give advice, so get the Initial Consultation Agreement signed first.</div>' : '';
      };
      m.querySelector('#c').onchange = load; load();
    },
    actions: [{ label: 'Cancel' }, { label: 'Start assessment', cls: 'btn-primary', onClick: async (m) => {
      const contact_id = m.querySelector('#c').value; if (!contact_id) throw new Error('Choose a client.');
      const { data, error } = await db.from('pathway_assessments').insert({ contact_id, case_id: m.querySelector('#k').value || null, agreement_id: m.querySelector('#g').value || null }).select('id').single();
      if (error) throw error;
      location.hash = `#/pathways/${data.id}`;
    } }],
  });
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
    <div class="alert info">After the Initial Consultation Agreement is signed, assess the client's routes here. Answers save to the client file as you go; the RCIC marks the assessment <b>final</b> once reviewed.</div>
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
