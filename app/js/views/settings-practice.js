// Business Settings → Pricing & rules (one editable place for prices, add-ons, complexity, promo codes and College/IRCC rules)
// and Backup & export (download all data to a file).
import { db, state, can, esc, icon, modal, confirmBox, toast, fail, today } from '../core.js';

const RULES = [
  ['imm5744_valid_months', 'IMM 5744 (ATIP consent) valid for (months)', 'number', 'Sets the expiry date automatically when the signature date is entered. Confirm with IRCC.'],
  ['portal_mb', 'Online application portal file limit (MB)', 'number', 'Used by File Prep. Check the current IRCC limit.'],
  ['atip_mb', 'ATIP online request file limit (MB)', 'number', 'Used by File Prep.'],
  ['retention_years', 'Keep closed files for (years)', 'number', 'Default retention-until date when closing a file. Confirm the College’s period.'],
  ['reconciliation_day', 'Monthly reconciliation reminder on day', 'number', 'Day of the month the reminder email starts.'],
  ['status_check_days', 'Status check follow-up every (days)', 'number', '30 or 60 by program.'],
  ['client_account_opened_on', 'Client (trust) account opened on', 'date', 'Record of the client account opening.'],
  ['college_notified_on', 'College notified of the client account on', 'date', 'The College must be told within the notice period below of opening a client account.'],
  ['client_account_notice_days', 'College notice period (days)', 'number', ''],
];

export async function pricing(el) {
  const [{ data: s, error }, { data: promos }, { data: items }] = await Promise.all([db.from('org_settings').select('pricing, rules, gst_number, gst_rate').eq('id', 1).single(),
    db.from('promo_codes').select('*').order('created_at', { ascending: false }), db.from('items').select('id, name').eq('active', true).order('name')]);
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const p = s.pricing || {}, r = s.rules || {};
  const addons = [...(p.addons || [])];
  const noticeLate = r.client_account_opened_on && !r.college_notified_on;
  el.innerHTML = `
    ${noticeLate ? '<div class="alert warn">Client account opened but the College notice date is not recorded.</div>' : ''}
    <div class="grid g-2" style="align-items:start;gap:16px">
      <div class="card"><div class="card-h"><h3>${icon('dollar')} Quote formula</h3></div><div class="card-b">
        <pre style="background:#14284B;color:#F2E6C9;border-radius:10px;padding:12px 14px;font-size:12px;white-space:pre-wrap;margin:0 0 12px">Subtotal  = (Σ services + Σ add-ons) × complexity factor
Discount  = promo OR manual %, professional fees only
Fee total = Subtotal − Discount
GST       = ${s.gst_number ? `${s.gst_rate}%` : '0% (no GST number in Business details)'} × Fee total
Amount due = Fee total + GST + disbursements at cost</pre>
        <p class="dk-muted" style="font-size:12.5px">Service prices come from <a href="#/items">Products &amp; Services</a> and the program price list in <a href="#/settings?tab=fees">Fee schedule</a>.</p>
        <h4 style="color:var(--navy);margin:12px 0 6px">Complexity factor (auto-picked from the file’s risk flags)</h4>
        <div class="row-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          <div class="field"><label>0–1 points</label><input class="input" type="number" step="0.01" id="cx_low" value="${p.complexity?.low ?? 1}"></div>
          <div class="field"><label>2–3 points</label><input class="input" type="number" step="0.01" id="cx_mid" value="${p.complexity?.mid ?? 1.15}"></div>
          <div class="field"><label>4+ points (manual review)</label><input class="input" type="number" step="0.01" id="cx_high" value="${p.complexity?.high ?? 1.3}"></div></div>
        <div class="field"><label>Maximum manual discount without RCIC approval (%)</label><input class="input" type="number" step="0.5" id="maxd" value="${p.max_discount_pct ?? 20}"></div>
        <h4 style="color:var(--navy);margin:12px 0 6px">Add-ons</h4><div id="ad"></div>
        <button class="btn btn-sm" id="addAd" type="button">${icon('plus')} Add-on</button>
        <div style="margin-top:14px"><button class="btn btn-primary" id="saveP">Save pricing</button></div>
        <div class="alert info" style="font-size:12.5px;margin-top:12px">No outcome-based fees anywhere. Government fees and disbursements are never discounted. Confirm referral incentives with the College before offering any.</div>
      </div></div>
      <div class="card"><div class="card-h"><h3>${icon('scale')} College and IRCC rules</h3></div><div class="card-b">
        <p class="dk-muted" style="font-size:12.5px;margin-bottom:10px">One place for rules the system applies. Update them as the College or IRCC answers your questions.</p>
        ${RULES.map(([k, l, t, help]) => `<div class="field"><label>${esc(l)}</label><input class="input" type="${t}" data-rule="${k}" value="${esc(r[k] ?? '')}">${help ? `<small class="dk-muted">${esc(help)}</small>` : ''}</div>`).join('')}
        <button class="btn btn-primary" id="saveR">Save rules</button></div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-h"><h3>${icon('award')} Promo codes</h3><button class="btn btn-sm btn-gold" id="newPromo">${icon('plus')} New code</button></div><div class="card-b">
      <p class="dk-muted" style="font-size:12.5px;margin-bottom:8px">One code per quote, valid only between its dates, for its services and up to its use limit. Applies to professional fees only and shows on the invoice as a line. Keep the written terms of every promotion.</p>
      ${(promos || []).length ? `<table class="t"><thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Services</th><th>Used</th><th></th></tr></thead><tbody>${promos.map((x) => `<tr>
        <td><b>${esc(x.code)}</b>${x.active ? '' : ' <span class="badge">Inactive</span>'}${x.ends_on && x.ends_on < today() ? ' <span class="badge b-RED">Expired</span>' : ''}</td><td>${x.kind === 'percent' ? `${x.value}%` : `$${x.value}`}</td>
        <td>${x.starts_on || 'any'} → ${x.ends_on || 'no end'}</td><td>${x.item_ids?.length ? x.item_ids.map((id) => esc(items.find((i) => i.id === id)?.name || '?')).join(', ') : 'All services'}</td>
        <td>${x.uses}${x.use_limit ? ' / ' + x.use_limit : ''}</td><td><button class="btn btn-sm" data-promo="${x.id}">Edit</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:14px">No promo codes yet.</div>'}
    </div></div>`;

  const drawAd = () => {
    el.querySelector('#ad').innerHTML = addons.map((a, i) => `<div class="row" style="gap:6px;margin-bottom:6px" data-ai="${i}"><input class="input" data-a="name" value="${esc(a.name)}" placeholder="Name">
      <select class="input" data-a="kind" style="max-width:130px"><option value="percent" ${a.kind === 'percent' ? 'selected' : ''}>% of services</option><option value="fixed" ${a.kind === 'fixed' ? 'selected' : ''}>Fixed $</option></select>
      <input class="input" data-a="value" type="number" step="0.01" value="${esc(a.value)}" style="max-width:100px"><button class="btn btn-ghost btn-sm" data-adel="${i}" type="button" aria-label="Remove">${icon('trash')}</button></div>`).join('');
    el.querySelectorAll('[data-adel]').forEach((b) => (b.onclick = () => { readAd(); addons.splice(+b.dataset.adel, 1); drawAd(); }));
  };
  const readAd = () => el.querySelectorAll('[data-ai]').forEach((row) => { const a = addons[+row.dataset.ai]; row.querySelectorAll('[data-a]').forEach((i) => (a[i.dataset.a] = i.dataset.a === 'value' ? Number(i.value) : i.value)); });
  drawAd();
  el.querySelector('#addAd').onclick = () => { readAd(); addons.push({ key: 'a' + Date.now(), name: '', kind: 'fixed', value: 0 }); drawAd(); };
  el.querySelector('#saveP').onclick = async () => {
    readAd();
    const n = (id) => Number(el.querySelector(id).value);
    const cx = { low: n('#cx_low'), mid: n('#cx_mid'), high: n('#cx_high') };
    if (Object.values(cx).some((v) => !(v >= 0.5 && v <= 3))) return fail(new Error('Complexity factors must be between 0.5 and 3.'));
    if (!(n('#maxd') >= 0 && n('#maxd') <= 100)) return fail(new Error('Maximum discount must be 0–100%.'));
    if (addons.some((a) => !a.name.trim() || !(a.value > 0))) return fail(new Error('Every add-on needs a name and a value above zero.'));
    const { error: er } = await db.from('org_settings').update({ pricing: { ...p, complexity: cx, max_discount_pct: n('#maxd'), addons } }).eq('id', 1);
    if (er) return fail(er); toast('Pricing saved'); pricing(el);
  };
  el.querySelector('#saveR').onclick = async () => {
    const nr = { ...r };
    el.querySelectorAll('[data-rule]').forEach((i) => { nr[i.dataset.rule] = i.value === '' ? null : i.type === 'number' ? Number(i.value) : i.value; });
    const { error: er } = await db.from('org_settings').update({ rules: nr }).eq('id', 1);
    if (er) return fail(er); toast('Rules saved'); pricing(el);
  };
  const promoModal = (x) => modal({
    title: x ? `Promo code ${x.code}` : 'New promo code',
    body: `<div class="row-2"><div class="field"><label>Code</label><input class="input" id="pc" value="${esc(x?.code || '')}" style="text-transform:uppercase" ${x ? 'disabled' : ''} placeholder="WELCOME10"></div>
        <div class="field"><label>Discount</label><div class="row" style="gap:6px"><select class="input" id="pk" style="max-width:110px"><option value="percent" ${x?.kind !== 'fixed' ? 'selected' : ''}>%</option><option value="fixed" ${x?.kind === 'fixed' ? 'selected' : ''}>$ off</option></select><input class="input" type="number" step="0.01" id="pv" value="${esc(x?.value ?? '')}"></div></div></div>
      <div class="row-2"><div class="field"><label>Starts</label><input class="input" type="date" id="ps" value="${x?.starts_on || today()}"></div><div class="field"><label>Ends</label><input class="input" type="date" id="pe" value="${x?.ends_on || ''}"></div></div>
      <div class="row-2"><div class="field"><label>Use limit (empty = no limit)</label><input class="input" type="number" min="1" id="pl" value="${esc(x?.use_limit ?? '')}"></div>
        <label class="row" style="gap:8px;margin-top:26px"><input type="checkbox" id="pa" ${x?.active === false ? '' : 'checked'}> Active</label></div>
      <div class="field"><label>Applies to (none ticked = every professional service)</label><div style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px">
        ${(items || []).map((i) => `<label class="row" style="gap:6px"><input type="checkbox" data-it="${i.id}" ${x?.item_ids?.includes(i.id) ? 'checked' : ''}> ${esc(i.name)}</label>`).join('')}</div></div>
      <div class="field"><label>Written terms of the promotion (kept on record)</label><textarea class="input" id="pt" rows="3">${esc(x?.terms || '')}</textarea></div>`,
    actions: [...(x && !x.uses ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!(await confirmBox('Delete code', `Delete ${x.code}?`, 'Delete', true))) return false; const { error: er } = await db.from('promo_codes').delete().eq('id', x.id); if (er) throw er; toast('Deleted'); pricing(el); } }] : []),
      { label: 'Cancel' }, { label: 'Save code', cls: 'btn-primary', onClick: async (m) => {
        const v = (q) => m.querySelector(q).value.trim();
        const row = { kind: v('#pk'), value: Number(v('#pv')), starts_on: v('#ps') || null, ends_on: v('#pe') || null, use_limit: v('#pl') ? Number(v('#pl')) : null,
          active: m.querySelector('#pa').checked, item_ids: [...m.querySelectorAll('[data-it]:checked')].map((i) => i.dataset.it), terms: v('#pt') || null };
        if (!(row.value > 0)) throw new Error('Enter the discount.');
        if (row.kind === 'percent' && row.value > 100) throw new Error('A percentage cannot be over 100.');
        if (!row.terms) throw new Error('Write the terms of the promotion (they are kept on record).');
        const { error: er } = x ? await db.from('promo_codes').update(row).eq('id', x.id)
          : await db.from('promo_codes').insert({ ...row, code: v('#pc').toUpperCase(), created_by: state.profile.id });
        if (er) throw new Error(er.code === '23505' ? 'That code already exists.' : er.code === '23514' ? 'Codes are 3–30 letters, numbers, - or _.' : er.message);
        toast('Promo code saved'); pricing(el);
      } }],
  });
  el.querySelector('#newPromo').onclick = () => promoModal(null);
  el.querySelectorAll('[data-promo]').forEach((b) => (b.onclick = () => promoModal(promos.find((x) => x.id === b.dataset.promo))));
}

const TABLES = ['org_settings', 'profiles', 'role_permissions', 'contacts', 'client_files', 'companies', 'deals', 'activities', 'notes', 'tasks', 'cases', 'key_dates',
  'rep_forms', 'deadlines', 'correspondence', 'appointments', 'intake_submissions', 'pathway_assessments', 'agreements', 'agreement_signers', 'agreement_events',
  'submission_letters', 'checklist_templates', 'case_checklists', 'case_checklist_items', 'client_documents', 'portal_messages', 'service_packages', 'items',
  'promo_codes', 'quotes', 'accounts', 'invoices', 'invoice_lines', 'payments', 'payment_applications', 'trust_transactions', 'vendors', 'expenses', 'bills',
  'bill_payments', 'receipts', 'journal_entries', 'journal_lines', 'reconciliations', 'month_closes', 'staff_agreements', 'audit_log'];

export async function backup(el) {
  if (state.profile?.role !== 'owner') { el.innerHTML = '<div class="alert err">Only the owner can export all data.</div>'; return; }
  el.innerHTML = `<div class="card"><div class="card-h"><h3>${icon('folder')} Backup &amp; export</h3></div><div class="card-b">
    <p style="margin-bottom:10px">Downloads every record in the Practice Hub (${TABLES.length} tables) to one file on this computer: clients, files, deadlines, agreements, letters, invoices, the books and the audit log. Documents themselves stay in OneDrive.</p>
    <div class="alert warn" style="font-size:12.5px">The file contains confidential client information. Save it only to an encrypted drive or your company OneDrive, never to a shared or personal device.</div>
    <button class="btn btn-primary" id="go">${icon('file')} Download full backup (JSON)</button> <span id="st" class="dk-muted" style="margin-left:8px"></span>
    <div id="res" style="margin-top:12px"></div></div></div>`;
  el.querySelector('#go').onclick = async (e) => {
    e.target.disabled = true;
    const st = el.querySelector('#st'), out = { exported_at: new Date().toISOString(), exported_by: state.profile.email, tables: {} }, errors = [];
    try {
      for (const t of TABLES) {
        st.textContent = `Exporting ${t}…`;
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await db.from(t).select('*').range(from, from + 999);
          if (error) { errors.push(`${t}: ${error.message}`); break; }
          rows.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        out.tables[t] = rows;
      }
      out.errors = errors;
      const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `practice-hub-backup-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      const n = Object.values(out.tables).reduce((s, r) => s + r.length, 0);
      el.querySelector('#res').innerHTML = `<div class="alert ${errors.length ? 'warn' : 'ok'}">Backup downloaded: ${n.toLocaleString()} records${errors.length ? `. Some tables could not be read: ${esc(errors.join('; '))}` : '.'}</div>`;
      st.textContent = '';
    } catch (err) { st.textContent = ''; fail(new Error('The backup could not be created: ' + (err?.message || err))); }
    e.target.disabled = false;
  };
}
