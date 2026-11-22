// IRCC Forms library: every form opens IRCC's current official version. A daily check reads each form page on
// canada.ca, records the edition and emails you when IRCC publishes a new one.
import { db, can, esc, icon, fmtDateTime, modal, toast, fail, rpc, callFn } from '../core.js';

export const formName = (code) => code.replace(/^(IMM|CIT)(\d)/, '$1 $2');
const recent = (d) => d && Date.now() - new Date(d).getTime() < 45 * 864e5;

export function formCard(f, compact = false) {
  return `<div class="fm-card${f.status === 'broken' ? ' fm-bad' : ''}">
    <div class="fm-top"><span class="fm-code">${esc(formName(f.code))}</span>${f.edition ? `<span class="badge plain">Edition ${esc(f.edition)}</span>` : ''}${recent(f.changed_at) ? '<span class="badge b-RED">New version</span>' : ''}</div>
    <b class="fm-title">${esc(f.title)}</b>
    ${!compact && f.notice ? `<div class="fm-note">${icon('alert')} ${esc(f.notice)}</div>` : ''}
    ${!compact && f.esign ? `<div class="fm-es">${icon('pen')} ${esc(f.esign)}</div>` : ''}
    ${f.status === 'broken' ? '<div class="fm-note">IRCC moved this page. Use the forms finder to locate it.</div>' : ''}
    <div class="fm-act">${f.pdf_url ? `<a class="btn btn-sm btn-primary" href="${esc(f.pdf_url)}" target="_blank" rel="noopener">${icon('file')} Current PDF</a>` : ''}
      <a class="btn btn-sm" href="${esc(f.page_url)}" target="_blank" rel="noopener">${icon('external')} Instructions</a>
      ${f.pdf_url && can('documents.upload') ? `<button class="btn btn-sm btn-gold" data-saveform="${esc(f.code)}">${icon('folder')} Save to client file</button>` : ''}</div>
    ${!compact ? `<small class="fm-meta">${f.page_updated ? `IRCC: updated ${esc(f.page_updated)} · ` : ''}${f.checked_at ? `checked ${fmtDateTime(f.checked_at)}` : 'not checked yet'}</small>` : ''}</div>`;
}

/** Copy IRCC's current PDF into the client's OneDrive folder ("03 Forms & submissions"). */
export async function saveForm(code, contactId) {
  const d = await callFn('files', { action: 'save_ircc_form', code, contact_id: contactId });
  toast(`Saved to the client's Forms & submissions folder: ${d.name}`);
  window.dispatchEvent(new Event('crm-changed'));
  return d;
}
/** Wire the Save buttons in a container. With a contactId the form goes straight to that client; otherwise pick a client first. */
export function wireSave(box, contactId = null) {
  box.querySelectorAll('[data-saveform]').forEach((b) => (b.onclick = async () => {
    const code = b.dataset.saveform;
    if (contactId) { b.disabled = true; try { await saveForm(code, contactId); } catch (e) { fail(e); } b.disabled = false; return; }
    const { data: people } = await db.from('contacts').select('id, full_name').order('full_name').limit(2000);
    modal({
      title: `Save ${formName(code)} to a client file`,
      body: `<div class="field"><label>Client</label><select class="input" id="sc"><option value="">Choose…</option>${(people || []).map((c) => `<option value="${c.id}">${esc(c.full_name)}</option>`).join('')}</select></div>
        <small class="dk-muted">The current official PDF is copied from canada.ca into the client's OneDrive folder, under “03 Forms &amp; submissions”. Open it from the client's Documents tab in Adobe Acrobat Reader, fill it in, and upload the completed version back with Edit → “Replace the file”.</small>`,
      actions: [{ label: 'Cancel' }, { label: 'Save form', cls: 'btn-gold', onClick: async (m) => { const cid = m.querySelector('#sc').value; if (!cid) throw new Error('Choose a client.'); await saveForm(code, cid); } }],
    });
  }));
}

export async function render(el) {
  const { data, error } = await db.from('ircc_forms').select('*').eq('active', true).order('sort');
  if (error) { el.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
  const forms = data || [];
  const cats = [...new Set(forms.map((f) => f.category))];
  const last = forms.map((f) => f.checked_at).filter(Boolean).sort().pop();
  el.innerHTML = `<div class="toolbar"><input class="input" id="q" placeholder="Search forms (e.g. 5476, sponsorship, study)" style="max-width:340px">
      <select class="input" id="cat" style="max-width:220px"><option value="">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select><div class="grow"></div>
      <small class="dk-muted">${last ? `Last checked ${fmtDateTime(last)}` : ''}</small>
      <button class="btn" id="chk">${icon('history')} Check for updates now</button>
      ${can('settings.manage') ? `<button class="btn btn-gold" id="add">${icon('plus')} Add a form</button>` : ''}
      <a class="btn" href="https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides.html" target="_blank" rel="noopener">${icon('external')} IRCC forms finder</a></div>
    <div class="alert info"><b>Tip:</b> set your browser to download PDFs (Chrome: Settings → Privacy and security → Site settings → PDF documents → Download PDFs) and make Adobe Acrobat Reader your default PDF app, so IRCC forms open ready to fill. Every button opens IRCC's <b>current</b> official form on canada.ca, so you always get the latest version. Each day the hub reads every form page and emails you when IRCC publishes a new edition. IRCC's PDF forms must be filled in Adobe Reader: use the client's <b>Forms</b> tab for a data sheet with every answer ready to copy.</div>
    <div id="list"></div>`;
  const draw = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase().replace(/\s+/g, ''), c = el.querySelector('#cat').value;
    const list = forms.filter((f) => (!c || f.category === c) && (!q || `${f.code}${f.title}${f.category}`.toLowerCase().replace(/\s+/g, '').includes(q)));
    el.querySelector('#list').innerHTML = cats.filter((k) => list.some((f) => f.category === k)).map((k) => `<h3 class="fm-cat">${esc(k)}</h3><div class="fm-grid">${list.filter((f) => f.category === k).map((f) => formCard(f)).join('')}</div>`).join('')
      || '<div class="empty">No forms match.</div>';
  };
  el.querySelector('#q').oninput = () => { draw(); wireSave(el); }; el.querySelector('#cat').onchange = () => { draw(); wireSave(el); }; draw(); wireSave(el);
  el.querySelector('#chk').onclick = async (e) => {
    e.target.disabled = true;
    try { await rpc('request_forms_check'); toast('Checking IRCC form pages — this takes about a minute. Refresh the page after.'); } catch (err) { fail(err); }
    setTimeout(() => (e.target.disabled = false), 60000);
  };
  el.querySelector('#add')?.addEventListener('click', () => modal({
    title: 'Add an IRCC form',
    body: `<div class="field"><label>Form number</label><input class="input" id="fc" placeholder="e.g. IMM 5786 or CIT 0001"></div>
      <div class="field"><label>Name</label><input class="input" id="ft" placeholder="Filled in from IRCC's page at the next check"></div>
      <div class="field"><label>Category</label><input class="input" id="fk" list="fcats" value="Other"><datalist id="fcats">${cats.map((x) => `<option>${esc(x)}</option>`).join('')}</datalist></div>
      <small class="dk-muted">The form page is assumed to be canada.ca/…/application-forms-guides/[number].html. If IRCC uses another page, it shows as “moved” after the check.</small>`,
    actions: [{ label: 'Cancel' }, { label: 'Add form', cls: 'btn-primary', onClick: async (m) => {
      const code = m.querySelector('#fc').value.toUpperCase().replace(/[\s-]/g, '');
      if (!/^[A-Z]{3,4}[0-9A-Z]{3,10}$/.test(code)) throw new Error('Enter a form number like IMM 5786.');
      const { error: er } = await db.from('ircc_forms').insert({ code, title: m.querySelector('#ft').value.trim() || formName(code), category: m.querySelector('#fk').value.trim() || 'Other',
        page_url: `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/${code.toLowerCase()}.html` });
      if (er) throw new Error(er.code === '23505' ? 'That form is already in the library.' : er.message);
      await rpc('request_forms_check').catch(() => {}); toast('Added — details fill in within a minute'); render(el);
    } }],
  }));
}
