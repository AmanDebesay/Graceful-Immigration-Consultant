// One pathway assessment: the Pathway map tool in a frame, saving its answers to the client file as you work.
import { db, state, can, esc, icon, fmtDateTime, staffName, confirmBox, toast, fail, modal } from '../core.js';
import { PA_BADGE, draftSummary } from './pathways.js';

export async function render(el, [id], { setTitle }) {
  const [{ data: a, error }, { data: org }] = await Promise.all([
    db.from('pathway_assessments').select('*, contacts(id, full_name, date_of_birth, email), cases(id, case_number, title), agreements(id, number, type, status)').eq('id', id).single(),
    db.from('org_settings').select('*').eq('id', 1).single()]);
  if (error) { el.innerHTML = '<div class="alert err">Assessment not found.</div>'; return; }
  setTitle(`${a.number} · ${a.contacts?.full_name || ''}`);
  const final = a.status === 'final', editable = !final && can('pathway.edit');

  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/pathways">← Pathway assessments</a>${PA_BADGE(a.status)}
      <span id="saveState" style="color:var(--muted);font-size:13px">${final ? `Final · ${esc(staffName(a.finalized_by))} · ${fmtDateTime(a.finalized_at)}` : editable ? 'Saves automatically' : 'View only'}</span><div class="grow"></div>
      <a class="btn" href="#/contacts/${a.contact_id}">${icon('user')} ${esc(a.contacts?.full_name || '')}</a>
      ${a.cases ? `<a class="btn" href="#/cases/${a.cases.id}">${icon('folder')} ${esc(a.cases.case_number)}</a>` : ''}
      ${a.agreements ? `<a class="btn" href="#/agreements/${a.agreements.id}">${icon('file')} ${esc(a.agreements.number)}</a>` : ''}
      <button class="btn" id="print" title="The RCIC's working summary, with internal flags">${icon('file')} Internal summary</button>
      <button class="btn btn-gold" id="client">${icon('award')} Client summary</button>
      ${editable && can('pathway.finalize') ? `<button class="btn btn-primary" id="fin">${icon('check')} Mark final</button>` : ''}
      ${final && can('pathway.finalize') ? `<button class="btn" id="reopen">Reopen</button>` : ''}
      ${editable ? `<button class="btn btn-danger" id="del" aria-label="Delete draft">${icon('trash')}</button>` : ''}</div>
    ${a.agreements?.status === 'signed' ? '' : `<div class="alert err">${a.agreements ? `Agreement ${esc(a.agreements.number)} is not signed yet.` : 'Not linked to a signed agreement.'} You can take the client's intake now; give advice only after the client signs the Initial Consultation Agreement.</div>`}
    ${editable && !can('pathway.finalize') ? '<div class="alert info">When you finish, ask the RCIC to review the assessment and mark it final.</div>' : ''}
    <div class="card" id="sumBox" style="margin-bottom:12px"><div class="card-b" style="padding:14px 18px">
      <div class="row" style="gap:10px;flex-wrap:wrap"><b style="font-family:var(--serif);font-size:17px;color:var(--navy)">${icon('award')} Recommended option</b>
        <span id="sumTop" class="dk-muted">Answer the questions below and the summary drafts itself.</span><div class="grow"></div>
        <button class="btn btn-sm" id="sumToggle" aria-expanded="false">Show summary</button>
        <button class="btn btn-sm" id="sumCopy">${icon('file')} Copy</button>
        <button class="btn btn-sm btn-gold" id="sumUse">Use in client summary</button></div>
      <div id="sumBody" hidden style="margin-top:12px;white-space:pre-wrap;line-height:1.55;font-size:14px;max-height:340px;overflow:auto;border-top:1px solid var(--line,#E4E7EC);padding-top:12px"></div>
      <small class="dk-muted" style="display:block;margin-top:8px">Drafted automatically from the results. Read it and edit it before giving it to the client.</small></div></div>
    <iframe id="pm" title="Pathway map" style="width:100%;height:calc(100vh - 190px);min-height:620px;border:1px solid var(--line,#E4E7EC);border-radius:12px;background:#fff"></iframe>
    <p style="color:var(--muted);font-size:12px;margin-top:8px">Decision support for the RCIC, not legal advice. Confirm every authority, time limit and policy on the official source before advising or filing.</p>`;

  const frame = el.querySelector('#pm'), stateEl = el.querySelector('#saveState');
  let tool = null, saved = '', timer = null, saving = null;
  let cs = a.result?.client_summary || {}; // what goes on the client's copy (names, message, sections)
  const fileNo = a.cases?.case_number || a.number;
  const firstName = () => cs.first_name || (a.contacts?.full_name || '').trim().split(/\s+/)[0] || '';
  let draft = a.result?.auto_summary || '', sumT = null;
  const TIER = { rec: 'Highly recommended', poss: 'Possible' };
  function refreshSum() {
    if (!tool) return;
    const r = tool.getResult(), top = r.ranked.find((x) => x.tier === 'rec') || r.ranked.find((x) => x.tier === 'poss');
    draft = draftSummary(r, firstName(), tool.getFacts());
    el.querySelector('#sumTop').innerHTML = !r.ranked.length ? 'Answer the questions below and the summary drafts itself.' : top ?`<b>${esc(top.name)}</b> · <span class="badge ${top.tier === 'rec' ? 'b-GREEN' : 'b-gold'}">${TIER[top.tier]}</span>` : 'No open option yet. Keep answering, or check the blocked routes.';
    el.querySelector('#sumBody').textContent = draft;
  }
  const sig = () => { const s = tool.getState(); return JSON.stringify([s.answers, s.checks, s.assessor]); };

  frame.onload = () => {
    tool = frame.contentWindow.PathwayMap;
    if (!tool) { stateEl.textContent = 'The assessment tool did not load. Refresh the page.'; return; }
    tool.setState({ tool: 'pathway-map', v: 1, ref: a.number + (a.cases ? ` · ${a.cases.case_number}` : ''),
      assessor: a.assessor || (editable ? state.profile.full_name : ''), answers: a.answers, checks: a.checks,
      client: { name: a.contacts?.full_name || '', dob: a.contacts?.date_of_birth || '', email: a.contacts?.email || '', file: fileNo } });
    saved = JSON.stringify([a.answers, a.checks, a.assessor || '']);
    refreshSum();
    if (editable && sig() !== saved) schedule();
  };
  frame.src = `tools/pathway-map.html?embed=1&theme=light&ca=${org?.client_account_open ? 1 : 0}${editable ? '' : '&ro=1'}`;

  async function save() {
    clearTimeout(timer); timer = null;
    if (!tool || !editable || sig() === saved) return;
    const s = tool.getState(), r = tool.getResult(), now = sig();
    const top = r.ranked.find((x) => x.tier !== 'block');
    stateEl.textContent = 'Saving…';
    const { error: e } = await db.from('pathway_assessments').update({ answers: s.answers, checks: s.checks, assessor: s.assessor || null,
      result: { ranked: r.ranked, flags: r.flags.map((f) => ({ sev: f.sev, title: f.t, why: f.why })), facts: tool.getFacts(), client_summary: cs, auto_summary: draft },
      top_route: top ? top.name : null, urgent_flags: r.flags.filter((f) => f.sev === 'urgent').length }).eq('id', id);
    if (e) { stateEl.textContent = 'Not saved'; return fail(e); }
    saved = now;
    stateEl.textContent = `Saved ${new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`;
  }
  const flush = () => (saving = save().finally(() => (saving = null)));
  function schedule() { stateEl.textContent = 'Unsaved changes…'; clearTimeout(timer); timer = setTimeout(flush, 1200); }

  // The tool posts an update after every change; save shortly after the last one.
  const onMsg = (e) => {
    if (!el.isConnected) { window.removeEventListener('message', onMsg); window.removeEventListener('hashchange', onLeave); return; }
    if (e.source !== frame.contentWindow || e.origin !== location.origin || e.data?.type !== 'pathwaymap:update') return;
    clearTimeout(sumT); sumT = setTimeout(refreshSum, 300);
    if (editable && tool && sig() !== saved) schedule();
  };
  const onLeave = () => { if (timer) flush(); window.removeEventListener('message', onMsg); window.removeEventListener('hashchange', onLeave); };
  window.addEventListener('message', onMsg);
  window.addEventListener('hashchange', onLeave);
  window.addEventListener('beforeunload', () => { if (timer) flush(); }, { once: true });

  el.querySelector('#print').onclick = () => {
    if (!tool) return;
    frame.contentWindow.print(); // the tool prints its summary page
  };
  el.querySelector('#client').onclick = () => clientSummary().catch(fail);
  el.querySelector('#sumToggle').onclick = (e) => {
    const b = el.querySelector('#sumBody'); b.hidden = !b.hidden;
    e.currentTarget.textContent = b.hidden ? 'Show summary' : 'Hide summary'; e.currentTarget.setAttribute('aria-expanded', String(!b.hidden));
  };
  el.querySelector('#sumCopy').onclick = async () => { refreshSum(); try { await navigator.clipboard.writeText(draft); toast('Summary copied'); } catch { fail(new Error('Copy did not work. Select the text and copy it.')); } };
  el.querySelector('#sumUse').onclick = () => { refreshSum(); clientSummary(draft).catch(fail); };
  el.querySelector('#fin')?.addEventListener('click', async () => {
    if (!(await confirmBox('Mark final', 'Mark this assessment final? It becomes part of the client file and is locked. You can reopen it later if something changes.', 'Mark final'))) return;
    await (saving || flush());
    const { error: e } = await db.from('pathway_assessments').update({ status: 'final' }).eq('id', id);
    if (e) return fail(e);
    toast('Assessment marked final'); render(el, [id], { setTitle });
  });
  el.querySelector('#reopen')?.addEventListener('click', async () => {
    const { error: e } = await db.from('pathway_assessments').update({ status: 'draft' }).eq('id', id);
    if (e) return fail(e);
    toast('Assessment reopened'); render(el, [id], { setTitle });
  });
  // Client copy: company letterhead, the client's details from the file, the options in plain language, and an acknowledgement to sign.
  async function clientSummary(useDraft) {
    if (!tool) return;
    refreshSum();
    const note = useDraft || cs.note || draft;
    const name = (a.contacts?.full_name || '').trim().split(/\s+/);
    const first = cs.first_name ?? name.slice(0, -1).join(' ') ?? '', last = cs.last_name ?? (name.length > 1 ? name[name.length - 1] : '');
    const lock = !editable;
    modal({ title: `Client summary · ${a.number}`, wide: true,
      body: `<p class="dk-muted" style="margin-bottom:12px">Printed on the company letterhead, like the agreements, with an acknowledgement for the client to sign. Give it to the client with the signed agreement.${lock ? ' This assessment is final, so changes here are used for this printout only.' : ''}</p>
        <div class="row-2"><div class="field"><label>First name</label><input class="input" id="sf" value="${esc(first || name[0] || '')}"></div><div class="field"><label>Last name</label><input class="input" id="sl" value="${esc(last)}"></div></div>
        <div class="row-2"><div class="field"><label>Date of birth</label><input class="input" type="date" id="sd" value="${esc(a.contacts?.date_of_birth || '')}" disabled title="From the client's file"></div>
          <div class="field"><label>Email</label><input class="input" id="se" value="${esc(a.contacts?.email || '')}" disabled title="From the client's file"></div></div>
        <div class="row-2"><div class="field"><label>File number</label><input class="input" value="${esc(fileNo)}" disabled></div><div class="field"><label>Agreement</label><input class="input" value="${esc(a.agreements?.number || 'Not linked')}" disabled></div></div>
        <small class="dk-muted" style="display:block;margin:-4px 0 12px">Date of birth and email come from the <a href="#/contacts/${a.contact_id}">client's file</a>. Edit them there if they are missing or wrong.</small>
        <div class="field"><div class="row" style="justify-content:space-between"><label>Message to the client <span class="dk-muted">(drafted from the results; edit freely)</span></label><button type="button" class="btn btn-sm" id="redraft">Redraft from results</button></div><textarea class="input" id="sn" rows="12" placeholder="e.g. Based on our consultation, I recommend we start with the spousal sponsorship. Please gather the documents listed under next steps and book a follow-up.">${esc(note)}</textarea></div>
        <label class="row" style="gap:8px;margin-bottom:6px"><input type="checkbox" id="sfa" ${cs.show_facts === false ? '' : 'checked'}> Include “What you told us” (the client's answers)</label>
        <label class="row" style="gap:8px"><input type="checkbox" id="sbl" ${cs.show_blocked === false ? '' : 'checked'}> Include options that are not available at this time</label>`,
      onOpen: (m) => { m.querySelector('#redraft').onclick = () => { m.querySelector('#sn').value = draftSummary(tool.getResult(), m.querySelector('#sf').value.trim() || firstName(), tool.getFacts()); }; },
      actions: [{ label: 'Cancel' }, { label: 'Preview & print', cls: 'btn-gold', onClick: async (m) => {
        const v = (q) => m.querySelector(q).value.trim();
        const next = { first_name: v('#sf'), last_name: v('#sl'), note: v('#sn'), show_facts: m.querySelector('#sfa').checked, show_blocked: m.querySelector('#sbl').checked };
        if (editable) {
          await (saving || flush());
          const { error: e } = await db.from('pathway_assessments').update({ result: { ...(await db.from('pathway_assessments').select('result').eq('id', id).single()).data.result, client_summary: next } }).eq('id', id);
          if (e) throw e;
        }
        cs = next;
        const r = tool.getResult(), order = { rec: 0, poss: 1, weak: 2, block: 3 };
        const shown = r.ranked.filter((x) => next.show_blocked || x.tier !== 'block').sort((x, y) => order[x.tier] - order[y.tier]);
        const refs = [...new Map(shown.filter((x) => x.tier !== 'block').flatMap((x) => x.refs).map((x) => [x.title, x])).values()].slice(0, 14);
        const dates = r.flags.filter((f) => f.sev !== 'note' && /day|deadline|appeal|Federal Court|removal|procedural fairness|status|RAD/i.test(f.t)).map((f) => ({ t: f.t, why: f.why }));
        const { pathwaySummary, defaults } = await import('../agreement-templates.js');
        const base = defaults('consultation', { settings: org || {} });
        const html = pathwaySummary({ ...base, number: a.number, assessment_date: (a.finalized_at || new Date().toISOString()).slice(0, 10), agreement_number: a.agreements?.number || '',
          file_number: fileNo, first_name: next.first_name, last_name: next.last_name, dob: a.contacts?.date_of_birth || '', email: a.contacts?.email || '',
          facts: tool.getFacts(), routes: shown, dates, note: next.note, refs, show_facts: next.show_facts, show_blocked: next.show_blocked });
        const { printDoc } = await import('./agreement.js');
        printDoc(html, `${a.number} Pathway summary - ${[next.first_name, next.last_name].filter(Boolean).join(' ')}`, a.status === 'final' ? '' : 'DRAFT: mark the assessment final before giving this to the client.');
      } }] });
  }
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox('Delete draft', `Delete draft ${a.number}? This can't be undone.`, 'Delete', true))) return;
    clearTimeout(timer); timer = null;
    const { error: e } = await db.from('pathway_assessments').delete().eq('id', id);
    if (e) return fail(e);
    toast('Draft deleted'); location.hash = '#/pathways';
  });
}
