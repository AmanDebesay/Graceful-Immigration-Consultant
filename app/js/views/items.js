import { db, can, esc, icon, modal, toast } from '../core.js';
import { money, accounts, acctOptions, clearFinCache } from '../fin.js';

export async function render(el) {
  const [{ data }, accs] = await Promise.all([db.from('items').select('*, accounts(name)').order('name'), accounts()]);
  const edit = can('finance.manage') || can('crm.edit');
  el.innerHTML = `<div class="toolbar"><span style="color:var(--muted)">Your price list. Used on deals and invoice lines.</span><div class="grow"></div>
    ${edit ? `<button class="btn btn-primary" id="new">${icon('plus')} New product/service</button>` : ''}</div>
    <div class="card"><div class="table-wrap">${data.length ? `<table class="t"><thead><tr><th>Name</th><th>Description</th><th>Income account</th><th>GST</th><th style="text-align:right">Price</th><th></th></tr></thead><tbody>
      ${data.map((i) => `<tr style="${i.active ? '' : 'opacity:.5'}"><td><b>${esc(i.name)}</b></td><td>${esc(i.description || '')}</td><td>${esc(i.accounts?.name || '—')}</td>
        <td>${i.taxable ? 'Yes' : 'No'}</td><td style="text-align:right">${money(i.unit_price)}</td><td style="text-align:right">${edit ? `<button class="btn btn-sm" data-e="${i.id}">Edit</button>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">${icon('briefcase')}<div>No products or services yet.</div></div>`}</div></div>`;
  const open = (it = {}) => modal({
    title: it.id ? 'Edit product/service' : 'New product/service',
    body: `<div class="field"><label>Name</label><input class="input" id="n" value="${esc(it.name || '')}" placeholder="e.g. Spousal Sponsorship — full representation"></div>
      <div class="field"><label>Description (shown on invoices)</label><input class="input" id="d" value="${esc(it.description || '')}"></div>
      <div class="row-2"><div class="field"><label>Price (before tax)</label><input class="input" type="number" step="0.01" id="p" value="${it.unit_price ?? ''}"></div>
      <div class="field"><label>Income account</label><select class="input" id="a">${acctOptions(accs, it.income_account_id || accs.find((a) => a.system_key === 'service_income')?.id, (a) => a.type === 'income')}</select></div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="t" ${it.taxable ?? true ? 'checked' : ''}> Charge GST/HST</label>
      ${it.id ? `<label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" id="ac" ${it.active ? 'checked' : ''}> Active</label>` : ''}`,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
      const row = { name: m.querySelector('#n').value.trim(), description: m.querySelector('#d').value || null, unit_price: Number(m.querySelector('#p').value || 0),
        income_account_id: m.querySelector('#a').value, taxable: m.querySelector('#t').checked };
      if (it.id) row.active = m.querySelector('#ac').checked;
      if (!row.name) throw new Error('Enter a name.');
      const { error } = it.id ? await db.from('items').update(row).eq('id', it.id) : await db.from('items').insert(row);
      if (error) throw error; clearFinCache(); toast('Saved'); render(el);
    } }],
  });
  el.querySelector('#new')?.addEventListener('click', () => open());
  el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => open(data.find((x) => x.id === b.dataset.e))));
}
