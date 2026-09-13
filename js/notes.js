/* notes.js — Team Notes system */
const NOTES_STATE = {
  notes: [
    { id:1, type:'case', fileId:'VIS-2026-AB-WB-001', author:'Assistant', content:'Reviewed passport scan from Tesfaye — expires March 2027, valid. Planning to request marriage certificate translation next. Will follow up by email today.', date:'2026-04-06 09:15', tags:['passport','valid'] },
    { id:2, type:'planning', fileId:'', author:'RCIC', content:'Planning to launch Instagram campaign next week targeting Filipino communities across Canada. Will post about spousal sponsorship timelines and how to start the process. Expecting 3-5 new leads.', date:'2026-04-05 16:30', tags:['marketing'] },
    { id:3, type:'action', fileId:'VIS-2026-AB-PH-002', author:'RCIC', content:'Maria\'s employer confirmed LMIA positive result. Action: download LMIA copy, start IMM 1295 prep. Need to verify position title matches exactly. Target submission: April 20.', date:'2026-04-04 11:00', tags:['lmia','urgent'] },
    { id:4, type:'reminder', fileId:'', author:'Assistant', content:'Commissioner of Oaths appointment booked for April 20 at 1:00 PM. Bring: Certificate of Barrister & Solicitor form (filled), ID, code of conduct booklet. Law firm: [Insert name]. Cost: ~$100.', date:'2026-04-03 14:00', tags:['commissioner','appointment'] }
  ],
  filtered: null
};

document.addEventListener('DOMContentLoaded', () => { renderNotes(); updateNotesBadge(); });

function renderNotes(list) {
  const el = document.getElementById('notesList');
  if (!el) return;
  const notes = list || NOTES_STATE.notes;
  if (!notes.length) { el.innerHTML = '<p class="text-muted">No notes found.</p>'; return; }
  const typeColors = { case:'', planning:'planning', action:'action', reminder:'reminder' };
  const typeLabels = { case:'Case note', planning:'Planning', action:'Action item', reminder:'Reminder' };
  const typeBadges = { case:'badge-blue', planning:'badge-gold', action:'badge-green', reminder:'badge-orange' };
  el.innerHTML = notes.map(n => `
    <div class="note-card ${typeColors[n.type]||''}" id="note-${n.id}">
      <div class="note-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge ${typeBadges[n.type]||'badge-gray'}">${typeLabels[n.type]||n.type}</span>
          <span style="font-size:11px;font-weight:500;color:var(--navy)">${n.author}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="note-meta">${n.date}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteNote(${n.id})" style="padding:2px 8px;font-size:11px">✕</button>
        </div>
      </div>
      <div class="note-content">${n.content}</div>
      ${n.fileId ? `<div class="note-file">📁 ${n.fileId}</div>` : ''}
      ${n.tags?.length ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${n.tags.map(t=>`<span class="badge badge-gray" style="font-size:9px">${t}</span>`).join('')}</div>` : ''}
    </div>`).join('');
}

function addNote() {
  const content = document.getElementById('noteContent')?.value?.trim();
  const author = document.getElementById('noteAuthor')?.value?.trim() || 'Team';
  if (!content) { alert('Please enter note content'); return; }
  const note = {
    id: Date.now(),
    type: document.getElementById('noteType')?.value || 'case',
    fileId: document.getElementById('noteFileId')?.value?.trim() || '',
    author,
    content,
    date: new Date().toLocaleString('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),
    tags: []
  };
  NOTES_STATE.notes.unshift(note);
  renderNotes();
  updateNotesBadge();
  document.getElementById('noteContent').value = '';
  document.getElementById('noteFileId').value = '';
}

function deleteNote(id) {
  NOTES_STATE.notes = NOTES_STATE.notes.filter(n => n.id !== id);
  renderNotes();
  updateNotesBadge();
}

function filterNotes(type) {
  renderNotes(type === 'all' ? NOTES_STATE.notes : NOTES_STATE.notes.filter(n => n.type === type));
}

function searchNotes(q) {
  if (!q) { renderNotes(); return; }
  renderNotes(NOTES_STATE.notes.filter(n =>
    n.content.toLowerCase().includes(q.toLowerCase()) ||
    n.author.toLowerCase().includes(q.toLowerCase()) ||
    n.fileId.toLowerCase().includes(q.toLowerCase())
  ));
}

function openAddNote() { showPage('notes'); }

function updateNotesBadge() {
  const el = document.getElementById('notesBadge');
  if (el) el.textContent = NOTES_STATE.notes.length;
  const notif = document.getElementById('notifCount');
  if (notif) notif.textContent = NOTES_STATE.notes.filter(n => n.type === 'action' || n.type === 'reminder').length;
}

/* documents.js — IRCC Forms & PDF viewer */
document.addEventListener('DOMContentLoaded', buildDocuments);

function buildDocuments() {
  const el = document.getElementById('irccForms');
  if (!el) return;
  const forms = DATA.ircc_forms?.spousal || [];
  el.innerHTML = forms.map(f => `
    <div class="ircc-form-row">
      <div class="ircc-form-name">
        <strong>${f.form}</strong> — ${f.title}
        <div class="ircc-form-sub">${f.tigrinya}</div>
        <div style="font-size:11px;color:var(--gray-600);margin-top:2px">${f.note}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">
        <span class="badge ${f.mandatory ? 'badge-red' : 'badge-gray'}">${f.mandatory ? 'Required' : 'Optional'}</span>
        <a href="${f.url}" target="_blank" class="btn btn-sm btn-primary">Open ↗</a>
        <button class="btn btn-sm" onclick="embedPDF('${f.url}', '${f.form}')">Preview</button>
      </div>
    </div>`).join('');
}

function embedPDF(url, title) {
  const viewer = document.getElementById('pdfViewer');
  if (!viewer) return;
  viewer.innerHTML = `<iframe src="${url}" width="100%" height="100%" style="border:none;border-radius:var(--radius)" title="${title}"></iframe>`;
}

function previewPDF(input) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const viewer = document.getElementById('pdfViewer');
  if (viewer) viewer.innerHTML = `<iframe src="${url}" width="100%" height="100%" style="border:none;border-radius:var(--radius)" title="${file.name}"></iframe>`;
}

function showCountryReqs() {
  const country = document.getElementById('countryRes')?.value;
  const prev = document.getElementById('countryPrev')?.value;
  const el = document.getElementById('countryReqs');
  if (!el || !country) return;
  const reqs = DATA.country_requirements[country];
  if (!reqs) { el.innerHTML = ''; return; }
  let html = `<div class="card" style="border-left:4px solid var(--navy)">
    <div class="card-title">${reqs.label} — Document instructions</div>`;
  reqs.instructions.forEach((instr, i) => {
    const ti = reqs.tigrinya[i] || '';
    html += `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:13px">${instr}</div>
      <div style="font-size:11px;color:var(--gray-600);font-style:italic;margin-top:2px">${ti}</div>
    </div>`;
  });
  html += `<div class="alert alert-info mt-8" style="font-size:11px">
    Always verify country requirements on IRCC website before submission: 
    <a href="https://ircc.canada.ca/english/information/applications/spouse.asp" target="_blank" style="color:var(--navy)">ircc.canada.ca ↗</a>
  </div></div>`;
  el.innerHTML = html;
}
