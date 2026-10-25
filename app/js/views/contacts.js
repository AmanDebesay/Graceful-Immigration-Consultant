import { db, state, can, esc, icon, STAGES, stageBadge, triageBadge, staffName, staffOptions, timeAgo, modal, toast } from '../core.js';
import { clearFinCache } from '../fin.js';

export async function render(el) {
  let stage = 'all', q = '';
  el.innerHTML = `<div class="toolbar">
      <input class="input" id="q" placeholder="Search name, email or phone" style="max-width:300px">
      <select class="input" id="stage" style="max-width:220px"><option value="all">All stages</option>${STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export CSV</button>
      ${can('crm.edit') ? `<button class="btn" id="imp">${icon('plus')} Import CSV</button>` : ''}
      ${can('crm.edit') ? `<button class="btn btn-primary" id="add">${icon('plus')} New client</button>` : ''}
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
    box.innerHTML = `<table class="t"><thead><tr><th>Name</th><th>Phone</th><th>Stage</th><th>Priority</th><th>Owner</th><th>Last contacted</th><th>Added</th></tr></thead><tbody>
      ${data.map((c) => `<tr class="click" data-id="${c.id}">
        <td><div class="cell-name"><span class="avatar sm">${esc(c.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span><div><b>${esc(c.full_name)}</b><span>${esc(c.email || '')}</span></div></div></td>
        <td>${esc(c.phone || '—')}</td><td>${stageBadge(c.stage)}</td><td>${triageBadge(c.priority)}</td>
        <td>${c.assigned_to ? esc(staffName(c.assigned_to)) : '<span style="color:var(--muted)">Unassigned</span>'}</td>
        <td>${c.last_activity_at ? timeAgo(c.last_activity_at) : '<span style="color:var(--muted)">Never</span>'}</td><td>${timeAgo(c.created_at)}</td></tr>`).join('')}</tbody></table>`;
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
  el.querySelector('#imp')?.addEventListener('click', () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const text = await input.files[0].text();
      const parse = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const head = parse(lines[0]).map((h) => h.toLowerCase());
      const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const iName = col('full name', 'name'), iFirst = col('first'), iLast = col('last'), iEmail = col('email'), iPhone = col('phone', 'mobile'), iCit = col('citizenship', 'country'), iLang = col('language');
      const rows2 = lines.slice(1).map(parse).map((r) => ({
        full_name: iName >= 0 && !head[iName].includes('first') && !head[iName].includes('last') ? r[iName] : [r[iFirst], r[iLast]].filter(Boolean).join(' '),
        email: iEmail >= 0 ? (r[iEmail] || '').toLowerCase() || null : null, phone: iPhone >= 0 ? r[iPhone] || null : null,
        citizenship: iCit >= 0 ? r[iCit] || null : null, language: iLang >= 0 ? r[iLang] || null : null, source: 'import', created_by: state.profile.id,
      })).filter((r) => r.full_name);
      if (!rows2.length) return toast('No rows found. The file needs a "Name" (or First/Last name) column.', true);
      modal({ title: 'Import contacts', body: `<p>Found <b>${rows2.length}</b> contacts. Contacts whose email already exists will be skipped.</p>
        <div class="table-wrap" style="max-height:260px;margin-top:10px"><table class="t"><tbody>${rows2.slice(0, 8).map((r) => `<tr><td>${esc(r.full_name)}</td><td>${esc(r.email || '')}</td><td>${esc(r.phone || '')}</td></tr>`).join('')}</tbody></table></div>`,
        actions: [{ label: 'Cancel' }, { label: `Import ${rows2.length}`, cls: 'btn-primary', onClick: async () => {
          let ok = 0, skipped = 0;
          for (let i = 0; i < rows2.length; i += 200) {
            const chunk = rows2.slice(i, i + 200);
            const { data, error } = await db.from('contacts').upsert(chunk, { onConflict: 'email', ignoreDuplicates: true }).select('id');
            if (error) { for (const r of chunk) { const { error: e } = await db.from('contacts').insert(r); e ? skipped++ : ok++; } } else { ok += data.length; skipped += chunk.length - data.length; }
          }
          clearFinCache(); toast(`Imported ${ok} contacts${skipped ? `, skipped ${skipped}` : ''}`); load();
        } }] });
    };
    input.click();
  });
  if (location.hash.includes('new=1') && can('crm.edit')) openAdd();
  load();

  function openAdd() {
    modal({
      title: 'New client',
      body: `<div class="field"><label>Full name *</label><input class="input" id="n"></div>
        <div class="row-2"><div class="field"><label>Email</label><input class="input" id="e" type="email"></div>
        <div class="field"><label>Phone</label><input class="input" id="p" type="tel"></div></div>
        <div class="row-2"><div class="field"><label>Stage</label><select class="input" id="s">${STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Assigned to</label><select class="input" id="a">${staffOptions(state.profile.id)}</select></div></div>
        <div class="field"><label>Source</label><select class="input" id="src"><option value="phone">Phone call</option><option value="walk-in">Walk-in</option><option value="referral">Referral</option><option value="whatsapp">WhatsApp</option><option value="social">Social media</option><option value="website">Website</option><option value="other">Other</option></select></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Add client', cls: 'btn-primary', onClick: async (m) => {
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
