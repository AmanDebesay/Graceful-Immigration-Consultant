import { db, state, esc, icon, ROLE_LABEL, roleBadge, initials, modal, confirmBox, toast, fail, rpc, callFn, loadStaff, fmtDate } from '../core.js';

const STAFF_ROLES = ['owner', 'rcic', 'case_manager', 'bookkeeper', 'assistant'];
const EDITABLE_ROLES = ['rcic', 'case_manager', 'bookkeeper', 'assistant'];

export async function render(el) {
  const isOwner = state.profile.role === 'owner';
  const [people, perms, rolePerms] = await Promise.all([
    db.from('profiles').select('*').order('role').order('full_name'),
    db.from('permissions').select('*').order('category'),
    db.from('role_permissions').select('*'),
  ]);
  const has = new Set((rolePerms.data || []).map((r) => `${r.role}:${r.permission}`));
  const staff = (people.data || []).filter((p) => p.role !== 'client');
  const clients = (people.data || []).filter((p) => p.role === 'client');

  el.innerHTML = `
    <div class="toolbar"><div class="grow"></div><button class="btn btn-primary" id="invite">${icon('plus')} Invite team member</button></div>
    <div class="card" style="margin-bottom:18px"><div class="card-h"><h3>Team members</h3><small style="color:var(--muted)">${staff.length} people</small></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Job title</th><th>Status</th><th>Since</th><th></th></tr></thead><tbody>
      ${staff.map((p) => `<tr><td><div class="cell-name"><span class="avatar sm">${esc(initials(p.full_name || p.email))}</span><div><b>${esc(p.full_name || '—')}</b><span>${esc(p.email)}</span></div></div></td>
        <td>${roleBadge(p.role)}</td><td>${esc(p.job_title || '—')}</td>
        <td>${p.active ? '<span class="badge b-GREEN">Active</span>' : '<span class="badge">Deactivated</span>'}</td><td>${fmtDate(p.created_at)}</td>
        <td style="text-align:right">${p.id !== state.profile.id ? `<button class="btn btn-sm" data-edit="${p.id}">Change access</button>` : '<small style="color:var(--muted)">You</small>'}</td></tr>`).join('')}
      </tbody></table></div></div>

    <div class="card" style="margin-bottom:18px"><div class="card-h"><h3>What each role can do</h3>
      <small style="color:var(--muted)">${isOwner ? 'Tick to grant. Owners always have full access.' : 'Only an owner can change these.'}</small></div>
      <div class="table-wrap"><table class="t perm-table"><thead><tr><th>Permission</th>${EDITABLE_ROLES.map((r) => `<th>${ROLE_LABEL[r]}</th>`).join('')}</tr></thead><tbody>
      ${(perms.data || []).map((p) => `<tr><td><b>${esc(p.label)}</b><br><small style="color:var(--muted)">${esc(p.category)}</small></td>
        ${EDITABLE_ROLES.map((r) => `<td><input type="checkbox" data-role="${r}" data-perm="${p.key}" ${has.has(`${r}:${p.key}`) ? 'checked' : ''} ${isOwner ? '' : 'disabled'} aria-label="${esc(ROLE_LABEL[r] + ': ' + p.label)}"></td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>

    <div class="card"><div class="card-h"><h3>Client portal accounts</h3><small style="color:var(--muted)">${clients.length} clients</small></div>
      ${clients.length ? `<div class="table-wrap"><table class="t"><tbody>${clients.map((p) => `<tr><td>${esc(p.full_name)}</td><td>${esc(p.email)}</td>
        <td>${p.active ? '<span class="badge b-GREEN">Active</span>' : '<span class="badge">Deactivated</span>'}</td>
        <td style="text-align:right"><button class="btn btn-sm" data-edit="${p.id}">Change access</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty" style="padding:28px">No client accounts yet. Invite a client with the role “Client” to give them portal access.</div>'}</div>`;

  el.querySelectorAll('input[data-perm]').forEach((cb) => (cb.onchange = async () => {
    try { await rpc('set_role_permission', { p_role: cb.dataset.role, p_permission: cb.dataset.perm, p_enabled: cb.checked }); toast('Permission updated'); }
    catch (e) { cb.checked = !cb.checked; fail(e); }
  }));

  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const p = people.data.find((x) => x.id === b.dataset.edit);
    const roles = p.role === 'client' ? ['client', ...STAFF_ROLES] : [...STAFF_ROLES, 'client'];
    modal({
      title: `Access for ${p.full_name || p.email}`,
      body: `<div class="field"><label>Role</label><select class="input" id="r">${roles.filter((r) => isOwner || r !== 'owner')
        .map((r) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>
        <label class="row" style="gap:8px"><input type="checkbox" id="act" ${p.active ? 'checked' : ''}> Account active (untick to block sign-in)</label>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const role = m.querySelector('#r').value, active = m.querySelector('#act').checked;
        if (!active && !(await confirmBox('Deactivate account', `${p.full_name || p.email} will no longer be able to sign in.`, 'Deactivate', true))) return false;
        await rpc('set_user_access', { p_user: p.id, p_role: role, p_active: active });
        toast('Access updated'); await loadStaff(); render(el);
      } }],
    });
  }));

  el.querySelector('#invite').onclick = () => modal({
    title: 'Invite team member',
    body: `<p style="color:var(--muted);margin-bottom:14px">They'll get an email with a link to set their password.</p>
      <div class="field"><label>Full name</label><input class="input" id="n"></div>
      <div class="field"><label>Email (staff must use a company address)</label><input class="input" id="e" type="email" placeholder="name@gracefulimmigration.ca"></div>
      <div class="row-2"><div class="field"><label>Role</label><select class="input" id="r">${[...STAFF_ROLES, 'client'].filter((r) => isOwner || r !== 'owner')
        .map((r) => `<option value="${r}" ${r === 'assistant' ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></div>
      <div class="field"><label>Job title (optional)</label><input class="input" id="j"></div></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Send invite', cls: 'btn-primary', onClick: async (m) => {
      await callFn('invite-user', { full_name: m.querySelector('#n').value, email: m.querySelector('#e').value, role: m.querySelector('#r').value, job_title: m.querySelector('#j').value });
      toast('Invitation sent'); await loadStaff(); render(el);
    } }],
  });
}
