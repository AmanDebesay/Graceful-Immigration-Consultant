import { db, state, can, esc, icon, ROLE_LABEL } from '../core.js';

// How the dashboard works, written for each role. Opens on the reader's own role.
const FLOW = [
  ['Lead & consultation', 'Assessment or booking comes in. Initial Consultation Agreement before paid advice.', 'RCIC'],
  ['Retainer', 'Assistant may draft it; the RCIC reviews, signs and sends it. Client signs online or on paper.', 'Assistant → RCIC'],
  ['Case opened', 'One case per application, with deadlines and the IRCC file number.', 'Case manager / RCIC'],
  ['1. Documents', 'Checklist: ask the client for each document and tick it when it is in the file.', 'Assistant'],
  ['2. Forms', 'Complete and check every IRCC form and letter.', 'Case manager / RCIC'],
  ['3. RCIC review', 'The RCIC checks the whole package, then approves or returns it with a note.', 'RCIC'],
  ['Submit & track', 'Submit, mark the case “Submitted”, add the file number, track it on the IRCC Portal page.', 'Case manager / RCIC'],
];

// Illustrations for the guide cards (navy and gold, drawn inline so they print and scale cleanly).
const G = `<defs><linearGradient id="gn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A64C0"/><stop offset="1" stop-color="#0B2A5C"/></linearGradient>
  <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7D47F"/><stop offset="1" stop-color="#C9932E"/></linearGradient></defs>`;
const rep = (n, f) => [...Array(n).keys()].map(f).join('');
const ART = {
  clipboard: `${G}<rect x="22" y="14" width="56" height="74" rx="7" fill="url(#gn)"/><rect x="28" y="22" width="44" height="60" rx="3" fill="#fff"/><rect x="38" y="9" width="24" height="12" rx="4" fill="url(#gg)"/>
    ${[34, 48, 62].map((y) => `<rect x="33" y="${y - 4}" width="8" height="8" rx="1.5" fill="none" stroke="#0B2A5C" stroke-width="1.8"/><path d="M34.5 ${y}l2 2 3.5-4" stroke="#0B2A5C" stroke-width="1.8" fill="none"/><rect x="45" y="${y - 2}" width="20" height="3.5" rx="1.7" fill="#0B2A5C" opacity=".75"/>`).join('')}
    <path d="M70 70 L88 34 L94 37 L76 73 Z" fill="url(#gg)"/><path d="M70 70 l6 3 -7 5z" fill="#0B2A5C"/>`,
  team: `${G}<circle cx="34" cy="34" r="10" fill="url(#gn)"/><path d="M16 70c0-12 8-20 18-20s18 8 18 20z" fill="url(#gn)"/><circle cx="58" cy="28" r="12" fill="url(#gn)"/><path d="M36 72c0-14 10-24 22-24s22 10 22 24z" fill="url(#gn)"/>
    <circle cx="72" cy="70" r="13" fill="url(#gg)"/>${rep(8, (i) => `<rect x="70" y="53" width="4" height="7" rx="1" fill="url(#gg)" transform="rotate(${i * 45} 72 70)"/>`)}<circle cx="72" cy="70" r="5" fill="#fff"/>`,
  shield: `${G}<path d="M40 12l24 9v18c0 17-11 28-24 33-13-5-24-16-24-33V21z" fill="url(#gg)"/><path d="M40 19l18 7v13c0 13-8 22-18 26-10-4-18-13-18-26V26z" fill="url(#gn)"/><path d="M31 41l7 7 13-14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="56" y="52" width="34" height="32" rx="4" fill="#fff" stroke="#0B2A5C" stroke-width="2"/><rect x="56" y="52" width="34" height="9" rx="3" fill="url(#gg)"/>${rep(3, (r) => rep(4, (c) => `<rect x="${60 + c * 7.5}" y="${65 + r * 6}" width="5" height="4" rx="1" fill="#0B2A5C" opacity=".7"/>`))}`,
  sun: `${G}<circle cx="50" cy="48" r="16" fill="url(#gg)"/>${rep(8, (i) => `<rect x="48" y="14" width="4" height="12" rx="2" fill="url(#gg)" transform="rotate(${i * 45} 50 48)"/>`)}<path d="M10 86h80" stroke="url(#gn)" stroke-width="6" stroke-linecap="round"/>`,
  folder: `${G}<path d="M12 28a5 5 0 0 1 5-5h22l7 8h37a5 5 0 0 1 5 5v42a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z" fill="url(#gn)"/><rect x="22" y="38" width="56" height="34" rx="3" fill="#fff"/><path d="M30 48h40M30 56h32M30 64h24" stroke="#0B2A5C" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="74" cy="70" r="12" fill="url(#gg)"/><path d="M69 70l4 4 7-8" stroke="#fff" stroke-width="3" fill="none"/>`,
  pen: `${G}<rect x="18" y="12" width="50" height="68" rx="5" fill="#fff" stroke="#0B2A5C" stroke-width="2.5"/><path d="M27 28h32M27 37h32M27 46h22" stroke="#0B2A5C" stroke-width="3" stroke-linecap="round" opacity=".6"/><path d="M27 66c6-6 9 4 14-2s8 2 12-2" stroke="#0B2A5C" stroke-width="2.5" fill="none"/>
    <path d="M60 78 L86 30 L93 34 L67 82 Z" fill="url(#gg)"/><path d="M60 78l7 4-8 5z" fill="#0B2A5C"/>`,
  route: `${G}<circle cx="20" cy="76" r="10" fill="url(#gg)"/><circle cx="80" cy="22" r="10" fill="url(#gn)"/><path d="M28 72 C 60 70 30 40 50 40 S 70 30 72 28" stroke="#0B2A5C" stroke-width="4" stroke-dasharray="7 6" fill="none"/>`,
  coins: `${G}${rep(3, (i) => `<ellipse cx="38" cy="${72 - i * 12}" rx="22" ry="8" fill="url(#gg)" stroke="#9A6B12" stroke-width="1.5"/>`)}<rect x="56" y="22" width="34" height="56" rx="5" fill="url(#gn)"/><rect x="61" y="28" width="24" height="10" rx="2" fill="#fff"/>${rep(3, (r) => rep(3, (c) => `<rect x="${61 + c * 8.5}" y="${43 + r * 10}" width="6" height="6" rx="1.5" fill="#fff" opacity=".85"/>`))}`,
  map: `${G}<path d="M12 24l24-8 28 10 24-8v58l-24 8-28-10-24 8z" fill="url(#gn)"/><path d="M36 16v58M64 26v58" stroke="#fff" stroke-width="2" opacity=".5"/><path d="M50 30c-8 0-13 6-13 12 0 10 13 22 13 22s13-12 13-22c0-6-5-12-13-12z" fill="url(#gg)"/><circle cx="50" cy="42" r="4.5" fill="#fff"/>`,
};
const H_ICON = { clipboard: 'layers', team: 'users', shield: 'shield', sun: 'clock', folder: 'folder', pen: 'pen', route: 'route', coins: 'coins', map: 'globe' };
const pickArt = (t) => /morning|day to day|habit/i.test(t) ? 'sun' : /team/i.test(t) ? 'team' : /complian|privacy|can and/i.test(t) ? 'shield'
  : /agreement/i.test(t) ? 'pen' : /opening/i.test(t) ? 'folder' : /hand-off|first contact/i.test(t) ? 'route' : /where/i.test(t) ? 'map' : 'clipboard';
const card = (title, body, art = pickArt(title)) => `<div class="gd2"><div class="gd2-art"><svg viewBox="0 0 100 100" aria-hidden="true">${ART[art]}</svg></div>
  <div class="gd2-h">${icon(H_ICON[art] || 'layers')}<h4>${title}</h4></div><div class="gd2-b">${body}</div></div>`;
const steps = (list) => `<ol class="gd-steps gd2-steps">${list.map((s) => `<li>${s}</li>`).join('')}</ol>`;
const ul = (list, cls = '') => `<ul class="gd2-ul ${cls}">${list.map((s) => `<li>${s}</li>`).join('')}</ul>`;

const ROLES = {
  assistant: {
    label: 'Assistant',
    intro: 'You help clients get their documents together and prepare drafts. The RCIC gives all immigration advice, signs agreements and approves every application.',
    parts: [
      card('Every morning', steps([
        'Open the <b>Dashboard</b>. <b>Your work queue</b> shows the checklists and drafts that are with you.',
        'Open <b>Tasks</b> (the red number means overdue). Each task has an <b>Open</b> button that takes you straight to the work.',
        'Check <b>Team Chat</b> for messages from the RCIC.',
      ])),
      card('Collecting documents with a checklist', steps([
        'Go to <b>Checklists</b> → <b>Assigned to me</b>, or open the client’s case and click <b>Start checklist</b> (the right list is suggested from the case type).',
        'Use <b>Email list</b>, <b>WhatsApp list</b> or <b>Copy list</b> at the top. Each one prepares a polite message listing every document still missing.',
        'When a document arrives, check it is complete (every page, readable, not expired), save it to the client file, then click <b>✓</b> on that line.',
        'If a line does not apply to this client, click <b>N/A</b> and write why in the note (for example “never married”).',
        'Use the note box for anything the next person must know, e.g. “passport expires 2027-03” or “translation ordered”.',
        'When every required line is done, click <b>Documents complete — hand off for forms</b> and choose the case manager or RCIC. They get a task automatically.',
      ])),
      card('Drafting an agreement', steps([
        'Go to <b>Agreements</b> → <b>Draft an agreement</b> (or <b>Generate agreement</b> on the client’s page).',
        'Choose the client, the type, paying or pro bono, and the service. Fill in each section; the live preview shows exactly what the client will see.',
        'Click <b>Send to RCIC for review</b>, choose the RCIC and add a note about anything unclear.',
        'If the RCIC sends it back, you get a task with their note. Make the changes and click <b>Send to RCIC again</b>.',
      ])),
      card('What you can and cannot do', `<div class="row-2"><div><b>You can</b>${ul(['View clients, cases and agreements', 'Work on checklists and hand them off', 'Draft agreements', 'Email and message clients about documents', 'Use Tasks, Team Chat and the Calendar'], 'gd-yes')}</div>
        <div><b>Only the RCIC can</b>${ul(['Give immigration advice or say what the client should do', 'Sign and send agreements to clients', 'Approve an application for submission', 'Change fees or the terms agreed with a client'], 'gd-no')}</div></div>
        <p style="margin-top:10px">If a client asks for advice (“Will I qualify?”, “Should I apply now?”), say the RCIC will answer, then send the question to the RCIC in Team Chat. Under the CICC Code of Professional Conduct, the RCIC supervises your work and answers for it.</p>`),
      card('Privacy', ul(['Use only the company email and the dashboard for client documents. Do not keep copies on a personal phone or account.', 'Send each client only their own information and links.', 'Never share passwords or two-step codes.'])),
    ],
  },
  case_manager: {
    label: 'Case Manager',
    intro: 'You turn a complete document file into a complete application, keep cases moving and watch the deadlines.',
    parts: [
      card('Every morning', steps(['<b>Dashboard</b> → <b>Your work queue</b> and <b>Tasks</b>.', '<b>Cases</b>: check <b>Deadlines in 14 days</b>.', '<b>IRCC Portal</b>: check for new IRCC messages or requests on submitted files.'])),
      card('Opening a case', steps(['Open the client (Contacts) → <b>Case</b>. Choose the application type, priority and deadline.', 'Assign the case. Then click <b>Start checklist</b> on the case and hand the documents part to the assistant (<b>Reassign</b>).'])),
      card('Preparing the forms', steps([
        'When the assistant hands off, you get a task “Prepare forms”. Open it.',
        'Read the documents part first, including the notes. If something is missing, click <b>Back to documents</b> with a note.',
        'Complete each form and letter in the <b>Forms</b> part and tick it. Add a line with <b>Add</b> for anything extra this file needs.',
        'Click <b>Send to RCIC for final review</b>. The RCIC gets a task.',
        'After approval you get a task “Approved — submit the application”. Submit it, then update the case: status <b>Submitted</b>, submission date and IRCC file number.',
      ])),
      card('Good habits', ul(['Record every client call or meeting with <b>Log activity</b> on the client page.', 'Add passport, permit and medical expiry dates as <b>Document expiry dates</b> so the dashboard warns you.', 'Keep the case status up to date; the dashboard charts use it.'])),
    ],
  },
  rcic: {
    label: 'RCIC & Owner',
    intro: 'You are the licensee: you give the advice, sign every agreement and approve every application before it is submitted. The dashboard routes those decisions to you.',
    parts: [
      card('Your review queue', steps([
        '<b>Dashboard</b> → <b>Your work queue</b> lists drafts waiting for your signature and files waiting for your approval. The sidebar shows the same counts next to <b>Agreements</b> and <b>Checklists</b>.',
        '<b>Agreements → Needs review</b>: open a draft, read the preview, change anything, then <b>Sign &amp; send</b> (or <b>Sign on paper</b>). Or click <b>Return for changes</b> with a note.',
        '<b>Checklists → Waiting for RCIC review</b>: check the documents and forms, tick each item in <b>3. RCIC final review</b>, then <b>Approve — ready to submit</b>, or <b>Return for changes</b> to forms or documents with a note.',
      ])),
      card('Setting up the team', steps([
        '<b>Team &amp; Access</b>: invite staff with their company email and choose their role.',
        'The permission table decides what each role can do. The assistant role has “Draft agreements for RCIC review” and “Work on case checklists”, but not signing or approval.',
        '<b>Business Settings → Checklists</b>: edit the document lists for each application type, or add your own.',
        '<b>Business Settings → Fee schedule</b>: prices used when an agreement is generated.',
      ])),
      card('Compliance reminders', ul([
        'RA 4.1: Initial Consultation Agreement before giving paid advice. RA 5.1: a Retainer Agreement within 10 days of starting work.',
        'You stay responsible for your staff’s work (supervision): check drafts and checklists properly before you sign or approve.',
        'Each signed agreement keeps a SHA-256 fingerprint and a full history. Void it and create a new one to change terms; never edit a signed agreement.',
      ])),
    ],
  },
  bookkeeper: {
    label: 'Bookkeeper',
    intro: 'You look after invoices, payments, the trust account and the books.',
    parts: [
      card('Day to day', steps([
        '<b>Sales &amp; Invoices</b>: create invoices from a case (<b>Invoice this case</b>) so they match the agreed milestones.',
        '<b>Trust (Client Funds)</b>: record retainers received into trust and transfers out when a milestone is earned.',
        '<b>Receipts</b> and <b>Expenses &amp; Bills</b>: upload receipts and record costs.',
        '<b>Banking</b> and <b>Reports</b>: reconcile and run monthly reports.',
      ])),
    ],
  },
};
ROLES.owner = ROLES.rcic;

export async function render(el) {
  const mine = state.profile.role;
  let tab = (location.hash.match(/[?&]role=(\w+)/) || [])[1] || (ROLES[mine] ? (mine === 'owner' ? 'rcic' : mine) : 'flow');
  const { data: perms } = await db.from('permissions').select('key, label, category').order('category');
  const yours = (perms || []).filter((p) => can(p.key));
  const TABS = [['flow', 'How a file moves', 'file'], ['assistant', 'Assistant', 'users'], ['case_manager', 'Case Manager', 'briefcase'], ['rcic', 'RCIC & Owner', 'user'], ['bookkeeper', 'Bookkeeper', 'coins']];
  const draw = () => {
    el.innerHTML = `<div class="gd2-tabs" id="tabs">${TABS.map(([k, l, ic]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}</div>
      <div class="gd2-info">${icon('alert')}<span>You are signed in as <b>${esc(ROLE_LABEL[mine] || mine)}</b>. Your access: ${mine === 'owner' ? 'everything' : yours.map((p) => esc(p.label)).join(' · ') || 'basic access'}. Ask the owner to change it on Team &amp; Access.</span></div>
      ${tab === 'flow' ? `<div class="gd-role">${card('From first contact to decision', `<div class="cl-flow" style="margin-top:6px">${FLOW.map(([t, d, who]) => `<div class="cl-flow-s"><b>${t}</b><small>${d}</small><small style="margin-top:4px"><span class="badge b-navy">${who}</span></small></div>`).join(`<span class="cl-flow-a">${icon('arrowr')}</span>`)}</div>`)}
        ${card('How a hand-off works', ul(['Each checklist step has one person responsible, shown as <b>Assigned to</b>.', 'Handing off moves the file to the next step and gives the next person a task with your note; your own task closes automatically.', 'Nobody can skip a step: every required line must be ticked or marked N/A with a note.', 'Only the RCIC can approve. The RCIC can return a file to forms or documents with a note saying what to fix.', 'Everything is kept in the checklist’s <b>History</b>: who did what, when, and why.']))}
        ${card('Where things are', ul(['<b>Dashboard</b>: your work queue, appointments, tasks and alerts.', '<b>Checklists</b>: every file and the step it is at.', '<b>Cases</b>: each application, its status and deadlines.', '<b>Agreements</b>: drafts, sent, signed.', '<b>Tasks</b>: everything assigned to you, with an <b>Open</b> button.', '<b>Team Chat</b>: quick questions to the team.', '<b>Legal &amp; Research</b>: IRCC, CICC and IRB references.']))}</div>`
        : `<div class="gd2-intro">${icon('shield')}<span>${ROLES[tab].intro}</span></div><div class="gd-role">${ROLES[tab].parts.join('')}</div>`}`;
    el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { tab = b.dataset.k; draw(); } };
  };
  draw();
}
