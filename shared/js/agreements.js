/* ================================================================
   agreements.js — Dynamic agreement generator + client data bridge
   Fills placeholders from client intake data.
   Used by both client portal and admin panel.
   ================================================================ */

// ── PLACEHOLDER MAP ───────────────────────────────────────────────
// Maps PDF placeholder text → client data field
const AGR_FIELDS = {
  // Consultation Agreement fields
  CONSULT: [
    { id:'ca_date',        label:'Date',                     key:'date',        default: new Date().toLocaleDateString('en-CA') },
    { id:'ca_rcic_name',   label:'RCIC Full Name',           key:'rcic_name',   default:'[YOUR FULL NAME]' },
    { id:'ca_rcic_cicc',   label:'CICC Membership #',        key:'rcic_cicc',   default:'[CICC #]' },
    { id:'ca_rcic_phone',  label:'RCIC Phone',               key:'rcic_phone',  default:'+1 (780) 000-0000' },
    { id:'ca_rcic_email',  label:'RCIC Email',               key:'rcic_email',  default:'info@gracefulimmigration.ca' },
    { id:'ca_rcic_addr',   label:'Business Address',         key:'rcic_addr',   default:'Canada' },
    { id:'ca_client_name', label:'Client Full Legal Name',   key:'fullName',    default:'' },
    { id:'ca_client_dob',  label:'Date of Birth',            key:'dob',         default:'' },
    { id:'ca_client_addr', label:'Client Address',           key:'address',     default:'' },
    { id:'ca_client_phone',label:'Client Phone',             key:'phone',       default:'' },
    { id:'ca_client_email',label:'Client Email',             key:'email',       default:'' },
    { id:'ca_purpose',     label:'Purpose of Consultation',  key:'purpose',     default:'' },
    { id:'ca_fee',         label:'Consultation Fee (CAD)',   key:'consultFee',  default:'' },
    { id:'ca_file_id',     label:'File ID',                  key:'fileId',      default:'' }
  ],

  // Service Agreement fields
  SERVICE: [
    { id:'sa_date',        label:'Date',                     key:'date',        default: new Date().toLocaleDateString('en-CA') },
    { id:'sa_rcic_name',   label:'RCIC Full Name',           key:'rcic_name',   default:'[YOUR FULL NAME]' },
    { id:'sa_rcic_cicc',   label:'CICC Membership #',        key:'rcic_cicc',   default:'[CICC #]' },
    { id:'sa_rcic_phone',  label:'RCIC Phone',               key:'rcic_phone',  default:'+1 (780) 000-0000' },
    { id:'sa_rcic_email',  label:'RCIC Email',               key:'rcic_email',  default:'info@gracefulimmigration.ca' },
    { id:'sa_rcic_addr',   label:'Business Address',         key:'rcic_addr',   default:'Canada' },
    { id:'sa_client_name', label:'Client Full Legal Name',   key:'fullName',    default:'' },
    { id:'sa_client_dob',  label:'Date of Birth',            key:'dob',         default:'' },
    { id:'sa_client_addr', label:'Client Address',           key:'address',     default:'' },
    { id:'sa_client_phone',label:'Client Phone',             key:'phone',       default:'' },
    { id:'sa_client_email',label:'Client Email',             key:'email',       default:'' },
    { id:'sa_passport',    label:'Passport Number',          key:'passport',    default:'' },
    { id:'sa_citizenship', label:'Country of Citizenship',   key:'country',     default:'' },
    { id:'sa_app_type',    label:'Application Type',         key:'appTypeLabel',default:'' },
    { id:'sa_total_fee',   label:'Total Professional Fee',   key:'totalFee',    default:'' },
    { id:'sa_stage1_fee',  label:'Stage 1 Fee (on signing)', key:'stage1Fee',   default:'' },
    { id:'sa_stage2_fee',  label:'Stage 2 Fee (at submission)',key:'stage2Fee', default:'' },
    { id:'sa_file_id',     label:'File Number',              key:'fileId',      default:'' }
  ]
};

// ── COMPANY DEFAULTS ──────────────────────────────────────────────
const COMPANY_DEFAULTS = {
  rcic_name:  '[YOUR FULL NAME]',
  rcic_cicc:  '[CICC LICENSE #]',
  rcic_phone: '+1 (780) 000-0000',
  rcic_email: 'info@gracefulimmigration.ca',
  rcic_addr:  'Canada'
};

// ── DATA BRIDGE (localStorage per file ID) ────────────────────────
// Key: graceful_client_{fileId}
// Value: JSON of all client + agreement fields

function saveClientData(fileId, data) {
  if (!fileId) return;
  const existing = loadClientData(fileId);
  const merged = { ...existing, ...data, fileId, updatedAt: new Date().toISOString() };
  localStorage.setItem('graceful_client_' + fileId, JSON.stringify(merged));
}

function loadClientData(fileId) {
  if (!fileId) return {};
  try {
    return JSON.parse(localStorage.getItem('graceful_client_' + fileId) || '{}');
  } catch(e) { return {}; }
}

function getAllClients() {
  const clients = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('graceful_client_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.fileId) clients.push(data);
      } catch(e) {}
    }
  }
  return clients.sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
}

// ── AUTO-FILL HELPERS ─────────────────────────────────────────────
function buildClientDataFromSession() {
  const fileId   = sessionStorage.getItem('graceful_fileId')   || '';
  const name     = sessionStorage.getItem('graceful_name')     || '';
  const email    = sessionStorage.getItem('graceful_email')    || '';
  const appType  = sessionStorage.getItem('graceful_appType')  || '';
  const dob      = sessionStorage.getItem('graceful_dob')      || '';
  const phone    = sessionStorage.getItem('graceful_phone')    || '';
  const passport = sessionStorage.getItem('graceful_passport') || '';
  const country  = sessionStorage.getItem('graceful_country')  || '';
  const addr     = sessionStorage.getItem('graceful_addr')     || '';
  const parts    = name.trim().split(' ');
  const first    = parts[0] || '';
  const last     = parts.slice(1).join(' ') || '';
  const appTypeLabel = APP_TYPE_LABELS[appType] || appType;
  return {
    fileId, fullName: name, first, last, email, dob, phone,
    passport, country, appType, appTypeLabel,
    address: addr,
    purpose: appTypeLabel ? `Initial assessment and application for ${appTypeLabel}` : 'Canadian immigration assessment',
    consultFee: '',
    totalFee: '',
    stage1Fee: '',
    stage2Fee: '',
    date: new Date().toLocaleDateString('en-CA'),
    ...COMPANY_DEFAULTS
  };
}

const APP_TYPE_LABELS = {
  spousal_spouses:'Spousal Sponsorship — Spouses',
  spousal_commonlaw:'Spousal Sponsorship — Common-Law',
  express_entry:'Express Entry PR',
  work_permit_overseas:'Work Permit — Overseas',
  work_permit_extension:'Work Permit Extension',
  study_permit_overseas:'Study Permit — Overseas',
  study_permit_extension:'Study Permit Extension',
  trv_supervisa:'TRV / Super Visa',
  visitor_extension:'Visitor Record Extension',
  pr_card_renewal:'PR Card Renewal'
};


// ── CHECKLIST DATA PER APPLICATION TYPE ───────────────────────────
const CLIENT_CHECKLISTS = {
  spousal_spouses: {
    title: 'Spousal Sponsorship — Spouses',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/family-sponsorship/spouse-partner-children.html',
    sections: [
      { name: 'Sponsor Documents', items: [
        { en: 'Valid Canadian passport or citizenship certificate', ti: 'ናይ ካናዳ ፓስፖርት ወይ ናይ ዜግነት ምስክር', required: true },
        { en: 'Proof of permanent residence (if PR)', ti: 'ናይ ቀዋሚ መንበሪ ምስክር', required: true },
        { en: 'Proof of income — T4, NOA, or employment letter', ti: 'ናይ እቶት ምስክር', required: true },
        { en: 'IMM 1344 — Application to Sponsor', ti: 'IMM 1344 ፎርም', required: true },
        { en: 'IMM 5532 — Relationship questionnaire', ti: 'IMM 5532 — ናይ ዝምድና ሕቶታት', required: true },
        { en: '2 passport-size photos (white background)', ti: '2 ናይ ፓስፖርት ስእሊ', required: true }
      ]},
      { name: 'Applicant Documents', items: [
        { en: 'Valid passport (all pages)', ti: 'ሓዲሽ ፓስፖርት (ኩሉ ገጻት)', required: true },
        { en: 'IMM 0008 — Generic Application', ti: 'IMM 0008 ፎርም', required: true },
        { en: 'IMM 5669 — Schedule A Background', ti: 'IMM 5669 ፎርም', required: true },
        { en: 'Birth certificate', ti: 'ናይ ልደት ምስክር ወረቐት', required: true },
        { en: 'Marriage certificate', ti: 'ናይ መርዓ ምስክር ወረቐት', required: true },
        { en: 'Proof of relationship (photos, messages, travel)', ti: 'ናይ ዝምድና ምስክር', required: true },
        { en: 'Police clearance certificate (all countries lived)', ti: 'ናይ ፖሊስ ምስክር', required: true }
      ]}
    ]
  },
  express_entry: {
    title: 'Express Entry PR',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html',
    sections: [
      { name: 'Identity & Status', items: [
        { en: 'Valid passport (all pages)', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: '2 passport-size photos', ti: '2 ናይ ፓስፖርት ስእሊ', required: true },
        { en: 'Current immigration status document', ti: 'ናይ ሕጂ ስደተኛ ደረጃ ሰነድ', required: true }
      ]},
      { name: 'Language & Education', items: [
        { en: 'IELTS / CELPIP results (within 2 years)', ti: 'ናይ ቋንቋ ምርመራ ውጽኢት', required: true },
        { en: 'Educational Credential Assessment (ECA)', ti: 'ናይ ትምህርቲ ምዕዶ ምርመራ', required: true },
        { en: 'All academic certificates and transcripts', ti: 'ናይ ትምህርቲ ምስክር ወረቐት', required: true }
      ]},
      { name: 'Work Experience', items: [
        { en: 'Employment reference letters (all employers)', ti: 'ናይ ስራሕ ምስክር ደብዳቤ', required: true },
        { en: 'Pay stubs or T4s (last 3 years)', ti: 'ናይ ደሞዝ ሰነድ', required: true },
        { en: 'Job offer letter (if applicable)', ti: 'ናይ ስራሕ ቀረብ ደብዳቤ', required: false }
      ]}
    ]
  },
  work_permit_overseas: {
    title: 'Work Permit — Overseas',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit/temporary/apply.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Valid passport (min 6 months validity)', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'LMIA copy (from Canadian employer)', ti: 'LMIA ሰነድ', required: true },
        { en: 'Job offer letter from employer', ti: 'ናይ ስራሕ ቀረብ ደብዳቤ', required: true },
        { en: 'IMM 1295 — Work Permit Application', ti: 'IMM 1295 ፎርም', required: true },
        { en: 'Educational credentials', ti: 'ናይ ትምህርቲ ምስክር', required: true },
        { en: 'Work experience proof', ti: 'ናይ ስራሕ ተሞኩሮ ምስክር', required: true },
        { en: '2 passport-size photos', ti: '2 ናይ ፓስፖርት ስእሊ', required: true }
      ]}
    ]
  },
  work_permit_extension: {
    title: 'Work Permit Extension',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit/temporary/extend.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Current work permit copy', ti: 'ናይ ሕጂ ናይ ስራሕ ፍቓድ', required: true },
        { en: 'Valid passport', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'New LMIA or employer letter', ti: 'ሓዲሽ LMIA ወይ ናይ ወሃቢ ስራሕ ደብዳቤ', required: true },
        { en: 'IMM 1295 — Work Permit Application', ti: 'IMM 1295 ፎርም', required: true }
      ]}
    ]
  },
  study_permit_overseas: {
    title: 'Study Permit — Overseas',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/apply.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Letter of acceptance from Canadian institution', ti: 'ናይ ካናዳ ቤት-ትምህርቲ ደብዳቤ ምቕባል', required: true },
        { en: 'Valid passport', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'IMM 1294 — Student Permit Application', ti: 'IMM 1294 ፎርም', required: true },
        { en: 'Proof of financial support (bank statements)', ti: 'ናይ ፋይናንስ ምስክር', required: true },
        { en: 'Academic transcripts and certificates', ti: 'ናይ ትምህርቲ ምስክር', required: true },
        { en: '2 passport-size photos', ti: '2 ናይ ፓስፖርት ስእሊ', required: true }
      ]}
    ]
  },
  study_permit_extension: {
    title: 'Study Permit Extension',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/extend.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Current study permit', ti: 'ናይ ሕጂ ናይ ትምህርቲ ፍቓድ', required: true },
        { en: 'New letter of acceptance or enrollment', ti: 'ሓዲሽ ደብዳቤ ምቕባል', required: true },
        { en: 'Valid passport', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'Proof of financial support', ti: 'ናይ ፋይናንስ ምስክር', required: true }
      ]}
    ]
  },
  trv_supervisa: {
    title: 'TRV / Super Visa',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Valid passport (min 6 months beyond intended stay)', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'IMM 5257 — Visitor Visa Application', ti: 'IMM 5257 ፎርም', required: true },
        { en: 'IMM 5645 — Family Information', ti: 'IMM 5645 ፎርም', required: true },
        { en: 'Invitation letter from family in Canada', ti: 'ናይ ቤተሰብ ደብዳቤ ዕድመ', required: true },
        { en: 'Proof of ties to home country', ti: 'ናብ ሃገርካ ዘቀናጅወካ ምስክር', required: true },
        { en: 'Financial proof (bank statements 3 months)', ti: 'ናይ ባንክ ሕሳብ', required: true },
        { en: 'Medical insurance (Super Visa: min $100k CAD)', ti: 'ናይ ጥዕና ዋስትና', required: true }
      ]}
    ]
  },
  visitor_extension: {
    title: 'Visitor Record Extension',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/extend-stay.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Valid passport', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'Current visitor record / status document', ti: 'ናይ ሕጂ ናይ ዓዳሚ ሰነድ', required: true },
        { en: 'IMM 5708 — Application to Change Conditions', ti: 'IMM 5708 ፎርም', required: true },
        { en: 'Reason for extension (letter)', ti: 'ምኽንያት ናይ ምርዝ ደብዳቤ', required: true }
      ]}
    ]
  },
  pr_card_renewal: {
    title: 'PR Card Renewal',
    ircc: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants/pr-card/apply-renew-replace.html',
    sections: [
      { name: 'Required Documents', items: [
        { en: 'Current (expired or expiring) PR card', ti: 'ናይ ሕጂ PR ካርድ', required: true },
        { en: 'Valid passport or travel document', ti: 'ሓዲሽ ፓስፖርት', required: true },
        { en: 'IMM 5444 — PR Card Application', ti: 'IMM 5444 ፎርም', required: true },
        { en: 'Proof of 730 days in Canada in past 5 years', ti: 'ናይ 730 መዓልታት ኣብ ካናዳ ምስክር', required: true },
        { en: '2 passport-size photos', ti: '2 ናይ ፓስፖርት ስእሊ', required: true }
      ]}
    ]
  }
};
