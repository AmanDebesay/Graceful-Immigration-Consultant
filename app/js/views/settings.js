import { db, esc, toast, fail, icon, modal, callFn } from '../core.js';

const FIELDS = [
  ['business_name', 'Business legal name'], ['rcic_name', 'RCIC name'], ['licence_number', 'CICC licence number'],
  ['phone', 'Business phone'], ['email', 'Public email'], ['address', 'Business address (printed on agreements, as CICC requires)'],
  ['gst_number', 'GST/HST registration number'], ['gst_rate', 'GST rate (%)'], ['notify_email', 'Send new-assessment alerts to'],
];
const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const total = (p) => (p.milestones || []).reduce((s, m) => s + Number(m.fee || 0), 0);

export async function render(el) {
  const tab = (location.hash.match(/tab=(fees|ai|integrations)/) || [])[1] || 'business';
  el.innerHTML = `<div class="toolbar"><div class="seg" id="tabs"><button data-t="business">Business details</button><button data-t="fees">Fee schedule</button><button data-t="ai">AI assistant</button><button data-t="integrations">Integrations</button></div></div><div id="pane"></div>`;
  el.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === tab);
    b.onclick = () => { location.hash = b.dataset.t === 'business' ? '#/settings' : `#/settings?tab=${b.dataset.t}`; };
  });
  const pane = el.querySelector('#pane');
  ({ fees, ai, business, integrations }[tab])(pane);
}

async function integrations(el) {
  const [{ data: integ, error }, { data: org }, status] = await Promise.all([
    db.from('integration_settings').select('teams_webhook_url, shared_mailbox').eq('id', 1).single(),
    db.from('org_settings').select('ircc_rep_id').eq('id', 1).single(),
    callFn('comms', { action: 'status' }).catch(() => ({})),
  ]);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const badge = (on) => `<span class="badge ${on ? 'b-GREEN' : 'b-AMBER'}">${on ? 'Connected' : 'Not connected'}</span>`;
  el.innerHTML = `<div class="grid g-2" style="align-items:start">
    <div class="card"><div class="card-h"><h3>${icon('mail')} Microsoft 365 email</h3>${badge(status.email)}</div><div class="card-b">
      <p class="dk-muted" style="margin-bottom:12px">Staff send client emails from their own company mailbox or the shared mailbox. Emails are saved in Outlook Sent Items and on the client's file, and a client's Outlook emails show on their <b>Emails</b> tab. System emails (new-assessment alerts, agreement notices) are sent from the shared mailbox.</p>
      <div class="field"><label for="sm">Shared mailbox</label><input class="input" id="sm" value="${esc(integ.shared_mailbox)}"></div>
      ${status.email ? '' : '<div class="alert info">To connect, register an app in Microsoft Entra and add its three values as Supabase secrets (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET). Your developer has the step-by-step guide.</div>'}</div></div>
    <div class="card"><div class="card-h"><h3>${icon('chat')} Microsoft Teams alerts</h3>${badge(!!integ.teams_webhook_url)}</div><div class="card-b">
      <p class="dk-muted" style="margin-bottom:12px">Posts new assessments (urgent ones highlighted) and signed agreements to a Teams channel. No client names are posted; each alert links to the file in the dashboard.</p>
      <div class="field"><label for="tw">Teams workflow link</label><input class="input" id="tw" value="${esc(integ.teams_webhook_url || '')}" placeholder="https://…logic.azure.com/… or https://…powerplatform.com/…">
        <small class="dk-muted">In Teams: open the channel → ⋯ → <b>Workflows</b> → <b>Post to a channel when a webhook request is received</b> → copy the link it gives you.</small></div>
      <button class="btn btn-sm" id="testTeams" ${integ.teams_webhook_url ? '' : 'disabled'}>Send test message</button></div></div>
    <div class="card"><div class="card-h"><h3>${icon('globe')} IRCC</h3></div><div class="card-b">
      <div class="field"><label for="rid">Representative IRCC ID (shown on the IRCC Portal tab; not a password)</label><input class="input" id="rid" value="${esc(org?.ircc_rep_id || '')}" placeholder="From your IRCC enrolment email"></div>
      <small class="dk-muted">Never store your IRCC password here. You sign in to the IRCC Portal yourself.</small></div></div>
  </div>
  <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-primary" id="saveInt">Save integrations</button></div>`;
  el.querySelector('#saveInt').onclick = async () => {
    const tw = el.querySelector('#tw').value.trim() || null, sm = el.querySelector('#sm').value.trim().toLowerCase(), rid = el.querySelector('#rid').value.trim() || null;
    if (tw && !/^https:\/\//.test(tw)) return fail(new Error('The Teams link must start with https://'));
    if (!/@gracefulimmigration\.ca$/.test(sm)) return fail(new Error('The shared mailbox must be a company address.'));
    const [a, b] = await Promise.all([
      db.from('integration_settings').update({ teams_webhook_url: tw, shared_mailbox: sm }).eq('id', 1),
      db.from('org_settings').update({ ircc_rep_id: rid }).eq('id', 1)]);
    if (a.error || b.error) return fail(a.error || b.error);
    toast('Integrations saved'); integrations(el);
  };
  el.querySelector('#testTeams').onclick = async (e) => {
    e.target.disabled = true;
    try { await callFn('comms', { action: 'teams_test' }); toast('Test message sent to Teams'); } catch (err) { fail(err); }
    e.target.disabled = false;
  };
}

async function business(el) {
  const { data: s, error } = await db.from('org_settings').select('*').eq('id', 1).single();
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  el.innerHTML = `<div class="card" style="max-width:760px"><div class="card-h"><h3>Business details</h3>
      <small style="color:var(--muted)">Used on agreements, invoices and emails</small></div>
    <form class="card-b" id="f">${FIELDS.map(([k, l]) => `<div class="field"><label for="${k}">${l}</label>
      <input class="input" id="${k}" value="${esc(s[k] ?? '')}" ${k === 'gst_rate' ? 'type="number" step="0.01" min="0" max="20"' : ''}></div>`).join('')}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Save changes</button></div></form></div>`;
  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const patch = Object.fromEntries(FIELDS.map(([k]) => [k, el.querySelector('#' + k).value.trim() || null]));
    patch.gst_rate = Number(patch.gst_rate || 0);
    for (const k of ['business_name', 'rcic_name', 'licence_number', 'phone', 'email', 'address', 'notify_email']) if (!patch[k]) return fail(new Error('Fill in every field except GST number.'));
    const { error: er } = await db.from('org_settings').update(patch).eq('id', 1);
    er ? fail(er) : toast('Settings saved');
  };
}

async function fees(el) {
  const [{ data: s }, { data: pk, error }] = await Promise.all([
    db.from('org_settings').select('consult_fee_30, consult_fee_60, gst_number, gst_rate').eq('id', 1).single(),
    db.from('service_packages').select('*').order('sort').order('name')]);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const unpriced = pk.filter((p) => p.active && total(p) === 0).length;
  el.innerHTML = `<div class="alert info">Set your prices once here. When you click <b>Generate agreement</b> for a client, the service you pick fills in the program, the services and the milestone fees automatically. You can still adjust them for that client before you sign and send.
      ${s.gst_number ? `GST (${s.gst_rate}%) is added on top of these fees.` : 'Fees are shown without GST (no GST number in Business details).'}</div>
    <div class="card" style="max-width:760px;margin-bottom:16px"><div class="card-h"><h3>Consultation fees</h3><small style="color:var(--muted)">Initial Consultation Agreement</small></div>
      <form class="card-b" id="cf"><div class="row-2">
        <div class="field"><label for="c30">30-minute consultation (CAD)</label><input class="input" id="c30" type="number" step="0.01" min="0" value="${esc(s.consult_fee_30)}"></div>
        <div class="field"><label for="c60">60-minute consultation (CAD)</label><input class="input" id="c60" type="number" step="0.01" min="0" value="${esc(s.consult_fee_60)}"></div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Save consultation fees</button></div></form></div>
    <div class="card"><div class="card-h"><h3>Services & prices</h3><div class="grow"></div><button class="btn btn-gold btn-sm" id="add">${icon('plus')} Add service</button></div>
      ${unpriced ? `<div class="alert err" style="margin:12px 16px 0">${unpriced} active service${unpriced > 1 ? 's have' : ' has'} no price yet. Click a row to set its milestone fees.</div>` : ''}
      <div class="table-wrap"><table class="t"><thead><tr><th>Service</th><th>Milestones</th><th class="r">Total fee</th><th>Status</th></tr></thead><tbody>
      ${pk.map((p) => `<tr class="click" data-id="${p.id}"><td><b>${esc(p.name)}</b><br><small style="color:var(--muted)">${esc(p.program)}</small></td>
        <td>${(p.milestones || []).length}</td><td class="r">${total(p) ? money(total(p)) : '<span class="badge b-gold">Set price</span>'}</td>
        <td>${p.active ? '<span class="badge b-GREEN">Active</span>' : '<span class="badge">Hidden</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  el.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const { error: er } = await db.from('org_settings').update({ consult_fee_30: Number(el.querySelector('#c30').value || 0), consult_fee_60: Number(el.querySelector('#c60').value || 0) }).eq('id', 1);
    er ? fail(er) : toast('Consultation fees saved');
  };
  el.querySelector('#add').onclick = () => editPackage(null, () => fees(el));
  el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => editPackage(pk.find((p) => p.id === tr.dataset.id), () => fees(el))));
}

function editPackage(p, done) {
  const pkg = p ? structuredClone(p) : { name: '', program: '', scope: null, active: true, sort: 200,
    milestones: [{ name: 'Signing of this agreement', included: 'Eligibility assessment, document checklist and file opening', fee: 0 },
      { name: 'Application ready for submission', included: 'Forms completed, documents reviewed, submission letter prepared', fee: 0 },
      { name: 'Application submitted to IRCC', included: 'Submission and acknowledgement of receipt; follow-up until decision', fee: 0 }] };
  const row = (m, i) => `<div class="ms-row" data-i="${i}" style="display:grid;grid-template-columns:1.1fr 1.6fr 110px 34px;gap:8px;margin-bottom:8px">
      <input class="input" data-m="name" placeholder="Milestone" value="${esc(m.name)}">
      <input class="input" data-m="included" placeholder="What is included" value="${esc(m.included)}">
      <input class="input" data-m="fee" type="number" step="0.01" min="0" placeholder="Fee" value="${esc(m.fee || '')}">
      <button class="btn btn-sm" type="button" data-del title="Remove">✕</button></div>`;
  modal({
    title: p ? 'Edit service' : 'Add service', wide: true,
    body: `<div class="field"><label>Service name (shown when generating)</label><input class="input" id="pn" value="${esc(pkg.name)}"></div>
      <div class="field"><label>Program wording in the agreement (be specific — CICC requires the exact category and program)</label><input class="input" id="pp" value="${esc(pkg.program)}"></div>
      <label style="font-size:12.5px;font-weight:600">Fees by milestone (CAD, before GST) — the fee is earned when each milestone is completed</label>
      <div id="ms" style="margin-top:6px">${pkg.milestones.map(row).join('')}</div>
      <div class="row" style="justify-content:space-between;margin:4px 0 14px"><button class="btn btn-sm" type="button" id="am">${icon('plus')} Add milestone</button><b id="tot"></b></div>
      <div class="field"><label>Services to be provided (one per line). Leave blank to use the standard list.</label><textarea class="input" id="ps" rows="4">${esc(pkg.scope || '')}</textarea></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="pa" ${pkg.active ? 'checked' : ''}> Active (offered when generating agreements)</label>`,
    onOpen: (m) => {
      const read = () => [...m.querySelectorAll('.ms-row')].map((r) => ({ name: r.querySelector('[data-m="name"]').value.trim(), included: r.querySelector('[data-m="included"]').value.trim(), fee: Number(r.querySelector('[data-m="fee"]').value || 0) }));
      const sum = () => { m.querySelector('#tot').textContent = 'Total: ' + money(read().reduce((s, x) => s + x.fee, 0)); };
      const wire = () => { m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { b.closest('.ms-row').remove(); sum(); })); m.querySelectorAll('[data-m="fee"]').forEach((i) => (i.oninput = sum)); sum(); };
      m.querySelector('#am').onclick = () => { const list = read(); list.push({ name: '', included: '', fee: 0 }); m.querySelector('#ms').innerHTML = list.map(row).join(''); wire(); };
      m._read = read; wire();
    },
    actions: [
      ...(p ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => {
        if (!confirm(`Delete "${p.name}"? Agreements already generated keep their fees.`)) return false;
        const { error } = await db.from('service_packages').delete().eq('id', p.id); if (error) throw error; toast('Service deleted'); done();
      } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const milestones = m._read().filter((x) => x.name || x.fee);
        const rec = { name: m.querySelector('#pn').value.trim(), program: m.querySelector('#pp').value.trim(), scope: m.querySelector('#ps').value.trim() || null,
          active: m.querySelector('#pa').checked, milestones };
        if (!rec.name || !rec.program) throw new Error('Enter the service name and the program wording.');
        if (!milestones.length) throw new Error('Add at least one milestone.');
        if (milestones.some((x) => !x.name)) throw new Error('Every milestone needs a name.');
        const { error } = p ? await db.from('service_packages').update(rec).eq('id', p.id) : await db.from('service_packages').insert(rec);
        if (error) throw error; toast('Service saved'); done();
      } }],
  });
}

async function ai(el) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: s, error }, { data: use }] = await Promise.all([
    db.from('org_settings').select('ai_staff_instructions, ai_public_instructions, ai_public_enabled').eq('id', 1).single(),
    db.from('ai_usage').select('kind, input_tokens, output_tokens').gte('created_at', since).limit(10000)]);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const sum = (k) => (use || []).filter((u) => u.kind === k).reduce((a, u) => ({ n: a.n + 1, tok: a.tok + u.input_tokens + u.output_tokens }), { n: 0, tok: 0 });
  const st = sum('staff'), pu = sum('public');
  el.innerHTML = `<div class="alert info">Both assistants run on Claude by Anthropic. To make the dashboard assistant work like the Claude you've trained, copy the <b>custom instructions</b> (and any key knowledge) from your Claude Project and paste them below. Messages are sent to Anthropic for processing and are not used to train AI models; conversations are not stored here, only usage counts.</div>
    <div class="grid g-2" style="align-items:start">
      <form class="card" id="af"><div class="card-h"><h3>Dashboard assistant (staff)</h3></div><div class="card-b">
        <div class="field"><label for="si">Your instructions and knowledge</label><textarea class="input" id="si" rows="14" placeholder="e.g. How I like assessments structured, my preferred programs, office procedures, fee policies, templates, tone…">${esc(s.ai_staff_instructions)}</textarea>
        <small class="dk-muted">Used for every staff conversation, together with built-in rules (cite IRPA/IRPR, verify current rules, flag deadlines first).</small></div></div></form>
      <div class="card"><div class="card-h"><h3>Website assistant (public)</h3><label class="row" style="gap:8px;font-weight:600"><input type="checkbox" id="pe" ${s.ai_public_enabled ? 'checked' : ''}> Show on website</label></div><div class="card-b">
        <div class="field"><label for="pi">Extra instructions for the public assistant</label><textarea class="input" id="pi" rows="8" placeholder="e.g. Office hours, holiday closures, a current promotion, how to send documents…">${esc(s.ai_public_instructions)}</textarea>
        <small class="dk-muted">It already knows your services, consultation fees, languages, phone, email and booking page, and it never gives immigration advice.</small></div></div></div>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:16px"><span class="dk-muted">Last 30 days: staff ${st.n} answers (${st.tok.toLocaleString()} tokens) · website ${pu.n} answers (${pu.tok.toLocaleString()} tokens)</span>
      <button class="btn btn-primary" id="saveAi">Save AI settings</button></div>`;
  el.querySelector('#saveAi').onclick = async () => {
    const { error: er } = await db.from('org_settings').update({ ai_staff_instructions: el.querySelector('#si').value.trim(), ai_public_instructions: el.querySelector('#pi').value.trim(), ai_public_enabled: el.querySelector('#pe').checked }).eq('id', 1);
    er ? fail(er) : toast('AI settings saved');
  };
}
