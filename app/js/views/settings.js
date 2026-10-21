import { db, esc, toast, fail } from '../core.js';

const FIELDS = [
  ['business_name', 'Business legal name'], ['rcic_name', 'RCIC name'], ['licence_number', 'CICC licence number'],
  ['phone', 'Business phone'], ['email', 'Public email'], ['address', 'Business address'],
  ['gst_number', 'GST/HST registration number'], ['gst_rate', 'GST rate (%)'], ['notify_email', 'Send new-assessment alerts to'],
];

export async function render(el) {
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
