import { db, state, can, esc, icon, modal, toast, staffOptions, staffName, timeAgo } from '../core.js';
import { downloadCsv } from '../fin.js';

export async function render(el) {
  const edit = can('crm.edit');
  const { data } = await db.from('companies').select('*, contacts(count), deals(value, stage)').order('name');
  const rows = data || [];
  el.innerHTML = `<div class="toolbar"><input class="input" id="q" placeholder="Search companies" style="max-width:280px"><div class="grow"></div>
    <button class="btn" id="csv">${icon('file')} Export</button>${edit ? `<button class="btn btn-primary" id="new">${icon('plus')} New company</button>` : ''}</div>
    <div class="card"><div class="table-wrap" id="list"></div></div>`;
  const draw = (q = '') => {
    const f = rows.filter((c) => !q || c.name.toLowerCase().includes(q));
    el.querySelector('#list').innerHTML = f.length ? `<table class="t"><thead><tr><th>Company</th><th>Industry</th><th>City</th><th>Contacts</th><th>Open deals</th><th>Owner</th><th>Added</th></tr></thead><tbody>
      ${f.map((c) => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.name)}</b>${c.website ? `<br><small style="color:var(--muted)">${esc(c.website)}</small>` : ''}</td>
        <td>${esc(c.industry || '—')}</td><td>${esc([c.city, c.province].filter(Boolean).join(', ') || '—')}</td><td>${c.contacts?.[0]?.count ?? 0}</td>
        <td>${(c.deals || []).filter((d) => !['won', 'lost'].includes(d.stage)).length}</td><td>${esc(staffName(c.owner_id))}</td><td>${timeAgo(c.created_at)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${icon('briefcase')}<div>No companies yet. Add employers you recruit for or partner with.</div></div>`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/companies/${tr.dataset.id}`)));
  };
  el.querySelector('#q').oninput = (e) => draw(e.target.value.toLowerCase());
  el.querySelector('#csv').onclick = () => downloadCsv('companies.csv', [['Name', 'Industry', 'Website', 'Phone', 'Email', 'City', 'Province'], ...rows.map((c) => [c.name, c.industry, c.website, c.phone, c.email, c.city, c.province])]);
  el.querySelector('#new')?.addEventListener('click', () => editCompany());
  draw();
}

export function editCompany(c = {}) {
  modal({
    title: c.id ? 'Edit company' : 'New company',
    body: `<div class="field"><label>Company name</label><input class="input" id="n" value="${esc(c.name || '')}"></div>
      <div class="row-2"><div class="field"><label>Industry</label><input class="input" id="i" value="${esc(c.industry || '')}" placeholder="e.g. Construction, Hospitality"></div>
      <div class="field"><label>Website</label><input class="input" id="w" value="${esc(c.website || '')}"></div></div>
      <div class="row-2"><div class="field"><label>Phone</label><input class="input" id="p" value="${esc(c.phone || '')}"></div><div class="field"><label>Email</label><input class="input" id="e" value="${esc(c.email || '')}"></div></div>
      <div class="field"><label>Address</label><input class="input" id="a" value="${esc(c.address || '')}"></div>
      <div class="row-2"><div class="field"><label>City</label><input class="input" id="ci" value="${esc(c.city || '')}"></div><div class="field"><label>Province</label><input class="input" id="pr" value="${esc(c.province || '')}"></div></div>
      <div class="field"><label>Owner</label><select class="input" id="o">${staffOptions(c.owner_id || state.profile.id)}</select></div>
      <div class="field"><label>Notes</label><textarea class="input" id="no">${esc(c.notes || '')}</textarea></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
      const v = (s) => m.querySelector(s).value.trim() || null;
      const row = { name: v('#n'), industry: v('#i'), website: v('#w'), phone: v('#p'), email: v('#e'), address: v('#a'), city: v('#ci'), province: v('#pr'), owner_id: v('#o'), notes: v('#no') };
      if (!row.name) throw new Error('Enter the company name.');
      const { data, error } = c.id ? await db.from('companies').update(row).eq('id', c.id).select('id').single() : await db.from('companies').insert({ ...row, created_by: state.profile.id }).select('id').single();
      if (error) throw error;
      toast('Company saved'); window.dispatchEvent(new Event('crm-changed'));
      location.hash = `#/companies/${data.id}`;
      if (c.id) window.dispatchEvent(new Event('hashchange'));
    } }],
  });
}
