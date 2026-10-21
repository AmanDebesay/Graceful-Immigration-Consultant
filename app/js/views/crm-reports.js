import { esc, icon, rpc, staffName, STAGES } from '../core.js';
import { money, monthLabel } from '../fin.js';
import { DEAL_STAGES, ACT_LABEL, CASE_LABEL } from '../crm.js';

export async function render(el) {
  const s = await rpc('crm_stats', { p_from: null, p_to: null });
  const bar = (v, max, color = 'var(--navy)') => `<div class="bar"><i style="width:${max ? (v / max) * 100 : 0}%;background:${color}"></i></div>`;
  const cs = s.contacts_by_stage || {}, cmax = Math.max(1, ...Object.values(cs));
  const ds = s.deals_by_stage || {};
  const winRate = s.won_count + s.lost_count ? Math.round((s.won_count / (s.won_count + s.lost_count)) * 100) : null;
  const months = (s.won_by_month || []); const mmax = Math.max(1, ...months.map((m) => +m.v));
  const at = s.activity_by_type || {}, amax = Math.max(1, ...Object.values(at));

  el.innerHTML = `<p style="color:var(--muted);margin-bottom:14px">Last 12 months.</p>
    <div class="grid g-4" style="margin-bottom:18px">
      <div class="card kpi"><div class="kpi-ico gold">${icon('trend')}</div><div><small>Open pipeline</small><b>${money(s.open_value)}</b><em>Weighted ${money(s.weighted_value)}</em></div></div>
      <div class="card kpi"><div class="kpi-ico green">${icon('check')}</div><div><small>Won revenue</small><b>${money(s.won_value)}</b><em>${s.won_count} deals</em></div></div>
      <div class="card kpi"><div class="kpi-ico">${icon('briefcase')}</div><div><small>Win rate</small><b>${winRate === null ? '—' : winRate + '%'}</b><em>${s.won_count} won · ${s.lost_count} lost</em></div></div>
      <div class="card kpi"><div class="kpi-ico">${icon('users')}</div><div><small>New contacts</small><b>${s.new_contacts}</b></div></div>
    </div>
    <div class="grid g-2">
      <div class="card"><div class="card-h"><h3>Lead funnel</h3></div><div class="card-b funnel">${STAGES.map(([k, l]) => `<div><div class="lbl"><span>${l}</span><b>${cs[k] || 0}</b></div>${bar(cs[k] || 0, cmax)}</div>`).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>Deals by stage</h3></div><div class="table-wrap"><table class="t"><tbody>${DEAL_STAGES.map(([k, l]) => `<tr><td>${l}</td><td>${ds[k]?.n || 0}</td><td style="text-align:right">${money(ds[k]?.v || 0)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-h"><h3>Lead sources</h3><small style="color:var(--muted)">Contacts · retained</small></div><div class="table-wrap">${(s.sources || []).length ? `<table class="t"><tbody>${s.sources.map((x) => `<tr><td>${esc(x.source)}</td><td>${x.n}</td><td>${x.retained} retained</td><td style="text-align:right">${x.n ? Math.round((x.retained / x.n) * 100) : 0}% conversion</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:18px">No data yet.</div>'}</div></div>
      <div class="card"><div class="card-h"><h3>Won revenue by month</h3></div><div class="card-b">${months.length ? `<div class="chart" style="height:160px">${months.map((m) => `<div style="height:${(+m.v / mmax) * 100}%" data-tip="${monthLabel(m.m)}: ${money(m.v)}"></div>`).join('')}</div>` : '<div class="empty" style="padding:18px">No won deals yet.</div>'}</div></div>
      <div class="card"><div class="card-h"><h3>Activities by type</h3></div><div class="card-b funnel">${Object.keys(at).length ? Object.entries(at).map(([k, v]) => `<div><div class="lbl"><span>${ACT_LABEL[k] || k}</span><b>${v}</b></div>${bar(v, amax, 'var(--gold)')}</div>`).join('') : '<div class="empty" style="padding:18px">No activities logged.</div>'}</div></div>
      <div class="card"><div class="card-h"><h3>Team activity</h3></div><div class="table-wrap">${(s.activity_by_user || []).length ? `<table class="t"><tbody>${s.activity_by_user.map((x) => `<tr><td>${esc(staffName(x.user))}</td><td style="text-align:right">${x.n} activities</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:18px">No activities logged.</div>'}</div></div>
      <div class="card"><div class="card-h"><h3>Cases by status</h3></div><div class="table-wrap"><table class="t"><tbody>${Object.entries(s.cases_by_status || {}).map(([k, v]) => `<tr><td>${esc(CASE_LABEL[k] || k)}</td><td style="text-align:right">${v}</td></tr>`).join('') || '<tr><td>No cases yet.</td></tr>'}</tbody></table></div></div>
    </div>`;
}
