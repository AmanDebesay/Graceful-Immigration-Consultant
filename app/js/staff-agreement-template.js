// Employment agreement for new staff (e.g. Immigration Case Assistant), on the company letterhead.
// Every fact comes from `d`, so the owner can change the role, address, term, pay, duties and schedules.
// render(d) returns self-contained HTML for preview and printing.

const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = (t) => String(t || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
const blank = (n = 18) => '_'.repeat(n);
const val = (v, n) => (String(v ?? '').trim() ? e(v) : blank(n));
const longDate = (d, n = 18) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : blank(n));
const money = (n) => (Number(n) ? Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : blank(8));
const LOGO = 'https://gracefulimmigration.ca/public/img/logo-emblem.png';

export const PROVINCES = {
  AB: ['Alberta', 'Employment Standards Code (Alberta)'],
  BC: ['British Columbia', 'Employment Standards Act (British Columbia)'],
  MB: ['Manitoba', 'The Employment Standards Code (Manitoba)'],
  NB: ['New Brunswick', 'Employment Standards Act (New Brunswick)'],
  NL: ['Newfoundland and Labrador', 'Labour Standards Act (Newfoundland and Labrador)'],
  NS: ['Nova Scotia', 'Labour Standards Code (Nova Scotia)'],
  NT: ['Northwest Territories', 'Employment Standards Act (Northwest Territories)'],
  NU: ['Nunavut', 'Labour Standards Act (Nunavut)'],
  ON: ['Ontario', 'Employment Standards Act, 2000 (Ontario)'],
  PE: ['Prince Edward Island', 'Employment Standards Act (Prince Edward Island)'],
  QC: ['Québec', 'Act respecting labour standards (Québec)'],
  SK: ['Saskatchewan', 'The Saskatchewan Employment Act'],
  YT: ['Yukon', 'Employment Standards Act (Yukon)'],
};
const prov = (d) => PROVINCES[d.work_province] || PROVINCES.ON;

const NOT_ALLOWED = `give immigration or legal advice, recommend a program or strategy, assess eligibility, or predict whether an application will succeed
represent a client, or communicate with IRCC, the CBSA or the IRB as a representative, or submit an application as the representative
sign or certify any form or declaration on behalf of the Employer or a client
handle, access or move client money or the Employer’s trust account
use the title consultant, RCIC, or any title suggesting licensure, or describe themselves as authorized to give advice
promise or guarantee any result`;
const ESCALATE = `answering a client’s question about eligibility, options, strategy, chances of approval or risks
choosing which form or program to use, or deciding what information to include or leave out of a form
responding to any letter, notice or request from IRCC, the CBSA or the IRB
handling a client who is upset, in an urgent situation, or at risk of losing status
anything involving fees, refunds or payments
publishing any marketing content`;
const DEVICES = `Login | Own unique login with multi-factor authentication. No shared accounts or shared passwords.
Devices | A device the Employer approves, with screen lock, up-to-date software and disk encryption. No storing client documents on personal devices, email or messaging apps.
Communication | Client communication through approved channels only. No passports or identity documents by WhatsApp or regular email.
Review | The Supervising Consultant may review activity logs and the Employee’s work at any time.
End of Term | Access ends on the last day of employment. All files are returned or deleted and confirmed in writing.`;

// Ready-made roles. Choosing one fills the role-specific parts; everything stays editable afterwards.
export const ROLE_PRESETS = {
  case_assistant: {
    label: 'Immigration Case Assistant', role_title: 'Immigration Case Assistant',
    duties: `help clients complete immigration forms and checklists using information and documents the client provides, for review by the Supervising Consultant
collect, organize, label and check documents for completeness against the Supervising Consultant’s checklists
update the case-tracking dashboard and keep file notes accurate and current
schedule appointments and send reminders and administrative messages approved by the Supervising Consultant
prepare marketing content (social media, flyers, website text, newsletters) as drafts, which must be approved by the Supervising Consultant before publication
perform other administrative tasks the Supervising Consultant reasonably assigns`,
    access: `Access level | “Assistant” role only: view and update assigned client files, upload and label documents, update case status and notes, and schedule and message clients using approved templates.
No access | Trust account, billing and payments, client agreement signing, administrator settings, staff accounts, and any ability to export all client data.`,
    training: `# Week 1 – Rules before tasks
CICC Code of Professional Conduct (the parts that apply to staff) and what unlicensed staff may and may not do
Confidentiality, privacy and security: handling passports, identity documents and client files
Practice dashboard walkthrough in the assistant role, using test files
Escalation rules (Schedule B)
Sign-off: short written quiz and signed acknowledgement
# Weeks 2–4 – Forms and documents, closely supervised
IRCC forms and online account basics: how forms are structured and the common errors that cause refusals
Document checklists for the main programs the practice handles; naming and filing standards
Practice on completed or fictional files, then real files with every form reviewed by the Supervising Consultant
Client communication scripts: what to say, and how to pass questions on
# Weeks 5–8 – Case tracking and client service
Deadlines, expiry dates and reminders; accurate status notes
Client intake and document collection, with review before anything is submitted
Handling difficult messages and escalation in practice
# Weeks 9–12 – Marketing and working within limits
CICC advertising rules: accuracy, no guarantees, testimonials and required licence information
Drafting marketing content for approval; using the brand and templates
Working through a full file under review; end-of-term review meeting`,
  },
  office_admin: {
    label: 'Office Administrator / Receptionist', role_title: 'Office Administrator',
    duties: `answer calls, emails and website enquiries, and book consultations in the Employer’s calendar
greet clients and handle general, non-advice questions using approved scripts
open new client files in the practice dashboard and keep contact details accurate
send appointment reminders and administrative messages approved by the Supervising Consultant
scan, name and file documents according to the Employer’s filing standards
order office supplies and keep the office and shared folders organized
perform other administrative tasks the Supervising Consultant reasonably assigns`,
    access: `Access level | “Assistant” role only: contacts, calendar, tasks and document upload for assigned files.
No access | Trust account, billing and payments, client agreement signing, administrator settings, staff accounts, and any ability to export all client data.`,
    training: `# Week 1 – Rules before tasks
What unlicensed staff may and may not do; escalation rules (Schedule B)
Confidentiality, privacy and security for client information
Practice dashboard walkthrough using test files
# Weeks 2–4 – Front desk and scheduling
Phone and email scripts; booking and rescheduling consultations
Opening client files and filing documents
# Weeks 5–12 – Working independently within limits
Handling difficult calls and urgent situations by escalating
Monthly review of a sample of the Employee’s work`,
  },
  marketing: {
    label: 'Marketing Coordinator', role_title: 'Marketing Coordinator',
    duties: `draft social media posts, flyers, website text and newsletters for the Supervising Consultant’s approval
keep the content calendar and publish only content the Supervising Consultant has approved in writing
design graphics and short videos using the Employer’s brand and templates
track enquiries and report monthly on what marketing brought in
make sure all content follows CICC advertising rules
perform other marketing tasks the Supervising Consultant reasonably assigns`,
    access: `Access level | Newsletter and website content tools; no access to client files unless a task needs it and the Supervising Consultant grants it.
No access | Client files, trust account, billing and payments, client agreement signing, administrator settings and staff accounts.`,
    training: `# Week 1 – Rules before tasks
CICC advertising rules: accuracy, no guarantees, testimonials with written consent, required licence information
Confidentiality and privacy: never using client information or images without written consent
Brand guide and templates
# Weeks 2–12 – Drafting for approval
Content calendar, drafting and approval workflow
Monthly results review with the Supervising Consultant`,
  },
  bookkeeper: {
    label: 'Bookkeeper', role_title: 'Bookkeeper',
    duties: `record sales, expenses, bills and receipts in the Employer’s accounting system
reconcile bank and credit card accounts each month
prepare GST returns and payroll records for the Supervising Consultant’s review
keep client trust account records as required by the CICC, without authority to move trust money
prepare monthly financial reports
perform other bookkeeping tasks the Supervising Consultant reasonably assigns`,
    access: `Access level | “Bookkeeper” role: accounting, invoices, expenses, banking and reports; read-only trust records.
No access | Moving client money, client agreement signing, administrator settings, staff accounts, and client immigration files.`,
    training: `# Week 1 – Rules before tasks
Confidentiality and privacy; what staff may and may not do
CICC client account (trust) rules and record-keeping
Accounting system walkthrough
# Weeks 2–12 – Supervised bookkeeping
Monthly close and reconciliation under review
GST and payroll preparation for approval`,
  },
};

export const NOT_ALLOWED_DEFAULT = NOT_ALLOWED, ESCALATE_DEFAULT = ESCALATE, DEVICES_DEFAULT = DEVICES;

export function staffDefaults(settings = {}, preset = 'case_assistant') {
  const p = ROLE_PRESETS[preset] || ROLE_PRESETS.case_assistant;
  return {
    preset, agreement_date: new Date().toLocaleDateString('en-CA'),
    business_name: settings.business_name || 'Graceful Immigration Consultant Inc.', business_address: settings.address || '',
    business_phone: settings.phone || '', business_email: settings.email || '', website: settings.website || 'gracefulimmigration.ca',
    rcic_name: settings.rcic_name || '', rcic_id: settings.licence_number || '', rcic_designation: 'RCIC-IRB',
    supervisor_name: settings.rcic_name || '', supervisor_id: settings.licence_number || '',
    employee_name: '', employee_address: '', employee_email: '', employee_phone: '', work_province: 'ON',
    role_title: p.role_title, doc_title: '', subtitle: '',
    term_type: 'fixed', start_date: '', end_date: '', term_months: 3, probation_months: 3, early_notice_weeks: 1,
    hours_type: 'part_time', hours_expected: '', hours_max: '', work_place: 'remote', work_place_text: '',
    pay_type: 'hourly', wage: '', pay_frequency: 'every two weeks', vacation_pct: 4, benefits: 'The Employee is not entitled to group benefits.',
    non_solicit_months: 6, include_training: true, include_witness: true,
    duties: p.duties, not_allowed: NOT_ALLOWED, escalation: ESCALATE, access: p.access + '\n' + DEVICES, training: p.training, extra_terms: '',
  };
}

// Pieces the editor and list need too.
export const docTitle = (d) => String(d.doc_title || '').trim() || (d.term_type === 'fixed' ? 'Fixed-Term Employment Agreement' : 'Employment Agreement');
export function subtitle(d) {
  if (String(d.subtitle || '').trim()) return d.subtitle.trim();
  const hrs = { part_time: 'Part-Time, As Needed', part_time_fixed: 'Part-Time', full_time: 'Full-Time' }[d.hours_type] || '';
  const place = { remote: 'Remote', office: 'In Office', hybrid: 'Hybrid' }[d.work_place] || '';
  return `${d.role_title || 'Employee'} (${[hrs, place].filter(Boolean).join(', ')})`;
}
export function endDate(d) {
  if (d.end_date || !d.start_date || !Number(d.term_months)) return d.end_date || '';
  const s = new Date(d.start_date + 'T00:00:00'); s.setMonth(s.getMonth() + Number(d.term_months)); s.setDate(s.getDate() - 1);
  return s.toLocaleDateString('en-CA');
}
const months = (n) => { const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n]; return `${w ? w + ' ' : ''}(${n}) month${n == 1 ? '' : 's'}`; };
const weeks = (n) => { const w = ['zero', 'one', 'two', 'three', 'four'][n]; return `${w ? w + ' ' : ''}(${n}) week${n == 1 ? '' : 's'}`; };

const STYLE = `<style>
.gi-emp{font-family:'Times New Roman',Georgia,serif;color:#1C2333;font-size:14.5px;line-height:1.5;max-width:820px;margin:0 auto}
.gi-emp *{box-sizing:border-box}
.gi-emp .lh{text-align:center;padding-bottom:10px}
.gi-emp .lh img{width:120px;height:auto;display:block;margin:0 auto}
.gi-emp .wm{margin:-4px 0 10px;line-height:1}.gi-emp .wm b{display:block;font-family:Georgia,'Times New Roman',serif;font-size:34px;color:#0B2A5C;font-weight:700;letter-spacing:-.01em}.gi-emp .wm span{display:block;font-family:Georgia,serif;font-size:12.5px;color:#0B2A5C;margin-top:2px}
.gi-emp .lh-line{border-top:1.5px solid #C9A24A;border-bottom:1.5px solid #C9A24A;padding:7px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0B2A5C;line-height:1.6}
.gi-emp h1{text-align:center;font-size:27px;letter-spacing:.02em;color:#0B2A5C;margin:24px 0 2px;font-weight:700;text-transform:uppercase}
.gi-emp .sub{text-align:center;font-style:italic;color:#5B6476;margin-bottom:18px}
.gi-emp h2{font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0B2A5C;margin:20px 0 8px;text-transform:uppercase;page-break-after:avoid;break-after:avoid}
.gi-emp .cl{display:grid;grid-template-columns:44px 1fr;margin:0 0 9px}.gi-emp .cl>b{font-weight:700}
.gi-emp .cl p{margin:0 0 6px;text-align:justify}
.gi-emp ul{margin:4px 0 6px 22px;padding:0}.gi-emp li{margin-bottom:4px;text-align:justify}
.gi-emp .party{margin:4px 0 12px 44px;text-align:justify}
.gi-emp table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:13.5px;page-break-inside:auto}
.gi-emp th,.gi-emp td{border:1px solid #C9CED8;padding:8px 10px;text-align:left;vertical-align:top}
.gi-emp thead th{background:#0B2A5C;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:13px}
.gi-emp tbody tr:nth-child(even) td{background:#F5F0E6}.gi-emp td:first-child{font-weight:700;width:150px}
.gi-emp h3{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0B2A5C;margin:14px 0 4px}
.gi-emp .sig h3{border-bottom:1.5px solid #C9A24A;padding-bottom:5px;margin:22px 0 14px;font-family:'Times New Roman',serif;font-size:14.5px;max-width:640px}
.gi-emp .sig .row{display:grid;grid-template-columns:110px 1fr;margin:0 0 18px;max-width:640px}
.gi-emp .ini{margin-top:22px}
.gi-emp .newpage{page-break-before:always;break-before:page}
.gi-emp .foot{margin-top:26px;border-top:1.5px solid #C9A24A;padding-top:6px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5B6476}
@media print{.gi-emp{font-size:11.5pt;max-width:none}.gi-emp .foot{display:none}}
</style>`;

function runningPage(d) {
  const css = (v) => String(v ?? '').replace(/[\\"]/g, '\\$&').replace(/[\n\r<>]/g, ' ');
  const foot = [d.business_name, d.business_phone, d.business_email, d.website].filter(Boolean).map(css).join('  |  ');
  return `<style>@media print{@page{margin:18mm 17mm 20mm;
    @top-right{content:"${css(docTitle(d))}\\A ${css(d.role_title)}";white-space:pre;font:bold 9pt Arial,Helvetica,sans-serif;color:#0B2A5C}
    @bottom-center{content:"${foot}\\A Confidential  |  Page " counter(page) " of " counter(pages);white-space:pre;font:8pt Arial,Helvetica,sans-serif;color:#6B7385}}
    @page:first{@top-right{content:none}}}</style>`;
}

const wordmark = (name) => { const [first, ...rest] = String(name || '').trim().split(/\s+/); return first ? `<div class="wm"><b>${e(first)}</b>${rest.length ? `<span>${e(rest.join(' '))}</span>` : ''}</div>` : ''; };
export function render(d) {
  const P = prov(d), fixed = d.term_type === 'fixed', end = endDate(d);
  const sv = `${e(d.supervisor_name || d.rcic_name)}`;
  let n = 0;
  const sec = (title, clauses) => { n++; let c = 0; return `<h2>${n}. ${e(title)}</h2>${clauses.filter(Boolean).map((x) => `<div class="cl"><b>${n}.${++c}</b><div>${x}</div></div>`).join('')}`; };
  const ul = (t) => `<ul>${lines(t).map((x) => `<li>${e(x.replace(/[;.]\s*(and)?$/, ''))}</li>`).join('')}</ul>`;
  const hoursTxt = d.hours_type === 'full_time'
    ? `The work is <b>full-time</b>, approximately ${val(d.hours_expected, 5)} hours per week.`
    : `The work is <b>part-time${d.hours_type === 'part_time' ? ' and as needed' : ''}</b>.${d.hours_type === 'part_time' ? ' The Employer does not guarantee any minimum hours.' : ''} The Employer expects to assign approximately ${val(d.hours_expected, 5)} hours per week, and no more than ${val(d.hours_max, 5)} hours per week unless the Supervising Consultant approves more in advance.`;
  const placeTxt = d.work_place === 'office'
    ? `The Employee works at the Employer’s office${d.work_place_text ? ` at ${e(d.work_place_text)}` : ''}, and keeps client information out of sight of visitors.`
    : `The Employee works <b>${d.work_place === 'hybrid' ? 'partly at the Employer’s office and partly remotely' : 'remotely'} from ${e(d.work_place_text || P[0])}</b>, from a private space where client information cannot be seen or overheard, and will tell the Employer if the work location changes.`;
  const access = lines(d.access).map((l) => { const [k, ...v] = l.split('|'); return [k.trim(), v.join('|').trim()]; });
  const stages = []; lines(d.training).forEach((l) => { if (l.startsWith('#')) stages.push({ h: l.replace(/^#+\s*/, ''), items: [] }); else (stages[stages.length - 1] || stages[stages.push({ h: '', items: [] }) - 1]).items.push(l); });
  const schedC = d.include_training && stages.length;

  const body = [
    sec('Position and reporting', [
      `<p>The Employer hires the Employee as an <b>${val(d.role_title, 24)}</b>.</p>`,
      `<p>The Employee reports to ${sv}, a Regulated Canadian Immigration Consultant (${e(d.rcic_designation || 'RCIC')}, CICC Licence No. ${val(d.supervisor_id || d.rcic_id, 10)}) licensed by the College of Immigration and Citizenship Consultants (the “CICC”), who supervises all of the Employee’s work (the “Supervising Consultant”).</p>`]),
    fixed ? sec('Fixed term', [
      `<p>Employment begins on ${longDate(d.start_date)} and ends automatically on ${longDate(end)}, ${months(Number(d.term_months) || 0)} after the start date (the “Term”). No notice of termination is required when the Term ends, and no severance or termination pay is owed because the Term has ended.</p>`,
      `<p>This is a temporary position. It does not create any expectation of renewal, extension, longer-term employment, licensing support, or any ownership or partnership in the Employer’s business. Any extension must be in writing and signed by both parties.</p>`,
      `<p>During the Term, either party may end the employment early by giving ${weeks(Number(d.early_notice_weeks) || 1)} of written notice, or any longer notice or pay required by applicable employment standards legislation. The Employer may end the employment immediately for just cause, including breach of confidentiality or of Section 5.</p>`])
    : sec('Start date and probation', [
      `<p>Employment begins on ${longDate(d.start_date)} and continues until it is ended under this Agreement.</p>`,
      Number(d.probation_months) ? `<p>The first ${months(Number(d.probation_months))} are a probationary period, during which the Employer will assess the Employee’s suitability for the role. During probation, the employment may be ended with the notice or pay required by the ${e(P[1])}, if any.</p>` : '',
      `<p>Either party may end the employment by giving written notice. The Employer will give the notice, or pay instead of notice, and any severance pay required by the ${e(P[1])}. The Employee will give at least ${weeks(Number(d.early_notice_weeks) || 2)} of written notice. The Employer may end the employment for just cause, including breach of confidentiality or of Section 5, as permitted by law.</p>`]),
    sec(`${d.hours_type === 'full_time' ? 'Hours' : 'Part-time work'} and place of work`, [
      `<p>${hoursTxt}</p>`, `<p>${placeTxt}</p>`,
      `<p>The Employee will record hours worked each pay period. Overtime is not authorized unless approved in writing in advance, and any overtime worked will be paid as required by law.</p>`]),
    sec('Pay and vacation', [
      d.pay_type === 'salary'
        ? `<p><b>Salary:</b> $${money(d.wage)} per year, paid ${e(d.pay_frequency)} by direct deposit, which will never be less than the ${e(P[0])} minimum wage for the hours worked.</p>`
        : `<p><b>Wage:</b> $${money(d.wage)} per hour, which will never be less than the ${e(P[0])} minimum wage, paid ${e(d.pay_frequency)} by direct deposit for hours actually worked and approved.</p>`,
      `<p>The Employer will deduct and remit income tax, Canada Pension Plan contributions and Employment Insurance premiums as required by law, and will provide a pay statement each pay period.</p>`,
      d.pay_type === 'salary'
        ? `<p><b>Vacation:</b> the Employee is entitled to the paid vacation required by the <i>${e(P[1])}</i>, and at least ${e(d.vacation_pct)}% vacation pay. <b>Public holiday pay</b> will be paid as required by law.</p>`
        : `<p><b>Vacation pay</b> of ${e(d.vacation_pct)} percent (${e(d.vacation_pct)}%) of gross wages (or the greater amount required by the <i>${e(P[1])}</i>) will be paid with each pay. <b>Public holiday pay</b> will be paid as required by law.</p>`,
      `<p>${e(d.benefits || '')} Expenses are reimbursed only if approved in writing in advance and supported by receipts.</p>`]),
    sec('Duties and limits of the role', [
      `<p><b>Duties.</b> Under the Supervising Consultant’s direction, the Employee will:</p>${ul(d.duties)}`,
      `<p><b>What the Employee must not do.</b> Only licensed immigration consultants and lawyers may give immigration advice or represent people in Canada. The Employee must <b>not</b>:</p>${ul(d.not_allowed)}`,
      `<p>If a client asks a question that requires advice, the Employee will not answer it and will pass it to the Supervising Consultant immediately, following the escalation rules in Schedule B.</p>`,
      `<p><b>Marketing.</b> All marketing must follow CICC advertising rules: it must be accurate, must not promise outcomes, must not use client testimonials without written consent, and must show licence information where required.</p>`,
      `<p>The Employee will follow the CICC Code of Professional Conduct as it applies to the Employer’s staff, and the Employer’s written policies and instructions.</p>`]),
    sec('Confidentiality and privacy', [
      `<p>“Confidential Information” includes all client information and documents (including passports, identity documents, immigration history, and financial and family details), case details, and the Employer’s business information, fees, systems, pricing and marketing plans.</p>`,
      `<p>The Employee will keep Confidential Information strictly confidential, use it only to perform the job, and not copy, download, photograph, forward or store it outside the Employer’s approved systems. This duty continues after the employment ends.</p>`,
      `<p>The Employee will follow the Employer’s privacy practices and applicable privacy law, including the federal <i>Personal Information Protection and Electronic Documents Act</i> and Alberta’s <i>Personal Information Protection Act</i>, and will report any suspected privacy breach, lost device or unauthorized access to the Supervising Consultant <b>immediately, and no later than the same day</b>.</p>`,
      `<p>The Employee will not discuss clients or cases with anyone outside the Employer.</p>`]),
    sec('Systems access and security', [
      `<p>The Employee will be given access to the ${e(d.business_name)} practice dashboard and related systems <b>only to the extent needed for the role</b>, as set out in Schedule A.</p>`,
      `<p>The Employee will not share passwords or login codes, will use multi-factor authentication, will use only approved devices and secure networks, and will not use public Wi-Fi to access client information.</p>`,
      `<p><b>Work records.</b> The Employee is informed and agrees that the practice dashboard automatically records, for work and compliance purposes: (a) each sign-in, with its date, time and device type; (b) <b>active working time</b>, counted only while the dashboard is open on screen and in use (time when the window is minimized, another program is in front, or there has been no mouse or keyboard activity for 5 minutes is not counted); (c) the pages worked in; and (d) the actions taken on client files, documents, money, agreements and tasks (the audit log). The Employee can see and download their own record at any time under <b>Work Time</b>. The Supervising Consultant can see and download the records of all staff and may use them in staff meetings, performance reviews, payroll, and College or privacy reviews. Private messages between staff in Team Chat are not read under this clause.</p>`,
      `<p>These records are kept for the same period as the Employer’s other business records and are handled under Alberta’s <i>Personal Information Protection Act</i>. They are collected only for reasonable purposes related to the employment.</p>`,
      `<p>The Employer may monitor and review use of its systems and may limit, suspend or remove access at any time.</p>`]),
    sec('Ownership of work', [
      `<p>All work the Employee produces for the Employer (including documents, templates, marketing content, designs and notes) belongs to the Employer. The Employee assigns all rights in that work to the Employer and waives moral rights to the extent permitted by law.</p>`,
      `<p>The Employee will not use the Employer’s name, logo, content or client information for any other purpose.</p>`]),
    sec('Conflicts and client protection', [
      `<p>During the employment, the Employee will not work for or provide services to another immigration consulting or legal immigration practice without written consent, and will immediately disclose any conflict of interest.</p>`,
      Number(d.non_solicit_months) ? `<p>During the employment and for ${months(Number(d.non_solicit_months))} afterwards, the Employee will not use Confidential Information to solicit or accept immigration work from the Employer’s clients or encourage clients to leave the Employer. This clause does not otherwise restrict the Employee from working in the immigration field after the employment ends.</p>` : '']),
    schedC ? sec('Training', [
      `<p>The Employee must complete the training in Schedule C within the times shown. Time spent on required training is paid work.</p>`,
      `<p>The Employer’s training and supervision do not create any promise of licensure, advancement or future employment.</p>`]) : '',
    sec('Right to work in Canada', [
      `<p>This employment is conditional on the Employee being legally entitled to work in Canada${fixed ? ' for the Term' : ''}. The Employee confirms that they are so entitled, will provide proof before starting (such as a work permit showing its conditions and expiry date), and will tell the Employer immediately if their status or work authorization changes.</p>`]),
    sec('Health, safety and respectful workplace', [
      `<p>The Employer will comply with applicable occupational health and safety law${d.work_place === 'office' ? '' : ', including for work from home'}. The Employee will report any work-related injury or hazard immediately.</p>`,
      `<p>The Employer does not tolerate harassment or discrimination. The Employee will act respectfully toward clients and colleagues, and may raise any concern with the Supervising Consultant, which the Employer will address promptly.</p>`]),
    sec('End of employment', [
      `<p>On or before the last day of ${fixed ? 'the Term (or earlier if the employment ends)' : 'employment'}, the Employee will return all Employer property and information, delete all Confidential Information from personal devices and accounts, and confirm this in writing. The Employer will end the Employee’s system access on the last day.</p>`]),
    lines(d.extra_terms).length ? sec('Additional terms', lines(d.extra_terms).map((x) => `<p>${e(x)}</p>`)) : '',
    sec('General', [
      `<p><b>Employment standards.</b> The Employee works in ${e(P[0])}, so the minimum standards of the <i>${e(P[1])}</i> apply. Nothing in this Agreement gives the Employee less than the law requires, and if any term does, the law applies instead. Subject to that, this Agreement is governed by the laws of Alberta and the federal laws of Canada that apply in Alberta.</p>`,
      `<p><b>Entire agreement.</b> This is the whole agreement between the parties and may be changed only in writing signed by both parties.</p>`,
      `<p><b>Severability.</b> If any part of this Agreement is found unenforceable, the rest continues in effect.</p>`,
      `<p><b>Independent advice.</b> The Employee confirms they had the opportunity to obtain independent legal advice before signing.</p>`,
      `<p><b>Signatures.</b> This Agreement may be signed electronically and in counterparts.</p>`]),
  ].join('');
  n++;
  const sigRows = (name) => `<div class="row"><span>Signature:</span><span>${blank(38)}</span></div><div class="row"><span>Name:</span><span>${name}</span></div><div class="row"><span>Date:</span><span>${blank(22)}</span></div>`;
  const sig = `<div class="sig newpage"><h2>${n}. Signatures</h2><p><b>SIGNED</b> by the parties on the dates written below.</p>
    <h3>EMPLOYER – ${e(d.business_name)}</h3>${sigRows(`${e(d.rcic_name)}, ${e(d.rcic_designation || 'RCIC')} (CICC Licence No. ${e(d.rcic_id)}), Authorized Signatory`)}
    <h3>EMPLOYEE</h3>${sigRows(String(d.employee_name || '').trim() ? e(d.employee_name) : blank(34))}
    ${d.include_witness ? `<h3>WITNESS (optional)</h3>${sigRows(blank(34))}` : ''}</div>`;
  const schedA = `<div class="newpage"><h2>Schedule A – System access and security</h2><table><thead><tr><th>Item</th><th>Rule</th></tr></thead><tbody>${access.map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`).join('')}</tbody></table>
    <h2>Schedule B – Escalation rules</h2><p>The Employee must stop and ask the Supervising Consultant before doing any of the following:</p>${ul(d.escalation)}</div>`;
  const scheduleC = schedC ? `<div class="newpage"><h2>Schedule C – Training plan${fixed && Number(d.term_months) ? ` (${months(Number(d.term_months)).replace(/ \(\d+\)/, '')})` : ''}</h2>
    <p>All training time is paid. The Supervising Consultant signs off each stage before the Employee works unsupervised on the next.</p>
    ${stages.map((s) => `${s.h ? `<h3>${e(s.h)}</h3>` : ''}<ul>${s.items.map((x) => `<li>${x.startsWith('Sign-off:') ? `<i>Sign-off:</i>${e(x.slice(9))}` : e(x)}</li>`).join('')}</ul>`).join('')}
    <p><b>Ongoing:</b> a weekly 30-minute check-in with the Supervising Consultant, a monthly review of a sample of the Employee’s files, and updates whenever IRCC or CICC rules change.</p>
    <p class="ini">Employee initials: ${blank(8)} &nbsp;&nbsp; Employer initials: ${blank(8)} &nbsp;&nbsp; Date: ${blank(14)}</p></div>` : '';

  return `${STYLE}${runningPage(d)}<div class="gi-emp">
    <div class="lh"><img src="${LOGO}" alt="">${wordmark(d.business_name)}<div class="lh-line"><b>${e(d.rcic_name)}</b>, ${e(d.rcic_designation || 'RCIC')} &nbsp;|&nbsp; CICC Licence No. ${e(d.rcic_id)}<br>${[d.business_phone, d.business_email, d.website ? 'https://' + String(d.website).replace(/^https?:\/\//, '') : '', 'Canada'].filter(Boolean).map(e).join(' &nbsp;|&nbsp; ')}</div></div>
    <h1>${e(docTitle(d))}</h1><div class="sub">${e(subtitle(d))}</div>
    <p>This Agreement is made as of ${longDate(d.agreement_date)}.</p>
    <p><b>BETWEEN:</b></p><p class="party"><b>${e(String(d.business_name || '').toUpperCase())}</b>, ${e(d.business_address)} (the “Employer”)</p>
    <p><b>AND:</b></p><p class="party">${String(d.employee_name || '').trim() ? `<b>${e(d.employee_name)}</b>` : `${blank(30)} (full legal name)`}, of ${val(d.employee_address, 40)} (the “Employee”)</p>
    ${body}${sig}${schedA}${scheduleC}
    <div class="foot">${[d.business_name, d.business_phone, d.business_email, d.website].filter(Boolean).map(e).join(' | ')}<br>Confidential</div></div>`;
}

// Facts that are still blank, shown as a checklist before printing.
export function missing(d) {
  const m = [];
  if (!String(d.employee_name || '').trim()) m.push('employee’s full legal name');
  if (!String(d.employee_address || '').trim()) m.push('employee’s address');
  if (!String(d.role_title || '').trim()) m.push('job title');
  if (!d.start_date) m.push('start date');
  if (d.term_type === 'fixed' && !endDate(d)) m.push('end date');
  if (!Number(d.wage)) m.push(d.pay_type === 'salary' ? 'salary' : 'hourly wage');
  if (d.hours_type !== 'full_time' && !String(d.hours_expected || '').trim()) m.push('expected hours per week');
  if (d.hours_type !== 'full_time' && !String(d.hours_max || '').trim()) m.push('maximum hours per week');
  if (!String(d.rcic_name || '').trim() || !String(d.rcic_id || '').trim()) m.push('RCIC name and licence number (Business Settings)');
  return m;
}
