/* ================================================================
   main.js — Core portal logic: routing, dashboard, cases, tasks,
             timer, intake, checklist, inadmissibility, risk score
   ================================================================ */

// ── STATE ────────────────────────────────────────────────────────
const STATE = {
  page: 'dashboard', sidebarCollapsed: false,
  timerRunning: false, timerSec: 0, timerInterval: null,
  cases: [...DATA.cases], tasks: [...DATA.tasks],
  inadmissAnswers: {}, eligAnswers: {},
  consultationSigned: false, serviceSigned: false,
  agreementSigned: false, sigMode: 'type', drawSigSaved: false,
  checkState: {}, checkAppType: 'spousal_spouses',
  rcicName: DATA.company.rcic,
  currentClient: null,   // populated on intake submit
  activityLog: DATA.activity_log ? [...DATA.activity_log] : []
};

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyCompany();
  buildDashboard();
  buildCasesTable();
  buildTasksList();
  buildIntake();
  buildInadmissibility();
  buildRiskScore();
  if (typeof buildDocuments === 'function') buildDocuments();
  showPage('dashboard');
});

function applyCompany() {
  const co = DATA.company;
  document.getElementById('sidebarName').textContent = co.rcic;
  document.getElementById('topbarAvatar').textContent = co.rcic.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase() || 'RC';
  document.querySelector('.user-avatar').textContent = document.getElementById('topbarAvatar').textContent;
}

// ── PAGE ROUTING ─────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  const btn = document.getElementById('nav-' + id);
  if (pg) pg.classList.add('active');
  if (btn) btn.classList.add('active');
  STATE.page = id;
  const titles = {
    dashboard:'Dashboard', calendar:'Calendar', cases:'Cases', tasks:'Tasks',
    intake:'New Intake', checklist:'Document Checklists', agreement:'Agreements',
    inadmiss:'Inadmissibility Checker', notes:'Team Notes', chat:'Team Chat',
    documents:'Documents & PDFs', riskscore:'Audit Risk Score',
    reports:'Reports', activity:'Team Activity Log'
  };
  document.getElementById('topbarTitle').textContent = titles[id] || id;
  if (id === 'dashboard') buildDashboard();
  if (id === 'riskscore') updateRiskScore();
  if (id === 'reports') buildReports();
  if (id === 'activity') buildActivityLog();
  if (id === 'checklist') buildChecklist();
  if (id === 'agreement') buildAgreement();
}

function toggleSidebar() {
  STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', STATE.sidebarCollapsed);
}

// ── TIMER ────────────────────────────────────────────────────────
function toggleTimer() {
  if (STATE.timerRunning) {
    clearInterval(STATE.timerInterval);
    STATE.timerRunning = false;
    document.getElementById('timerBtn').textContent = '▶ Timer';
  } else {
    STATE.timerInterval = setInterval(() => {
      STATE.timerSec++;
      const h = String(Math.floor(STATE.timerSec/3600)).padStart(2,'0');
      const m = String(Math.floor((STATE.timerSec%3600)/60)).padStart(2,'0');
      const s = String(STATE.timerSec%60).padStart(2,'0');
      document.getElementById('timerDisplay').textContent = `${h}:${m}:${s}`;
    }, 1000);
    STATE.timerRunning = true;
    document.getElementById('timerBtn').textContent = '⏸ Timer';
  }
}

// ── GLOBAL SEARCH ────────────────────────────────────────────────
function globalSearch() {
  const q = document.getElementById('globalSearch').value.toLowerCase().trim();
  if (!q) return;
  const match = STATE.cases.find(c =>
    c.id.toLowerCase().includes(q) || c.client.toLowerCase().includes(q));
  if (match) {
    showPage('cases');
    setTimeout(() => filterCases(q), 100);
  }
}

// ── DASHBOARD ────────────────────────────────────────────────────
function buildDashboard() {
  buildStageTracker('stageTrack', 3);
  buildUpcomingTasks();
  buildUpcomingAppts();
  buildOpportunities();
  buildCharts();
  document.getElementById('dashYear').textContent = new Date().getFullYear();
  document.getElementById('kpiActive').textContent = STATE.cases.filter(c => c.status === 'Active' || c.status === 'In Progress').length;
  document.getElementById('kpiTasks').textContent = STATE.tasks.filter(t => t.status !== 'Done').length;
  document.getElementById('upTaskCount').textContent = STATE.tasks.filter(t => t.status !== 'Done').length;
}

function buildStageTracker(containerId, currentStage) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const stages = DATA.case_stages;
  el.innerHTML = stages.map((s, i) => {
    const cls = i < currentStage ? 'done' : i === currentStage ? 'current' : 'pending';
    const line = i < stages.length - 1 ? `<div class="stage-line ${i < currentStage ? 'done' : ''}"></div>` : '';
    return `<div class="stage-item">${line}<div class="stage-dot ${cls}">${i < currentStage ? '✓' : i+1}</div><div class="stage-label">${s}</div></div>`;
  }).join('');
}

function buildUpcomingTasks() {
  const el = document.getElementById('upcomingTasks');
  if (!el) return;
  const pending = STATE.tasks.filter(t => t.status !== 'Done').slice(0, 4);
  if (!pending.length) { el.innerHTML = '<p class="text-muted">No upcoming tasks</p>'; return; }
  el.innerHTML = pending.map(t => {
    const overdue = new Date(t.due) < new Date() && t.status !== 'Done';
    return `<div class="task-row ${overdue ? 'overdue' : ''}">
      <input type="checkbox" onchange="completeTask(${t.id}, this.checked)">
      <div class="task-text">
        <div>${t.title}</div>
        <div class="task-meta">${t.fileId} · ${t.assignedTo}</div>
      </div>
      <span class="badge ${overdue ? 'badge-red' : 'badge-orange'}">${overdue ? 'Overdue' : t.due}</span>
    </div>`;
  }).join('');
}

function buildUpcomingAppts() {
  const el = document.getElementById('upcomingAppts');
  if (!el) return;
  const appts = DATA.events.filter(e => e.type === 'appt').slice(0, 3);
  if (!appts.length) { el.innerHTML = '<p class="text-muted">No upcoming appointments</p>'; return; }
  el.innerHTML = appts.map(e => `
    <div class="task-row">
      <span style="font-size:16px">📅</span>
      <div class="task-text">
        <div>${e.title}</div>
        <div class="task-meta">${e.date} · ${e.time}</div>
      </div>
      <span class="badge badge-blue">${e.fileId || 'General'}</span>
    </div>`).join('');
  document.getElementById('upApptCount').textContent = appts.length;
}

function buildOpportunities() {
  const el = document.getElementById('dashOpportunities');
  if (!el) return;
  el.innerHTML = DATA.opportunity_rules.slice(0,3).map((r, i) => `
    <div class="opp-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div class="opp-title">🔍 ${r.trigger}</div>
          <div class="opp-sub"><strong>Opportunity:</strong> ${r.opportunity}</div>
          <div class="opp-sub"><strong>Action:</strong> ${r.action}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="this.textContent='✓ Flagged';this.disabled=true">Flag</button>
      </div>
    </div>`).join('');
}

function buildCharts() {
  // Case type chart
  const ctx1 = document.getElementById('caseTypeChart');
  if (ctx1 && !ctx1._chartInstance) {
    const types = {};
    STATE.cases.forEach(c => { types[c.type] = (types[c.type]||0)+1; });
    ctx1._chartInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: Object.keys(types).map(t => t.replace(' — ',' ')),
        datasets: [{ data: Object.values(types), backgroundColor: '#1B3A5C', borderRadius: 4 }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, responsive: true }
    });
  }
  // Case status donut
  const ctx2 = document.getElementById('caseStatusChart');
  if (ctx2 && !ctx2._chartInstance) {
    const statuses = {};
    STATE.cases.forEach(c => { statuses[c.status] = (statuses[c.status]||0)+1; });
    const colors = { Active:'#1E8449', 'In Progress':'#E67E22', Submitted:'#1B3A5C', Approved:'#27AE60', Refused:'#C0392B' };
    ctx2._chartInstance = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: Object.keys(statuses),
        datasets: [{ data: Object.values(statuses), backgroundColor: Object.keys(statuses).map(s => colors[s]||'#999'), borderWidth: 2 }]
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, responsive: true }
    });
  }
}

// ── CASES ────────────────────────────────────────────────────────
function buildCasesTable(cases) {
  const el = document.getElementById('casesTable');
  if (!el) return;
  const list = cases || STATE.cases;
  if (!list.length) { el.innerHTML = '<p class="text-muted" style="padding:16px">No cases found.</p>'; return; }
  const statusColors = { Active:'badge-green', 'In Progress':'badge-orange', Submitted:'badge-blue', Approved:'badge-green', Refused:'badge-red', 'On Hold':'badge-gray' };
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>File ID</th><th>Client</th><th>Application type</th><th>Status</th><th>Stage</th><th>Next action</th><th>Due</th><th>Fee</th></tr></thead>
    <tbody>${list.map(c => `<tr>
      <td><a onclick="showPage('checklist')">${c.id}</a></td>
      <td><strong>${c.client}</strong></td>
      <td style="font-size:11px">${c.type}</td>
      <td><span class="badge ${statusColors[c.status]||'badge-gray'}">${c.status}</span></td>
      <td><span class="badge badge-blue">Stage ${c.stage}</span></td>
      <td style="font-size:11px">${c.nextAction}</td>
      <td style="font-size:11px">${c.nextDate}</td>
      <td style="font-size:11px">$${c.collected.toLocaleString()} / $${c.fee.toLocaleString()}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function filterCases(q) { buildCasesTable(STATE.cases.filter(c => c.id.toLowerCase().includes(q.toLowerCase()) || c.client.toLowerCase().includes(q.toLowerCase()))); }
function filterCaseStatus(s) { buildCasesTable(s ? STATE.cases.filter(c => c.status === s) : STATE.cases); }
function filterCaseType(t) { buildCasesTable(t ? STATE.cases.filter(c => c.type.includes(t)) : STATE.cases); }

// ── TASKS ────────────────────────────────────────────────────────
function buildTasksList(tasks) {
  const el = document.getElementById('tasksList');
  if (!el) return;
  const list = tasks || STATE.tasks;
  const priorityColor = { high: 'badge-red', medium: 'badge-orange', low: 'badge-gray' };
  el.innerHTML = list.map(t => `
    <div class="task-row" id="taskrow-${t.id}">
      <input type="checkbox" ${t.status==='Done'?'checked':''} onchange="completeTask(${t.id}, this.checked)">
      <div class="task-text">
        <div style="${t.status==='Done'?'text-decoration:line-through;color:var(--gray-400)':''}">${t.title}</div>
        <div class="task-meta">${t.fileId} · Assigned: ${t.assignedTo}</div>
      </div>
      <span class="badge badge-gray">${t.type}</span>
      <span class="badge ${priorityColor[t.priority]||'badge-gray'}">${t.priority}</span>
      <span class="badge ${t.status==='Done'?'badge-green':new Date(t.due)<new Date()?'badge-red':'badge-orange'}">${t.due}</span>
      <button class="btn btn-sm" onclick="deleteTask(${t.id})">✕</button>
    </div>`).join('');
}

function completeTask(id, done) {
  const t = STATE.tasks.find(t => t.id === id);
  if (t) t.status = done ? 'Done' : 'Pending';
  buildTasksList();
  buildUpcomingTasks();
  document.getElementById('kpiTasks').textContent = STATE.tasks.filter(t => t.status !== 'Done').length;
}

function deleteTask(id) {
  STATE.tasks = STATE.tasks.filter(t => t.id !== id);
  buildTasksList();
}

function filterTasks(type) { buildTasksList(type === 'all' ? STATE.tasks : STATE.tasks.filter(t => t.type === type)); }
function filterTaskStatus(s) { buildTasksList(s ? STATE.tasks.filter(t => t.status === s) : STATE.tasks); }

function openAddTask() {
  document.getElementById('modalTitle').textContent = 'Add New Task';
  document.getElementById('modalBody').innerHTML = `
    <div class="row-2">
      <div><label>Task title</label><input type="text" id="newTaskTitle" placeholder="Task description"></div>
      <div><label>File ID</label><input type="text" id="newTaskFile" placeholder="VIS-2026-AB-WB-001"></div>
    </div>
    <div class="row-3">
      <div><label>Assigned to</label><input type="text" id="newTaskAssign" placeholder="RCIC / Assistant / Client"></div>
      <div><label>Type</label><select id="newTaskType"><option value="rcic">RCIC</option><option value="team">Team</option><option value="client">Client</option></select></div>
      <div><label>Due date</label><input type="date" id="newTaskDue"></div>
    </div>
    <div><label>Priority</label>
      <select id="newTaskPriority"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
    </div>
    <div class="btn-group">
      <button class="btn btn-primary" onclick="saveTask()">Save task</button>
      <button class="btn" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function saveTask() {
  const title = document.getElementById('newTaskTitle')?.value?.trim();
  if (!title) { alert('Please enter a task title'); return; }
  const newTask = {
    id: Date.now(),
    title,
    fileId: document.getElementById('newTaskFile')?.value || '',
    assignedTo: document.getElementById('newTaskAssign')?.value || 'RCIC',
    type: document.getElementById('newTaskType')?.value || 'rcic',
    status: 'Pending',
    due: document.getElementById('newTaskDue')?.value || '',
    priority: document.getElementById('newTaskPriority')?.value || 'medium'
  };
  STATE.tasks.unshift(newTask);
  buildTasksList();
  closeModal();
}

// ── INTAKE ───────────────────────────────────────────────────────
function buildIntake() {
  const el = document.getElementById('intakeContent');
  if (!el) return;
  const appOptions = DATA.application_types.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  const chanOptions = DATA.intake_channels.map(c => `<option value="${c.code}">${c.label}</option>`).join('');
  const provOptions = ['AB','BC','ON','SK','MB','QC','NS','NB','NL','PE'].map(p => `<option value="${p}">${p}</option>`).join('');

  el.innerHTML = `
    <div class="card">
      <div class="card-title">File ID generator</div>
      <div class="row-3">
        <div><label>Province</label><select id="intProv">${provOptions}</select></div>
        <div><label>How found us</label><select id="intChan">${chanOptions}</select></div>
        <div><label>Sequence #</label><input type="number" id="intSeq" value="1" min="1"></div>
      </div>
      <div style="margin-top:10px">
        <label>Generated File ID</label>
        <div style="background:var(--navy);color:var(--gold);padding:10px 16px;border-radius:var(--radius);font-size:20px;font-weight:700;letter-spacing:2px;margin-top:4px;display:flex;align-items:center;justify-content:space-between">
          <span id="previewId">VIS-2026-AB-WB-001</span>
          <button class="btn btn-sm" style="background:rgba(255,255,255,.15);border-color:transparent;color:white" onclick="copyId()">Copy</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Client information</div>
      <div class="row-2">
        <div><label>Application type</label><select id="intType" onchange="updateFee()">${appOptions}</select></div>
        <div><label>Agreed fee (CAD)</label><input type="text" id="intFee" readonly></div>
      </div>
      <div class="divider"></div>
      <div style="font-weight:600;font-size:13px;color:var(--navy);margin-bottom:4px">Sponsor / Principal applicant</div>
      <div class="row-2">
        <div><label>First name</label><input type="text" id="intFirst" placeholder="First name"></div>
        <div><label>Last name</label><input type="text" id="intLast" placeholder="Last name"></div>
      </div>
      <div class="row-3">
        <div><label>Date of birth</label><input type="date" id="intDob"></div>
        <div><label>Phone</label><input type="tel" id="intPhone" placeholder="+1-780-..."></div>
        <div><label>Email</label><input type="email" id="intEmail" placeholder="email@..."></div>
      </div>
      <div class="row-2">
        <div><label>Status in Canada</label>
          <select id="intStatus"><option>Canadian Citizen</option><option>Permanent Resident</option><option>Protected Person</option><option>Other</option></select>
        </div>
        <div><label>Province of residence</label><select id="intProvRes">${provOptions}</select></div>
      </div>
      <div class="divider"></div>
      <div style="font-weight:600;font-size:13px;color:var(--navy);margin-bottom:4px">Sponsored person</div>
      <div class="row-2">
        <div><label>First name</label><input type="text" id="intSpFirst" placeholder="First name"></div>
        <div><label>Last name</label><input type="text" id="intSpLast" placeholder="Last name"></div>
      </div>
      <div class="row-2">
        <div><label>Country of citizenship</label><input type="text" id="intSpCountry" placeholder="Country"></div>
        <div><label>Relationship</label>
          <select id="intRel"><option>Spouse (married)</option><option>Common-law partner</option><option>Conjugal partner</option><option>Dependent child</option></select>
        </div>
      </div>
      <div class="divider"></div>
      <div style="font-weight:600;font-size:13px;color:var(--navy);margin-bottom:4px">Contact & address (sponsor / principal applicant)</div>
      <div><label>Street address</label><input type="text" id="intAddr" placeholder="123 Main St"></div>
      <div class="row-3">
        <div><label>City</label><input type="text" id="intCity" placeholder="City"></div>
        <div><label>Province</label><select id="intProvAddr">${provOptions}</select></div>
        <div><label>Postal code</label><input type="text" id="intPostal" placeholder="T9H 0A1"></div>
      </div>
      <div class="row-2">
        <div><label>Passport number (sponsor)</label><input type="text" id="intPassport" placeholder="AB123456"></div>
        <div><label>Country of citizenship (sponsor)</label><input type="text" id="intCitizenship" placeholder="Canada"></div>
      </div>
      <div class="divider"></div>
      <div><label>Notes</label><textarea id="intNotes" placeholder="Any important notes about this client..."></textarea></div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="submitIntake()">Open case & generate file ID</button>
      </div>
      <div id="intakeOK" class="alert alert-success hidden" style="margin-top:10px"></div>
    </div>`;

  ['intProv','intChan','intSeq'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateFileId);
    if (el) el.addEventListener('input', updateFileId);
  });
  updateFileId();
  updateFee();
}

function updateFileId() {
  const prov = document.getElementById('intProv')?.value || 'AB';
  const chan = document.getElementById('intChan')?.value || 'WB';
  const seq = String(document.getElementById('intSeq')?.value || '1').padStart(3,'0');
  const id = `VIS-${new Date().getFullYear()}-${prov}-${chan}-${seq}`;
  const el = document.getElementById('previewId');
  if (el) el.textContent = id;
}

function updateFee() {
  const type = document.getElementById('intType')?.value;
  const app = DATA.application_types.find(a => a.id === type);
  const el = document.getElementById('intFee');
  if (el && app) el.value = `$${app.fee.toLocaleString()} CAD`;
}

function copyId() {
  const id = document.getElementById('previewId')?.textContent || '';
  navigator.clipboard.writeText(id).then(() => alert('Copied: ' + id));
}

function submitIntake() {
  const first = document.getElementById('intFirst')?.value?.trim();
  const last = document.getElementById('intLast')?.value?.trim();
  if (!first || !last) { alert('Please enter client name'); return; }
  const id = document.getElementById('previewId')?.textContent || '';
  const typeId = document.getElementById('intType')?.value;
  const type = DATA.application_types.find(a => a.id === typeId);
  const today = new Date().toISOString().split('T')[0];

  // Store full client data for auto-fill into agreements
  STATE.currentClient = {
    fileId: id,
    first, last, fullName: `${first} ${last}`,
    dob:         document.getElementById('intDob')?.value || '',
    phone:       document.getElementById('intPhone')?.value || '',
    email:       document.getElementById('intEmail')?.value || '',
    statusCA:    document.getElementById('intStatus')?.value || '',
    addr:        document.getElementById('intAddr')?.value || '',
    city:        document.getElementById('intCity')?.value || '',
    province:    document.getElementById('intProvAddr')?.value || 'AB',
    postal:      document.getElementById('intPostal')?.value || '',
    country:     'Canada',
    passport:    document.getElementById('intPassport')?.value || '',
    citizenship: document.getElementById('intCitizenship')?.value || '',
    spFirst:     document.getElementById('intSpFirst')?.value || '',
    spLast:      document.getElementById('intSpLast')?.value || '',
    spCountry:   document.getElementById('intSpCountry')?.value || '',
    relationship:document.getElementById('intRel')?.value || '',
    appTypeId:   typeId,
    appTypeLabel:type?.label || '',
    fee:         type?.fee || 0,
    notes:       document.getElementById('intNotes')?.value || '',
    openedDate:  today
  };

  const newCase = {
    id, client: `${first} ${last}`, type: type?.label || 'Unknown',
    status: 'Active', stage: 1, consultant: DATA.company.rcic,
    opened: today, nextAction: 'Initial consultation / sign consultation agreement',
    nextDate: '', fee: type?.fee || 0, collected: 0
  };
  STATE.cases.unshift(newCase);
  // Reset agreement signed state for new case
  STATE.consultationSigned = false;
  STATE.serviceSigned = false;
  STATE.agreementSigned = false;
  // Log activity
  logActivity(`Opened new case ${id} for ${first} ${last}`);
  buildCasesTable();
  document.getElementById('intakeOK').textContent = `✓ Case opened: ${id} for ${first} ${last}. Next: go to Agreements to sign Consultation Agreement.`;
  document.getElementById('intakeOK').classList.remove('hidden');
  document.getElementById('kpiActive').textContent = STATE.cases.filter(c => c.status === 'Active' || c.status === 'In Progress').length;
}

function logActivity(action, fileId) {
  STATE.activityLog.unshift({
    id: Date.now(), member: DATA.company.rcic || 'RCIC', role: 'RCIC',
    action, fileId: fileId || STATE.currentClient?.fileId || '',
    timestamp: new Date().toISOString()
  });
}

// ── CHECKLIST ────────────────────────────────────────────────────
function buildChecklist() {
  const el = document.getElementById('checklistContent');
  if (!el) return;

  // If service agreement not signed, show gate warning
  const gateHtml = !STATE.serviceSigned
    ? `<div class="alert alert-warn" style="margin-bottom:12px">
        ⚠ Service Agreement must be signed before accessing the document checklist.
        <button class="btn btn-sm btn-gold" style="margin-left:12px" onclick="showPage('agreement')">Go to Agreements →</button>
       </div>` : '';

  const appOpts = DATA.application_types.map(t =>
    `<option value="${t.id}" ${STATE.checkAppType === t.id ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  const cl = DATA.checklists[STATE.checkAppType];
  if (!cl) { el.innerHTML = '<p class="text-muted">No checklist found for this application type.</p>'; return; }

  const totalItems = cl.sections.reduce((sum, s) => sum + s.items.length, 0);
  const doneItems = Object.values(STATE.checkState).filter(Boolean).length;
  const pct = totalItems ? Math.round(doneItems / totalItems * 100) : 0;

  el.innerHTML = `
    ${gateHtml}
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div>
          <div class="card-title">Document Checklist — ${cl.title}</div>
          <div class="card-sub">Select the application type to load the correct checklist</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-sm" href="${cl.ircc_link}" target="_blank">IRCC page ↗</a>
          <button class="btn btn-sm btn-primary" onclick="exportChecklistCSV()">Export CSV</button>
          <button class="btn btn-sm" onclick="printChecklist()">Print / PDF</button>
        </div>
      </div>
      <div class="row-2" style="margin-bottom:12px">
        <div>
          <label>Application type</label>
          <select onchange="switchChecklist(this.value)" style="width:100%">${appOpts}</select>
        </div>
        <div>
          <label>Case / File ID</label>
          <input type="text" id="clkFileId" value="${STATE.currentClient?.fileId || ''}" placeholder="VIS-2026-AB-WB-001" readonly>
        </div>
      </div>
      <div style="height:8px;background:var(--gray-200);border-radius:20px;overflow:hidden">
        <div id="clkFill" style="height:100%;background:var(--navy);border-radius:20px;transition:width .4s;width:${pct}%"></div>
      </div>
      <div id="clkLabel" class="text-muted" style="margin-top:4px">${doneItems} of ${totalItems} items ready (${pct}%)</div>
      <div class="alert alert-info" style="margin-top:10px;font-size:11px">★ Required items must be provided. All non-English documents need certified translation. / ናይ ትርጉም ምስ ኩሎም ሰነዳት ዘየድልዩ ኣቕርቡ።</div>
    </div>`;

  STATE.checkState = {};
  cl.sections.forEach((sec, si) => {
    const secDiv = document.createElement('div');
    secDiv.className = 'card';
    secDiv.innerHTML = `
      <div style="background:var(--navy);color:white;padding:8px 14px;border-radius:var(--radius);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:13px;font-weight:600">${sec.title}</div>
          ${sec.ti ? `<div style="font-size:10px;color:var(--gold);margin-top:1px">${sec.ti}</div>` : ''}
        </div>
        <span class="badge badge-gold">${sec.items.length} items</span>
      </div>`;
    sec.items.forEach((item, ii) => {
      const id = `chk_${si}_${ii}`;
      STATE.checkState[id] = false;
      const row = document.createElement('div');
      row.className = 'checklist-item';
      row.id = 'clkrow_' + id;
      row.innerHTML = `
        <input type="checkbox" id="${id}" onchange="toggleCheck('${id}')">
        <div class="item-info">
          <div class="item-en">${item.en}</div>
          ${item.ti ? `<div class="item-ti">${item.ti}</div>` : ''}
          <div class="${item.required ? 'req-required' : 'req-optional'}">${item.required ? '★ Required / ዘድሊ' : '○ If applicable / እንተሃሊዩ'}</div>
        </div>`;
      row.addEventListener('click', e => {
        if (e.target.tagName !== 'INPUT') {
          const cb = document.getElementById(id);
          cb.checked = !cb.checked;
          toggleCheck(id);
        }
      });
      secDiv.appendChild(row);
    });
    el.appendChild(secDiv);
  });
}

function switchChecklist(typeId) {
  STATE.checkAppType = typeId;
  buildChecklist();
}

function exportChecklistCSV() {
  const cl = DATA.checklists[STATE.checkAppType];
  if (!cl) return;
  const rows = [['Section', 'Item (English)', 'Item (Tigrinya)', 'Required', 'Status']];
  cl.sections.forEach((sec, si) => {
    sec.items.forEach((item, ii) => {
      const id = `chk_${si}_${ii}`;
      rows.push([sec.title, item.en, item.ti || '', item.required ? 'Required' : 'If applicable', STATE.checkState[id] ? 'Done' : 'Pending']);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadFile(`checklist_${STATE.checkAppType}.csv`, csv, 'text/csv');
}

function printChecklist() {
  window.print();
}

function toggleCheck(id) {
  STATE.checkState[id] = document.getElementById(id)?.checked || false;
  document.getElementById('clkrow_' + id)?.classList.toggle('done', STATE.checkState[id]);
  const total = Object.keys(STATE.checkState).length;
  const done = Object.values(STATE.checkState).filter(Boolean).length;
  const pct = total ? Math.round(done/total*100) : 0;
  const fill = document.getElementById('clkFill');
  if (fill) fill.style.width = pct + '%';
  const lbl = document.getElementById('clkLabel');
  if (lbl) lbl.textContent = `${done} of ${total} items ready (${pct}%)`;
}

// ── AGREEMENT ────────────────────────────────────────────────────
// ── AGREEMENTS (2-step: Consultation first, then Service) ─────────
function buildAgreement() {
  const el = document.getElementById('agreementContent');
  if (!el) return;
  const co = DATA.company;
  const cl = STATE.currentClient;
  const today = new Date().toISOString().split('T')[0];
  const appOpts = DATA.application_types.map(t =>
    `<option value="${t.id}" ${cl?.appTypeId === t.id ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  // Step indicators
  const step1Done = STATE.consultationSigned;
  const step2Done = STATE.serviceSigned;

  el.innerHTML = `
    <!-- Progress steps -->
    <div class="card" style="padding:16px 20px">
      <div style="display:flex;align-items:center;gap:0">
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="width:32px;height:32px;border-radius:50%;background:${step1Done ? 'var(--green)' : 'var(--navy)'};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${step1Done ? '✓' : '1'}</div>
          <div style="font-size:11px;margin-top:4px;font-weight:600;color:var(--navy)">Consultation Agreement</div>
          <span class="badge ${step1Done ? 'badge-green' : 'badge-orange'}" style="margin-top:3px">${step1Done ? 'Signed' : 'Required first'}</span>
        </div>
        <div style="flex:1;height:2px;background:${step1Done ? 'var(--green)' : 'var(--border)'};margin-top:-18px"></div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="width:32px;height:32px;border-radius:50%;background:${step2Done ? 'var(--green)' : step1Done ? 'var(--navy)' : 'var(--gray-200)'};color:${step1Done||step2Done ? 'white' : 'var(--gray-600)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${step2Done ? '✓' : '2'}</div>
          <div style="font-size:11px;margin-top:4px;font-weight:600;color:var(--navy)">Service Agreement</div>
          <span class="badge ${step2Done ? 'badge-green' : step1Done ? 'badge-orange' : 'badge-gray'}" style="margin-top:3px">${step2Done ? 'Signed' : step1Done ? 'Sign now' : 'Locked'}</span>
        </div>
      </div>
    </div>

    <!-- Auto-fill notice -->
    ${cl ? `<div class="alert alert-success" style="margin-bottom:12px">✓ Client data loaded from intake: <strong>${cl.fullName}</strong> — File: <strong>${cl.fileId}</strong>. All fields auto-filled.</div>`
          : `<div class="alert alert-info" style="margin-bottom:12px">No intake on file. Fill in client details manually, or <button class="btn btn-sm btn-primary" onclick="showPage('intake')">Go to New Intake →</button></div>`}

    <!-- STEP 1: CONSULTATION AGREEMENT -->
    <div id="agStep1" class="${step1Done ? 'hidden' : ''}">
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <div class="card-title">Step 1 — RCIC Initial Consultation Agreement</div>
            <div class="card-sub">Must be signed before the Service Agreement. Auto-filled from intake.</div>
          </div>
          <button class="btn btn-sm" onclick="exportAgreementPDF('consultation')">Print / PDF</button>
        </div>
        <div class="row-3">
          <div><label>Date</label><input type="date" id="ca_date" value="${today}"></div>
          <div><label>File ID</label><input type="text" id="ca_fileId" value="${cl?.fileId || ''}" placeholder="VIS-2026-AB-WB-001"></div>
          <div><label>Consultation fee (CAD)</label><input type="text" id="ca_fee" value="$250 CAD" placeholder="$250 CAD"></div>
        </div>
        <div class="divider"></div>
        <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px">RCIC (Auto-filled from company settings)</div>
        <div class="row-3">
          <div><label>RCIC Full Name</label><input type="text" id="ca_rcicName" value="${co.rcic}" readonly></div>
          <div><label>CICC Licence No.</label><input type="text" id="ca_cicc" value="${co.cicc}" readonly></div>
          <div><label>Province</label><input type="text" id="ca_province" value="" placeholder="Province"></div>
        </div>
        <div class="row-2">
          <div><label>Business Address</label><input type="text" id="ca_addr" value="${co.location}" readonly></div>
          <div><label>Phone</label><input type="text" id="ca_phone" value="${co.phone}" readonly></div>
        </div>
        <div><label>Email</label><input type="text" id="ca_email" value="${co.email}" readonly></div>
        <div class="divider"></div>
        <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px">Client (Auto-filled from intake)</div>
        <div class="row-2">
          <div><label>First Name</label><input type="text" id="ca_first" value="${cl?.first || ''}" placeholder="First name"></div>
          <div><label>Last Name</label><input type="text" id="ca_last" value="${cl?.last || ''}" placeholder="Last name"></div>
        </div>
        <div class="row-3">
          <div><label>Date of Birth</label><input type="date" id="ca_dob" value="${cl?.dob || ''}"></div>
          <div><label>Phone</label><input type="tel" id="ca_cphone" value="${cl?.phone || ''}" placeholder="+1-780-..."></div>
          <div><label>Email</label><input type="email" id="ca_cemail" value="${cl?.email || ''}" placeholder="email@..."></div>
        </div>
        <div><label>Address</label><input type="text" id="ca_caddr" value="${cl ? `${cl.addr}, ${cl.city}, ${cl.province} ${cl.postal}, Canada` : ''}" placeholder="Street, City, Province, Postal Code, Country"></div>
        <div class="divider"></div>
        <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px">Purpose of consultation</div>
        <div><label>Brief description</label>
          <input type="text" id="ca_purpose" value="${cl?.appTypeLabel ? `Initial assessment of eligibility for ${cl.appTypeLabel}` : 'Initial assessment of eligibility for Canadian immigration'}" placeholder="Initial assessment of eligibility...">
        </div>
        <div class="divider"></div>
        <div class="agreement-text">
          <h4>1. Purpose and Scope of Consultation</h4>
          <p>This Agreement is for the purpose of a <strong>one-time initial consultation only</strong>. No immigration application preparation, submission, or ongoing representation is included under this Agreement. Any further services will require a separate written retainer agreement.</p>
          <h4>2. Limited-Scope Service</h4>
          <p>This consultation is limited to providing general information, assessment, and guidance based on the information provided by the Client. The RCIC will not act as the Client's representative before IRCC, IRB, or any other authority under this Agreement.</p>
          <h4>3. No Guarantee of Outcome</h4>
          <p>Opinions provided are based solely on information provided at the time of consultation. The RCIC does <strong>not guarantee</strong> eligibility, approval, processing times, or any particular outcome.</p>
          <h4>4. Consultation Fees</h4>
          <p>The Client agrees to pay the consultation fee noted above. This fee is earned once the consultation has taken place and is <strong>non-refundable</strong>, unless otherwise required by law.</p>
          <h4>5. Confidentiality (Code of Professional Conduct — s.28)</h4>
          <p>The RCIC must keep confidential all information relating to the Client acquired in the course of the professional relationship, unless disclosure is authorized by the Client or required by law.</p>
          <h4>6. Privacy &amp; Consent (PIPEDA)</h4>
          <p>The Client consents to the collection, use, and storage of personal information for the purpose of providing this consultation, in accordance with PIPEDA.</p>
          <h4>7. Governing Law</h4>
          <p>This Agreement shall be governed by the federal laws of Canada applicable therein.</p>
          <h4>8. Acknowledgement</h4>
          <p>The Client acknowledges that they have read and understood this Agreement, had the opportunity to ask questions, and agree to be bound by its terms.</p>
        </div>
        <div class="sig-confirm-row">
          <input type="checkbox" id="ca_readChk">
          <label for="ca_readChk">I confirm the client has read and understood this Consultation Agreement and agrees to its terms.</label>
        </div>
        <div class="card-title" style="margin-bottom:8px">Client Signature</div>
        ${sigBlockHtml('ca')}
        <div class="btn-group">
          <button class="btn btn-primary" onclick="submitConsultationAgreement()">Sign Consultation Agreement →</button>
        </div>
        <div id="ca_confirm" class="alert alert-success hidden" style="margin-top:10px"></div>
      </div>
    </div>

    <!-- Consultation signed badge (shown after step 1) -->
    ${step1Done ? `<div class="alert alert-success" style="margin-bottom:12px">✓ Consultation Agreement signed on ${STATE.consultationSignedDate || today}. Proceed to Service Agreement below.</div>` : ''}

    <!-- STEP 2: SERVICE AGREEMENT (locked until consultation signed) -->
    <div id="agStep2" ${!step1Done ? 'style="opacity:.4;pointer-events:none"' : ''}>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <div class="card-title">Step 2 — Retainer / Service Agreement</div>
            <div class="card-sub">${!step1Done ? '🔒 Locked — sign Consultation Agreement first' : 'Client has decided to proceed. Complete service agreement below.'}</div>
          </div>
          <button class="btn btn-sm" onclick="exportAgreementPDF('service')">Print / PDF</button>
        </div>
        <div class="row-3">
          <div><label>Date</label><input type="date" id="sa_date" value="${today}"></div>
          <div><label>File Number</label><input type="text" id="sa_fileId" value="${cl?.fileId || ''}" placeholder="VIS-2026-AB-WB-001" readonly></div>
          <div><label>Application type</label><select id="sa_type">${appOpts}</select></div>
        </div>
        <div class="divider"></div>
        <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px">RCIC (Auto-filled)</div>
        <div class="row-3">
          <div><label>RCIC Full Name</label><input type="text" id="sa_rcicName" value="${co.rcic}" readonly></div>
          <div><label>CICC Membership No.</label><input type="text" id="sa_cicc" value="${co.cicc}" readonly></div>
          <div><label>Province</label><input type="text" id="sa_province" value="" placeholder="Province"></div>
        </div>
        <div class="row-2">
          <div><label>Business Address</label><input type="text" id="sa_addr" value="${co.location}" readonly></div>
          <div><label>Phone</label><input type="text" id="sa_phone" value="${co.phone}" readonly></div>
        </div>
        <div><label>Email</label><input type="text" id="sa_email" value="${co.email}" readonly></div>
        <div class="divider"></div>
        <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px">Client (Auto-filled from intake)</div>
        <div class="row-2">
          <div><label>Client Full Legal Name</label><input type="text" id="sa_client" value="${cl?.fullName || ''}" placeholder="Full legal name" oninput="updateSaSigPrev()"></div>
          <div><label>Passport Number</label><input type="text" id="sa_passport" value="${cl?.passport || ''}" placeholder="AB123456"></div>
        </div>
        <div><label>Address</label><input type="text" id="sa_caddr" value="${cl ? `${cl.addr}, ${cl.city}, ${cl.province} ${cl.postal}, Canada` : ''}" placeholder="Street, City, Province, Postal, Country"></div>
        <div class="row-2">
          <div><label>Phone</label><input type="tel" id="sa_cphone" value="${cl?.phone || ''}" placeholder="+1-780-..."></div>
          <div><label>Email</label><input type="email" id="sa_cemail" value="${cl?.email || ''}" placeholder="email@..."></div>
        </div>
        <div class="divider"></div>
        <div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:6px">Fees</div>
        <div class="row-3">
          <div><label>Total Professional Fee (CAD, before tax)</label><input type="text" id="sa_totalFee" value="${cl?.fee ? '$' + cl.fee.toLocaleString() + ' CAD' : ''}" placeholder="$2,350 CAD"></div>
          <div><label>Stage 1 — Due on signing</label><input type="text" id="sa_stage1" placeholder="e.g. $500 — Initial assessment"></div>
          <div><label>Stage 2 — Due at next milestone</label><input type="text" id="sa_stage2" placeholder="e.g. $1,850 — IRCC submission"></div>
        </div>
        <div class="divider"></div>
        <div class="agreement-text">
          <h4>1. Authorization and Nature of Retainer</h4>
          <p>The Client hereby retains <strong>${co.name}</strong> ("Consultant") to provide immigration consulting services. The Consultant agrees to act on the Client's behalf for the matters described in this Agreement. The RCIC is a member in good standing of the College of Immigration and Citizenship Consultants (CICC).</p>
          <h4>2. Pre-conditions and Processing Times</h4>
          <p>This Agreement is conditional upon the facts provided by the Client being accurate and complete. Processing times are determined by IRCC/AAIP and may change without notice. No specific processing time or outcome can be guaranteed.</p>
          <h4>3. Scope of Services</h4>
          <p>The Consultant agrees to provide: (a) assessment and advice; (b) preparation and submission of the application noted above; (c) communication and follow-up with IRCC on the Client's behalf; (d) IMM 5476 Use of Representative authorization.</p>
          <h4>4. Services Excluded</h4>
          <p>This Agreement does not include: judicial review, criminal law services, in-person representation at hearings, or any additional applications beyond those listed. Any excluded services require a new or amended retainer agreement.</p>
          <h4>5. Client's Responsibilities</h4>
          <p>The Client agrees to: (a) provide accurate, complete, and honest information at all times; (b) promptly disclose any material changes; (c) provide requested documents in a timely manner; (d) inform Consultant of any direct contact from IRCC or other authorities.</p>
          <p><strong>Misrepresentation Warning:</strong> Providing false or misleading information may lead to application refusal, loss of status, and future ineligibility. <em>Client initials: _______</em></p>
          <h4>6. Fees, Trust Account and Refund Policy</h4>
          <p>All advance payments will be deposited into the Consultant's trust account. Fees are earned upon completion of each stage. <strong>48-hour cooling-off period:</strong> The Client may cancel within 48 hours for a full refund. After 48 hours, fees for work performed are non-refundable. Government IRCC fees are non-refundable once paid.</p>
          <h4>7. Confidentiality and Privacy (PIPEDA)</h4>
          <p>All client information kept strictly confidential per CICC Code of Professional Conduct s.28. Information shared only with IRCC and necessary authorities as required for the application.</p>
          <h4>8. Government Fees</h4>
          <p>Government fees (IRCC processing, biometrics, right of PR, etc.) are separate from the Consultant's professional fees and are paid directly to IRCC by the Client.</p>
          <h4>9. Termination</h4>
          <p>Either party may terminate this Agreement in writing. The Consultant may withdraw for serious reasons including non-cooperation, non-payment, or requests to act unethically.</p>
          <h4>10. Dispute Resolution</h4>
          <p>Complaints may be filed with the CICC — 5500 North Service Road, Suite 1002, Burlington ON L7L 6W6 — Toll-free: 1-877-836-7543 — info@college-ic.ca — college-ic.ca</p>
          <h4>11. Governing Law</h4>
          <p>This Agreement is governed by the federal laws of Canada applicable therein.</p>
        </div>
        <div class="sig-confirm-row">
          <input type="checkbox" id="sa_readChk">
          <label for="sa_readChk">I confirm the client has read, understood, and agrees to be bound by this Retainer / Service Agreement.</label>
        </div>
        <div class="card-title" style="margin-bottom:8px">Client Signature</div>
        ${sigBlockHtml('sa')}
        <div class="btn-group">
          <button class="btn btn-primary btn-gold" onclick="submitServiceAgreement()">Sign Service Agreement ✓</button>
        </div>
        <div id="sa_confirm" class="alert alert-success hidden" style="margin-top:10px"></div>
      </div>
    </div>`;

  // Setup signature canvases
  setupCanvasById('ca_sigCanvas');
  setupCanvasById('sa_sigCanvas');
}

function sigBlockHtml(prefix) {
  return `<div class="sig-block-wrap">
    <div class="sig-tabs">
      <div class="sig-tab active" id="${prefix}_sigTabType" onclick="switchSigBlock('${prefix}','type')">Type name</div>
      <div class="sig-tab" id="${prefix}_sigTabDraw" onclick="switchSigBlock('${prefix}','draw')">Draw signature</div>
    </div>
    <div class="sig-panel active" id="${prefix}_sigPanelType">
      <label>Client full legal name (typed signature)</label>
      <input type="text" id="${prefix}_sigTyped" placeholder="Type full name to sign" oninput="updateSigPrevBlock('${prefix}')">
      <div class="sig-preview" id="${prefix}_sigPreview"></div>
    </div>
    <div class="sig-panel" id="${prefix}_sigPanelDraw">
      <label>Draw signature with mouse or finger</label>
      <canvas id="${prefix}_sigCanvas" width="700" height="100" style="border:1px solid var(--border);border-radius:var(--radius);cursor:crosshair;display:block;width:100%;height:100px;background:white;margin-top:4px"></canvas>
      <div class="btn-group">
        <button class="btn btn-sm" onclick="clearCanvasById('${prefix}_sigCanvas','${prefix}')">Clear</button>
        <button class="btn btn-primary btn-sm" onclick="saveDrawingById('${prefix}')">Save signature</button>
      </div>
      <div id="${prefix}_drawOK" class="alert alert-success hidden" style="margin-top:6px">Signature saved</div>
    </div>
  </div>`;
}

function switchSigBlock(prefix, type) {
  document.getElementById(prefix + '_sigTabType')?.classList.toggle('active', type === 'type');
  document.getElementById(prefix + '_sigTabDraw')?.classList.toggle('active', type === 'draw');
  document.getElementById(prefix + '_sigPanelType')?.classList.toggle('active', type === 'type');
  document.getElementById(prefix + '_sigPanelDraw')?.classList.toggle('active', type === 'draw');
}
function updateSigPrevBlock(prefix) {
  const n = document.getElementById(prefix + '_sigTyped')?.value || '';
  const el = document.getElementById(prefix + '_sigPreview');
  if (el) el.textContent = n;
}
function setupCanvasById(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1B3A5C'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false, lx = 0, ly = 0;
  function pos(e) { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x:(t.clientX-r.left)*(canvas.width/r.width), y:(t.clientY-r.top)*(canvas.height/r.height) }; }
  canvas.addEventListener('mousedown', e => { drawing=true; const p=pos(e); lx=p.x; ly=p.y; });
  canvas.addEventListener('mousemove', e => { if(!drawing) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(p.x,p.y); ctx.stroke(); lx=p.x; ly=p.y; });
  canvas.addEventListener('mouseup', () => drawing=false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true; const p=pos(e); lx=p.x; ly=p.y; }, {passive:false});
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if(!drawing) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(p.x,p.y); ctx.stroke(); lx=p.x; ly=p.y; }, {passive:false});
  canvas.addEventListener('touchend', () => drawing=false);
}
function clearCanvasById(canvasId, prefix) {
  const c = document.getElementById(canvasId); if(c) c.getContext('2d').clearRect(0,0,c.width,c.height);
  if (prefix) { STATE['draw_'+prefix+'_saved'] = false; document.getElementById(prefix+'_drawOK')?.classList.add('hidden'); }
}
function saveDrawingById(prefix) {
  STATE['draw_'+prefix+'_saved'] = true;
  document.getElementById(prefix+'_drawOK')?.classList.remove('hidden');
}

// Keep legacy canvas functions for compatibility
function setupCanvas() { setupCanvasById('sigCanvas'); }
function clearCanvas() { clearCanvasById('sigCanvas', null); STATE.drawSigSaved = false; }
function saveDrawing() { STATE.drawSigSaved = true; document.getElementById('drawOK')?.classList.remove('hidden'); }
function switchSig(type) { switchSigBlock('ca', type); }
function updateSigPrev() {}
function updateSaSigPrev() { updateSigPrevBlock('sa'); }

function submitConsultationAgreement() {
  if (!document.getElementById('ca_readChk')?.checked) { alert('Please confirm you have read and agree to the Consultation Agreement.'); return; }
  const first = document.getElementById('ca_first')?.value?.trim();
  const last = document.getElementById('ca_last')?.value?.trim();
  if (!first || !last) { alert('Please enter client first and last name.'); return; }
  const typed = document.getElementById('ca_sigTyped')?.value?.trim();
  if (!typed && !STATE['draw_ca_saved']) { alert('Please type or draw the client signature.'); return; }
  const date = document.getElementById('ca_date')?.value || new Date().toISOString().split('T')[0];
  STATE.consultationSigned = true;
  STATE.consultationSignedDate = date;
  logActivity('Consultation Agreement signed', document.getElementById('ca_fileId')?.value);
  document.getElementById('ca_confirm').textContent = `✓ Consultation Agreement signed by ${typed || first + ' ' + last} on ${date}.`;
  document.getElementById('ca_confirm').classList.remove('hidden');
  setTimeout(() => buildAgreement(), 1200); // refresh to unlock step 2
}

function submitServiceAgreement() {
  if (!STATE.consultationSigned) { alert('Please sign the Consultation Agreement first.'); return; }
  if (!document.getElementById('sa_readChk')?.checked) { alert('Please confirm you have read and agree to the Service Agreement.'); return; }
  const client = document.getElementById('sa_client')?.value?.trim();
  if (!client) { alert('Please enter client full legal name.'); return; }
  const typed = document.getElementById('sa_sigTyped')?.value?.trim();
  if (!typed && !STATE['draw_sa_saved']) { alert('Please type or draw the client signature.'); return; }
  const date = document.getElementById('sa_date')?.value || new Date().toISOString().split('T')[0];
  STATE.serviceSigned = true;
  STATE.agreementSigned = true;
  STATE.serviceSignedDate = date;
  logActivity('Service Agreement signed', document.getElementById('sa_fileId')?.value);
  document.getElementById('sa_confirm').textContent = `✓ Service Agreement signed by ${typed || client} on ${date}. File is now active — proceed to Document Checklist.`;
  document.getElementById('sa_confirm').classList.remove('hidden');
  updateRiskScore();
}

function exportAgreementPDF(type) {
  window.print();
}

// ── INADMISSIBILITY ──────────────────────────────────────────────
function buildInadmissibility() {
  const el = document.getElementById('inadmissContent');
  if (!el) return;
  el.innerHTML = `<div class="card"><div class="card-title">Inadmissibility assessment — IRPA Division 4 (ENF 1)</div>
    <div class="card-sub">Based on IRCC ENF 1 Manual. Assess every ground before submission.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <span class="badge badge-red">Inadmissible = Do not submit</span>
      <span class="badge badge-orange">Explain = Written explanation needed</span>
      <span class="badge badge-green">Clear = Not applicable</span>
    </div></div>`;

  DATA.inadmissibility.forEach(group => {
    const sec = document.createElement('div');
    sec.innerHTML = `<div class="inadmiss-header">
      <div>${group.category} ${group.ministerial_relief ? '<span class="badge badge-gold" style="font-size:9px;margin-left:8px">Ministerial relief possible</span>' : ''}</div>
      <span style="font-size:10px;opacity:.7">${group.ref}</span>
    </div>`;
    group.items.forEach(item => {
      const id = 'in_' + item.id;
      STATE.inadmissAnswers[id] = '';
      const row = document.createElement('div');
      row.className = 'criteria-row';
      row.id = 'ir_' + id;
      row.innerHTML = `<div class="criteria-info">
        <div class="criteria-title">${item.title}</div>
        <div class="criteria-detail">${item.detail}</div>
        <div class="criteria-standard">Standard: ${item.standard}</div>
      </div>
      <select id="${id}" onchange="updateInadmiss('${id}')">
        <option value="">— Assess —</option>
        <option value="clear">Clear / Not applicable</option>
        <option value="explain">Requires explanation</option>
        <option value="inadmissible">Inadmissible</option>
      </select>`;
      sec.appendChild(row);
    });
    el.appendChild(sec);
  });
}

function updateInadmiss(id) {
  const val = document.getElementById(id)?.value || '';
  STATE.inadmissAnswers[id] = val;
  const row = document.getElementById('ir_' + id);
  if (row) {
    row.className = 'criteria-row';
    if (val==='clear') row.classList.add('status-clear');
    if (val==='explain') row.classList.add('status-explain');
    if (val==='inadmissible') row.classList.add('status-inadmiss');
  }
  updateRiskScore();
}

// ── RISK SCORE ───────────────────────────────────────────────────
function buildRiskScore() {
  const el = document.getElementById('riskContent');
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Audit risk score</div>
      <div class="score-bar-wrap">
        <div class="score-big" id="riskNum">—</div>
        <div style="flex:1">
          <div class="text-muted mb-8">Case score / 100</div>
          <div class="score-bar-lg"><div class="score-fill score-low" id="riskFill" style="width:0%"></div></div>
          <div class="text-muted mt-8" id="riskLbl">Complete the inadmissibility assessment to generate score</div>
        </div>
      </div>
    </div>
    <div class="card"><div class="card-title">Flags</div><div id="riskFlags"><p class="text-muted">Complete assessment to see flags.</p></div></div>
    <div class="card">
      <div class="card-title">Pre-submission checklist</div>
      <div class="chk-row"><span>Service agreement signed</span><span id="chkSig" class="badge badge-gray">Pending</span></div>
      <div class="chk-row"><span>Inadmissibility check complete</span><span id="chkIn" class="badge badge-gray">Pending</span></div>
      <div class="chk-row"><span>No red inadmissibility flags</span><span id="chkNoRed" class="badge badge-gray">Pending</span></div>
      <div class="chk-row"><span>Risk score 60 or above</span><span id="chkScore" class="badge badge-gray">Pending</span></div>
      <div class="chk-row" style="font-weight:600"><span>Overall submission status</span><span id="chkOverall" class="badge badge-gray">Incomplete</span></div>
    </div>`;
}

function updateRiskScore() {
  const vals = Object.values(STATE.inadmissAnswers);
  const assessed = vals.filter(v => v !== '').length;
  const reds = vals.filter(v => v === 'inadmissible').length;
  const oranges = vals.filter(v => v === 'explain').length;
  if (assessed === 0) return;
  let score = Math.max(0, Math.min(100, 100 - reds*20 - oranges*5));
  const numEl = document.getElementById('riskNum');
  const fillEl = document.getElementById('riskFill');
  const lblEl = document.getElementById('riskLbl');
  if (numEl) numEl.textContent = score;
  if (fillEl) { fillEl.style.width = score+'%'; fillEl.className = 'score-fill ' + (score>=70?'score-low':score>=45?'score-med':'score-high'); }
  if (lblEl) lblEl.textContent = score>=70 ? '✓ Low risk — likely ready for submission' : score>=45 ? '⚠ Medium risk — review flags' : '✗ High risk — do not submit without resolving flags';
  const flagsEl = document.getElementById('riskFlags');
  if (flagsEl) {
    let html = '';
    Object.entries(STATE.inadmissAnswers).forEach(([id, val]) => {
      if (!val) return;
      const itemId = id.replace('in_','');
      let title = itemId;
      DATA.inadmissibility.forEach(g => g.items.forEach(it => { if(it.id===itemId) title=it.title; }));
      if (val==='inadmissible') html += `<div class="flag-item flag-red">✗ Inadmissible: ${title}</div>`;
      else if (val==='explain') html += `<div class="flag-item flag-orange">⚠ Explanation needed: ${title}</div>`;
    });
    flagsEl.innerHTML = html || '<div class="flag-item flag-green">✓ No flags — case looks clean</div>';
  }
  const setChk = (id, ok, yes, no) => { const el = document.getElementById(id); if(el){el.textContent=ok?yes:no; el.className='badge '+(ok?'badge-green':'badge-red');} };
  setChk('chkSig', STATE.agreementSigned, 'Signed', 'Not signed');
  setChk('chkIn', assessed>0, 'Done', 'Pending');
  setChk('chkNoRed', reds===0, 'Clear', `${reds} flag(s)`);
  setChk('chkScore', score>=60, `Score: ${score}`, `Score: ${score} — low`);
  const ready = STATE.agreementSigned && assessed>0 && reds===0 && score>=60;
  setChk('chkOverall', ready, 'Ready to submit ✓', 'Not ready');
}

// ── REPORTS ──────────────────────────────────────────────────────
function buildReports() {
  const total = STATE.cases.length;
  const approved = STATE.cases.filter(c=>c.status==='Approved').length;
  const refused = STATE.cases.filter(c=>c.status==='Refused').length;
  const active = STATE.cases.filter(c=>c.status==='Active'||c.status==='In Progress').length;
  const revenue = STATE.cases.reduce((sum,c)=>sum+c.collected,0);
  const outstanding = STATE.cases.reduce((sum,c)=>sum+(c.fee-c.collected),0);
  ['rptTotal','rptApproved','rptRefused'].forEach((id,i)=>{
    const el=document.getElementById(id); if(el) el.textContent=[total,approved,refused][i];
  });
  const rr = document.getElementById('rptRevenue'); if(rr) rr.textContent = '$'+revenue.toLocaleString();
  // Populate full case table in reports
  const rt = document.getElementById('rptCasesTable');
  if (rt) {
    rt.innerHTML = `<table class="data-table">
      <thead><tr><th>File ID</th><th>Client</th><th>Application Type</th><th>Status</th><th>Opened</th><th>Fee (CAD)</th><th>Collected</th><th>Outstanding</th><th>Next Action</th><th>Next Date</th></tr></thead>
      <tbody>${STATE.cases.map(c=>`<tr>
        <td>${c.id}</td><td><strong>${c.client}</strong></td><td style="font-size:11px">${c.type}</td>
        <td><span class="badge ${c.status==='Approved'?'badge-green':c.status==='Refused'?'badge-red':c.status==='Active'||c.status==='In Progress'?'badge-orange':'badge-gray'}">${c.status}</span></td>
        <td>${c.opened||''}</td><td>$${(c.fee||0).toLocaleString()}</td>
        <td style="color:var(--green)">$${(c.collected||0).toLocaleString()}</td>
        <td style="color:${c.fee-c.collected>0?'var(--red)':'var(--green)'}">$${(c.fee-c.collected).toLocaleString()}</td>
        <td style="font-size:11px">${c.nextAction||''}</td><td style="font-size:11px">${c.nextDate||''}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }
  // Task summary table
  const tt = document.getElementById('rptTasksTable');
  if (tt) {
    tt.innerHTML = `<table class="data-table">
      <thead><tr><th>Task</th><th>File ID</th><th>Assigned To</th><th>Type</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
      <tbody>${STATE.tasks.map(t=>`<tr>
        <td>${t.title}</td><td>${t.fileId}</td><td>${t.assignedTo}</td>
        <td>${t.type}</td>
        <td><span class="badge ${t.priority==='high'?'badge-red':t.priority==='medium'?'badge-orange':'badge-gray'}">${t.priority}</span></td>
        <td><span class="badge ${t.status==='Done'?'badge-green':new Date(t.due)<new Date()&&t.status!=='Done'?'badge-red':'badge-orange'}">${t.status}</span></td>
        <td>${t.due}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }
}

// ── EXPORT FUNCTIONS ─────────────────────────────────────────────
function downloadFile(filename, content, mimeType) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCasesCSV() {
  const headers = ['File ID','Client','Application Type','Status','Stage','Consultant','Opened','Next Action','Next Date','Fee (CAD)','Collected (CAD)','Outstanding (CAD)'];
  const rows = STATE.cases.map(c => [
    c.id, c.client, c.type, c.status, `Stage ${c.stage}`, c.consultant, c.opened,
    c.nextAction, c.nextDate, c.fee, c.collected, c.fee - c.collected
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`cases_report_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
}

function exportTasksCSV() {
  const headers = ['ID','Title','File ID','Assigned To','Type','Priority','Status','Due Date'];
  const rows = STATE.tasks.map(t => [t.id, t.title, t.fileId, t.assignedTo, t.type, t.priority, t.status, t.due]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`tasks_report_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
}

function exportActivityCSV() {
  const headers = ['Timestamp','Team Member','Role','Action','File ID'];
  const rows = STATE.activityLog.map(a => [a.timestamp, a.member, a.role, a.action, a.fileId]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`activity_log_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
}

function exportReportsPDF() { window.print(); }

// ── ACTIVITY LOG ─────────────────────────────────────────────────
function buildActivityLog() {
  const el = document.getElementById('activityContent');
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="card-title">Team Activity Log</div>
          <div class="card-sub">All logins, case actions, agreements, and task updates</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-primary" onclick="exportActivityCSV()">Export CSV</button>
          <button class="btn btn-sm" onclick="buildActivityLog()">Refresh</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <select onchange="filterActivity(this.value)" style="width:auto">
          <option value="">All members</option>
          ${DATA.team_members.map(m=>`<option value="${m.name}">${m.name}</option>`).join('')}
        </select>
        <input type="text" placeholder="Search actions..." oninput="searchActivity(this.value)" style="flex:1;min-width:200px">
      </div>
      <table class="data-table" id="activityTable">
        <thead><tr><th>Date & Time</th><th>Team Member</th><th>Role</th><th>Action</th><th>File ID</th></tr></thead>
        <tbody id="activityBody">${renderActivityRows(STATE.activityLog)}</tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-title">Team Members</div>
      <table class="data-table">
        <thead><tr><th>Member</th><th>Role</th><th>Last Activity</th></tr></thead>
        <tbody>
          ${DATA.team_members.map(m => {
            const last = STATE.activityLog.filter(a=>a.member===m.name)[0];
            return `<tr>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="width:28px;height:28px;border-radius:50%;background:${m.color};color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${m.avatar}</div>
                <strong>${m.name}</strong></div></td>
              <td>${m.role}</td>
              <td class="text-muted">${last ? new Date(last.timestamp).toLocaleString() : 'No activity'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderActivityRows(log) {
  if (!log.length) return '<tr><td colspan="5" class="text-muted" style="padding:16px">No activity recorded.</td></tr>';
  return log.map(a => {
    const dt = new Date(a.timestamp);
    const member = DATA.team_members.find(m => m.name === a.member);
    return `<tr>
      <td style="font-size:11px">${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</td>
      <td><div style="display:flex;align-items:center;gap:6px">
        <div style="width:22px;height:22px;border-radius:50%;background:${member?.color||'var(--navy)'};color:white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700">${member?.avatar||'??'}</div>
        ${a.member}</div></td>
      <td class="text-muted">${a.role}</td>
      <td>${a.action}</td>
      <td>${a.fileId ? `<span class="badge badge-blue">${a.fileId}</span>` : ''}</td>
    </tr>`;
  }).join('');
}

function filterActivity(member) {
  const filtered = member ? STATE.activityLog.filter(a => a.member === member) : STATE.activityLog;
  const el = document.getElementById('activityBody');
  if (el) el.innerHTML = renderActivityRows(filtered);
}

function searchActivity(q) {
  const filtered = q ? STATE.activityLog.filter(a => a.action.toLowerCase().includes(q.toLowerCase()) || a.member.toLowerCase().includes(q.toLowerCase())) : STATE.activityLog;
  const el = document.getElementById('activityBody');
  if (el) el.innerHTML = renderActivityRows(filtered);
}

// ── CLEAR DEMO DATA ───────────────────────────────────────────────
function clearDemoData() {
  if (!confirm('This will remove all 3 sample cases, sample tasks, and sample calendar events. Your real data will remain. Continue?')) return;
  const demoIds = ['VIS-2026-AB-WB-001','VIS-2026-AB-PH-002','VIS-2026-AB-RC-003'];
  STATE.cases = STATE.cases.filter(c => !demoIds.includes(c.id));
  STATE.tasks = STATE.tasks.filter(t => !demoIds.includes(t.fileId));
  buildCasesTable();
  buildTasksList();
  buildDashboard();
  alert('Demo data cleared. The portal is ready for real clients.');
}

// ── MODAL UTILS ──────────────────────────────────────────────────
function closeModal(e) {
  if (!e || e.target === document.getElementById('modalOverlay')) {
    document.getElementById('modalOverlay').classList.remove('open');
  }
}
// openEventModal and saveEvent are defined in calendar.js
