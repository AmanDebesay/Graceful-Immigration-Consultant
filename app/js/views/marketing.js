// Marketing: the content plan (ideas → editing → RCIC approval → posted), the posting target, results per post,
// and how many calls/leads marketing brought in. Lead numbers are counts only: no names or phone numbers.
import { db, state, can, esc, icon, modal, toast, fail, fmtDate, confirmBox, staffName } from '../core.js';
import { SOURCE_LABEL, CAT_LABEL, abDate } from '../calls-common.js';

const PLATFORMS = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'WhatsApp status', 'LinkedIn', 'Website'];
const KINDS = [['video', 'Video'], ['reel', 'Reel / short'], ['post', 'Post'], ['story', 'Story'], ['graphic', 'Graphic / flyer'], ['live', 'Live'], ['other', 'Other']];
const ST = { idea: ['Idea', ''], editing: ['Editing', 'b-blue'], for_approval: ['Waiting for RCIC approval', 'b-gold'], approved: ['Approved: ready to post', 'b-navy'], posted: ['Posted', 'b-GREEN'], rejected: ['Changes needed', 'b-RED'] };
const badge = (s) => `<span class="badge ${ST[s]?.[1] || ''}">${ST[s]?.[0] || esc(s)}</span>`;
const CSS = `<style>
.mk-top{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.mk-k{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.mk-k b{display:block;font-size:26px;color:var(--navy,#0B2A5C);line-height:1.1}.mk-k span{font-size:12.5px;color:var(--muted)}
.mk-bar{height:8px;border-radius:6px;background:#EEF0F5;overflow:hidden;margin-top:6px}.mk-bar i{display:block;height:100%;background:linear-gradient(90deg,#EDBE55,#D19A2E)}
.mk-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px}@media (max-width:1000px){.mk-grid{grid-template-columns:1fr}}
.mk-plat{display:flex;flex-wrap:wrap;gap:6px}.mk-plat label{display:flex;gap:5px;align-items:center;font-size:13.5px;border:1px solid var(--line);border-radius:8px;padding:5px 8px}
.mk-rules li{margin:0 0 6px 18px;font-size:13.5px}
</style>`;

const periodStart = (period) => {
  const t = new Date(abDate() + 'T12:00:00');
  if (period === 'day') return abDate(t);
  if (period === 'month') return abDate(t).slice(0, 8) + '01';
  const dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); return t.toLocaleDateString('en-CA'); // week starts Monday
};

export async function render(el, _p, { setTitle } = {}) {
  let filter = 'active', days = 30, ovDays = 7;
  let tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') === 'calls' ? 'calls' : 'content';
  const editor = can('marketing.edit') || can('marketing.approve'), approver = can('marketing.approve');
  el.innerHTML = `${CSS}<div class="toolbar"><div class="seg" id="mt"><button data-k="content">Content plan</button><button data-k="calls">Calls overview</button></div><span id="ctools"><div class="seg" id="f"><button data-k="active">In progress</button><button data-k="for_approval">Needs approval</button><button data-k="posted">Posted</button><button data-k="all">All</button></div>
    </span><span id="otools"><div class="seg" id="ov">${[[1, 'Today'], [2, 'Yesterday + today'], [7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '12 months']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div></span>
    <div class="grow"></div>${editor ? `<button class="btn btn-primary" id="new">${icon('plus')} New content</button>` : ''}</div><div id="body"><div class="loading"><div class="spin"></div></div></div>`;
  el.querySelector('#f').onclick = (e) => { if (e.target.dataset.k) { filter = e.target.dataset.k; draw(); } };
  el.querySelector('#mt').onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; draw(); } };
  el.querySelector('#ov').onclick = (e) => { if (e.target.dataset.k) { ovDays = Number(e.target.dataset.k); overview(); } };
  el.querySelector('#new')?.addEventListener('click', () => editPost({ kind: 'video', status: 'idea', platforms: ['TikTok', 'Instagram', 'Facebook'] }));
  let posts = [], org = {}, stats = null;

  async function load() {
    const from = abDate(Date.now() - (days - 1) * 864e5), to = abDate();
    const [p, o, s] = await Promise.all([db.from('content_posts').select('*').order('created_at', { ascending: false }).limit(500),
      db.from('org_settings').select('content_target, content_target_period').eq('id', 1).single(),
      db.rpc('call_stats', { p_from: from, p_to: to })]);
    if (p.error) { el.querySelector('#body').innerHTML = `<div class="alert err">${esc(p.error.message)}</div>`; return; }
    posts = p.data || []; org = o.data || {}; stats = s.error ? null : s.data;
    draw();
  }

  function draw() {
    el.querySelectorAll('#mt button').forEach((b) => b.classList.toggle('on', b.dataset.k === tab));
    el.querySelector('#ctools').hidden = tab !== 'content'; el.querySelector('#otools').hidden = tab !== 'calls';
    const nb = el.querySelector('#new'); if (nb) nb.hidden = tab !== 'content';
    if (tab === 'calls') return overview();
    el.querySelectorAll('#f button').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    const target = Number(org.content_target) || 3, per = org.content_target_period || 'week', start = periodStart(per);
    const postedNow = posts.filter((x) => x.status === 'posted' && x.posted_at && abDate(x.posted_at) >= start && ['video', 'reel', 'live'].includes(x.kind)).length;
    const waiting = posts.filter((x) => x.status === 'for_approval').length, ready = posts.filter((x) => x.status === 'approved').length;
    const views30 = posts.filter((x) => x.status === 'posted' && x.posted_at && Date.now() - +new Date(x.posted_at) < 30 * 864e5).reduce((a, x) => a + (Number(x.views) || 0), 0);
    const list = posts.filter((x) => filter === 'all' ? true : filter === 'active' ? !['posted'].includes(x.status) : x.status === filter)
      .sort((a, b) => String(a.planned_on || a.created_at).localeCompare(String(b.planned_on || b.created_at)) * (filter === 'posted' ? -1 : 1));
    const perL = { day: 'today', week: 'this week', month: 'this month' }[per];
    const st = stats || {}, cat = st.by_category || {};
    el.querySelector('#body').innerHTML = `<div class="mk-top">
        <div class="mk-k"><b>${postedNow} / ${target}</b><span>Videos posted ${perL}</span><div class="mk-bar"><i style="width:${Math.min(100, postedNow / target * 100)}%"></i></div>
          ${approver ? `<button class="btn btn-sm" id="tgt" style="margin-top:8px">Change target</button>` : ''}</div>
        <div class="mk-k"><b>${waiting}</b><span>Waiting for RCIC approval</span></div><div class="mk-k"><b>${ready}</b><span>Approved, ready to post</span></div>
        <div class="mk-k"><b>${views30.toLocaleString()}</b><span>Views in the last 30 days</span></div>
        ${stats ? `<div class="mk-k"><b>${st.total ?? 0}</b><span>Calls in the last ${days} days</span></div><div class="mk-k"><b>${(cat.potential || 0) + (cat.booked || 0) + (cat.paying || 0)}</b><span>Real leads (potential + booked + paying)</span></div>` : ''}
      </div>
      <div class="mk-grid"><div class="card"><div class="table-wrap">${list.length ? `<table class="t"><thead><tr><th>Planned</th><th>Content</th><th>Status</th><th>Results</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr><td style="white-space:nowrap">${x.planned_on ? esc(fmtDate(x.planned_on)) : '—'}${x.posted_at ? `<small style="display:block;color:var(--muted)">posted ${esc(fmtDate(x.posted_at))}</small>` : ''}</td>
          <td><b>${esc(x.title)}</b><small style="display:block;color:var(--muted)">${esc(KINDS.find(([k]) => k === x.kind)?.[1] || x.kind)} · ${esc((x.platforms || []).join(', ') || 'no platform')} · ${esc(staffName(x.assignee_id) || '')}</small>
            ${x.status === 'rejected' && x.review_note ? `<small style="display:block;color:#B42318">RCIC: ${esc(x.review_note)}</small>` : ''}</td>
          <td>${badge(x.status)}</td>
          <td style="font-size:13px">${x.status === 'posted' ? `${x.views ?? '—'} views · ${x.likes ?? '—'} likes${x.comments != null ? ` · ${x.comments} comments` : ''}${x.leads != null ? `<br><b>${x.leads}</b> enquiries` : ''}` : ''}</td>
          <td style="text-align:right;white-space:nowrap">${approver && x.status === 'for_approval' ? `<button class="btn btn-sm btn-primary" data-ok="${x.id}">${icon('check')} Approve</button> ` : ''}<button class="btn btn-sm" data-e="${x.id}">Open</button></td></tr>`).join('')}
        </tbody></table>` : `<div class="empty">${icon('video')}<div>Nothing here yet.${editor ? ' Click <b>New content</b> to plan a video or post.' : ''}</div></div>`}</div></div>
        <div>
          ${stats ? `<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Calls by source (last ${days} days)</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Source</th><th>Calls</th><th>Leads</th><th>Paying</th></tr></thead><tbody>
            ${(st.by_source || []).map((r) => `<tr><td>${esc(SOURCE_LABEL[r.source] || r.source)}</td><td>${r.total}</td><td>${r.potential + r.booked + r.paying}</td><td>${r.paying}</td></tr>`).join('') || '<tr><td colspan="4" class="dk-muted">No calls logged yet.</td></tr>'}</tbody></table></div>
            <div class="card-b" style="font-size:12.5px;color:var(--muted)">${Object.entries(cat).map(([k, v]) => `${esc(CAT_LABEL[k] || k)}: <b>${v}</b>`).join(' · ')}<br>Counts only. Callers’ names and numbers stay private (CICC confidentiality).</div></div>` : ''}
          <div class="card"><div class="card-h"><h3>Before anything is posted</h3></div><div class="card-b"><ul class="mk-rules">
            <li>The RCIC approves every video and post first (CICC advertising rules). Send it with <b>Ask for approval</b>.</li>
            <li>Accurate information only. Never promise approval, results or processing times.</li>
            <li>No client names, faces, documents, stories or testimonials without the client’s written consent.</li>
            <li>Show “Aman Debesay, RCIC-IRB · CICC licence R1056136” where the platform allows (bio, caption or end screen).</li>
            <li>Point people to the booking page <b>gracefulimmigration.ca/public/book.html</b> and the phone line for that platform.</li>
            <li>Business social accounts belong to Graceful Immigration: use page roles (Meta Business Suite, TikTok Business), never the owner’s password.</li></ul></div></div>
        </div></div>`;
    const b = el.querySelector('#body');
    b.querySelector('#tgt')?.addEventListener('click', target_);
    b.querySelectorAll('[data-e]').forEach((x) => (x.onclick = () => editPost(posts.find((p) => p.id === x.dataset.e))));
    b.querySelectorAll('[data-ok]').forEach((x) => (x.onclick = () => decide(posts.find((p) => p.id === x.dataset.ok), true)));
  }

  // ── Where the calls came from: counts only (no names or numbers), so the marketing team can see it too ──
  async function overview() {
    el.querySelectorAll('#ov button').forEach((b) => b.classList.toggle('on', Number(b.dataset.k) === ovDays));
    const body = el.querySelector('#body');
    body.innerHTML = '<div class="loading"><div class="spin"></div></div>';
    const from = abDate(Date.now() - (ovDays - 1) * 864e5), to = abDate();
    const { data: s, error } = await db.rpc('call_stats', { p_from: from, p_to: to });
    if (error) { body.innerHTML = `<div class="alert err">${esc(error.message)}</div>`; return; }
    const cat = s.by_category || {}, leads = (cat.potential || 0) + (cat.booked || 0) + (cat.paying || 0);
    const bar = (v, max, color = 'linear-gradient(90deg,#EDBE55,#D19A2E)') => `<div style="height:9px;border-radius:5px;background:#EEF0F5;min-width:80px"><div style="height:9px;border-radius:5px;width:${max ? v / max * 100 : 0}%;background:${color}"></div></div>`;
    const maxSrc = Math.max(1, ...(s.by_source || []).map((r) => r.total)), maxC = Math.max(1, ...(s.by_country || []).map((r) => r.total));
    const hours = Array.from({ length: 24 }, (_, h) => (s.by_hour || []).find((x) => x.h === h) || { h, total: 0, answered: 0, missed: 0 });
    const used = hours.filter((h) => h.total), lo = Math.min(7, ...used.map((h) => h.h)), hi = Math.max(19, ...used.map((h) => h.h)), maxH = Math.max(1, ...hours.map((h) => h.total));
    const days = s.by_day || [], maxD = Math.max(1, ...days.map((d) => d.total));
    const K = [[s.total, 'Calls in'], [s.people, 'Different people'], [s.answered, 'Answered'], [s.missed, 'Missed'], [cat.just_asking || 0, 'Just asking'],
      [cat.potential || 0, 'Potential clients'], [cat.booked || 0, 'Booked consultation'], [cat.paying || 0, 'Paying clients'], [leads, 'Real leads (potential + booked + paying)'],
      [cat.unreviewed || 0, 'Not sorted yet'], [(cat.spam || 0) + (cat.wrong_number || 0) + (cat.personal || 0), 'Spam / not leads']];
    const vbars = (items, label) => `<div style="display:flex;align-items:flex-end;gap:3px;height:140px;padding-top:6px">${items.map((x) => `<div title="${esc(x.title)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:10px;color:var(--muted);min-width:0">
        <i style="display:block;width:100%;height:${x.missed / x.max * 110}px;background:#E7A39B;border-radius:${x.answered ? '0' : '4px 4px 0 0'}"></i><i style="display:block;width:100%;height:${x.answered / x.max * 110}px;background:#C9962B;border-radius:4px 4px 0 0"></i>
        <span style="white-space:nowrap;overflow:hidden">${esc(label(x))}</span></div>`).join('')}</div>`;
    body.innerHTML = `<div class="mk-top">${K.map(([v, l]) => `<div class="mk-k"><b>${v ?? 0}</b><span>${l}</span></div>`).join('')}</div>
      ${!s.total ? '<div class="alert info">No calls in this period yet.</div>' : `<div class="mk-grid" style="margin-bottom:14px">
        <div class="card"><div class="card-h"><h3>Where the calls came from</h3><small class="dk-muted">How callers heard about us</small></div><div class="table-wrap"><table class="t"><thead><tr><th>Source</th><th>Calls</th><th>Missed</th><th>Just asking</th><th>Leads</th><th>Paying</th><th></th></tr></thead><tbody>
          ${(s.by_source || []).map((r) => `<tr><td><b>${esc(SOURCE_LABEL[r.source] || r.source)}</b></td><td>${r.total}</td><td>${r.missed}</td><td>${r.just_asking}</td><td>${r.potential + r.booked + r.paying}</td><td>${r.paying}</td><td>${bar(r.total, maxSrc)}</td></tr>`).join('')}</tbody></table></div>
          ${(s.by_source || []).some((r) => r.source === 'unknown') ? '<div class="card-b" style="font-size:12.5px;color:var(--muted)">“Not asked yet” means nobody asked the caller how they heard about us. Asking every caller makes this table useful.</div>' : ''}</div>
        <div class="card"><div class="card-h"><h3>Calls by country</h3><small class="dk-muted">From the caller’s number</small></div><div class="table-wrap"><table class="t"><thead><tr><th>Country</th><th>Calls</th><th>Missed</th><th>Leads</th><th></th></tr></thead><tbody>
          ${(s.by_country || []).map((r) => `<tr><td><b>${esc(r.country)}</b></td><td>${r.total}</td><td>${r.missed}</td><td>${r.leads}</td><td>${bar(r.total, maxC)}</td></tr>`).join('')}</tbody></table></div></div></div>
      <div class="mk-grid"><div class="card"><div class="card-h"><h3>Calls by hour (Alberta time)</h3><small class="dk-muted"><span style="color:#C9962B">■</span> answered <span style="color:#E7A39B">■</span> missed</small></div><div class="card-b">
          ${vbars(hours.slice(lo, hi + 1).map((h) => ({ ...h, max: maxH, title: `${h.total} calls: ${h.answered} answered, ${h.missed} missed` })), (h) => `${h.h % 12 || 12}${h.h < 12 ? 'a' : 'p'}`)}
          <p class="dk-muted" style="font-size:12.5px;margin-top:8px">Calls come soon after a post goes up. Post when someone can answer, and staff the busiest hours.</p></div></div>
        <div class="card"><div class="card-h"><h3>Calls by day</h3></div><div class="card-b">
          ${vbars(days.slice(-31).map((d) => ({ ...d, max: maxD, title: `${d.day}: ${d.total} calls, ${d.missed} missed` })), (d) => d.day.slice(8))}</div></div></div>`}
      <p class="dk-muted" style="font-size:12.5px;margin-top:10px">Counts only: callers’ names and numbers stay private (CICC confidentiality).${can('crm.view') ? ' The full list is in <a href="#/calls">Call Log</a>.' : ''}</p>`;
  }

  function target_() {
    modal({ title: 'Content target', body: `<div class="row-2"><div class="field"><label>At least this many videos</label><input class="input" id="n" type="number" min="1" value="${Number(org.content_target) || 3}"></div>
      <div class="field"><label>Per</label><select class="input" id="p">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<option value="${k}" ${org.content_target_period === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async (m) => {
        const row = { content_target: Math.max(1, Number(m.querySelector('#n').value) || 3), content_target_period: m.querySelector('#p').value };
        const { error } = await db.from('org_settings').update(row).eq('id', 1); if (error) throw error; Object.assign(org, row); toast('Target saved'); draw(); } }] });
  }

  async function decide(x, ok, note = null) {
    const { error } = await db.from('content_posts').update(ok ? { status: 'approved', approved_by: state.profile.id, approved_at: new Date().toISOString(), review_note: note }
      : { status: 'rejected', review_note: note, approved_by: null, approved_at: null }).eq('id', x.id);
    if (error) return fail(error);
    toast(ok ? 'Approved: ready to post' : 'Sent back with your note'); load();
  }

  function editPost(x) {
    const locked = !editor;
    const n = (k) => `<div class="field"><label>${k[1]}</label><input class="input" type="number" min="0" id="m-${k[0]}" value="${esc(x[k[0]] ?? '')}"></div>`;
    modal({ title: x.id ? x.title : 'New content',
      body: `<div class="field"><label>Title / idea</label><input class="input" id="t" value="${esc(x.title || '')}" placeholder="e.g. 3 mistakes in refugee claims"></div>
        <div class="row-2"><div class="field"><label>Type</label><select class="input" id="k">${KINDS.map(([k, l]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Planned for</label><input class="input" type="date" id="d" value="${esc(x.planned_on || '')}"></div></div>
        <div class="field"><label>Platforms</label><div class="mk-plat">${PLATFORMS.map((p) => `<label><input type="checkbox" data-pl="${esc(p)}" ${(x.platforms || []).includes(p) ? 'checked' : ''}> ${esc(p)}</label>`).join('')}</div></div>
        <div class="field"><label>Caption / script</label><textarea class="input" id="c" rows="4">${esc(x.caption || '')}</textarea></div>
        <div class="field"><label>Draft file link (Google Drive, Canva, OneDrive…)</label><input class="input" id="dl" value="${esc(x.draft_link || '')}" placeholder="https://…"></div>
        ${x.draft_link ? `<p style="margin:-4px 0 10px"><a href="${esc(x.draft_link)}" target="_blank" rel="noopener">${icon('external')} Open the draft</a></p>` : ''}
        ${['approved', 'posted'].includes(x.status) ? `<div class="row-2"><div class="field"><label>Posted on</label><input class="input" type="date" id="pa" value="${esc(x.posted_at ? abDate(x.posted_at) : '')}"></div>
            <div class="field"><label>Links to the post (one per line)</label><textarea class="input" id="pu" rows="2">${esc(x.post_urls || '')}</textarea></div></div>
          <div class="row-2">${n(['views', 'Views'])}${n(['likes', 'Likes'])}</div><div class="row-2">${n(['comments', 'Comments'])}${n(['shares', 'Shares'])}</div>
          <div class="row-2">${n(['new_followers', 'New followers'])}${n(['leads', 'Enquiries (calls, DMs) it brought'])}</div>` : ''}
        <div class="field"><label>Notes</label><textarea class="input" id="nt" rows="2">${esc(x.notes || '')}</textarea></div>
        <p class="dk-muted" style="font-size:12.5px">Status: ${badge(x.status || 'idea')}${x.approved_by ? ` · approved by ${esc(staffName(x.approved_by))}` : ''}${x.review_note ? `<br>RCIC note: ${esc(x.review_note)}` : ''}</p>`,
      actions: locked ? [{ label: 'Close' }] : [
        ...(x.id && (approver || (x.created_by === state.profile.id && x.status !== 'posted')) ? [{ label: 'Delete', cls: 'btn-danger', onClick: async () => {
          if (!(await confirmBox('Delete', `Delete “${x.title}”?`, 'Delete', true))) return false;
          const { error } = await db.from('content_posts').delete().eq('id', x.id); if (error) throw error; toast('Deleted'); load(); } }] : []),
        ...(approver && x.id && x.status === 'for_approval' ? [{ label: 'Needs changes', onClick: async (m) => { const note = prompt('What should be changed?'); if (note === null) return false; await save(m, null); await decide(x, false, note); } },
          { label: 'Approve', cls: 'btn-gold', onClick: async (m) => { await save(m, null); await decide(x, true); } }] : []),
        ...(['idea', 'editing', 'rejected'].includes(x.status || 'idea') ? [{ label: 'Ask for approval', cls: 'btn-gold', onClick: (m) => save(m, 'for_approval') }] : []),
        ...(x.status === 'approved' ? [{ label: 'Mark posted', cls: 'btn-gold', onClick: (m) => save(m, 'posted') }] : []),
        { label: 'Save', cls: 'btn-primary', onClick: (m) => save(m, x.status === 'idea' && x.id ? 'editing' : null) }],
    });
    async function save(m, status) {
      const v = (q) => m.querySelector(q)?.value.trim() ?? '';
      const row = { title: v('#t'), kind: v('#k'), planned_on: v('#d') || null, caption: v('#c') || null, draft_link: v('#dl') || null, notes: v('#nt') || null,
        platforms: [...m.querySelectorAll('[data-pl]:checked')].map((i) => i.dataset.pl) };
      if (!row.title) throw new Error('Give it a title.');
      if (row.draft_link && !/^https?:\/\//i.test(row.draft_link)) throw new Error('The draft link must start with https://');
      if (m.querySelector('#pa')) {
        Object.assign(row, { post_urls: v('#pu') || null, posted_at: v('#pa') ? new Date(v('#pa') + 'T12:00:00').toISOString() : null });
        ['views', 'likes', 'comments', 'shares', 'new_followers', 'leads'].forEach((k) => { const s = v('#m-' + k); row[k] = s === '' ? null : Number(s); });
      }
      if (status) row.status = status;
      if (status === 'posted' && !row.posted_at) row.posted_at = new Date().toISOString();
      const { error } = x.id ? await db.from('content_posts').update(row).eq('id', x.id) : await db.from('content_posts').insert({ ...row, status: status || 'idea' });
      if (error) throw error;
      toast(status === 'for_approval' ? 'Sent to the RCIC for approval' : status === 'posted' ? 'Marked as posted' : 'Saved'); load();
    }
  }

  setTitle?.('Marketing');
  load();
}
