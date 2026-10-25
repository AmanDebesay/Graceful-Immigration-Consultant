// Agreement templates built from the CICC "Guide for Developing Your Service Agreement" (2024),
// the Code of Professional Conduct s.24 and the Retainer Agreement Regulation (RA).
// render() returns self-contained HTML; it is frozen and hashed when the RCIC signs & sends.

const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const lines = (t) => String(t || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
const bullets = (t, fallback = '') => { const l = lines(t); return l.length ? `<ul>${l.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : fallback; };
const para = (t) => lines(t).map((x) => `<p>${e(x)}</p>`).join('');
const longDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '________________');

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

const LOGO = 'https://gracefulimmigration.ca/public/img/logo-emblem.png';
const BILLING = {
  flat: 'Flat fee billing with payment by milestones',
  flat_dates: 'Flat fee billing with payment on predetermined dates',
  hourly: 'Billing by the hour',
  daily: 'Billing by the day',
};

const STYLE = `<style>
.gi-agr{font-family:Georgia,'Times New Roman',serif;color:#1C2333;font-size:14px;line-height:1.62;max-width:820px;margin:0 auto;position:relative}
.gi-agr *{box-sizing:border-box}
.gi-agr .lh{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:3px double #C9A24A}
.gi-agr .lh img{width:74px;height:auto;flex:none}
.gi-agr .lh-name{flex:1}
.gi-agr .lh-name b{display:block;font-size:24px;color:#0B2A5C;letter-spacing:.06em;line-height:1.1}
.gi-agr .lh-name span{display:block;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#9A7420;margin-top:4px}
.gi-agr .lh-name small{display:block;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#5B6476;margin-top:5px}
.gi-agr .lh-contact{text-align:right;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#3B4456;line-height:1.55}
.gi-agr .title{text-align:center;margin:26px 0 6px}
.gi-agr .title h1{font-size:25px;letter-spacing:.14em;color:#0B2A5C;margin:0;font-weight:700}
.gi-agr .title .kind{font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#9A7420;margin-top:4px}
.gi-agr .orn{display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0 4px;color:#C9A24A}
.gi-agr .orn i{display:block;height:1px;width:90px;background:linear-gradient(90deg,transparent,#C9A24A)}.gi-agr .orn i:last-child{background:linear-gradient(90deg,#C9A24A,transparent)}
.gi-agr .meta{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:10px 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px}
.gi-agr .meta span{border:1px solid #E3D3AA;background:#FFFBF2;border-radius:999px;padding:3px 12px;color:#3B4456}.gi-agr .meta b{color:#0B2A5C}
.gi-agr .parties{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #E3DCCD;border-radius:10px;overflow:hidden;margin:0 0 16px;font-size:13.2px}
.gi-agr .parties > div{padding:14px 16px}.gi-agr .parties > div + div{border-left:1px solid #E3DCCD;background:#FCFAF5}
.gi-agr .parties .lbl{display:block;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#9A7420;margin-bottom:6px}
.gi-agr .parties .nm{display:block;font-size:16px;color:#0B2A5C;font-weight:700;margin-bottom:2px}
.gi-agr .glance{border:1px solid #D9C48E;background:linear-gradient(180deg,#FFFBF2,#FFF7E6);border-radius:10px;padding:12px 16px;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px}
.gi-agr .glance h3{font-family:Georgia,serif;font-size:14px;color:#0B2A5C;margin:0 0 8px;letter-spacing:.06em;text-transform:uppercase}
.gi-agr .glance dl{display:grid;grid-template-columns:170px 1fr;gap:5px 12px;margin:0}.gi-agr .glance dt{color:#6B5A2E;font-weight:700}.gi-agr .glance dd{margin:0;color:#1C2333}
.gi-agr .intro{font-size:13.6px;color:#2A3142;text-align:justify}
.gi-agr h2{display:flex;align-items:center;gap:10px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;letter-spacing:.08em;text-transform:uppercase;color:#0B2A5C;margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid #EFE6D2;page-break-after:avoid;break-after:avoid}
.gi-agr h2 .n{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:50%;background:#0B2A5C;color:#F2C462;font-size:12px;letter-spacing:0}
.gi-agr p{margin:0 0 9px;text-align:justify}.gi-agr ul{margin:0 0 9px 22px;padding:0}.gi-agr li{margin-bottom:4px}
.gi-agr table{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:12.5px;font-family:Arial,Helvetica,sans-serif;page-break-inside:avoid}
.gi-agr th,.gi-agr td{border:1px solid #DED6C4;padding:7px 9px;text-align:left;vertical-align:top}
.gi-agr thead th{background:#0B2A5C;color:#fff;font-weight:600;border-color:#0B2A5C}
.gi-agr tfoot th{background:#FBF4E3;color:#0B2A5C}
.gi-agr .r{text-align:right;white-space:nowrap}
.gi-agr .ini{display:flex;justify-content:flex-end;align-items:center;gap:8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6B7385;margin:2px 0 10px;letter-spacing:.06em;text-transform:uppercase}
.gi-agr .gi-initials{display:inline-block;min-width:64px;text-align:center;font-weight:700;font-size:13px;color:#0B2A5C;border:1px solid #C9A24A;border-radius:6px;padding:2px 8px;letter-spacing:.1em;background:#FFFDF8}
.gi-agr .callout{border-left:3px solid #C9A24A;background:#FCFAF5;padding:8px 12px;margin:6px 0 10px;font-size:13.2px}
.gi-agr .sigpage{margin-top:28px;border:1px solid #E3DCCD;border-radius:12px;padding:18px 20px 14px;background:#FFFEFB;page-break-inside:avoid;break-inside:avoid}
.gi-agr .sigpage h2{margin-top:0}
.gi-agr .sigs{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px}
.gi-agr .sig{font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#3B4456}
.gi-agr .sig .gi-sig{height:74px;display:flex;align-items:flex-end;border-bottom:1.5px solid #1C2333;margin-bottom:6px}
.gi-agr .sig img{max-height:70px;max-width:260px}.gi-agr .typed{font-family:'Brush Script MT','Segoe Script',cursive;font-size:30px;color:#0B2A5C}
.gi-agr .sig b{color:#0B2A5C}
.gi-agr .note{font-size:11.5px;color:#6B7385;font-family:Arial,Helvetica,sans-serif}
.gi-agr .foot{margin-top:22px;padding-top:10px;border-top:3px double #C9A24A;display:flex;justify-content:space-between;gap:10px;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#6B7385}
.gi-agr .runfoot{display:none}
@media (max-width:640px){.gi-agr .lh{flex-wrap:wrap}.gi-agr .lh-contact{text-align:left;width:100%}.gi-agr .parties,.gi-agr .sigs{grid-template-columns:1fr}.gi-agr .parties > div + div{border-left:0;border-top:1px solid #E3DCCD}.gi-agr .glance dl{grid-template-columns:1fr}}
@media print{
  @page{margin:16mm 15mm 20mm}
  .gi-agr{font-size:11.5pt;max-width:none}
  .gi-agr .runfoot{display:flex;position:fixed;bottom:-12mm;left:0;right:0;justify-content:space-between;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#6B7385;border-top:1px solid #E3DCCD;padding-top:3mm}
}
</style>`;

const H = (n, t) => `<h2><span class="n">${n}</span>${t}</h2>`;
const glanceRow = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');

function letterhead(d, title, kind, extra = '') {
  return `<div class="lh"><img src="${LOGO}" alt="Graceful Immigration Consultant Inc.">
    <div class="lh-name"><b>${e(d.business_name)}</b><span>Guide · Support · Belong</span><small>${e(d.rcic_name)}, Regulated Canadian Immigration Consultant (RCIC-IRB) · College ID ${e(d.rcic_id)}</small></div>
    <div class="lh-contact">${e(d.business_address)}<br>${e(d.business_phone)}<br>${e(d.business_email)}<br>gracefulimmigration.ca</div></div>
  <div class="title"><h1>${e(title)}</h1><div class="kind">${e(kind)}</div><div class="orn"><i></i>✦<i></i></div></div>
  <div class="meta">${d.number ? `<span>Agreement no. <b>${e(d.number)}</b></span>` : ''}<span>Date <b>${longDate(d.agreement_date)}</b></span>${extra}<span>Written in <b>English</b></span></div>
  <div class="parties"><div><span class="lbl">Licensee (RCIC)</span><span class="nm">${e(d.rcic_name)}</span>Regulated Canadian Immigration Consultant · College ID ${e(d.rcic_id)}<br>${e(d.business_name)}<br>${e(d.business_address)}<br>${e(d.business_phone)} · ${e(d.business_email)}</div>
    <div><span class="lbl">Client</span><span class="nm">${e(d.client_name)}</span>${d.client_dob ? `Date of birth: ${longDate(d.client_dob)}<br>` : ''}${e(d.client_address || 'Address: ________________')}<br>${e(d.client_phone || 'Phone: ________________')}${d.client_email ? ' · ' + e(d.client_email) : ''}</div></div>`;
}
function runningFooter(d, title) {
  return `<div class="runfoot"><span>${e(d.business_name)} · ${e(title)}${d.number ? ' · ' + e(d.number) : ''}</span><span>Client initials: ________</span></div>`;
}
function signatures(d, title, n) {
  return `<div class="sigpage">${H(n, 'Signatures')}
  <p>IN WITNESS WHEREOF, the Client and the RCIC have each read this ${e(title)} and signed it personally (not through a designate) on the dates written below. Where the parties are not physically together, signatures are given electronically, a method both parties agree to.</p>
  <div class="sigs"><div class="sig"><div class="gi-sig" data-sig="client"></div><b>${e(d.client_name)}</b><br>Client<br>Date: <span data-sig-date="client">________________</span></div>
    <div class="sig"><div class="gi-sig" data-sig="rcic"></div><b>${e(d.rcic_name)}</b><br>Regulated Canadian Immigration Consultant · College ID ${e(d.rcic_id)}<br>Date: <span data-sig-date="rcic">________________</span></div></div>
  <p class="note" style="margin-top:14px">Electronic signatures are legally recognized under the Personal Information Protection and Electronic Documents Act (PIPEDA), Alberta's Electronic Transactions Act and CICC By-law 2021-2, s.1.1(aa). The signed document is fingerprinted (SHA-256) so any later change can be detected.</p></div>`;
}
function closing(d) {
  return `<div class="foot"><span>${e(d.business_name)} · ${e(d.business_address)}</span><span>${e(d.rcic_name)} · CICC College ID ${e(d.rcic_id)}</span></div>`;
}
const regulator = `<p>The RCIC is a Licensee of the ${CICC.name}, the national regulator of immigration and citizenship consultants in Canada. ${CICC.address}. Telephone ${CICC.phone}. Email ${CICC.email}. Website ${CICC.web}.</p>`;

function consultation(d) {
  const tax = Math.round(Number(d.fee || 0) * Number(d.gst_rate || 0)) / 100;
  const total = Number(d.fee || 0) + tax;
  return `${STYLE}<div class="gi-agr">${letterhead(d, 'INITIAL CONSULTATION AGREEMENT', 'Retainer Agreement Regulation, section 4.1')}
  <div class="glance"><h3>Key terms at a glance</h3><dl>${glanceRow('Consultation', `${longDate(d.consult_date)} · ${e(d.consult_length)} · ${e(d.consult_method)}`)}${glanceRow('Purpose', e(d.purpose))}
    ${glanceRow('Fee', `${money(total)} CAD${d.gst_rate ? ` (incl. GST ${money(tax)})` : ' (GST not applicable)'}`)}${glanceRow('Language of service', e(d.language))}</dl></div>
  <p class="intro">This Initial Consultation Agreement (the “Agreement”) is made between the Regulated Canadian Immigration Consultant named above (the “RCIC”) and the Client, as required by section 4.1 of the Retainer Agreement Regulation of the College of Immigration and Citizenship Consultants before advice is given for a fee. It records the purpose, the fee and the date of the consultation.</p>
  ${H(1, 'Purpose and scope of the consultation')}
  <p>This Agreement is for a one-time initial consultation only, specifically for: <b>${e(d.purpose)}</b></p>
  <p>The consultation will take place on ${longDate(d.consult_date)}, for ${e(d.consult_length)}, by ${e(d.consult_method)}.</p>
  <p>No immigration application preparation, submission or ongoing representation is included. Any further services require a separate written Retainer (Service) Agreement.</p>
  ${H(2, 'Limited-scope service')}
  <ul><li>The consultation is limited to general information, assessment and guidance based on the information the Client provides.</li>
    <li>The RCIC will not act as the Client's representative before Immigration, Refugees and Citizenship Canada (IRCC), the Immigration and Refugee Board (IRB) or any other authority under this Agreement.</li>
    <li>No forms will be filed and no submissions made on the Client's behalf unless a separate Retainer Agreement is signed.</li></ul>
  ${H(3, 'No guarantee of outcome')}
  <p>Any opinion given is based solely on the information the Client provides at the time of the consultation. The RCIC does not guarantee eligibility, approval, processing times or any particular outcome; all decisions are made by government authorities.</p>
  ${H(4, 'Consultation fee')}
  <table><thead><tr><th>Description</th><th class="r">Amount (CAD)</th></tr></thead><tbody><tr><td>Consultation fee</td><td class="r">${money(d.fee)}</td></tr>
    <tr><td>GST ${d.gst_rate ? `(${e(d.gst_rate)}%)` : ''}</td><td class="r">${d.gst_rate ? money(tax) : 'Not applicable'}</td></tr></tbody>
    <tfoot><tr><th>Total payable in advance</th><th class="r">${money(total)}</th></tr></tfoot></table>
  <p>Payment method: ${e(d.payment_method)}. The fee is earned once the consultation has taken place and is non-refundable, unless otherwise required by law. If the RCIC cancels and the consultation is not rescheduled, the fee will be refunded in full.</p>
  ${H(5, 'Confidentiality and privacy')}
  <p>The RCIC must keep confidential all information about the Client acquired in the professional relationship, as required by the Code of Professional Conduct, unless disclosure is authorized by the Client or required by law. The Client consents to the collection, use and secure storage in Canada of personal information for this consultation, in accordance with PIPEDA and Alberta's Personal Information Protection Act, and accepts the risks of communication by email or other electronic means.</p>
  ${H(6, 'Language')}<p>This Agreement is written in English. The consultation will be provided in ${e(d.language)}. The Client may bring or arrange an interpreter.</p>
  ${H(7, 'Regulator and complaints')}${regulator}<p>Information about the College's complaints process: ${CICC.complaints}</p>
  ${H(8, 'Governing law')}<p>This Agreement is governed by the laws of the Province of ${e(d.province)} and the federal laws of Canada applicable therein.</p>
  ${H(9, 'Acknowledgement')}<p>The Client acknowledges that they have read and understood this Agreement, had the opportunity to ask questions, and agree to be bound by its terms. The Client will receive a copy of the signed Agreement by email.</p>
  <div class="ini">Client initials <span class="gi-initials">______</span></div>
  ${signatures(d, 'Initial Consultation Agreement', 10)}${closing(d)}${runningFooter(d, 'Initial Consultation Agreement')}</div>`;
}

function retainer(d) {
  const rate = Number(d.gst_rate || 0);
  const billing = BILLING[d.billing] ? d.billing : 'flat';
  const ms = (d.milestones || []).filter((m) => m.name);
  const msTotal = ms.reduce((s, m) => s + Number(m.fee || 0), 0);
  const disbTotal = ms.reduce((s, m) => s + Number(m.disb || 0), 0);
  const tax = (v) => Math.round(Number(v || 0) * rate) / 100;
  const per = billing === 'daily' ? ['day', d.daily_rate, d.est_days] : ['hour', d.hourly_rate, d.est_hours];
  const est = Number(per[1] || 0) * Number(per[2] || 0);
  const totalFees = billing === 'hourly' || billing === 'daily' ? est : msTotal;
  const fees = billing === 'hourly' || billing === 'daily'
    ? `<p>Professional fees are determined by <b>${BILLING[billing].toLowerCase()}</b>. This method will not change for the services in this Agreement.</p>
       <table><thead><tr><th>Rate</th><th>Anticipated ${per[0]}s</th><th class="r">Estimated professional fees</th><th class="r">GST</th><th class="r">Estimated total</th></tr></thead>
       <tbody><tr><td>${money(per[1])} per ${per[0]}</td><td>${e(per[2])}</td><td class="r">${money(est)}</td><td class="r">${rate ? money(tax(est)) : 'Not applicable'}</td><td class="r">${money(est + tax(est))}</td></tr></tbody></table>
       <p>Schedule of payments: ${e(d.hourly_schedule)}. Invoices will be provided ${e(d.invoice_frequency || 'monthly')} and will list the services rendered, the dates and the time spent.</p>`
    : `<p>Professional fees are determined by <b>${BILLING[billing].toLowerCase()}</b>. This method will not change for the services in this Agreement; if the Agreement ends early, earned fees are those of the milestones completed. The milestones below are listed in chronological order.</p>
       <table><thead><tr><th>#</th><th>Milestone${billing === 'flat_dates' ? ' and due date' : ' (fee earned when completed)'}</th><th>What is included</th><th class="r">Professional fee</th><th class="r">GST</th><th class="r">Est. disbursements</th></tr></thead>
       <tbody>${ms.map((m, i) => `<tr><td>${i + 1}</td><td>${e(m.name)}${billing === 'flat_dates' && m.due ? `<br><small>Due ${longDate(m.due)}</small>` : ''}</td><td>${e(m.included)}</td><td class="r">${money(m.fee)}</td><td class="r">${rate ? money(tax(m.fee)) : 'N/A'}</td><td class="r">${Number(m.disb) ? money(m.disb) : '—'}</td></tr>`).join('')}</tbody>
       <tfoot><tr><th colspan="3">Totals</th><th class="r">${money(msTotal)}</th><th class="r">${rate ? money(tax(msTotal)) : 'N/A'}</th><th class="r">${disbTotal ? money(disbTotal) : '—'}</th></tr>
       <tr><th colspan="5">Total professional fees including GST</th><th class="r">${money(msTotal + tax(msTotal))}</th></tr></tfoot></table>
       <p>${billing === 'flat_dates' ? 'Each payment is due on the date shown.' : 'An invoice is issued when each milestone is completed.'} Invoices are payable within ${e(d.payment_days)} days.</p>`;
  return `${STYLE}<div class="gi-agr">${letterhead(d, 'RETAINER AGREEMENT', 'Service Agreement for Immigration and Citizenship Services', d.file_number ? `<span>File no. <b>${e(d.file_number)}</b></span>` : '')}
  <div class="glance"><h3>Key terms at a glance</h3><dl>${glanceRow('Category and program', e(d.program || '________________'))}${glanceRow('Billing method', BILLING[billing])}
    ${glanceRow(billing === 'hourly' || billing === 'daily' ? 'Estimated professional fees' : 'Total professional fees', `${money(totalFees)} + ${rate ? `GST ${money(tax(totalFees))}` : 'GST not applicable'} = <b>${money(totalFees + tax(totalFees))}</b> CAD`)}
    ${glanceRow('Retainer held in trust', Number(d.retainer) > 0 ? money(d.retainer) : 'None')}${glanceRow('Language of service', e(d.language))}
    ${glanceRow('Preferred correspondence', e(d.comm_methods))}</dl></div>
  <p class="intro">This Retainer Agreement (the “Agreement”) sets out the exact duties of the Regulated Canadian Immigration Consultant named above (the “RCIC”) and of the Client, so that both parties have clear expectations about what will be provided, how it will be provided and at what cost. It is made in accordance with the College of Immigration and Citizenship Consultants Act, the Code of Professional Conduct and the Retainer Agreement Regulation. The RCIC is a Licensee of the College of Immigration and Citizenship Consultants (the “College”).</p>

  ${H(1, 'Summary of preliminary advice')}
  ${para(d.preliminary_advice) || '<p>________________</p>'}${d.consultation_ref ? `<p>Reference: Initial Consultation Agreement ${e(d.consultation_ref)}.</p>` : ''}
  <p>The RCIC has also advised that any existing or potential criminal matter may affect the outcome and that additional documents may be required; the RCIC does not provide criminal law advice.</p>
  <div class="ini">Client initials <span class="gi-initials">______</span></div>

  ${H(2, 'General provisions')}
  <p>The RCIC commits to providing quality immigration and/or citizenship services and to adequately supervising any person who assists with them. People likely to assist the RCIC: ${e(d.assistants || 'none at this time; the Client will be told in writing if this changes')}.</p>
  <p>When necessary, the RCIC will obtain assistance from other professionals or services, including an interpreter or translator, and will obtain the Client's written consent before any additional fees are incurred. The RCIC will provide professional, ethical and competent services as required by the College's Code of Professional Conduct (${CICC.code}).</p>
  <p>The RCIC will provide services in <b>${e(d.language)}</b>; this Agreement is written in English. Original documents provided by the Client will be returned as soon as their purpose is complete.</p>
  <p>The RCIC will keep the Client informed of the status of the file, including new government requests or decisions and the completion of key milestones. Government correspondence will be shared within ${e(d.update_time)} of receipt, and the RCIC will respond to the Client's inquiries within ${e(d.response_time)}.</p>

  ${H(3, 'Authorization to act')}
  <p>The Client expressly authorizes the RCIC to act on the Client's behalf to the extent of the specific services described in this Agreement, including by completing a Use of a Representative form (IMM 5476) where required. Once this Agreement is signed, the Client may appoint a designate in writing to deal with the RCIC on their behalf.</p>

  ${H(4, 'Services to be provided')}
  <p>The RCIC will represent the Client in the following immigration and/or citizenship category and program: <b>${e(d.program || '________________')}</b></p>
  <p>The scope of services and major steps:</p>${bullets(d.scope)}
  <p>Estimated timeframes:</p>${bullets(d.timeframes)}
  <p class="callout">Once an application is submitted, government processing times are outside the RCIC's control and may change at any time.</p>

  ${H(5, 'Client instructions and designate')}
  ${para(d.instructions) || '<p>No additional instructions.</p>'}
  <p>Designate authorized to receive file updates or communicate with the RCIC: ${e(d.designate || 'none. A designate must be appointed by the Client in writing, stating the duties conferred and the duration of the authority; a designate may not be paid for acting as designate')}.</p>

  ${H(6, 'Services not included')}${bullets(d.excluded, '<p>None listed.</p>')}
  <p>This Agreement applies only to immigration and citizenship services. If the Client requests additional services, a separate Retainer Agreement or a signed addendum to this Agreement will be required before that work begins.</p>

  ${H(7, 'Professional fees and billing method')}${fees}
  <p>All amounts are in <b>Canadian dollars (CAD)</b>. Applicable taxes: ${rate ? `GST at ${e(rate)}% (${e(d.province)})${d.gst_number ? `, registration no. ${e(d.gst_number)}` : ''}` : '<b>Not applicable</b>'}. Contingency billing (payment only on a successful decision) is not used. All fees are fair and reasonable.</p>
  <p><b>Retainer held in trust:</b> ${Number(d.retainer) > 0 ? `The Client will deposit ${money(d.retainer)} in advance. These funds will be held in the RCIC's client (trust) account until earned, withdrawn only after an invoice is issued, and maintained in accordance with the College's Client Account Regulation. ${e(d.retainer_replenish)}` : 'No funds will be held in trust; no advance payment is required.'}</p>
  <p><b>Invoices:</b> each invoice will state the Client's name, the services rendered, the dates they were rendered and the total professional fees payable for them.</p>

  ${H(8, 'Disbursements and government fees')}
  <p>The following disbursements may be incurred. They are billed to the Client at cost on the next invoice, with receipts:</p>${bullets(d.disbursements, '<p>None expected.</p>')}
  <p>If disbursements will exceed these estimates, the RCIC will obtain the Client's written agreement first. Government fees (for example processing, biometrics and right of permanent residence fees) are the Client's responsibility, are paid directly to the government and may change without notice: https://www.cic.gc.ca/english/information/fees/fees.asp</p>

  ${H(9, 'Terms of payment')}
  <p>Invoices are payable within ${e(d.payment_days)} days of issue by: ${e(d.payment_methods)}. ${Number(d.interest) > 0 ? `Interest of ${e(d.interest)}% per month may be charged on overdue amounts.` : 'No interest is charged on overdue amounts.'} ${Number(d.admin_fee) > 0 ? `An administrative fee of ${money(d.admin_fee)} applies to processing a Client-initiated discharge of representation or early termination of this Agreement.` : 'No administrative fee is charged for a Client-initiated discharge or early termination.'}</p>

  ${H(10, 'Refund policy')}
  ${d.cooling_off ? '<p>The Client may cancel this Agreement in writing within forty-eight (48) hours of signing it for a full refund of all amounts paid.</p>' : ''}
  <p>If this Agreement ends, the Client will receive an itemized account of all funds received and services provided, and an invoice for any outstanding services or disbursements. Unused or unearned fees will be refunded in accordance with the College's Client File Management Regulation and Client Account Regulation.</p>
  <p class="callout"><b>Fees are not refundable in the event of an application refusal</b>, provided the RCIC performed the agreed services professionally. If an error or omission by the RCIC requires a refund, it will be provided and the RCIC will notify their professional liability insurer.</p>
  <div class="ini">Client initials <span class="gi-initials">______</span></div>

  ${H(11, 'Obligations of the Client')}
  <p>The Client: (a) is responsible for providing the RCIC with all required documentation to process the file; (b) is responsible for providing up-to-date and reliable contact information in a timely manner; (c) is responsible for providing accurate information, and understands that any inaccuracies may negatively affect the outcome of the application; and (d) understands that the RCIC's obligations under this Agreement are null and void if the Client knowingly provides inaccurate, misleading or false material information, and that the Client's financial obligations remain.</p>
  <p>The Client will also inform the RCIC promptly of any material change in their circumstances and of any direct contact from a government authority.</p>
  <div class="ini">Client initials <span class="gi-initials">______</span></div>

  ${H(12, 'Confidentiality and correspondence')}
  <p>The Client's personal information and documents are collected and protected according to the Code of Professional Conduct, PIPEDA and Alberta's Personal Information Protection Act. They are stored in an encrypted, access-controlled system hosted in Canada, seen only by people working on the file, and kept confidential indefinitely, except where disclosure is authorized by the Client, required for the applications in this Agreement or required by law. Another person may access the file only with the Client's written authorization.</p>
  <p>Preferred method of correspondence: <b>${e(d.comm_methods)}</b>. The Client accepts the risks of electronic communication and will share documents only through the secure method the RCIC provides.</p>

  ${H(13, 'Discharge or withdrawal of representation')}
  <p><b>Discharge by the Client.</b> The Client may discharge the RCIC at any time by written notice, in accordance with the laws of ${e(d.province)}. The Client will then pay only for services rendered and disbursements incurred up to that date${Number(d.admin_fee) > 0 ? `, plus the administrative fee of ${money(d.admin_fee)}` : ''}; any unearned funds will be refunded.</p>
  <p><b>Withdrawal by the RCIC.</b> The RCIC may withdraw if the Client fails to honour this Agreement, including non-payment after reasonable notice, unless serious prejudice to the Client would result. The RCIC must withdraw if discharged, if instructed to act illegally or contrary to the Code of Professional Conduct, if a conflict of interest arises, or if the RCIC is not competent to handle the matter, and may withdraw where there has been a serious loss of confidence (for example deception, inadequate instructions, or refusal to act on the RCIC's advice on a significant point). Withdrawal will never be done for an improper purpose or so as to prejudice the Client.</p>
  <p><b>What happens next.</b> On discharge or withdrawal the RCIC will: deliver to the Client all documents, files and property belonging to the Client; give the Client all information required about the matter; provide an invoice for services rendered (or an account of time spent); provide an itemized account of all Client funds and refund unearned funds; promptly account for outstanding fees and disbursements; co-operate with any successor to minimize expense and avoid prejudice; and make best efforts to notify, in writing within ten (10) calendar days, any government agency where the RCIC is the Client's representative.</p>

  ${H(14, 'If the RCIC cannot be reached')}
  <p>If the Client is unable to contact the RCIC and has reason to believe the RCIC may be dead, incapacitated or otherwise unable to fulfil their duties, the Client should contact the College (details in section 15). ${e(d.successor || 'The RCIC maintains arrangements so that the Client\'s file can be returned or transferred without prejudice to the Client.')}</p>

  ${H(15, 'Disputes, complaints and the regulator')}
  ${regulator}
  <p>If a dispute arises, the Client should first present the concern in writing to the RCIC, who will respond within ${e(d.dispute_days)} business days. If the dispute remains unresolved, or the Client believes the RCIC has not met their obligations under the Code of Professional Conduct, the Client may file a complaint with the College. Information about the complaints process: ${CICC.complaints} (College website, section “Protecting the public — Complaints process”).</p>

  ${H(16, 'Changes to this Agreement and general terms')}
  <p>Any change to this Agreement after it is signed must be agreed in writing by the Client and the RCIC, and each change initialled by both. This Agreement is governed by the laws of the Province of ${e(d.province)} and the federal laws of Canada applicable therein. It is the entire agreement between the parties; if any provision is found invalid, the rest remains in force.</p>

  ${H(17, 'Acknowledgement and copy')}
  <p>The Client acknowledges having read and understood this Agreement, had the opportunity to ask questions and to seek independent legal advice, and received access to the Code of Professional Conduct, and agrees to be bound by these terms. The RCIC will send the Client a signed copy of this Agreement by email as confirmation and keep a copy, with that confirmation, in the Client's file.</p>
  <div class="ini">Client initials <span class="gi-initials">______</span></div>
  ${signatures(d, 'Retainer Agreement', 18)}${closing(d)}${runningFooter(d, 'Retainer Agreement')}</div>`;
}

export function render(type, d) { return type === 'consultation' ? consultation(d) : retainer(d); }

export function requiredMissing(type, d) {
  const need = [['client_name', 'Client name'], ['client_address', 'Client address'], ['client_phone', 'Client phone'], ['rcic_name', 'RCIC name'],
    ['rcic_id', 'College ID'], ['business_address', 'Business address'], ['business_phone', 'Business phone']];
  if (type === 'consultation') need.push(['purpose', 'Purpose of consultation'], ['fee', 'Consultation fee']);
  else need.push(['program', 'Category and program'], ['scope', 'Scope of services'], ['preliminary_advice', 'Summary of preliminary advice']);
  const miss = need.filter(([k]) => !String(d[k] ?? '').trim()).map(([, l]) => l);
  if (type === 'retainer') {
    if (['flat', 'flat_dates'].includes(d.billing || 'flat') && !(d.milestones || []).some((m) => m.name && Number(m.fee) > 0)) miss.push('At least one milestone with a fee');
    if (d.billing === 'flat_dates' && (d.milestones || []).some((m) => m.name && !m.due)) miss.push('A due date for every milestone');
    if (d.billing === 'hourly' && !(Number(d.hourly_rate) > 0)) miss.push('Hourly rate');
    if (d.billing === 'daily' && !(Number(d.daily_rate) > 0)) miss.push('Daily rate');
    if (!String(d.comm_methods || '').trim()) miss.push('Preferred method of correspondence');
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
