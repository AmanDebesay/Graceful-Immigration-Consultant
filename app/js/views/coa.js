import { db, can, esc, icon, rpc, modal, toast, today } from '../core.js';
import { money, clearFinCache, downloadCsv } from '../fin.js';

const TYPES = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity'], ['income', 'Income'], ['expense', 'Expenses']];
const SUBTYPES = { asset: [['bank', 'Bank'], ['fixed_asset', 'Fixed asset'], ['other', 'Other current asset']], liability: [['credit_card', 'Credit card'], ['other', 'Other liability']],
  equity: [['equity', 'Equity']], income: [['income', 'Income']], expense: [['expense', 'Expense'], ['cogs', 'Cost of services']] };

export async function render(el) {
  const manage = can('finance.manage');
  const rows = await rpc('report_account_balances', { p_from: null, p_to: today() });
  const { data: all } = await db.from('accounts').select('*').order('code');
  const bal = Object.fromEntries((rows || []).map((r) => [r.account_id, +r.balance]));

  el.innerHTML = `<div class="toolbar"><input class="input" id="q" placeholder="Filter accounts" style="max-width:260px"><div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export</button>${manage ? `<button class="btn btn-primary" id="new">${icon('plus')} New account</button>` : ''}</div>
    <div id="list"></div>`;
  const draw = (q = '') => {
    el.querySelector('#list').innerHTML = TYPES.map(([t, label]) => {
      const accs = all.filter((a) => a.type === t && (!q || (a.code + a.name).toLowerCase().includes(q)));
      if (!accs.length) return '';
      return `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${label}</h3></div><div class="table-wrap"><table class="t"><tbody>
        ${accs.map((a) => `<tr style="${a.active ? '' : 'opacity:.5'}"><td style="width:80px">${esc(a.code)}</td><td><b>${esc(a.name)}</b>${a.system_key ? ' <span class="badge plain b-navy" title="Used automatically by the system">System</span>' : ''}${a.description ? `<br><small style="color:var(--muted)">${esc(a.description)}</small>` : ''}</td>
          <td style="text-align:right">${money(bal[a.id] || 0)}</td><td style="text-align:right;white-space:nowrap">
          ${['bank', 'trust_bank', 'credit_card'].includes(a.subtype) ? `<a class="btn btn-sm" href="#/banking?a=${a.id}">Register</a>` : `<a class="btn btn-sm" href="#/reports?r=gl&a=${a.id}">Ledger</a>`}
          ${manage ? `<button class="btn btn-sm" data-e="${a.id}">Edit</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
    }).join('');
    el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => edit(all.find((a) => a.id === b.dataset.e))));
  };
  el.querySelector('#q').oninput = (e) => draw(e.target.value.toLowerCase());
  el.querySelector('#csv').onclick = () => downloadCsv('chart-of-accounts.csv', [['Code', 'Name', 'Type', 'Balance', 'Active'], ...all.map((a) => [a.code, a.name, a.type, bal[a.id] || 0, a.active])]);
  el.querySelector('#new')?.addEventListener('click', () => edit());

  function edit(a) {
    modal({
      title: a ? 'Edit account' : 'New account',
      body: `<div class="row-2"><div class="field"><label>Code</label><input class="input" id="c" value="${esc(a?.code || '')}"></div>
        <div class="field"><label>Type</label><select class="input" id="t" ${a ? 'disabled' : ''}>${TYPES.map(([k, l]) => `<option value="${k}" ${a?.type === k ? 'selected' : ''}>${l.replace(/s$/, '')}</option>`).join('')}</select></div></div>
        ${a ? '' : `<div class="field"><label>Detail type</label><select class="input" id="st"></select></div>`}
        <div class="field"><label>Name</label><input class="input" id="n" value="${esc(a?.name || '')}"></div>
        <div class="field"><label>Description</label><input class="input" id="d" value="${esc(a?.description || '')}"></div>
        ${a && !a.system_key ? `<label class="row" style="gap:8px"><input type="checkbox" id="act" ${a.active ? 'checked' : ''}> Active</label>` : ''}`,
      onOpen: (m) => {
        const t = m.querySelector('#t'), st = m.querySelector('#st');
        if (!st) return;
        const fill = () => { st.innerHTML = SUBTYPES[t.value].map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); };
        t.onchange = fill; fill();
      },
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const row = { code: m.querySelector('#c').value.trim(), name: m.querySelector('#n').value.trim(), description: m.querySelector('#d').value || null };
        if (!row.code || !row.name) throw new Error('Enter a code and a name.');
        let error;
        if (a) { if (m.querySelector('#act')) row.active = m.querySelector('#act').checked; ({ error } = await db.from('accounts').update(row).eq('id', a.id)); }
        else ({ error } = await db.from('accounts').insert({ ...row, type: m.querySelector('#t').value, subtype: m.querySelector('#st').value }));
        if (error) throw new Error(error.code === '23505' ? 'That account code is already used.' : error.message);
        clearFinCache(); toast('Account saved'); render(el);
      } }],
    });
  }
  draw();
}
