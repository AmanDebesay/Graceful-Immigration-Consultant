import { db, can, esc, icon, fmtDate, staffName, toast, fail } from '../core.js';
import { money, downloadCsv } from '../fin.js';
import { DEAL_STAGES, dealBadge, editDeal } from '../crm.js';

export async function render(el) {
  let view = sessionStorage.getItem('gi_deal_view') || 'board';
  const edit = can('crm.edit');
  el.innerHTML = `<div class="toolbar"><div class="seg" id="v"><button data-k="board">Board</button><button data-k="list">List</button></div>
    <div id="sum" class="row" style="gap:18px;color:var(--muted)"></div><div class="grow"></div>
    <button class="btn" id="csv">${icon('file')} Export</button>${edit ? `<button class="btn btn-gold" id="new">${icon('plus')} New deal</button>` : ''}</div><div id="body"></div>`;
  el.querySelector('#v').onclick = (e) => { if (e.target.dataset.k) { view = e.target.dataset.k; sessionStorage.setItem('gi_deal_view', view); draw(); } };
  el.querySelector('#new')?.addEventListener('click', () => editDeal());
  window.addEventListener('crm-changed', () => draw(), { once: true });
  let deals = [];

  async function draw() {
    el.querySelectorAll('#v button').forEach((b) => b.classList.toggle('on', b.dataset.k === view));
    const { data } = await db.from('deals').select('*, contacts(full_name), companies(name), items(name)').order('updated_at', { ascending: false }).limit(1000);
    deals = data || [];
    const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));
    el.querySelector('#sum').innerHTML = `<span>Open pipeline <b style="color:var(--navy)">${money(open.reduce((s, d) => s + +d.value, 0))}</b></span>
      <span>Weighted <b style="color:var(--navy)">${money(open.reduce((s, d) => s + (+d.value * d.probability) / 100, 0))}</b></span>
      <span>Won <b style="color:var(--green)">${money(deals.filter((d) => d.stage === 'won').reduce((s, d) => s + +d.value, 0))}</b></span>`;
    const body = el.querySelector('#body');
    if (view === 'list') {
      body.innerHTML = `<div class="card"><div class="table-wrap">${deals.length ? `<table class="t"><thead><tr><th>Deal</th><th>Client</th><th>Stage</th><th style="text-align:right">Value</th><th>Probability</th><th>Expected close</th><th>Owner</th></tr></thead><tbody>
        ${deals.map((d) => `<tr class="click" data-id="${d.id}"><td><b>${esc(d.title)}</b>${d.items ? `<br><small style="color:var(--muted)">${esc(d.items.name)}</small>` : ''}</td>
          <td>${esc(d.contacts?.full_name || '')}${d.companies ? `<br><small style="color:var(--muted)">${esc(d.companies.name)}</small>` : ''}</td><td>${dealBadge(d.stage)}</td>
          <td style="text-align:right">${money(d.value)}</td><td>${d.probability}%</td><td>${fmtDate(d.expected_close)}</td><td>${esc(staffName(d.owner_id))}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${icon('trend')}<div>No deals yet. A deal is a paid service you expect to win.</div></div>`}</div></div>`;
      body.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => editDeal(deals.find((d) => d.id === tr.dataset.id))));
      return;
    }
    body.innerHTML = `<div class="board">${DEAL_STAGES.map(([k, l]) => {
      const items = deals.filter((d) => d.stage === k);
      return `<div class="col" data-stage="${k}"><div class="col-h">${l}<span>${items.length}</span></div>
        <div style="font-size:12px;color:var(--muted);padding:0 6px 4px">${money(items.reduce((s, d) => s + +d.value, 0))}</div>
        ${items.map((d) => `<div class="lead" draggable="${edit}" data-id="${d.id}"><b>${esc(d.title)}</b><small>${esc(d.contacts?.full_name || '')}</small>
          <div class="row"><b style="color:var(--navy)">${money(d.value)}</b><small style="margin-left:auto">${d.expected_close ? fmtDate(d.expected_close, { month: 'short', day: 'numeric' }) : ''}</small></div></div>`).join('')}</div>`;
    }).join('')}</div>`;
    body.querySelectorAll('.lead').forEach((c) => {
      c.onclick = () => editDeal(deals.find((d) => d.id === c.dataset.id));
      c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
      c.ondragend = () => c.classList.remove('dragging');
    });
    if (!edit) return;
    body.querySelectorAll('.col').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = async (e) => {
        e.preventDefault(); col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain'), d = deals.find((x) => x.id === id);
        if (!d || d.stage === col.dataset.stage) return;
        const { error } = await db.from('deals').update({ stage: col.dataset.stage }).eq('id', id);
        if (error) return fail(error);
        if (col.dataset.stage === 'won' && d.contact_id) await db.from('contacts').update({ stage: 'retained' }).eq('id', d.contact_id);
        toast(col.dataset.stage === 'won' ? '🎉 Deal won' : 'Deal moved'); draw();
      };
    });
  }
  el.querySelector('#csv').onclick = () => downloadCsv('deals.csv', [['Deal', 'Client', 'Company', 'Service', 'Stage', 'Value', 'Probability', 'Expected close', 'Owner'],
    ...deals.map((d) => [d.title, d.contacts?.full_name, d.companies?.name, d.items?.name, d.stage, d.value, d.probability, d.expected_close, staffName(d.owner_id)])]);
  draw();
}
