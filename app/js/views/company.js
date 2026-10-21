import { db, can, esc, icon, stageBadge, timeAgo, fmtDateTime, staffName, initials } from '../core.js';
import { money } from '../fin.js';
import { dealBadge, logActivity, editDeal, ACT_LABEL, ACT_ICON } from '../crm.js';
import { editCompany } from './companies.js';

export async function render(el, [id], { setTitle }) {
  const { data: c, error } = await db.from('companies').select('*').eq('id', id).single();
  if (error) { el.innerHTML = '<div class="alert err">Company not found.</div>'; return; }
  setTitle(c.name);
  const [{ data: people }, { data: deals }, { data: acts }] = await Promise.all([
    db.from('contacts').select('id, full_name, email, job_title, stage').eq('company_id', id).order('full_name'),
    db.from('deals').select('*, contacts(full_name)').eq('company_id', id).order('created_at', { ascending: false }),
    db.from('activities').select('*').eq('company_id', id).order('occurred_at', { ascending: false }).limit(50),
  ]);
  const edit = can('crm.edit');
  el.innerHTML = `<div class="toolbar"><a class="btn btn-sm" href="#/companies">← Companies</a><div class="grow"></div>
    ${edit ? `<button class="btn" id="act">${icon('phone')} Log activity</button><button class="btn" id="deal">${icon('trend')} New deal</button><button class="btn" id="ed">Edit</button>` : ''}</div>
    <div class="detail"><div class="card"><div class="card-b">
      <div class="row" style="margin-bottom:12px"><span class="avatar gold" style="width:52px;height:52px;border-radius:12px">${esc(initials(c.name))}</span>
        <div><h2 style="font-family:var(--serif);color:var(--navy);font-size:21px">${esc(c.name)}</h2><small style="color:var(--muted)">${esc(c.industry || 'Company')}</small></div></div>
      <dl class="kv"><dt>Website</dt><dd>${c.website ? `<a href="${esc(/^https?:/.test(c.website) ? c.website : 'https://' + c.website)}" target="_blank" rel="noopener">${esc(c.website)}</a>` : '—'}</dd>
        <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd><dt>Email</dt><dd>${esc(c.email || '—')}</dd>
        <dt>Address</dt><dd>${esc([c.address, c.city, c.province].filter(Boolean).join(', ') || '—')}</dd><dt>Owner</dt><dd>${esc(staffName(c.owner_id))}</dd></dl>
      ${c.notes ? `<p style="margin-top:14px;white-space:pre-wrap">${esc(c.notes)}</p>` : ''}</div></div>
      <div class="grid">
        <div class="card"><div class="card-h"><h3>People</h3><small style="color:var(--muted)">Link contacts by editing them</small></div><div class="table-wrap">${(people || []).length ? `<table class="t"><tbody>
          ${people.map((p) => `<tr class="click" onclick="location.hash='#/contacts/${p.id}'"><td><b>${esc(p.full_name)}</b><br><small style="color:var(--muted)">${esc(p.job_title || p.email || '')}</small></td><td>${stageBadge(p.stage)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty" style="padding:20px">No contacts linked yet.</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>Deals</h3></div><div class="table-wrap">${(deals || []).length ? `<table class="t"><tbody>
          ${deals.map((d) => `<tr class="click" data-d="${d.id}"><td><b>${esc(d.title)}</b><br><small style="color:var(--muted)">${esc(d.contacts?.full_name || '')}</small></td><td>${dealBadge(d.stage)}</td><td style="text-align:right">${money(d.value)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="empty" style="padding:20px">No deals yet.</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>Activity</h3></div><div class="card-b timeline">${(acts || []).map((a) => `<div class="tl"><div class="tl-dot">${icon(ACT_ICON[a.type])}</div>
          <div class="tl-body"><div class="meta">${ACT_LABEL[a.type]} · ${esc(staffName(a.author_id))} · ${fmtDateTime(a.occurred_at)}</div><b>${esc(a.subject || '')}</b>${a.body ? `<div class="text" style="margin-top:4px">${esc(a.body)}</div>` : ''}</div></div>`).join('') || '<div class="empty" style="padding:16px">No activity yet.</div>'}</div></div>
      </div></div>`;
  el.querySelector('#act')?.addEventListener('click', () => logActivity({ companyId: id }));
  el.querySelector('#deal')?.addEventListener('click', () => editDeal({ company_id: id }));
  el.querySelector('#ed')?.addEventListener('click', () => editCompany(c));
  el.querySelectorAll('[data-d]').forEach((tr) => (tr.onclick = () => editDeal(deals.find((d) => d.id === tr.dataset.d))));
  window.addEventListener('crm-changed', () => render(el, [id], { setTitle }), { once: true });
}
