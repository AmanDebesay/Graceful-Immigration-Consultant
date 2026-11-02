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

const card = (title, body) => `<div class="card gd-card"><div class="card-b"><h4>${title}</h4>${body}</div></div>`;
const steps = (list) => `<ol class="gd-steps">${list.map((s) => `<li>${s}</li>`).join('')}</ol>`;
const ul = (list, cls = '') => `<ul class="${cls}">${list.map((s) => `<li>${s}</li>`).join('')}</ul>`;

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
  const TABS = [['flow', 'How a file moves'], ['assistant', 'Assistant'], ['case_manager', 'Case Manager'], ['rcic', 'RCIC & Owner'], ['bookkeeper', 'Bookkeeper']];
  const draw = () => {
    el.innerHTML = `<div class="toolbar"><div class="seg" id="tabs">${TABS.map(([k, l]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="alert info">You are signed in as <b>${esc(ROLE_LABEL[mine] || mine)}</b>. Your access: ${mine === 'owner' ? 'everything' : yours.map((p) => esc(p.label)).join(' · ') || 'basic access'}. Ask the owner to change it on Team &amp; Access.</div>
      ${tab === 'flow' ? `<div class="gd-role">${card('From first contact to decision', `<div class="cl-flow" style="margin-top:6px">${FLOW.map(([t, d, who]) => `<div class="cl-flow-s"><b>${t}</b><small>${d}</small><small style="margin-top:4px"><span class="badge b-navy">${who}</span></small></div>`).join(`<span class="cl-flow-a">${icon('arrowr')}</span>`)}</div>`)}
        ${card('How a hand-off works', ul(['Each checklist step has one person responsible, shown as <b>Assigned to</b>.', 'Handing off moves the file to the next step and gives the next person a task with your note; your own task closes automatically.', 'Nobody can skip a step: every required line must be ticked or marked N/A with a note.', 'Only the RCIC can approve. The RCIC can return a file to forms or documents with a note saying what to fix.', 'Everything is kept in the checklist’s <b>History</b>: who did what, when, and why.']))}
        ${card('Where things are', ul(['<b>Dashboard</b>: your work queue, appointments, tasks and alerts.', '<b>Checklists</b>: every file and the step it is at.', '<b>Cases</b>: each application, its status and deadlines.', '<b>Agreements</b>: drafts, sent, signed.', '<b>Tasks</b>: everything assigned to you, with an <b>Open</b> button.', '<b>Team Chat</b>: quick questions to the team.', '<b>Legal &amp; Research</b>: IRCC, CICC and IRB references.']))}</div>`
        : `<div class="card" style="margin-bottom:16px"><div class="card-b"><p style="font-size:15px">${ROLES[tab].intro}</p></div></div><div class="gd-role">${ROLES[tab].parts.join('')}</div>`}`;
    el.querySelector('#tabs').onclick = (e) => { if (e.target.dataset.k) { tab = e.target.dataset.k; draw(); } };
  };
  draw();
}
