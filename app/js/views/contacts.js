import { db, state, can, esc, icon, STAGES, stageBadge, triageBadge, staffName, staffOptions, timeAgo, modal, toast, clientAvatar } from '../core.js';
import { clearFinCache, downloadCsv } from '../fin.js';

export async function render(el) {
  let stage = 'all', q = '';
  el.innerHTML = `<div class="toolbar">
      <input class="input" id="q" placeholder="Search name, email or phone" style="max-width:300px">
      <select class="input" id="stage" style="max-width:220px"><option value="all">All stages</option>${STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <div class="grow"></div>
      <button class="btn" id="csv">${icon('file')} Export CSV</button>
      ${can('crm.edit') ? `<button class="btn" id="imp">${icon('upload')} Import CSV</button>` : ''}
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
    const th = (ic, l) => `<th><span class="th-i">${icon(ic)}${l}</span></th>`;
    const when = (d) => `<span class="td-i">${icon('calendar')}${d}</span>`;
    box.innerHTML = `<table class="t t-rich"><thead><tr>${th('users', 'Name')}${th('phone', 'Phone')}${th('layers', 'Stage')}${th('award', 'Priority')}${th('user', 'Owner')}${th('calendar', 'Last contacted')}${th('calendar', 'Added')}<th></th></tr></thead><tbody>
      ${data.map((c) => `<tr class="click" data-id="${c.id}">
        <td><div class="cell-name">${clientAvatar(c, 'avatar')}<div><b>${esc(c.full_name)}</b><span>${esc(c.email || '')}</span></div></div></td>
        <td class="td-strong">${esc(c.phone || '—')}</td><td>${stageBadge(c.stage)}</td><td>${c.priority ? triageBadge(c.priority) : '<span class="badge plain">—</span>'}</td>
        <td><span class="td-i">${icon('user')}${c.assigned_to ? esc(staffName(c.assigned_to)) : 'Unassigned'}</span></td>
        <td>${when(c.last_activity_at ? timeAgo(c.last_activity_at) : 'Never')}</td><td>${when(timeAgo(c.created_at))}</td>
        <td><button class="row-more" data-more="${c.id}" aria-label="More">⋯</button></td></tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      document.querySelector('.dropdown')?.remove();
      const c = data.find((x) => x.id === b.dataset.more), d = document.createElement('div'); d.className = 'dropdown';
      d.innerHTML = `<button data-a="open">${icon('user')} Open client</button>${c.email ? `<button data-a="mail">${icon('mail')} Email</button>` : ''}${c.phone ? `<button data-a="call">${icon('phone')} Call</button>` : ''}`;
      const r = b.getBoundingClientRect(); Object.assign(d.style, { position: 'fixed', top: `${r.bottom + 6}px`, left: `${Math.max(8, r.right - 190)}px`, right: 'auto', zIndex: 50 });
      document.body.appendChild(d);
      d.onclick = (ev) => { const a = ev.target.closest('[data-a]')?.dataset.a; d.remove();
        if (a === 'open') location.hash = `#/contacts/${c.id}`; if (a === 'mail') location.href = `mailto:${c.email}`; if (a === 'call') location.href = `tel:${c.phone}`; };
      setTimeout(() => document.addEventListener('click', () => d.remove(), { once: true }));
    }));
    box.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => (location.hash = `#/contacts/${tr.dataset.id}`)));
  }

  let t;
  el.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  el.querySelector('#stage').onchange = (e) => { stage = e.target.value; load(); };
  el.querySelector('#csv').onclick = () => {
    const cols = ['full_name', 'email', 'phone', 'citizenship', 'language', 'stage', 'priority', 'source', 'created_at'];
    downloadCsv('contacts.csv', [cols, ...rows.map((r) => cols.map((k) => r[k] ?? ''))]);
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
