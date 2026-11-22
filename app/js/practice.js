// Practice Operating System: the client file, risk flags and complexity, representation forms (IMM 5476/5744),
// deadlines, the form data sheet and consistency checker, quotes, and the printable signing packet.
// Rules that came from the design document and that the RCIC should confirm live in Business Settings → Pricing & rules.
import { db, state, can, esc, icon, fmtDate, modal, toast, fail, today, rpc } from './core.js';

// ── Risk flags (intake) — the first seven score one complexity point each ──
export const RISK = [
  ['prior_refusal', 'Prior refusal', true, 'Check every form answers the same way; collect the refusal letter and GCMS notes.'],
  ['gaps', 'Gaps in the timeline', true, 'Resolve every gap before any submission.'],
  ['security_history', 'Military, police or security service in the history', true, 'Full duty questions; check the Ezokola factors if inadmissibility is raised; line up evidence.'],
  ['inconsistent_forms', 'Forms disagree (dates, UNHCR, a “No” on a relevant question)', true, 'Voluntary correction plan before IRCC finds it.'],
  ['expired_docs', 'Expired documents', true, 'Renew or explain before filing.'],
  ['other_country', 'Another country involved (visa office, third-country status)', true, 'Confirm the right visa office and third-country documents.'],
  ['urgent_deadline', 'Urgent court or IRCC deadline', true, 'Diary it now; Federal Court matters go to a lawyer.'],
  ['detention', 'Detention', false, 'Check every form answers the same way; collect documents.'],
  ['third_party', 'Someone other than the client is paying or giving instructions', false, 'Payer agreement; consent to share; confirm who the client is.'],
  ['conflict', 'Possible conflict (sponsor, relative, employer)', false, 'Conflict consent or separate files.'],
  ['prior_helper', 'Prior helper or unlicensed adviser', false, 'Record who helped and whether they were paid.'],
  ['language_barrier', 'Language barrier', false, 'Interpreter declaration on forms and consents.'],
  ['deadline_passed', 'IRCC deadline already passed', false, 'Urgent: confirm what was sent and request an extension.'],
];
export const RISK_LABEL = Object.fromEntries(RISK.map(([k, l]) => [k, l]));
export const points = (flags = []) => RISK.filter(([k, , s]) => s && flags.includes(k)).length;
export const tierOf = (p) => (p <= 1 ? 'low' : p <= 3 ? 'mid' : 'high');
export const factorFor = (p, pricing) => Number(pricing?.complexity?.[tierOf(p)] ?? { low: 1, mid: 1.15, high: 1.3 }[tierOf(p)]);

export const REP_STATE = { not_needed: 'Not needed', printed: 'Prepared, waiting for signatures', signed: 'Signed', scanned: 'Signed copy scanned', filed: 'Filed with IRCC', withdrawn: 'Withdrawn (Section D)' };
export const REP_FORM = { IMM5476: 'IMM 5476 — Use of a Representative', IMM5744: 'IMM 5744 — ATIP consent' };
export const repBadge = (s) => `<span class="badge ${{ filed: 'b-GREEN', scanned: 'b-blue', signed: 'b-blue', printed: 'b-AMBER', withdrawn: '', not_needed: '' }[s] || ''}">${esc(REP_STATE[s] || s)}</span>`;
export const DL_KIND = { ircc_letter: 'IRCC letter response', medical: 'Medical validity', biometrics: 'Biometrics validity', passport: 'Passport / ID', imm5744: 'IMM 5744 validity', status_check: 'Status check follow-up', court: 'Federal Court / appeal window', internal: 'Internal', agreement_end: 'Agreement end / closing letter', other: 'Other' };
export const DL_OWNER = { us: 'Us', client: 'Client', ircc: 'IRCC' };
export const PAYMENT_MODEL = { A: 'A — invoice after each stage, paid to operating', B: 'B — disbursements to client account, fees invoiced per stage', C: 'C — full deposit to client account, moved as earned' };
export const daysTo = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
export const dueText = (d) => { const n = daysTo(d); return n < 0 ? `Overdue ${-n}d` : n === 0 ? 'Due today' : `${n} day${n === 1 ? '' : 's'}`; };
export const duePill = (d, done) => done ? '<span class="badge b-GREEN">Done</span>' : `<span class="badge ${daysTo(d) <= 2 ? 'b-RED' : daysTo(d) <= 7 ? 'b-AMBER' : daysTo(d) <= 14 ? 'b-gold' : ''}">${dueText(d)}</span>`;

export async function orgRules() {
  const { data } = await db.from('org_settings').select('*').eq('id', 1).single();
  return data || {};
}

// ── The client file (one row per contact; created on first save) ──
export async function loadFile(contactId) {
  const { data } = await db.from('client_files').select('*').eq('contact_id', contactId).maybeSingle();
  return data || { contact_id: contactId, risk_flags: [], related: [], history: {}, _new: true };
}
export async function saveFile(contactId, patch) {
  const { data: exists } = await db.from('client_files').select('contact_id').eq('contact_id', contactId).maybeSingle();
  const body = { ...patch, updated_by: state.profile.id };
  const { error } = exists ? await db.from('client_files').update(body).eq('contact_id', contactId)
    : await db.from('client_files').insert({ contact_id: contactId, ...body });
  if (error) throw error;
}

// ── Form data: split a full name for IRCC forms ──
export function splitName(full = '') {
  const w = String(full).trim().split(/\s+/).filter(Boolean);
  return w.length < 2 ? { family: w[0] || '', given: '' } : { family: w[w.length - 1], given: w.slice(0, -1).join(' ') };
}
const ym = (s) => (/^\d{4}-\d{2}/.test(s || '') ? s.slice(0, 7) : null);
const ymNum = (s) => { const v = ym(s); return v ? Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7)) - 1 : null; };
const ymText = (n) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;

/** Gaps of more than one month in a list of {from, to} periods (YYYY-MM; empty "to" = present), over the last `years`. */
export function timelineGaps(rows, years = 10, dob = null) {
  const now = ymNum(today());
  let start = now - years * 12 + 1;
  if (dob) start = Math.max(start, ymNum(dob) + 18 * 12);
  const p = (rows || []).map((r) => [ymNum(r.from), r.to ? ymNum(r.to) : now]).filter(([a, b]) => a !== null && b !== null && b >= a).sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let cur = start - 1;
  for (const [a, b] of p) {
    if (b < start) continue;
    if (a > cur + 1) gaps.push([ymText(Math.max(cur + 1, start)), ymText(a - 1)]);
    cur = Math.max(cur, b);
  }
  if (cur < now) gaps.push([ymText(Math.max(cur + 1, start)), ymText(now)]);
  return gaps.filter(([a, b]) => ymNum(b) >= ymNum(a));
}

const UCI_RE = /^(\d{8}|\d{10}|\d{4}-\d{4}|\d{2}-\d{4}-\d{4})$/;
const APP_RE = /^[A-Z]{1,2}\d{9,10}$/;

/** Cross-form consistency checker. Returns [{level: 'err'|'warn'|'ok', area, msg}]. */
export function checkFile({ contact: c, file: f, cases = [], reps = [], agreements = [], keyDates = [], settings: s = {} }) {
  const out = [], add = (level, area, msg) => out.push({ level, area, msg });
  const h = f.history || {}, bg = h.background || {}, flags = f.risk_flags || [];
  if (!c.full_name || c.full_name.trim().split(/\s+/).length < 2) add('err', 'Identity', 'Full name as on the passport (family and given names) is needed for every form.');
  if (!c.date_of_birth) add('err', 'Identity', 'Date of birth is missing.');
  if (!c.citizenship) add('warn', 'Identity', 'Citizenship is missing.');
  for (const k of cases) {
    if (k.uci && !UCI_RE.test(String(k.uci).trim())) add('err', 'IRCC numbers', `UCI “${k.uci}” on ${k.case_number} is not in a UCI format (8 or 10 digits, e.g. 1124-5299 or 11-2452-9928).`);
    if (k.ircc_file_number && !APP_RE.test(String(k.ircc_file_number).trim())) add('warn', 'IRCC numbers', `Application number “${k.ircc_file_number}” on ${k.case_number} doesn't look like an IRCC number (a letter followed by 9 digits, e.g. G000288532).`);
  }
  const ucis = [...new Set(cases.map((k) => String(k.uci || '').replace(/\D/g, '')).filter(Boolean))];
  if (ucis.length > 1) add('err', 'IRCC numbers', `Different UCIs on this client's cases (${ucis.join(', ')}). A person has one UCI.`);
  // Timeline
  const acts = h.activities || [], addrs = h.addresses || [];
  if (acts.length) { const g = timelineGaps(acts, 10, c.date_of_birth); g.forEach(([a, b]) => add('err', 'Personal history', `Gap in personal history ${a} to ${b}. Schedule A / IMM 5669 needs every month accounted for (use “unemployed”, “at home”, etc.).`)); }
  else add('warn', 'Personal history', 'Personal history (last 10 years, or since age 18) is not entered yet.');
  if (addrs.length) timelineGaps(addrs, 10, c.date_of_birth).forEach(([a, b]) => add('err', 'Addresses', `Gap in address history ${a} to ${b}.`));
  else add('warn', 'Addresses', 'Address history is not entered yet.');
  for (const r of [...acts, ...addrs]) if (ym(r.from) && ym(r.to) && ym(r.to) < ym(r.from)) add('err', 'Dates', `A period ends (${r.to}) before it starts (${r.from}).`);
  // Background answers versus the narrative and the risk flags
  const secRows = acts.filter((r) => /military|army|navy|air force|police|security|militia|national service|conscript/i.test(`${r.activity} ${r.org || ''}`));
  if (secRows.length && bg.military !== 'yes') add('err', 'Background', `Personal history mentions military/police/security service (${secRows.map((r) => r.activity).join(', ')}) but the background answer is not “Yes”.`);
  if (bg.military === 'yes' && !flags.includes('security_history')) add('warn', 'Risk flags', 'Background says military/police/security service but the risk flag is not ticked.');
  if (flags.includes('security_history') && bg.military === 'no') add('err', 'Background', 'Risk flag says military/police/security service but the background answer is “No”.');
  if (bg.refused === 'yes' && !flags.includes('prior_refusal')) add('warn', 'Risk flags', 'Background says a previous refusal but the “Prior refusal” flag is not ticked.');
  if (flags.includes('prior_refusal') && bg.refused === 'no') add('err', 'Background', 'Risk flag says prior refusal but the background answer is “No”.');
  if (bg.detained === 'yes' && !flags.includes('detention')) add('warn', 'Risk flags', 'Background says detention but the “Detention” flag is not ticked.');
  const unanswered = BACKGROUND.filter(([k]) => !bg[k]).map(([, l]) => l);
  if (unanswered.length) add('warn', 'Background', `Background questions not answered: ${unanswered.length} of ${BACKGROUND.length}.`);
  // Representation
  const r5476 = reps.filter((r) => r.form === 'IMM5476' && r.state !== 'withdrawn' && r.state !== 'not_needed');
  const active = agreements.filter((a) => a.status !== 'void');
  const retained = active.some((a) => ['retainer', 'limited_scope', 'doc_review', 'monitoring'].includes(a.type) && a.status === 'signed');
  if (retained && !reps.some((r) => r.form === 'IMM5476')) add('warn', 'Representation', 'A retainer is signed but no IMM 5476 is tracked. Needed for any communication with IRCC on the client’s behalf (not for advice only).');
  const proBono = active.some((a) => a.data?.fee_basis === 'pro_bono' && ['retainer', 'limited_scope'].includes(a.type));
  const paidAgr = active.some((a) => a.data?.fee_basis !== 'pro_bono' && ['retainer', 'limited_scope', 'doc_review', 'monitoring'].includes(a.type));
  for (const r of r5476) {
    if (r.paid_box === 'paid' && proBono && !paidAgr) add('err', 'Representation', 'IMM 5476 has the PAID box, but the agreement is pro bono. The box must be true.');
    if (r.paid_box === 'unpaid' && paidAgr) add('err', 'Representation', 'IMM 5476 has the UNPAID box, but the client pays fees under the agreement.');
  }
  for (const r of reps.filter((x) => x.form === 'IMM5744' && x.state !== 'withdrawn' && x.expires_on)) {
    const n = daysTo(r.expires_on);
    if (n < 0) add('err', 'Representation', `IMM 5744 expired on ${r.expires_on}. Get a new original signature before any ATIP request.`);
    else if (n <= 30) add('warn', 'Representation', `IMM 5744 expires in ${n} days (${r.expires_on}).`);
  }
  if (!/^R\d{6,7}$/i.test(String(s.licence_number || ''))) add('warn', 'Representation', `Your CICC membership ID in Business Settings (“${s.licence_number || ''}”) doesn't look like R followed by 6 or 7 digits.`);
  // Payer and sharing
  const payer = (f.payer_contact_id && f.payer_contact_id !== c.id) || active.some((a) => a.data?.payer_other);
  if (payer && !active.some((a) => a.type === 'payer')) add('warn', 'Payer', 'Someone else pays: record a Third-party payer agreement (Agreements → Third-party payer).');
  if (payer && !active.some((a) => a.type === 'consent_share')) add('warn', 'Payer', 'No consent-to-share on file: the payer may receive only invoices, receipts and an “in progress” status.');
  if ((f.interpreter_needed || flags.includes('language_barrier')) && !h.interpreter_declaration) add('warn', 'Language', 'Interpreter needed: add the interpreter declaration to the forms and consents (tick it in Background when done).');
  // Documents
  for (const k of keyDates.filter((x) => /passport/i.test(x.doc_type))) {
    const n = daysTo(k.expires_on);
    if (n < 0) add('err', 'Documents', `Passport expired on ${k.expires_on}.`);
    else if (n < 183) add('warn', 'Documents', `Passport expires in ${n} days (${k.expires_on}); permits are not issued past passport validity.`);
  }
  if (!out.some((x) => x.level === 'err')) add('ok', 'Overall', 'No contradictions found in the information entered.');
  return out;
}

export const BACKGROUND = [
  ['refused', 'Ever refused a visa or permit, denied entry or ordered to leave any country (including Canada)?'],
  ['criminal', 'Ever committed, been arrested for, charged with or convicted of any criminal offence in any country?'],
  ['detained', 'Ever been detained, incarcerated or put in jail?'],
  ['military', 'Ever served in any military, militia, civil defence unit, police or security organization?'],
  ['govt', 'Ever held a government position (civil servant, judge, police, mayor, legislator…)?'],
  ['war', 'Ever witnessed or participated in ill-treatment of prisoners or civilians, looting or desecration?'],
  ['medical', 'Tuberculosis in the last two years, or a physical or mental disorder needing social or health services?'],
  ['overstay', 'Ever remained beyond authorized status, studied or worked without authorization in Canada?'],
];

/** The form data sheet: every answer for IMM 5476, IMM 5744, IMM 0008 and Schedule A, with copy buttons. */
export function dataSheet({ contact: c, file: f, cases = [], settings: s = {} }) {
  const n = splitName(c.full_name), k = cases[0] || {}, h = f.history || {}, bg = h.background || {};
  const addr = [c.address, c.city, c.province, c.postal_code, c.country].filter(Boolean).join(', ');
  const yn = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');
  return [
    { title: 'IMM 5476 — Use of a Representative', note: 'Download the current edition from IRCC Forms. Hand or e-signature as IRCC allows. Date as YYYY-MM-DD. Tick the representative box truthfully (paid or unpaid) — never “friend or family” for a client.', rows: [
      ['Applicant family name', n.family, 'Check against the passport'], ['Applicant given name(s)', n.given], ['Date of birth (YYYY-MM-DD)', c.date_of_birth || ''],
      ['UCI', k.uci || ''], ['Application type', k.application_type || k.title || ''], ['Application number', k.ircc_file_number || ''],
      ['Representative', `${s.rcic_name || ''}`], ['Representative type', 'Member of the College of Immigration and Citizenship Consultants (CICC)'],
      ['Membership ID number', s.licence_number || ''], ['Firm / organization', s.business_name || ''], ['Mailing address', s.address || '', 'Confirm the full street address'],
      ['Telephone', s.phone || ''], ['Email', s.email || ''], ['IRCC representative ID', s.ircc_rep_id || '', 'From your IRCC enrolment (if used)'] ] },
    { title: 'IMM 5744 — ATIP consent', note: 'Client’s original ink signature; valid for the period set in Settings → Pricing & rules (confirm with IRCC).', rows: [
      ['Client family name', n.family], ['Client given name(s)', n.given], ['Other names used', f.aliases || ''], ['Date of birth', c.date_of_birth || ''], ['UCI', k.uci || ''],
      ['Country of citizenship', c.citizenship || ''], ['Authorized person', `${s.rcic_name || ''}, ${s.business_name || ''}`], ['Address of authorized person', s.address || ''] ] },
    { title: 'IMM 0008 — Generic application (personal details)', note: 'Only what the Practice Hub holds. The rest comes from the client questionnaire.', rows: [
      ['Family name', n.family], ['Given name(s)', n.given], ['Other names (aliases)', f.aliases || ''], ['Date of birth', c.date_of_birth || ''],
      ['Country of citizenship', c.citizenship || ''], ['Current country of residence', c.country || (c.location === 'in' ? 'Canada' : '')], ['Status in Canada', c.status_in_canada || ''],
      ['Native language / preferred language', c.language || ''], ['Interpreter needed', f.interpreter_needed ? `Yes${f.interpreter_language ? ' — ' + f.interpreter_language : ''}` : 'No'],
      ['Mailing address', addr], ['Telephone', c.phone || ''], ['Email', c.email || ''], ['Visa office', k.visa_office || ''] ] },
    { title: 'Schedule A — Background / Declaration', note: 'Answers must match every other form and the personal history below.', rows: [
      ...BACKGROUND.map(([key, q]) => [q, yn(bg[key])]),
      ...(h.activities || []).map((r) => [`Personal history ${r.from || '?'} → ${r.to || 'present'}`, [r.activity, r.org, r.city, r.country, r.status].filter(Boolean).join(' · ')]),
      ...(h.addresses || []).map((r) => [`Address ${r.from || '?'} → ${r.to || 'present'}`, [r.address, r.city, r.country].filter(Boolean).join(', ')]) ] },
  ];
}

// ── Quotes ──
/** Same formula as the database (public._quote_totals) — for the live preview only; the server's numbers are saved. */
export function quoteTotals(lines, factor, gstRate, disc) {
  const r2 = (v) => Math.round(v * 100) / 100;
  let base = 0, elig = 0, add = 0, disb = 0;
  for (const l of lines) {
    const q = Number(l.qty || 1), amt = r2(q * Number(l.unit_price || 0));
    if ((l.kind || 'service') === 'service') { base += amt; if (!disc?.ids?.length || disc.ids.includes(l.item_id)) elig += amt; }
    else if (l.kind === 'disb') disb += amt;
  }
  for (const l of lines.filter((x) => x.kind === 'addon')) add += l.pct ? r2(base * Number(l.pct) / 100 * Number(l.qty || 1)) : r2(Number(l.qty || 1) * Number(l.unit_price || 0));
  const sub = r2((base + add) * factor); elig = disc?.ids?.length ? r2(elig * factor) : sub;
  const d = disc?.kind === 'percent' ? r2(elig * disc.value / 100) : disc?.kind === 'fixed' ? Math.min(disc.value, elig) : 0;
  const fee = r2(sub - d), gst = r2(fee * gstRate / 100);
  return { base_total: r2(base), addons_total: r2(add), fee_subtotal: sub, discount_amount: r2(d), fee_total: fee, gst, disbursements: r2(disb), amount_due: r2(fee + gst + disb) };
}
const QSTATUS = { draft: ['Draft', ''], sent: ['Sent', 'b-blue'], accepted: ['Accepted', 'b-gold'], invoiced: ['Invoiced', 'b-GREEN'], void: ['Void', ''] };
export const quoteBadge = (s) => `<span class="badge ${QSTATUS[s]?.[1] || ''}">${QSTATUS[s]?.[0] || s}</span>`;

export async function quotesPanel(box, contactId) {
  const { money } = await import('./fin.js');
  const { data } = await db.from('quotes').select('*').eq('contact_id', contactId).order('created_at', { ascending: false });
  box.innerHTML = `<div class="row" style="justify-content:space-between;margin:4px 0 8px"><h4 style="color:var(--navy);margin:0">Quotes</h4>
      ${can('finance.manage') ? `<button class="btn btn-sm btn-gold" id="nq">${icon('plus')} New quote</button>` : ''}</div>
    ${(data || []).length ? `<table class="t"><tbody>${data.map((q) => `<tr class="click" data-q="${q.id}"><td><b>${esc(q.number)}</b><br><small style="color:var(--muted)">${fmtDate(q.created_at)}${q.promo_code ? ' · promo ' + esc(q.promo_code) : q.discount_pct ? ` · ${q.discount_pct}% off` : ''}</small></td>
      <td>${quoteBadge(q.status)}</td><td style="text-align:right"><b>${money(q.amount_due)}</b></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty" style="padding:14px">No quotes yet. A quote calculates fees from your price list, add-ons, the file’s complexity, any promo code, GST and disbursements at cost.</div>'}`;
  box.querySelector('#nq')?.addEventListener('click', () => quoteEditor({ contactId }).then(() => quotesPanel(box, contactId)));
  box.querySelectorAll('[data-q]').forEach((tr) => (tr.onclick = () => quoteEditor({ contactId, quote: data.find((q) => q.id === tr.dataset.q) }).then(() => quotesPanel(box, contactId))));
}

export async function quoteEditor({ contactId, quote = null }) {
  const { money, payerFor } = await import('./fin.js');
  const [s, { data: items }, { data: pkgs }, file, { data: contact }, { data: cases }, payer] = await Promise.all([orgRules(),
    db.from('items').select('id, name, unit_price, taxable').eq('active', true).order('name'),
    db.from('service_packages').select('id, name, milestones').eq('active', true).order('name'), loadFile(contactId),
    db.from('contacts').select('id, full_name').eq('id', contactId).single(), db.from('cases').select('id, case_number, title').eq('contact_id', contactId), payerFor(contactId).catch(() => null)]);
  const pricing = s.pricing || {}, rate = s.gst_number ? Number(s.gst_rate || 5) : 0, pts = points(file.risk_flags || []);
  const editable = !quote || quote.status === 'draft';
  let lines = quote ? JSON.parse(JSON.stringify(quote.lines || [])) : [];
  const tierInit = quote ? (Number(quote.complexity_factor) === factorFor(pts, pricing) ? 'auto' : Object.entries(pricing.complexity || {}).find(([, v]) => Number(v) === Number(quote.complexity_factor))?.[0] || 'auto') : 'auto';
  return new Promise((resolve) => modal({
    title: quote ? `Quote ${quote.number}` : `New quote — ${contact.full_name}`, wide: true,
    body: `${pts >= 4 ? '<div class="alert warn">This file scores 4 or more complexity points: review it personally before quoting.</div>' : ''}
      <div class="row-2"><div class="field"><label>Case (optional)</label><select class="input" id="qc" ${editable ? '' : 'disabled'}><option value="">None</option>${(cases || []).map((k) => `<option value="${k.id}" ${quote?.case_id === k.id ? 'selected' : ''}>${esc(k.case_number)} · ${esc(k.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Bill to</label><input class="input" value="${esc(payer?.name ? `${payer.name} (fee payer) — client is ${contact.full_name}` : contact.full_name)}" disabled></div></div>
      <div class="field"><label>Lines</label><div id="ql"></div>
        ${editable ? `<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          <select class="input" id="addSvc" style="max-width:260px"><option value="">+ Service…</option>${(items || []).map((i) => `<option value="i:${i.id}">${esc(i.name)} — ${money(i.unit_price)}</option>`).join('')}
            ${(pkgs || []).length ? `<optgroup label="Program price list">${pkgs.map((p) => `<option value="p:${p.id}">${esc(p.name)} — ${money((p.milestones || []).reduce((a, m) => a + Number(m.fee || 0), 0))}</option>`).join('')}</optgroup>` : ''}</select>
          <select class="input" id="addOn" style="max-width:240px"><option value="">+ Add-on…</option>${(pricing.addons || []).map((a, i) => `<option value="${i}">${esc(a.name)} — ${a.kind === 'percent' ? a.value + '% of base' : money(a.value)}</option>`).join('')}</select>
          <button class="btn btn-sm" id="addDisb" type="button">+ Disbursement (at cost)</button></div>` : ''}</div>
      <div class="row-2"><div class="field"><label>Complexity (this file: ${pts} point${pts === 1 ? '' : 's'})</label><select class="input" id="qt" ${editable ? '' : 'disabled'}>
          <option value="auto">Automatic from risk flags — ×${factorFor(pts, pricing).toFixed(2)}</option>${['low', 'mid', 'high'].map((t) => `<option value="${t}" ${tierInit === t ? 'selected' : ''}>${{ low: 'Standard', mid: 'Prior refusal or gaps', high: 'Inadmissibility concern' }[t]} — ×${Number(pricing.complexity?.[t] ?? 1).toFixed(2)}</option>`).join('')}</select></div>
        <div class="field"><label>Promo code (one per quote)</label><input class="input" id="qp" value="${esc(quote?.promo_code || '')}" ${editable ? '' : 'disabled'} style="text-transform:uppercase" placeholder="e.g. WELCOME10"></div></div>
      <div class="row-2"><div class="field"><label>Or a manual discount % (max ${pricing.max_discount_pct ?? 20}% without RCIC approval)</label><input class="input" id="qd" type="number" step="0.5" min="0" max="100" value="${esc(quote?.discount_pct ?? '')}" ${editable ? '' : 'disabled'}></div>
        <div class="field"><label>Reason for the manual discount</label><select class="input" id="qr" ${editable ? '' : 'disabled'}><option value="">—</option>${['Returning client', 'Financial hardship', 'Community event', 'Bundle / family files', 'Other (see notes)'].map((r) => `<option ${quote?.discount_reason === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
      <div class="field"><label>Notes on the quote</label><textarea class="input" id="qn" rows="2" ${editable ? '' : 'disabled'}>${esc(quote?.notes || '')}</textarea></div>
      <div id="qtot" class="card" style="padding:12px 16px;background:var(--cream,#FFFBF2)"></div>
      <small class="dk-muted">Discounts apply to professional fees only. Government fees and disbursements are passed through at cost and never discounted. No outcome-based fees.</small>`,
    onOpen: (m) => {
      const draw = () => {
        m.querySelector('#ql').innerHTML = lines.length ? `<table class="t"><thead><tr><th>Type</th><th>Description</th><th style="width:84px">Qty</th><th style="width:120px">Price / %</th><th></th></tr></thead><tbody>${lines.map((l, i) => `<tr data-i="${i}">
            <td><small>${{ service: 'Service', addon: 'Add-on', disb: 'Disbursement' }[l.kind || 'service']}</small></td>
            <td><input class="input" data-f="name" value="${esc(l.name)}" ${editable ? '' : 'disabled'}></td>
            <td><input class="input" style="min-width:64px;padding:6px 8px" data-f="qty" type="number" min="1" step="1" value="${esc(l.qty ?? 1)}" ${editable ? '' : 'disabled'}></td>
            <td>${l.pct ? `<input class="input" data-f="pct" type="number" step="0.5" value="${esc(l.pct)}" ${editable ? '' : 'disabled'} title="% of the service base">` : `<input class="input" data-f="unit_price" type="number" step="0.01" value="${esc(l.unit_price)}" ${editable ? '' : 'disabled'}>`}</td>
            <td>${editable ? `<button class="btn btn-ghost btn-sm" data-del="${i}" type="button" aria-label="Remove">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="dk-muted" style="padding:6px 0">Add the services on this quote.</div>';
        m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { lines.splice(+b.dataset.del, 1); draw(); }));
        calc();
      };
      const read = () => m.querySelectorAll('#ql tr[data-i]').forEach((tr) => { const l = lines[+tr.dataset.i]; tr.querySelectorAll('[data-f]').forEach((i) => { l[i.dataset.f] = i.type === 'number' ? Number(i.value) : i.value; }); });
      const calc = () => {
        read();
        const t = m.querySelector('#qt').value, f = t === 'auto' ? factorFor(pts, pricing) : Number(pricing.complexity?.[t] ?? 1);
        const pct = Number(m.querySelector('#qd').value || 0), code = m.querySelector('#qp').value.trim();
        const r = quoteTotals(lines, f, rate, code ? null : pct ? { kind: 'percent', value: pct } : null);
        const row = (k, v, b) => `<div class="row" style="justify-content:space-between"><span>${k}</span>${b ? `<b>${v}</b>` : `<span>${v}</span>`}</div>`;
        m.querySelector('#qtot').innerHTML = row('Services', money(r.base_total)) + (r.addons_total ? row('Add-ons', money(r.addons_total)) : '') + (f !== 1 ? row(`Complexity ×${f.toFixed(2)}`, money(r.fee_subtotal - r.base_total - r.addons_total)) : '')
          + row('Subtotal', money(r.fee_subtotal)) + (code ? row(`Promo ${esc(code.toUpperCase())}`, 'checked when saved') : r.discount_amount ? row(`Discount ${pct}%`, '−' + money(r.discount_amount)) : '')
          + row('Fee total', money(r.fee_total)) + row(rate ? `GST ${rate}%` : 'GST (not registered)', money(r.gst)) + (r.disbursements ? row('Disbursements at cost', money(r.disbursements)) : '')
          + `<hr style="border:0;border-top:1px solid var(--line);margin:6px 0">${row('Amount due', money(quote && !editable ? quote.amount_due : r.amount_due), true)}`;
      };
      m.querySelector('#addSvc')?.addEventListener('change', (e) => {
        const [t, id] = e.target.value.split(':'); e.target.value = '';
        if (t === 'i') { const it = items.find((x) => x.id === id); lines.push({ kind: 'service', item_id: id, name: it.name, qty: 1, unit_price: Number(it.unit_price) }); }
        if (t === 'p') { const p = pkgs.find((x) => x.id === id); lines.push({ kind: 'service', name: p.name, qty: 1, unit_price: (p.milestones || []).reduce((a, x) => a + Number(x.fee || 0), 0) }); }
        read(); draw();
      });
      m.querySelector('#addOn')?.addEventListener('change', (e) => {
        const a = (pricing.addons || [])[+e.target.value]; e.target.value = ''; if (!a) return;
        read(); lines.push(a.kind === 'percent' ? { kind: 'addon', name: a.name, qty: 1, pct: Number(a.value) } : { kind: 'addon', name: a.name, qty: 1, unit_price: Number(a.value) }); draw();
      });
      m.querySelector('#addDisb')?.addEventListener('click', () => { read(); lines.push({ kind: 'disb', name: 'Courier', qty: 1, unit_price: 0 }); draw(); });
      m.addEventListener('input', calc); m.addEventListener('change', (e) => { if (!['addSvc', 'addOn'].includes(e.target.id)) calc(); });
      m.save = async () => {
        read();
        if (!lines.some((l) => (l.kind || 'service') === 'service')) throw new Error('Add at least one service.');
        const q = await rpc('save_quote', { p: { id: quote?.id || null, contact_id: contactId, case_id: m.querySelector('#qc').value || null, tier: m.querySelector('#qt').value,
          lines, promo_code: m.querySelector('#qp').value.trim() || null, discount_pct: m.querySelector('#qd').value || null, discount_reason: m.querySelector('#qr').value || null,
          notes: m.querySelector('#qn').value, bill_to: payer || null, payer_contact_id: file.payer_contact_id || null } });
        quote = q; return q;
      };
      draw();
    },
    actions: [
      { label: 'Close', onClick: () => resolve() },
      ...(quote && editable ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { const { error } = await db.from('quotes').delete().eq('id', quote.id); if (error) throw error; toast('Quote deleted'); resolve(); } }] : []),
      ...(quote ? [{ label: 'Print', onClick: async () => { await printQuote(quote, contact, payer, s); return false; } }] : []),
      ...(quote && ['draft', 'sent'].includes(quote.status) ? [{ label: quote.status === 'draft' ? 'Mark sent' : 'Mark accepted', onClick: async (m) => {
        if (quote.status === 'draft') await m.save();
        await rpc('quote_status', { p_id: quote.id, p_status: quote.status === 'draft' ? 'sent' : 'accepted' }); toast('Quote updated'); resolve(); } }] : []),
      ...(editable ? [{ label: 'Save quote', cls: 'btn-primary', onClick: async (m) => { const q = await m.save(); toast(`Quote ${q.number} saved — ${money(q.amount_due)}`); resolve(); } }] : []),
      ...(quote && quote.status !== 'invoiced' && quote.status !== 'void' && can('finance.manage') ? [{ label: 'Create invoice', cls: 'btn-gold', onClick: async (m) => {
        if (editable) await m.save();
        const inv = await rpc('quote_to_invoice', { p_id: quote.id }); toast('Draft invoice created from the quote'); resolve(); location.hash = `#/invoices/${inv}`; } }] : []),
    ],
  }));
}

async function printQuote(q, contact, payer, s) {
  const { money } = await import('./fin.js');
  const { printDoc } = await import('./views/agreement.js');
  const rows = (q.lines || []).map((l) => `<tr><td>${esc(l.name)}${l.kind === 'disb' ? ' <small>(disbursement at cost)</small>' : l.kind === 'addon' && l.pct ? ` <small>(${l.pct}% of services)</small>` : ''}</td><td style="text-align:right">${esc(l.qty ?? 1)}</td>
    <td style="text-align:right">${l.pct ? money(q.base_total * l.pct / 100) : money(l.unit_price)}</td></tr>`).join('');
  const r = (k, v, b) => `<tr><td colspan="2" style="text-align:right">${b ? `<b>${k}</b>` : k}</td><td style="text-align:right">${b ? `<b>${v}</b>` : v}</td></tr>`;
  printDoc(`<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#1C2333">
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px double #C9A24A;padding-bottom:12px"><img src="https://gracefulimmigration.ca/public/img/logo-emblem.png" style="width:64px">
      <div style="flex:1"><b style="font-family:Georgia,serif;font-size:21px;color:#0B2A5C">${esc(s.business_name)}</b><br><small>${esc(s.rcic_name)}, RCIC-IRB · College ID ${esc(s.licence_number)}</small></div>
      <div style="text-align:right;font-size:12px">${esc(s.address)}<br>${esc(s.phone)}<br>${esc(s.email)}</div></div>
    <h1 style="font-family:Georgia,serif;color:#0B2A5C;letter-spacing:.1em;font-size:22px;margin:20px 0 4px">QUOTE ${esc(q.number)}</h1>
    <p style="margin:0 0 14px">Date ${esc(String(q.created_at).slice(0, 10))} · Valid 30 days</p>
    <p><b>Client:</b> ${esc(contact.full_name)}${payer?.name ? `<br><b>Fees paid by:</b> ${esc(payer.name)} (not a client)` : ''}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px" border="1" cellpadding="7"><thead style="background:#0B2A5C;color:#fff"><tr><th style="text-align:left">Service</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>${rows}${Number(q.complexity_factor) !== 1 ? r(`Complexity adjustment ×${Number(q.complexity_factor).toFixed(2)}`, money(q.fee_subtotal - q.base_total - q.addons_total)) : ''}
      ${r('Subtotal (professional fees)', money(q.fee_subtotal))}${q.discount_amount > 0 ? r(q.promo_code ? `Promo code ${esc(q.promo_code)}` : `Discount ${q.discount_pct}% (${esc(q.discount_reason || '')})`, '−' + money(q.discount_amount)) : ''}
      ${r('Fee total', money(q.fee_total))}${r(q.gst_rate > 0 ? `GST ${q.gst_rate}%` : 'GST (not applicable)', money(q.gst))}${q.disbursements > 0 ? r('Disbursements at cost', money(q.disbursements)) : ''}${r('Amount due (CAD)', money(q.amount_due), true)}</tbody></table>
    <p style="font-size:12px;color:#5B6476;margin-top:14px">Government fees are paid directly to the government and are not included unless listed as a disbursement. Disbursements are charged at cost with receipts. Fees are not contingent on the outcome of any application. This quote is not a retainer agreement; work begins only under a signed agreement.</p>
    ${q.notes ? `<p style="font-size:13px"><b>Notes:</b> ${esc(q.notes)}</p>` : ''}</div>`, `Quote ${q.number}`);
}

// ── Printable signing packet: in signing order, with a checklist ──
export async function signingPacket(contactId) {
  const { printDoc } = await import('./views/agreement.js');
  const [{ data: c }, file, { data: reps }, { data: agrs }, { data: cases }, s] = await Promise.all([db.from('contacts').select('*').eq('id', contactId).single(), loadFile(contactId),
    db.from('rep_forms').select('*').eq('contact_id', contactId), db.from('agreements').select('number, type, status, title, sign_method').eq('contact_id', contactId).neq('status', 'void').order('created_at'),
    db.from('cases').select('*').eq('contact_id', contactId), orgRules()]);
  const { AGR_TYPE } = await import('./views/agreements.js');
  const rep = (f) => (reps || []).filter((r) => r.form === f).sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
  const box = (done) => `<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #0B2A5C;border-radius:3px;text-align:center;line-height:13px;font-size:12px;margin-right:8px">${done ? '✓' : ''}</span>`;
  const r5476 = rep('IMM5476'), r5744 = rep('IMM5744');
  const items = [
    ['IMM 5476 — Use of a Representative', 'Use the current edition from IRCC Forms. Hand signature or e-signature (IRCC accepts both on the current edition). Date YYYY-MM-DD. Representative box: ' + (r5476?.paid_box ? r5476.paid_box.toUpperCase() : 'paid / unpaid — tick truthfully'), r5476 && ['signed', 'scanned', 'filed'].includes(r5476.state)],
    ['IMM 5744 — ATIP consent', 'Client’s signature as the form instructs. Valid for the period set in Settings.', r5744 && ['signed', 'scanned', 'filed'].includes(r5744.state)],
    ...(agrs || []).filter((a) => a.type === 'consent_share').map((a) => [`${AGR_TYPE[a.type]} ${a.number}`, 'Client signs (e-sign or paper).', a.status === 'signed']),
    ...(agrs || []).filter((a) => !['consent_share', 'termination', 'non_engagement'].includes(a.type)).map((a) => [`${AGR_TYPE[a.type]} ${a.number}`, a.sign_method === 'paper' ? 'Signed on paper — scan and upload.' : 'E-sign link or paper.', a.status === 'signed']),
  ];
  const sheet = dataSheet({ contact: c, file, cases: cases || [], settings: s });
  printDoc(`<div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;color:#1C2333">
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px double #C9A24A;padding-bottom:12px"><img src="https://gracefulimmigration.ca/public/img/logo-emblem.png" style="width:64px">
      <div><b style="font-family:Georgia,serif;font-size:21px;color:#0B2A5C">${esc(s.business_name)}</b><br><small>Signing packet — in signing order</small></div></div>
    <h2 style="font-family:Georgia,serif;color:#0B2A5C">${esc(c.full_name)}</h2>
    <p style="margin:0 0 12px">Prepared ${today()} · ${esc(s.rcic_name)}, College ID ${esc(s.licence_number)}</p>
    ${items.map(([t, how, done], i) => `<div style="border:1px solid #E3DCCD;border-radius:8px;padding:10px 14px;margin-bottom:8px">${box(done)}<b>${i + 1}. ${esc(t)}</b><br><small style="color:#5B6476;margin-left:24px;display:block">${esc(how)}</small></div>`).join('')}
    <p style="font-size:12px;color:#5B6476">Before printing: check the phone, address and firm name on every form against your current details, and download each IRCC form fresh from IRCC Forms (barcoded forms expire).</p>
    ${sheet.slice(0, 2).map((sec) => `<div style="page-break-before:always"><h3 style="font-family:Georgia,serif;color:#0B2A5C;border-bottom:1px solid #EFE6D2;padding-bottom:6px">${esc(sec.title)} — data sheet</h3><p style="font-size:12px;color:#5B6476">${esc(sec.note)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px" border="1" cellpadding="6">${sec.rows.map(([k, v, n]) => `<tr><th style="text-align:left;width:40%;background:#FBF7EE">${esc(k)}</th><td>${esc(v) || '<span style="color:#B42318">—</span>'}${n ? `<br><small style="color:#8A90A0">${esc(n)}</small>` : ''}</td></tr>`).join('')}</table></div>`).join('')}</div>`, `Signing packet — ${c.full_name}`);
}
