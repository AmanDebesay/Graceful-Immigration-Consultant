// Submission letter editor: guided form on the left, readiness check + live letter on the right.
// Drafts autosave. The RCIC finalizes (locks) the letter; their saved handwritten signature is placed on it then.
import { db, state, can, esc, icon, fmtDate, fmtDateTime, modal, confirmBox, toast, fail } from '../core.js';
import { TYPES, COACH, DELIVERY, letterHtml, letterText, checkLetter } from '../letter-templates.js';
import { letterBadge } from './letters.js';

const P_LABEL = { applicant: 'Principal applicant', dob: 'Date of birth', uci: 'UCI', app_no: 'Application number', citizenship: 'Country of citizenship', residence: 'Country of residence', status: 'Current status in Canada', app_type: 'Application' };
const LOGO = () => new URL('../public/img/logo-full.png', location.href.split('#')[0]).href;
const rowsFor = (s) => Math.min(28, Math.max(4, String(s || '').split('\n').reduce((n, l) => n + 1 + Math.floor(l.length / 70), 0) + 1));

export async function render(el, [id], { setTitle }) {
  const { data: L, error } = await db.from('submission_letters').select('*, contacts(id, full_name), cases(id, case_number)').eq('id', id).single();
  if (error || !L) { el.innerHTML = '<div class="alert err">Letter not found.</div>'; return; }
  const [{ data: org }, { data: me }, { data: mine }] = await Promise.all([
    db.from('org_settings').select('*').eq('id', 1).single(),
    db.from('profiles').select('full_name, job_title, email_sig, role').eq('id', state.profile.id).single(),
    db.from('user_signatures').select('signature').eq('user_id', state.profile.id).maybeSingle(),
  ]);
  const t = TYPES[L.type] || TYPES.general;
  const d = structuredClone(L.data || {});
  d.particulars ||= {}; d.extra ||= {}; d.sections ||= []; d.enclosures ||= [];
  let title = L.title;
  const locked = L.status === 'final' || !can('letters.edit');
  const canFinal = can('letters.finalize');
  setTitle(`${L.number} · ${title}`);

  const sg = me?.email_sig || {};
  const draftSigner = { name: me?.full_name || org?.rcic_name, credentials: sg.credentials || 'RCIC-IRB', title: sg.title || me?.job_title || '', college_id: sg.college_id || org?.licence_number };
  const ctx = (clean = false) => ({ org, logo: LOGO(), clean, signer: d.signed || (canFinal ? draftSigner : { name: org?.rcic_name, credentials: 'RCIC-IRB', college_id: org?.licence_number }), signature: L.status === 'final' ? d.signed?.signature : '' });
  const tmplSec = (key) => t.sections.find((s) => s.key === key);
  const pList = t.particulars.map((p) => (Array.isArray(p) ? p : [p, P_LABEL[p] || p]));
  const dis = locked ? 'disabled' : '';
  const tips = (arr) => arr?.length ? `<ul class="sl-tips">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const sec = (title, inner, open = false) => `<details class="agr-sec" ${open ? 'open' : ''}><summary>${title}</summary><div class="agr-sec-b">${inner}</div></details>`;
  const aiBtn = (target) => locked ? '' : `<button class="btn btn-sm" type="button" data-ai="${target}">${icon('sparkle')} Improve with AI</button>`;

  const sectionCard = (x, i) => {
    const ts = tmplSec(x.key);
    return `<div class="sl-sec ${x.on ? '' : 'off'}" data-i="${i}">
      <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
        <label class="row" style="gap:6px;flex:none" title="Include this section"><input type="checkbox" data-s="${i}" data-f="on" ${x.on ? 'checked' : ''} ${dis}></label>
        <input class="input" data-s="${i}" data-f="heading" value="${esc(x.heading || '')}" placeholder="Heading" style="font-weight:600" ${dis}>
        ${locked ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-up="${i}" title="Move up" aria-label="Move up">↑</button><button class="btn btn-ghost btn-sm" type="button" data-del="${i}" title="Remove section" aria-label="Remove section">${icon('trash')}</button>`}</div>
      <details class="sl-coach"><summary>${icon('book')} How to write this section</summary>${tips(ts?.help || ['State the point, the rule, then apply the facts with Tab references.'])}</details>
      ${ts?.snippets?.length && !locked ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin:6px 0">${ts.snippets.map((sn, j) => `<button class="btn btn-sm" type="button" data-snip="${i}:${j}">+ ${esc(sn[0])}</button>`).join('')}</div>` : ''}
      <textarea class="input sl-ta" data-s="${i}" data-f="text" rows="${rowsFor(x.text)}" ${dis}>${esc(x.text || '')}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:6px">${aiBtn('s' + i)}</div></div>`;
  };
  const enclRows = () => d.enclosures.map((e, i) => `<div class="row sl-encl" style="gap:6px;margin-bottom:6px"><span class="sl-tab">Tab ${i + 1}</span>
      <input class="input" data-e="${i}" value="${esc(e.desc || '')}" placeholder="Document description" ${dis}>
      ${locked ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-eup="${i}" aria-label="Move up">↑</button><button class="btn btn-ghost btn-sm" type="button" data-edel="${i}" aria-label="Remove">${icon('trash')}</button>`}</div>`).join('');

  const form = () => `
    ${sec(`${icon('book')} Legal test & approach`, `<div class="sl-test"><b>${t.kind === 'rules' ? 'Rules-based letter' : 'Persuasive letter'}</b> — ${t.kind === 'rules'
      ? 'show each requirement is met, concisely, with the document that proves it. Explain anything missing.'
      : 'convince the officer to exercise discretion. Lead with your strongest point, tie every fact to the test, and prove each one.'}</div>
      <p style="margin:8px 0"><b>The test:</b> ${esc(t.test)}</p>
      <details class="sl-coach"><summary>Before you write</summary>${tips(COACH.before)}</details>
      <details class="sl-coach"><summary>While you write</summary>${tips(COACH.writing)}</details>
      <details class="sl-coach"><summary>Before you file</summary>${tips(COACH.filing)}</details>`, true)}
    ${sec('Letter details', `<div class="field"><label>Title (for your list)</label><input class="input" id="ttl" value="${esc(title)}" ${dis}></div>
      <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" data-k="date" value="${esc(d.date || '')}" ${dis}></div>
      <div class="field"><label>How it is sent</label><select class="input" data-k="delivery" ${dis}>${Object.entries(DELIVERY).map(([k, v]) => `<option value="${k}" ${d.delivery === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}<option value="" ${!d.delivery ? 'selected' : ''}>(don’t show)</option></select></div></div>
      <div class="field"><label>To (IRCC office and address)</label><textarea class="input" data-k="recipient" rows="3" ${dis}>${esc(d.recipient || '')}</textarea></div>
      <div class="field"><label>Salutation</label><input class="input" data-k="salutation" value="${esc(d.salutation || '')}" ${dis}></div>
      ${(t.extraFields || []).map(([k, lab, , opts]) => `<div class="field"><label>${esc(lab)}</label><select class="input" data-x="${k}" ${dis}>${opts.map(([v, l]) => `<option value="${v}" ${d.extra[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}`)}
    ${sec('RE: block (file particulars)', `<p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">Filled in from the client file and case. Empty lines are left out of the letter.</p>
      ${pList.map(([k, lab]) => `<div class="field"><label>${esc(lab)}</label><input class="input" ${['dob', 'decision_date'].includes(k) ? 'type="date"' : ''} data-p="${k}" value="${esc(d.particulars[k] || '')}" ${dis}></div>`).join('')}`)}
    ${sec('Opening — the heart of the case', `<details class="sl-coach" open><summary>${icon('book')} How to write the opening</summary>${tips(t.opening.help)}</details>
      <textarea class="input sl-ta" data-k="opening" rows="${rowsFor(d.opening)}" ${dis}>${esc(d.opening || '')}</textarea>
      <label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" data-k="rep_statement" ${d.rep_statement ? 'checked' : ''} ${dis}> <span>Add the representation paragraph (IMM 5476 enclosed)</span></label>
      <div class="row" style="justify-content:flex-end;margin-top:6px">${aiBtn('opening')}</div>`, true)}
    ${sec('Body — sections', `<p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">Headings follow the legal test. Untick a section to leave it out. Refer to evidence as “Tab 3” or “Tab 3, p. 2” — the numbers match the enclosure list below. Lines starting with “- ” become bullets; “&gt; ” makes a quotation.</p>
      <div id="secs">${d.sections.map(sectionCard).join('')}</div>${locked ? '' : `<button class="btn btn-sm" type="button" id="addSec">${icon('plus')} Add a section</button>`}`, true)}
    ${sec('Conclusion & request', `<details class="sl-coach"><summary>${icon('book')} How to write the conclusion</summary>${tips(['Close with your second-strongest point, then make the exact request (what remedy, under which provision).', 'For persuasive letters, ask for an opportunity to respond (or an interview) if the officer has credibility concerns.'])}</details>
      <textarea class="input sl-ta" data-k="conclusion" rows="${rowsFor(d.conclusion)}" ${dis}>${esc(d.conclusion || '')}</textarea><div class="row" style="justify-content:flex-end;margin-top:6px">${aiBtn('conclusion')}</div>`)}
    ${sec(`Enclosures (${d.enclosures.length} tabs)`, `<p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">List every document in the order it is attached. Tab numbers follow this order.</p><div id="encl">${enclRows()}</div>
      ${locked ? '' : `<button class="btn btn-sm" type="button" id="addEncl">${icon('plus')} Add a document</button>`}`)}
    ${sec('Sign-off', `<div class="field"><label>Closing</label><input class="input" data-k="closing" value="${esc(d.closing || '')}" ${dis}></div>
      <p class="dk-muted" style="font-size:12.5px">${L.status === 'final' ? `Signed by ${esc(d.signed?.name || '')} when finalized on ${fmtDateTime(L.finalized_at)}.` : canFinal ? `When you finalize, your name, College ID${mine?.signature ? ' and saved handwritten signature' : ''} go on the letter.${mine?.signature ? '' : ' Save a handwritten signature under My Account to have it printed.'}` : 'The RCIC signs the letter when they finalize it.'}</p>`)}`;

  el.innerHTML = `<div class="toolbar no-print"><a class="btn btn-sm" href="#/contacts/${L.contact_id}">← ${esc(L.contacts?.full_name || 'Client')}</a>${letterBadge(L.status)}
      <small class="dk-muted" style="margin-left:6px">${esc(L.number)} · ${esc(t.short)}${L.cases ? ` · <a href="#/cases/${L.cases.id}">${esc(L.cases.case_number)}</a>` : ''}</small><span id="saved" class="dk-muted" style="font-size:12px;margin-left:8px"></span><div class="grow"></div>
      ${can('letters.view') ? `<button class="btn" id="review">${icon('sparkle')} AI review</button>` : ''}
      <button class="btn" id="word">${icon('file')} Word</button><button class="btn" id="print">${icon('file')} Print / PDF</button>
      ${canFinal && L.status === 'draft' ? `<button class="btn btn-primary" id="final">${icon('check')} Finalize & sign</button>` : ''}
      ${canFinal && L.status === 'final' ? `<button class="btn" id="reopen">Reopen to edit</button>` : ''}
      ${can('letters.edit') && L.status === 'draft' ? `<button class="btn btn-danger" id="del" aria-label="Delete draft">${icon('trash')}</button>` : ''}</div>
    ${L.status === 'final' ? `<div class="alert ok no-print">Final — signed by ${esc(d.signed?.name || '')} on ${fmtDate(L.finalized_at)}. ${canFinal ? 'Reopen it to make changes.' : ''}</div>` : ''}
    <div class="agr-layout"><div class="card agr-form" id="form">${form()}</div>
      <div><div class="card sl-ready" id="ready"></div>
        <div class="card agr-preview"><div class="card-h"><h3>Letter</h3><small style="color:var(--muted)">Yellow = still to fill in</small></div><div class="card-b" id="pv" style="padding:0;overflow:auto"></div></div></div></div>`;

  const pv = el.querySelector('#pv'), ready = el.querySelector('#ready'), saved = el.querySelector('#saved');
  const knownNames = () => [d.particulars.sponsor].filter(Boolean).flatMap((n) => String(n).split(/\s+/));
  const refresh = () => {
    pv.innerHTML = letterHtml(d, L.type, ctx());
    const r = checkLetter(d, L.type, { knownNames: knownNames() });
    const lv = { error: ['b-RED', 'Fix'], warn: ['b-AMBER', 'Improve'], info: ['', 'Note'] };
    const color = r.score >= 85 ? 'var(--green)' : r.score >= 60 ? 'var(--amber)' : 'var(--red)';
    ready.innerHTML = `<div class="card-b"><div class="row" style="gap:14px;align-items:center">
        <div class="sl-score" style="--c:${color}"><b>${r.score}</b><small>/100</small></div>
        <div><b style="color:var(--navy)">Readiness check</b><br><small class="dk-muted">${r.words} words · ${r.issues.filter((i) => i.level === 'error').length} to fix · ${r.issues.filter((i) => i.level === 'warn').length} to improve. Automatic checks — use AI review for a full critique.</small></div></div>
      ${r.issues.length ? `<details class="sl-issues" ${r.issues.some((i) => i.level !== 'info') ? 'open' : ''}><summary>${r.issues.length} item${r.issues.length > 1 ? 's' : ''}</summary><ul>${r.issues.map((i) => `<li><span class="badge ${lv[i.level][0]}">${lv[i.level][1]}</span> <b>${esc(i.where)}:</b> ${esc(i.msg)}</li>`).join('')}</ul></details>`
        : '<div class="alert ok" style="margin-top:10px">No automatic issues found. Read it aloud and have someone else review it before filing.</div>'}</div>`;
    return r;
  };

  let timer = null;
  const save = () => {
    if (locked) return;
    clearTimeout(timer); saved.textContent = 'Saving…';
    timer = setTimeout(async () => {
      const { error: er } = await db.from('submission_letters').update({ data: d, title }).eq('id', id);
      saved.textContent = er ? 'Not saved — ' + er.message : 'Saved';
    }, 900);
  };
  const changed = () => { refresh(); save(); };
  const redrawSecs = () => { el.querySelector('#secs').innerHTML = d.sections.map(sectionCard).join(''); };
  const redrawEncl = () => { el.querySelector('#encl').innerHTML = enclRows(); };

  const formEl = el.querySelector('#form');
  formEl.addEventListener('input', (e) => {
    const i = e.target;
    if (i.id === 'ttl') { title = i.value; setTitle(`${L.number} · ${title}`); return save(); }
    if (i.dataset.k) d[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value;
    else if (i.dataset.p) d.particulars[i.dataset.p] = i.value;
    else if (i.dataset.x) d.extra[i.dataset.x] = i.value;
    else if (i.dataset.s) { const s = d.sections[+i.dataset.s]; s[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value; if (i.dataset.f === 'on') i.closest('.sl-sec').classList.toggle('off', !i.checked); }
    else if (i.dataset.e) d.enclosures[+i.dataset.e].desc = i.value;
    else return;
    if (i.tagName === 'TEXTAREA') i.rows = rowsFor(i.value);
    changed();
  });
  formEl.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || locked && !b.dataset.ai) return;
    if (b.id === 'addSec') { d.sections.push({ key: 'c' + Date.now(), heading: '', text: '', on: true }); redrawSecs(); changed(); }
    else if (b.dataset.del) { if (await confirmBox('Remove this section?', 'Its heading and text are deleted from this letter.', 'Remove', true)) { d.sections.splice(+b.dataset.del, 1); redrawSecs(); changed(); } }
    else if (b.dataset.up) { const i = +b.dataset.up; if (i > 0) { [d.sections[i - 1], d.sections[i]] = [d.sections[i], d.sections[i - 1]]; redrawSecs(); changed(); } }
    else if (b.dataset.snip) { const [i, j] = b.dataset.snip.split(':').map(Number); const sn = tmplSec(d.sections[i].key).snippets[j][1]; d.sections[i].text = `${String(d.sections[i].text || '').trimEnd()}\n\n${sn}`.trim(); redrawSecs(); changed(); }
    else if (b.id === 'addEncl') { d.enclosures.push({ desc: '' }); redrawEncl(); changed(); el.querySelector(`[data-e="${d.enclosures.length - 1}"]`)?.focus(); }
    else if (b.dataset.edel) { d.enclosures.splice(+b.dataset.edel, 1); redrawEncl(); changed(); toast('Removed. Check your Tab references — the numbers after it moved up.'); }
    else if (b.dataset.eup) { const i = +b.dataset.eup; if (i > 0) { [d.enclosures[i - 1], d.enclosures[i]] = [d.enclosures[i], d.enclosures[i - 1]]; redrawEncl(); changed(); toast('Moved. Update any Tab references that changed.'); } }
    else if (b.dataset.ai) improve(b.dataset.ai);
  });

  // ── AI (Claude via the staff assistant). Identifiers are removed before sending. ──
  const scrub = (text) => {
    let s = String(text || '');
    const names = [d.particulars.applicant, d.particulars.sponsor].filter(Boolean).flatMap((n) => String(n).split(/\s+/)).filter((n) => n.length >= 2);
    for (const n of names) s = s.replace(new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu'), '$1[name]');
    for (const k of ['dob', 'uci', 'app_no', 'profile_no', 'lmia', 'pal']) { const v = String(d.particulars[k] || '').trim(); if (v.length >= 4) s = s.split(v).join('[removed]'); }
    return s;
  };
  const ask = async (prompt, box) => {
    const { streamFn, md } = await import('./assistant.js');
    return streamFn('ai-assist', { task: 'letter', messages: [{ role: 'user', content: prompt }] }, (txt) => { box.innerHTML = md(txt.replace(/<<<REWRITE>>>|<<<END>>>/g, '')); box.scrollTop = box.scrollHeight; });
  };
  const PRIV = '<p class="dk-muted" style="font-size:12px;margin-bottom:8px">The client’s name, date of birth, UCI and file numbers are removed before the text is sent to the AI. Other names you typed are sent as written. The AI can be wrong — check every suggestion and citation.</p>';

  el.querySelector('#review')?.addEventListener('click', () => {
    modal({ title: 'AI review of this letter', wide: true, body: `${PRIV}<div id="out" class="ai-out" style="max-height:60vh;overflow:auto"><div class="loading" style="min-height:80px"><div class="spin"></div>Reviewing…</div></div>`,
      onOpen: async (m) => {
        const box = m.querySelector('#out');
        const auto = checkLetter(d, L.type, { knownNames: knownNames() }).issues.map((i) => `- ${i.where}: ${i.msg}`).join('\n');
        const prompt = `You are reviewing a draft ${t.label} letter to IRCC written by a Regulated Canadian Immigration Consultant. Review it as a senior Canadian immigration practitioner and legal-writing instructor would.

Assess three areas:
1. Technical — grammar, punctuation, spelling, usage. Quote the exact phrase and give the correction.
2. Formal — structure and organization: CREAC (Conclusion, Rule, Explanation, Application, Conclusion) in each argument section; all necessary parts present (date, delivery method, recipient, RE block, representation statement, clear request, enclosure list, signature); professional, respectful tone (no instructions to the officer, no informality, no exaggeration).
3. Substantive — is the purpose obvious and the legal conclusion clear; is the client's story rational and in order (people introduced before they appear); is the correct, current law and policy cited (flag outdated references such as former manuals, and say "verify" for any citation or pinpoint you cannot confirm — never invent citations); are the legally relevant facts tied to the legal test; is every factual statement supported by an enclosed tab; what would an officer doubt or find missing; what evidence would close each gap.

The legal test for this kind of letter: ${t.test}
This is a ${t.kind === 'rules' ? 'rules-based letter — it should be concise and show each requirement is met' : 'persuasive letter — it should lead with the strongest point, close with the second strongest, and prove every fact'}.

Automatic checks already flagged:
${auto || '- none'}

Reply with these headings:
## Verdict (2–3 sentences and a readiness score out of 10)
## Top 5 fixes (in priority order)
## Section by section
## Evidence to add
## Suggested opening (rewrite the opening in 2–3 sentences using only facts in the letter)

Canadian English. Do not add facts that are not in the letter.

--- LETTER ---
${scrub(letterText(d, L.type))}`;
        try { await ask(prompt, box); } catch (err) { box.innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
      },
      actions: [{ label: 'Close' }] });
  });

  function improve(target) {
    const isSec = target.startsWith('s');
    const s = isSec ? d.sections[+target.slice(1)] : null;
    const heading = isSec ? s.heading : target === 'opening' ? 'Opening paragraph' : 'Conclusion and request';
    const text = isSec ? s.text : d[target];
    const help = isSec ? tmplSec(s.key)?.help || [] : target === 'opening' ? t.opening.help : ['Close with the second-strongest point and an exact request.'];
    let result = '';
    modal({ title: `Improve: ${heading}`, wide: true, body: `${PRIV}<div id="out" class="ai-out" style="max-height:55vh;overflow:auto"><div class="loading" style="min-height:80px"><div class="spin"></div>Working…</div></div>`,
      onOpen: async (m) => {
        const box = m.querySelector('#out');
        const prompt = `Improve one part of a ${t.label} letter to IRCC, written by a Regulated Canadian Immigration Consultant.
Part: ${heading}
Legal test for the letter: ${t.test}
Guidance for this part:
${help.map((h) => '- ' + h).join('\n')}

Rules: keep every fact as given — do not add new facts, names, dates or numbers. Where evidence is needed write [Tab ?]. Where a fact is missing write [confirm: …]. Keep existing Tab references. Plain, professional, respectful language; short paragraphs; for argument sections use CREAC. Lines starting with "- " are bullets. Do not invent citations; keep only ones already present unless a well-known leading authority is essential, and then add "(verify)".

Reply in exactly this format:
<<<REWRITE>>>
(the improved text only)
<<<END>>>
## What I changed
## Evidence that would strengthen it

--- CURRENT TEXT ---
${scrub(text || '(empty)')}

--- REST OF THE LETTER, for context ---
${scrub(letterText(d, L.type)).slice(0, 14000)}`;
        try { result = await ask(prompt, box); } catch (err) { box.innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
      },
      actions: [{ label: 'Close' }, ...(locked ? [] : [{ label: 'Use the rewrite', cls: 'btn-primary', onClick: () => {
        const mm = result.match(/<<<REWRITE>>>\s*([\s\S]*?)\s*<<<END>>>/);
        if (!mm) throw new Error('The rewrite isn’t ready yet, or the reply had no rewrite.');
        // Put real names back where the scrubbed text had [name]
        const first = String(d.particulars.applicant || '').trim();
        const back = mm[1].replace(/\[name\]/g, first ? first.split(/\s+/).pop() : '[name]');
        if (isSec) s.text = back; else d[target] = back;
        if (isSec) redrawSecs(); else { const ta = el.querySelector(`[data-k="${target}"]`); ta.value = back; ta.rows = rowsFor(back); }
        changed(); toast('Section replaced. Check names, facts and [placeholders].');
      } }])] });
  }

  // ── Output ──
  const fileBase = () => `${L.number} ${title}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  el.querySelector('#print').onclick = async () => {
    const r = checkLetter(d, L.type, { knownNames: knownNames() });
    const banner = L.status === 'draft' ? `DRAFT — not finalized${r.issues.some((i) => i.level === 'error') ? ' · has items to fix' : ''}` : '';
    (await import('./agreement.js')).printDoc(letterHtml(d, L.type, ctx(true)), fileBase(), banner);
  };
  el.querySelector('#word').onclick = () => {
    const html = letterHtml(d, L.type, ctx(true)).replace(/class="ph"/g, '');
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(fileBase())}</title>
      <style>@page WordSection1{size:8.5in 11.0in;margin:0.9in 0.9in 0.9in 0.9in}div.WordSection1{page:WordSection1}</style></head><body><div class="WordSection1">${html}</div></body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿', doc], { type: 'application/msword' })); a.download = fileBase() + '.doc'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  el.querySelector('#final')?.addEventListener('click', async () => {
    const r = checkLetter(d, L.type, { knownNames: knownNames() });
    const errs = r.issues.filter((i) => i.level === 'error');
    modal({ title: 'Finalize and sign this letter', body: `${errs.length ? `<div class="alert err" style="margin-bottom:10px">${errs.length} item${errs.length > 1 ? 's' : ''} still to fix:<ul style="margin:6px 0 0 18px">${errs.slice(0, 6).map((i) => `<li>${esc(i.where)}: ${esc(i.msg)}</li>`).join('')}</ul></div>` : '<div class="alert ok" style="margin-bottom:10px">No items to fix.</div>'}
      <p>The letter is locked and signed by <b>${esc(draftSigner.name || '')}, ${esc(draftSigner.credentials)}</b>${mine?.signature ? ' with your saved handwritten signature' : ' (name printed in script — no saved handwritten signature)'}. You can reopen it later; that is recorded in the audit log.</p>
      <label class="row" style="gap:8px;margin-top:10px;align-items:flex-start"><input type="checkbox" id="ok1" style="margin-top:3px"><span>I have reviewed the facts with the client, checked every citation, and the enclosures match the package.</span></label>`,
      actions: [{ label: 'Cancel' }, { label: 'Finalize & sign', cls: 'btn-primary', onClick: async (m) => {
        if (!m.querySelector('#ok1').checked) throw new Error('Please confirm the review first.');
        clearTimeout(timer);
        d.signed = { ...draftSigner, signature: mine?.signature || '', at: new Date().toISOString() };
        const { error: er } = await db.from('submission_letters').update({ data: d, title, status: 'final' }).eq('id', id);
        if (er) { delete d.signed; throw er; }
        toast('Letter finalized'); render(el, [id], { setTitle });
      } }] });
  });
  el.querySelector('#reopen')?.addEventListener('click', async () => {
    if (!(await confirmBox('Reopen this letter?', 'It becomes an editable draft again and the signature is removed until you finalize it again.', 'Reopen'))) return;
    delete d.signed;
    const { error: er } = await db.from('submission_letters').update({ status: 'draft', data: d }).eq('id', id);
    if (er) return fail(er);
    render(el, [id], { setTitle });
  });
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox('Delete this draft?', 'This can’t be undone.', 'Delete', true))) return;
    const { error: er } = await db.from('submission_letters').delete().eq('id', id);
    if (er) return fail(er);
    toast('Draft deleted'); location.hash = `#/contacts/${L.contact_id}`;
  });

  refresh();
}
