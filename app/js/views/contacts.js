import { db, state, can, esc, icon, STAGES, stageBadge, triageBadge, staffName, staffOptions, timeAgo, modal, toast } from '../core.js';

export async function render(el) {
  let stage = 'all', q = '';
  el.innerHTML = `<div class="toolbar">
      <input class="input" id="q" placeholder="Search name, email or phone" style="max-width:300px">
      <select class="input" id="stage" style="max-width:220px"><option value="all">All stages</option>${STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export CSV</button>
      ${can('crm.edit') ? `<button class="btn btn-primary" id="add">${icon('plus')} Add contact</button>` : ''}
    </div><div class="card"><div class="table-wrap" id="list"></div></div>`;

  let rows = [];
  async function load() {
    let query = db.from('contacts').select('*').order('created_at', { ascending: false }).limit(500);
    if (stage !== 'all') query = query.eq('stage', stage);
    if (q) { const like = `%${q.replace(/[%_,()]/g, '')}%`; query = query.or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`); }
    const { data, error } = await query;
    const box = el.querySelector('#list');
    if (error) { box.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    rows = data;
    if (!data.length) { box.innerHTML = `<div class="empty">${icon('users')}<div>No contacts found.</div></div>`; return; }
    box.innerHTML = `<table class="t"><thead><tr><th>Name</th><th>Phone</th><th>Stage</th><th>Priority</th><th>Assigned</th><th>Source</th><th>Added</th></tr></thead><tbody>
      ${data.map((c) => `<tr class="click" data-id="${c.id}">
        <td><div class="cell-name"><span class="avatar sm">${esc(c.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span><div><b>${esc(c.full_name)}</b><span>${esc(c.email || '')}</span></div></div></td>
        <td>${esc(c.phone || '—')}</td><td>${stageBadge(c.stage)}</td><td>${triageBadge(c.priority)}</td>
        <td>${c.assigned_to ? esc(staffName(c.assigned_to)) : '<span style="color:var(--muted)">Unassigned</span>'}</td>
        <td><span class="badge plain">${esc(c.source)}</span></td><td>${timeAgo(c.created_at)}</td></tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/contacts/${tr.dataset.id}`)));
  }

  let t;
  el.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  el.querySelector('#stage').onchange = (e) => { stage = e.target.value; load(); };
  el.querySelector('#csv').onclick = () => {
    const cols = ['full_name', 'email', 'phone', 'citizenship', 'language', 'stage', 'priority', 'source', 'created_at'];
    const csv = [cols.join(','), ...rows.map((r) => cols.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  el.querySelector('#add')?.addEventListener('click', () => openAdd());
  if (location.hash.includes('new=1') && can('crm.edit')) openAdd();
  load();

  function openAdd() {
    modal({
      title: 'Add contact',
      body: `<div class="field"><label>Full name *</label><input class="input" id="n"></div>
        <div class="row-2"><div class="field"><label>Email</label><input class="input" id="e" type="email"></div>
        <div class="field"><label>Phone</label><input class="input" id="p" type="tel"></div></div>
        <div class="row-2"><div class="field"><label>Stage</label><select class="input" id="s">${STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Assigned to</label><select class="input" id="a">${staffOptions(state.profile.id)}</select></div></div>
        <div class="field"><label>Source</label><select class="input" id="src"><option value="phone">Phone call</option><option value="walk-in">Walk-in</option><option value="referral">Referral</option><option value="whatsapp">WhatsApp</option><option value="social">Social media</option><option value="website">Website</option><option value="other">Other</option></select></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add contact', cls: 'btn-primary', onClick: async (m) => {
        const full_name = m.querySelector('#n').value.trim();
        if (!full_name) throw new Error('Enter a name.');
        const email = m.querySelector('#e').value.trim().toLowerCase() || null;
        const { data, error } = await db.from('contacts').insert({
          full_name, email, phone: m.querySelector('#p').value.trim() || null, stage: m.querySelector('#s').value,
          assigned_to: m.querySelector('#a').value || null, source: m.querySelector('#src').value, created_by: state.profile.id,
        }).select('id').single();
        if (error) throw new Error(error.code === '23505' ? 'A contact with this email already exists.' : error.message);
        toast('Contact added');
        location.hash = `#/contacts/${data.id}`;
      } }],
    });
  }
}
