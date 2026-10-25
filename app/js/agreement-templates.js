// Agreement templates built from the CICC "Guide for Developing Your Service Agreement" (2024),
// the Code of Professional Conduct s.24 and the Retainer Agreement Regulation (RA).
// render() returns self-contained HTML; it is frozen and hashed when the RCIC signs & sends.

const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const lines = (t) => String(t || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
const bullets = (t, fallback = '') => { const l = lines(t); return l.length ? `<ul>${l.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : fallback; };
const para = (t) => lines(t).map((x) => `<p>${e(x)}</p>`).join('');
const longDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '________________');
const initials = () => `<div class="ini">Client initials: <span class="gi-initials">______</span></div>`;

export const CICC = {
  name: 'College of Immigration and Citizenship Consultants (CICC)',
  address: '5500 North Service Road, Suite 1002, Burlington, Ontario L7L 6W6',
  phone: '289-348-0422 · Toll-free 1-877-836-7543',
  email: 'info@college-ic.ca',
  web: 'https://college-ic.ca',
  complaints: 'https://college-ic.ca/protecting-the-public/complaints-process',
  code: 'https://laws.justice.gc.ca/eng/regulations/SOR-2022-128/index.html',
};

export function defaults(type, { contact = {}, settings = {}, caseRow = null, pkg = null, consult = null } = {}) {
  const today = new Date().toLocaleDateString('en-CA');
  const base = {
    agreement_date: today, language: 'English',
    client_name: contact.full_name || '', client_dob: contact.date_of_birth || '', client_email: contact.email || '', client_phone: contact.phone || '',
    client_address: [contact.address, contact.city, contact.province, contact.postal_code, contact.country].filter(Boolean).join(', '),
    rcic_name: settings.rcic_name || '', rcic_id: settings.licence_number || '', business_name: settings.business_name || '',
    business_address: settings.address || '', business_phone: settings.phone || '', business_email: settings.email || '',
    gst_rate: settings.gst_number ? Number(settings.gst_rate || 5) : 0, gst_number: settings.gst_number || '', province: 'Alberta',
  };
  if (type === 'consultation') {
    return { ...base, purpose: 'Initial assessment of eligibility and immigration options in Canada.', consult_date: today, consult_length: `${consult?.minutes || 60} minutes`,
      consult_method: 'Video call (Zoom or Microsoft Teams)', fee: Number(consult?.fee ?? 60), payment_method: 'Interac e-Transfer or by phone before the consultation' };
  }
  const d = { ...base,
    file_number: caseRow?.case_number || '', program: caseRow?.application_type ? `${caseRow.application_type}` : '',
    preliminary_advice: '', consultation_ref: '', assistants: '', comm_methods: 'Email and telephone; WhatsApp for scheduling only', response_time: '2 business days',
    update_time: '2 business days',
    scope: 'Assessment of eligibility and advice\nPreparation of document checklist and review of client documents\nCompletion and review of all application forms\nPreparation of submission letter where appropriate\nSubmission of the application to IRCC on the client\'s behalf\nCommunication and follow-up with IRCC until a final decision is made',
    timeframes: 'Document checklist provided within 5 business days of signing this agreement\nApplication prepared within 15 business days of receiving all required documents\nGovernment processing times are set by IRCC and are outside the RCIC\'s control',
    instructions: '', designate: '', excluded: 'Judicial review or appeals before the Federal Court (lawyers only)\nCriminal law advice\nAny application not listed in the Services to be Provided section',
    billing: 'flat', milestones: [{ name: 'Signing of this agreement', included: 'Eligibility assessment, document checklist and file opening', fee: 0 },
      { name: 'Application ready for submission', included: 'Forms completed, documents reviewed, submission letter prepared', fee: 0 },
      { name: 'Application submitted to IRCC', included: 'Submission and acknowledgement of receipt', fee: 0 }],
    hourly_rate: 0, est_hours: 0, hourly_schedule: 'Invoiced monthly for hours worked',
    retainer: 0, retainer_replenish: 'The retainer will not be replenished unless agreed in writing.',
    disbursements: 'Courier and postage: at cost (estimated $0–$50)\nCertified translations: at cost, quoted before ordering\nDocument notarization: at cost',
    payment_days: 14, interest: 0, admin_fee: 0, cooling_off: true, dispute_days: 30, successor: '',
    payment_methods: 'Interac e-Transfer to the business email, cheque, or cash with receipt' };
  if (pkg) {
    d.program = pkg.program || d.program;
    if (pkg.scope) d.scope = pkg.scope;
    if ((pkg.milestones || []).length) d.milestones = pkg.milestones.map((m) => ({ name: m.name || '', included: m.included || '', fee: Number(m.fee || 0) }));
  }
  return d;
}

const STYLE = `<style>
.gi-agr{font-family:Georgia,'Times New Roman',serif;color:#1C2333;font-size:14.5px;line-height:1.6;max-width:800px;margin:0 auto}
.gi-agr h1{font-size:22px;text-align:center;color:#0B2A5C;margin:0 0 4px;letter-spacing:.04em}
.gi-agr .sub{text-align:center;color:#5B6476;font-size:13px;margin-bottom:22px}
.gi-agr h2{font-size:15.5px;color:#0B2A5C;margin:22px 0 6px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.gi-agr p{margin:0 0 9px}.gi-agr ul{margin:0 0 9px 22px}.gi-agr li{margin-bottom:4px}
.gi-agr .parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;border:1px solid #E3DCCD;border-radius:8px;padding:14px 16px;margin:10px 0 14px;font-size:13.5px}
.gi-agr .parties b{display:block;color:#0B2A5C;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
.gi-agr table{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:13px;font-family:Arial,sans-serif}
.gi-agr th,.gi-agr td{border:1px solid #D9D4C7;padding:7px 9px;text-align:left;vertical-align:top}.gi-agr th{background:#F6F2E9}
.gi-agr .r{text-align:right}.gi-agr .ini{text-align:right;font-family:Arial,sans-serif;font-size:12px;color:#5B6476;margin:4px 0 8px}
.gi-agr .gi-initials{font-weight:700;color:#0B2A5C;border-bottom:1px solid #999;padding:0 10px}
.gi-agr .sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}
.gi-agr .sig{border-top:1px solid #333;padding-top:6px;font-size:13px;min-height:110px}
.gi-agr .sig .gi-sig{height:70px;display:flex;align-items:flex-end;margin-top:-80px;margin-bottom:10px}
.gi-agr .sig img{max-height:70px;max-width:260px}.gi-agr .typed{font-family:'Brush Script MT',cursive;font-size:30px;color:#0B2A5C}
.gi-agr .note{font-size:12px;color:#5B6476;font-family:Arial,sans-serif}
@media (max-width:640px){.gi-agr .parties,.gi-agr .sigs{grid-template-columns:1fr}}
</style>`;

function header(title, d, extra = '') {
  return `<h1>${e(title)}</h1><div class="sub">${e(d.business_name)} · Agreement date: ${longDate(d.agreement_date)}${extra}</div>
  <div class="parties"><div><b>Regulated Canadian Immigration Consultant</b>${e(d.rcic_name)}<br>College ID: ${e(d.rcic_id)}<br>${e(d.business_name)}<br>${e(d.business_address)}<br>${e(d.business_phone)} · ${e(d.business_email)}</div>
    <div><b>Client</b>${e(d.client_name)}${d.client_dob ? `<br>Date of birth: ${longDate(d.client_dob)}` : ''}<br>${e(d.client_address || 'Address: ________________')}<br>${e(d.client_phone)}${d.client_email ? ' · ' + e(d.client_email) : ''}</div></div>`;
}
function signatures(d, title) {
  return `<h2>Signatures</h2><p>IN WITNESS WHEREOF this ${e(title)} has been executed by the parties on the dates written below.</p>
  <div class="sigs"><div class="sig"><div class="gi-sig" data-sig="client"></div>Client: <b>${e(d.client_name)}</b><br>Date: <span data-sig-date="client">________________</span></div>
    <div class="sig"><div class="gi-sig" data-sig="rcic"></div>RCIC: <b>${e(d.rcic_name)}</b>, College ID ${e(d.rcic_id)}<br>Date: <span data-sig-date="rcic">________________</span></div></div>
  <p class="note" style="margin-top:14px">Digital signatures are legally recognized under the federal Personal Information Protection and Electronic Documents Act (PIPEDA) and provincial legislation, and by CICC By-law 2021-2, s.1.1(aa).</p>`;
}
const regulator = `<p>The RCIC is licensed and regulated by the ${CICC.name}, the national regulator of immigration and citizenship consultants. ${CICC.address}. Telephone ${CICC.phone}. Email ${CICC.email}. Website ${CICC.web}.</p>`;

function consultation(d) {
  const tax = Math.round(Number(d.fee || 0) * Number(d.gst_rate || 0)) / 100;
  return `${STYLE}<div class="gi-agr">${header('INITIAL CONSULTATION AGREEMENT', d)}
  <p>This Initial Consultation Agreement (the “Agreement”) is made between the Regulated Canadian Immigration Consultant (the “RCIC”) and the Client named above, as required by section 4.1 of the Retainer Agreement Regulation before advice is given for a fee.</p>
  <h2>1. Purpose and scope of the consultation</h2>
  <p>This Agreement is for a one-time initial consultation only, specifically for: <b>${e(d.purpose)}</b></p>
  <p>Consultation: ${longDate(d.consult_date)} · ${e(d.consult_length)} · ${e(d.consult_method)}.</p>
  <p>No immigration application preparation, submission or ongoing representation is included under this Agreement. Any further services will require a separate written Retainer (Service) Agreement.</p>
  <h2>2. Limited-scope service</h2>
  <ul><li>The consultation is limited to general information, assessment and guidance based on the information provided by the Client.</li>
    <li>The RCIC will not act as the Client's representative before Immigration, Refugees and Citizenship Canada (IRCC), the Immigration and Refugee Board (IRB) or any other authority under this Agreement.</li>
    <li>No forms will be filed and no submissions will be made on the Client's behalf unless a separate Retainer Agreement is signed.</li></ul>
  <h2>3. No guarantee of outcome</h2>
  <p>Any opinion or information provided is based solely on the information the Client provides at the time of the consultation. The RCIC does not guarantee eligibility, approval, processing times or any particular outcome; all decisions are made by government authorities.</p>
  <h2>4. Consultation fee</h2>
  <table><tr><th>Description</th><th class="r">Amount (CAD)</th></tr><tr><td>Consultation fee</td><td class="r">${money(d.fee)}</td></tr>
    <tr><td>GST ${d.gst_rate ? `(${d.gst_rate}%)` : ''}</td><td class="r">${d.gst_rate ? money(tax) : 'Not applicable'}</td></tr>
    <tr><th>Total</th><th class="r">${money(Number(d.fee || 0) + tax)}</th></tr></table>
  <p>Payment method: ${e(d.payment_method)}. The fee is earned once the consultation has taken place and is non-refundable, unless otherwise required by law. If the RCIC cancels and the consultation is not rescheduled, the fee will be refunded in full.</p>
  <h2>5. Confidentiality</h2>
  <p>Under section 28 of the Code of Professional Conduct, the RCIC must keep confidential all information relating to the Client acquired in the course of the professional relationship, unless disclosure is authorized by the Client or required by law.</p>
  <h2>6. Privacy and consent</h2>
  <p>The Client consents to the collection, use and storage of personal information for the purpose of this consultation, in accordance with the Personal Information Protection and Electronic Documents Act (PIPEDA) and Alberta's Personal Information Protection Act. Records are stored securely in Canada. The Client understands that communication may occur by email or other electronic means and accepts the inherent risks of electronic communication.</p>
  <h2>7. Language</h2><p>The consultation will be provided in ${e(d.language)}. The Client may arrange an interpreter.</p>
  <h2>8. Regulator and complaints</h2>${regulator}<p>Information about the College's complaints process: ${CICC.complaints}</p>
  <h2>9. Governing law</h2><p>This Agreement is governed by the laws of the Province of ${e(d.province)} and the federal laws of Canada applicable therein.</p>
  <h2>10. Acknowledgement</h2><p>The Client acknowledges that they have read and understood this Agreement, had the opportunity to ask questions, and agree to be bound by its terms.</p>
  ${initials()}${signatures(d, 'Initial Consultation Agreement')}</div>`;
}

function retainer(d) {
  const rate = Number(d.gst_rate || 0);
  const ms = (d.milestones || []).filter((m) => m.name);
  const msTotal = ms.reduce((s, m) => s + Number(m.fee || 0), 0);
  const tax = (v) => Math.round(Number(v || 0) * rate) / 100;
  const fees = d.billing === 'hourly'
    ? `<p>The Client will be billed by the <b>hourly</b> method. This method will not be changed for the services in this Agreement.</p>
       <table><tr><th>Hourly rate</th><th>Anticipated hours</th><th class="r">Estimated professional fees</th></tr>
       <tr><td>${money(d.hourly_rate)} per hour</td><td>${e(d.est_hours)}</td><td class="r">${money(Number(d.hourly_rate || 0) * Number(d.est_hours || 0))}</td></tr></table>
       <p>Schedule of payments: ${e(d.hourly_schedule)}. Each invoice will itemize the services rendered, the dates and the time spent.</p>`
    : `<p>The Client will be billed by the <b>flat fee</b> method with payment by milestones. This method will not be changed for the services in this Agreement; if the Agreement ends early, earned fees are determined by the milestones completed.</p>
       <table><tr><th>Milestone (fee earned when completed)</th><th>What is included</th><th class="r">Fee</th><th class="r">GST</th><th class="r">Total</th></tr>
       ${ms.map((m) => `<tr><td>${e(m.name)}</td><td>${e(m.included)}</td><td class="r">${money(m.fee)}</td><td class="r">${rate ? money(tax(m.fee)) : 'N/A'}</td><td class="r">${money(Number(m.fee || 0) + tax(m.fee))}</td></tr>`).join('')}
       <tr><th colspan="2">Total professional fees</th><th class="r">${money(msTotal)}</th><th class="r">${rate ? money(tax(msTotal)) : 'N/A'}</th><th class="r">${money(msTotal + tax(msTotal))}</th></tr></table>
       <p>An invoice is issued when each milestone is completed and is payable within ${e(d.payment_days)} days.</p>`;
  return `${STYLE}<div class="gi-agr">${header('RETAINER (SERVICE) AGREEMENT', d, d.file_number ? ` · File no. ${e(d.file_number)}` : '')}
  <p>This Service Agreement contains the terms and conditions the RCIC will follow in providing immigration and/or citizenship services to the Client. It is made in accordance with the College of Immigration and Citizenship Consultants Act, the Code of Professional Conduct and the Retainer Agreement Regulation. The RCIC is licensed and regulated by the College of Immigration and Citizenship Consultants (the “College”). Both parties agree to the terms below and accept the responsibilities and obligations they set out.</p>

  <h2>1. Summary of preliminary advice</h2>
  ${para(d.preliminary_advice) || '<p>________________</p>'}${d.consultation_ref ? `<p>Reference: Initial Consultation Agreement ${e(d.consultation_ref)}.</p>` : ''}
  <p>The RCIC has also advised that any existing or potential criminal matter may affect the outcome and that additional documents may be required; the RCIC does not provide criminal law advice.</p>${initials()}

  <h2>2. General provisions</h2>
  <p>The RCIC commits to providing the Client with quality immigration and/or citizenship services and to adequately supervising any person who assists with these services.</p>
  <p>People likely to assist the RCIC with these services: ${e(d.assistants || 'None at this time. The Client will be informed in writing if this changes.')}</p>
  <p>When necessary, the RCIC will obtain assistance from other professionals or services, including an interpreter or translator. The RCIC will keep the Client informed and will obtain the Client's written consent before any additional fees are incurred.</p>
  <p>The RCIC will provide professional, ethical and competent services as required by the College's Code of Professional Conduct. A copy of the Code has been provided to the Client: ${CICC.code}</p>
  <p>The RCIC will provide services in <b>${e(d.language)}</b>. The RCIC will return any original documents provided by the Client as soon as the purpose for which they were taken is completed.</p>
  <p>The RCIC will provide timely updates on the status of the Client's case, including when new information, requests or decisions are made by the government and when key milestones are completed. Updates and government correspondence will be shared within ${e(d.update_time)} of receipt. The RCIC will respond to the Client's inquiries within ${e(d.response_time)}. Communication will be by: ${e(d.comm_methods)}.</p>
  <p>The RCIC will provide the Client with a signed copy of this Service Agreement.</p>

  <h2>3. Authorization to act</h2>
  <p>The Client expressly authorizes the RCIC to act on the Client's behalf to the extent of the specific services described in this Agreement, including by completing a Use of a Representative form (IMM 5476) where required.</p>

  <h2>4. Services to be provided</h2>
  <p>The RCIC will represent the Client and act on the Client's behalf in the following immigration and/or citizenship category and program: <b>${e(d.program || '________________')}</b></p>
  <p>The scope of services and major steps will include:</p>${bullets(d.scope)}
  <p>Estimated timeframes:</p>${bullets(d.timeframes)}
  <p>Once an application is submitted, the RCIC is not in control of government processing times, which may change at any time.</p>

  <h2>5. Client instructions</h2>
  ${para(d.instructions) || '<p>No additional instructions.</p>'}
  <p>Persons the Client authorizes to receive file updates or communicate with the RCIC on the Client's behalf: ${e(d.designate || 'None. Any designate must be appointed by the Client in writing, stating the duties and duration of their authority.')}</p>

  <h2>6. Services not included</h2>${bullets(d.excluded, '<p>None listed.</p>')}
  <p>If the Client wishes the RCIC to provide additional services, a separate Service Agreement or a signed addendum to this Agreement will be required before that work begins.</p>

  <h2>7. Professional fees and billing method</h2>${fees}
  <p>All amounts are in Canadian dollars. Professional fees are subject to GST ${rate ? `at ${rate}% (${e(d.province)})${d.gst_number ? `, registration no. ${e(d.gst_number)}` : ''}` : ': Not applicable'}. Contingency billing is not used.</p>
  <p><b>Advance payment (retainer):</b> ${Number(d.retainer) > 0 ? `The Client will pay ${money(d.retainer)} in advance. These funds will be deposited and held in the RCIC's client (trust) account until earned. Only earned fees will be withdrawn, and only after an invoice has been issued to the Client. ${e(d.retainer_replenish)}` : 'No advance payment is required.'}</p>

  <h2>8. Disbursements and government fees</h2>
  <p>The following disbursements may be incurred and will be billed to the Client at cost, with invoices and receipts provided:</p>${bullets(d.disbursements, '<p>None expected.</p>')}
  <p>If disbursements will exceed these estimates, the RCIC will inform the Client and obtain the Client's written agreement before incurring them.</p>
  <p>The Client is responsible for all fees charged by the Government of Canada or a province (for example processing, biometrics and right of permanent residence fees). These are paid directly to the government when an application is submitted and may change without notice. Current fees: https://www.cic.gc.ca/english/information/fees/fees.asp</p>

  <h2>9. Terms of payment</h2>
  <p>Invoices are payable within ${e(d.payment_days)} days of issue by: ${e(d.payment_methods)}. ${Number(d.interest) > 0 ? `Interest of ${e(d.interest)}% per month may be charged on overdue amounts.` : 'No interest is charged on overdue amounts.'} ${Number(d.admin_fee) > 0 ? `An administrative fee of ${money(d.admin_fee)} may be charged for processing a Client-initiated discharge of representation or early termination of this Agreement.` : 'No administrative fee is charged for a Client-initiated discharge or early termination.'}</p>

  <h2>10. Refund policy</h2>
  ${d.cooling_off ? '<p>The Client may cancel this Agreement in writing within forty-eight (48) hours of signing it for a full refund of all amounts paid.</p>' : ''}
  <p>If this Agreement is terminated, the Client will receive an itemized statement of account showing the amounts received and the services provided, and an invoice for any outstanding amounts for services rendered or disbursements made. Any unearned fees will be refunded to the Client in accordance with the College's Client Account and Client File Management Regulations.</p>
  <p>Fees are not refundable in the event of an application refusal, provided the RCIC performed the agreed services professionally. Should the RCIC make an error or omission that necessitates a refund, a refund will be provided, and the RCIC will notify their professional liability insurer.</p>

  <h2>11. Client responsibilities</h2>
  <p>The Client is responsible for: (a) providing all required documentation to process the file; (b) providing up-to-date and reliable contact information in a timely manner; (c) providing accurate, complete and honest information, understanding that inaccuracies may negatively affect the outcome of the application; and (d) informing the RCIC of any material change and of any direct contact from government authorities.</p>
  <p><b>Misrepresentation:</b> The Client understands that providing false, misleading or incomplete information may lead to refusal, loss of status, inadmissibility and a finding of misrepresentation. If the Client knowingly provides inaccurate, misleading or false material information, the RCIC's obligations under this Agreement become null and void, and the Client's financial obligations remain.</p>${initials()}

  <h2>12. Electronic communication</h2>
  <p>The Client consents to communication by email and other electronic means, accepts the inherent risks, and will share documents only through the secure method provided by the RCIC.</p>${initials()}

  <h2>13. Confidentiality and privacy</h2>
  <p>The RCIC owes the Client an obligation of confidentiality under the Code of Professional Conduct and will keep all information relating to the Client confidential indefinitely, except where disclosure is authorized by the Client, required for the applications described in this Agreement, or required by law. The Client's personal information and documents are collected and protected according to the Code of Professional Conduct, PIPEDA and Alberta's Personal Information Protection Act, and are stored securely in Canada. If the Client wishes another person or family member to access information on the file, the Client must give the RCIC a written authorization naming that person.</p>

  <h2>14. Discharge or withdrawal of representation</h2>
  <p>The Client may discharge the RCIC at any time by written notice. The RCIC may withdraw if the Client fails to honour this Agreement, including non-payment after reasonable notice, and must withdraw if instructed to act illegally or contrary to the Code, if a conflict of interest arises, or if the RCIC is not competent to handle the matter. The RCIC may also withdraw where there is a serious loss of confidence, such as deception or failure to give adequate instructions. Any withdrawal will be done without prejudice to the Client.</p>
  <p>On discharge or withdrawal the RCIC will: return all documents and property belonging to the Client; give the Client all information required in connection with the matter; provide an invoice for services rendered and an itemized account of all Client funds; refund unearned funds; co-operate with any successor representative; and make best efforts to notify, in writing within ten (10) calendar days, any government agency where the RCIC appears as the Client's representative.</p>

  <h2>15. Unexpected termination of service</h2>
  <p>If the Client is unable to contact the RCIC and has reason to believe the RCIC may be dead, incapacitated or otherwise unable to fulfil their duties, the Client should contact the College (contact details below). ${e(d.successor || 'The RCIC maintains arrangements so that the Client\'s file can be returned or transferred without prejudice to the Client.')}</p>

  <h2>16. Disputes and complaints</h2>
  <p>If a dispute arises, the Client should first present the concern in writing to the RCIC. The RCIC will respond within ${e(d.dispute_days)} business days. If the matter is not resolved, or if the Client is concerned that the RCIC has not met their obligations under the Code of Professional Conduct, the Client may file a complaint with the College: ${CICC.complaints}</p>
  ${regulator}

  <h2>17. Amendments and general terms</h2>
  <p>This Agreement may only be changed in writing with the consent of both parties, signed or initialled and dated by the RCIC and the Client. This Agreement is governed by the laws of the Province of ${e(d.province)} and the federal laws of Canada applicable therein. It is the entire agreement between the parties, and if any provision is found invalid the remaining provisions continue in full force.</p>

  <h2>18. Acknowledgement</h2>
  <p>The Client acknowledges that they have read and understood this Agreement, had the opportunity to ask questions and to seek independent legal advice, received a copy of the Code of Professional Conduct, and agree to be bound by these terms. The Client will receive a copy of the signed Agreement.</p>
  ${initials()}${signatures(d, 'Service Agreement')}</div>`;
}

export function render(type, d) { return type === 'consultation' ? consultation(d) : retainer(d); }

export function requiredMissing(type, d) {
  const need = [['client_name', 'Client name'], ['client_address', 'Client address'], ['client_phone', 'Client phone'], ['rcic_name', 'RCIC name'],
    ['rcic_id', 'College ID'], ['business_address', 'Business address'], ['business_phone', 'Business phone']];
  if (type === 'consultation') need.push(['purpose', 'Purpose of consultation'], ['fee', 'Consultation fee']);
  else need.push(['program', 'Category and program'], ['scope', 'Scope of services'], ['preliminary_advice', 'Summary of preliminary advice']);
  const miss = need.filter(([k]) => !String(d[k] ?? '').trim()).map(([, l]) => l);
  if (type === 'retainer') {
    if (d.billing === 'flat' && !(d.milestones || []).some((m) => m.name && Number(m.fee) > 0)) miss.push('At least one milestone with a fee');
    if (d.billing === 'hourly' && !(Number(d.hourly_rate) > 0)) miss.push('Hourly rate');
  }
  return miss;
}

// Fill signature placeholders in frozen HTML for display (signatures are stored separately from the hashed body)
export function withSignatures(html, a) {
  const sig = (s) => !s ? '' : s.startsWith('data:image') ? `<img src="${s}" alt="signature">` : `<span class="typed">${e(s)}</span>`;
  const d = (t) => t ? new Date(t).toLocaleString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '________________';
  return html
    .replace('<div class="gi-sig" data-sig="client"></div>', `<div class="gi-sig" data-sig="client">${sig(a.client_signature)}</div>`)
    .replace('<div class="gi-sig" data-sig="rcic"></div>', `<div class="gi-sig" data-sig="rcic">${sig(a.rcic_signature)}</div>`)
    .replace('<span data-sig-date="client">________________</span>', `<span data-sig-date="client">${d(a.client_signed_at)}</span>`)
    .replace('<span data-sig-date="rcic">________________</span>', `<span data-sig-date="rcic">${d(a.rcic_signed_at)}</span>`)
    .replace(/<span class="gi-initials">______<\/span>/g, `<span class="gi-initials">${a.client_initials ? e(a.client_initials) : '______'}</span>`);
}

export function certificate(a, events = []) {
  const f = (t) => t ? new Date(t).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'medium' }) : '—';
  return `<div class="gi-agr" style="margin-top:30px;border:1px solid #E3DCCD;border-radius:8px;padding:16px 18px;font-family:Arial,sans-serif;font-size:12.5px">
    <h2 style="margin-top:0">Signature certificate</h2>
    <table><tr><th>Document</th><td>${e(a.number)} · ${e(a.title)}</td></tr><tr><th>Document fingerprint (SHA-256)</th><td style="word-break:break-all">${e(a.body_sha256 || '—')}</td></tr>
    <tr><th>RCIC signature</th><td>${e(a.rcic_name || '')} · ${f(a.rcic_signed_at)}</td></tr>
    <tr><th>Client signature</th><td>${e(a.client_name || '—')}${a.client_initials ? ` (initials ${e(a.client_initials)})` : ''} · ${f(a.client_signed_at)}${a.client_ip ? ` · IP ${e(a.client_ip)}` : ''}</td></tr></table>
    ${events.length ? `<table><tr><th>Event</th><th>When</th><th>IP / device</th></tr>${events.map((v) => `<tr><td>${e(v.event)}</td><td>${f(v.created_at)}</td><td style="word-break:break-all">${e([v.ip, (v.user_agent || '').slice(0, 80)].filter(Boolean).join(' · '))}</td></tr>`).join('')}</table>` : ''}
  </div>`;
}
