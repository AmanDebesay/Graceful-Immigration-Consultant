import { db, state, can, esc, icon, fmtDate, timeAgo, triageBadge, priorityBadge, STAGES, rpc, today } from '../core.js';

export async function render(el) {
  const stats = await rpc('dashboard_stats');
  const first = (state.profile.full_name || '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const [urgent, tasks, recent] = await Promise.all([
    can('intake.view')
      ? db.from('intake_submissions').select('id, triage_level, created_at, status, contacts(full_name)').in('status', ['new', 'in_review']).order('created_at', { ascending: false }).limit(6)
      : { data: [] },
    db.from('tasks').select('id, title, due_date, priority, contact_id, contacts(full_name)').eq('done', false).eq('assigned_to', state.profile.id).order('due_date', { ascending: true, nullsFirst: false }).limit(7),
    can('crm.view') ? db.from('contacts').select('id, full_name, stage, created_at, priority').order('created_at', { ascending: false }).limit(5) : { data: [] },
  ]);

  const kpi = (label, value, ico, cls, sub, href) => value === null || value === undefined ? '' : `
    <a class="card kpi" href="${href}"><div class="kpi-ico ${cls}">${icon(ico)}</div>
    <div><small>${label}</small><b>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div></a>`;

  // 30-day assessments chart
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000); days.push(d.toLocaleDateString('en-CA')); }
  const byDay = Object.fromEntries((stats.assessments_30d || []).map((x) => [x.day, x.n]));
  const max = Math.max(1, ...days.map((d) => byDay[d] || 0));
  const chart = days.map((d) => `<div style="height:${((byDay[d] || 0) / max) * 100}%" data-tip="${fmtDate(d, { month: 'short', day: 'numeric' })}: ${byDay[d] || 0}"></div>`).join('');

  const pipe = stats.pipeline || {};
  const pipeMax = Math.max(1, ...STAGES.map(([k]) => pipe[k] || 0));

  el.innerHTML = `
    <div class="welcome">
      <svg class="leaf svg" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 1.5l1.9 3.8 1.9-1-.7 4.8 3.1-2.9 1 1.9 3.4-.5-1.4 3.8 1.9 1-5.3 3.8 1 1.9-5.8-1v7.2h-1.9v-7.2l-5.8 1 1-1.9L1.9 13l1.9-1-1.4-3.8 3.4.5 1-1.9 3.1 2.9-.7-4.8 1.9 1z"/></svg>
      <div><h2>${greet}, ${esc(first)}</h2><p>${new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })} · Here's what needs your attention.</p></div>
      <div class="row">
        ${can('intake.view') ? `<a class="btn btn-gold" href="#/assessments/new">${icon('plus')} New assessment</a>` : ''}
        ${can('crm.edit') ? `<a class="btn" href="#/contacts?new=1">${icon('user')} Add contact</a>` : ''}
      </div>
    </div>

    <div class="grid g-4" style="margin-bottom:18px">
      ${kpi('New assessments', stats.new_assessments, 'clipboard', 'gold', 'Waiting for review', '#/assessments')}
      ${kpi('Urgent (RED) open', stats.red_open, 'alert', 'red', 'Deadlines or removal risk', '#/assessments')}
      ${kpi('Open leads', stats.leads_open, 'trend', '', 'In the pipeline', '#/pipeline')}
      ${kpi('Active clients', stats.clients, 'briefcase', 'green', 'Retained', '#/contacts')}
      ${kpi('My open tasks', stats.tasks_open, 'checksq', '', stats.tasks_overdue ? `<span style="color:var(--red)">${stats.tasks_overdue} overdue</span>` : 'All on track', '#/tasks')}
      ${kpi('Newsletter subscribers', stats.subscribers, 'mail', 'gold', 'Opted in', '#/newsletter')}
    </div>

    <div class="grid g-main">
      <div class="grid">
        ${can('intake.view') ? `<div class="card"><div class="card-h"><h3>Assessments — last 30 days</h3><a href="#/assessments" class="btn btn-sm">View all</a></div>
          <div class="card-b"><div class="chart">${chart}</div></div></div>` : ''}
        ${can('intake.view') ? `<div class="card"><div class="card-h"><h3>Waiting for review</h3></div>
          ${(urgent.data || []).length ? `<div class="table-wrap"><table class="t"><tbody>${urgent.data.map((s) => `
            <tr class="click" onclick="location.hash='#/assessments/${s.id}'">
              <td>${triageBadge(s.triage_level)}</td><td><b>${esc(s.contacts?.full_name || '—')}</b></td>
              <td style="color:var(--muted)">${timeAgo(s.created_at)}</td><td style="text-align:right;color:var(--muted)">Review →</td></tr>`).join('')}
            </tbody></table></div>` : `<div class="empty">${icon('check')}<div>No assessments waiting. Nice work.</div></div>`}</div>` : ''}
      </div>
      <div class="grid">
        <div class="card"><div class="card-h"><h3>My tasks</h3><a href="#/tasks" class="btn btn-sm">All tasks</a></div>
          <div class="card-b" style="padding-top:6px;padding-bottom:6px">
          ${(tasks.data || []).length ? tasks.data.map((t) => `
            <div class="check"><div style="flex:1;min-width:0"><div class="title" style="font-weight:600">${esc(t.title)}</div>
              <small style="color:${t.due_date && t.due_date < today() ? 'var(--red)' : 'var(--muted)'}">${t.due_date ? 'Due ' + fmtDate(t.due_date) : 'No due date'}${t.contacts ? ' · ' + esc(t.contacts.full_name) : ''}</small></div>
              ${priorityBadge(t.priority)}</div>`).join('') : '<div class="empty" style="padding:24px">You have no open tasks.</div>'}
          </div></div>
        ${can('crm.view') ? `<div class="card"><div class="card-h"><h3>Pipeline</h3><a href="#/pipeline" class="btn btn-sm">Open board</a></div>
          <div class="card-b funnel">${STAGES.map(([k, l]) => `<div><div class="lbl"><span>${l}</span><b>${pipe[k] || 0}</b></div>
            <div class="bar"><i style="width:${((pipe[k] || 0) / pipeMax) * 100}%"></i></div></div>`).join('')}</div></div>
          <div class="card"><div class="card-h"><h3>Newest contacts</h3></div><div class="card-b" style="padding-top:6px;padding-bottom:6px">
          ${(recent.data || []).map((c) => `<a class="check" href="#/contacts/${c.id}" style="color:inherit"><span class="avatar sm">${esc(c.full_name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>
            <span style="flex:1">${esc(c.full_name)}<br><small style="color:var(--muted)">${timeAgo(c.created_at)}</small></span>${triageBadge(c.priority)}</a>`).join('') || '<div class="empty" style="padding:24px">No contacts yet.</div>'}
          </div></div>` : ''}
      </div>
    </div>`;

  // My-task count may have changed elsewhere
  window.dispatchEvent(new Event('refresh-counts'));
}
