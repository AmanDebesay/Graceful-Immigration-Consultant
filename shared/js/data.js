/* ================================================================
   data.js — All application data. Edit this file to update content.
   ================================================================ */
const DATA = {
  company: {
    name: "Graceful Immigration Consultant Inc.",
    rcic: "[YOUR FULL NAME]",
    cicc: "[YOUR CICC LICENSE #]",
    location: "Canada",
    address: "Canada",
    website: "gracefulimmigration.ca",
    email: "info@gracefulimmigration.ca",
    phone: "+1 (780) 000-0000"
  },

  application_types: [
    { id: "spousal_spouses",        label: "Spousal Sponsorship — Spouses",        fee: 2350 },
    { id: "spousal_commonlaw",      label: "Spousal Sponsorship — Common-Law",      fee: 2350 },
    { id: "express_entry",          label: "Express Entry PR",                       fee: 2800 },
    { id: "work_permit_overseas",   label: "Work Permit — Overseas",                fee: 1800 },
    { id: "work_permit_extension",  label: "Work Permit Extension",                 fee: 1200 },
    { id: "study_permit_overseas",  label: "Study Permit — Overseas",               fee: 1500 },
    { id: "study_permit_extension", label: "Study Permit Extension",                fee: 900  },
    { id: "trv_supervisa",          label: "TRV / Super Visa",                      fee: 1000 },
    { id: "visitor_extension",      label: "Visitor Record Extension",              fee: 800  },
    { id: "pr_card_renewal",        label: "PR Card Renewal",                       fee: 700  }
  ],

  // Official IRCC forms for spousal sponsorship (with direct PDF links from IRCC)
  ircc_forms: {
    spousal: [
      {
        form: "IMM 5533",
        title: "Document Checklist — Spouse (including dependent children)",
        mandatory: true,
        note: "Upload this checklist with your online application",
        url: "https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5533e.pdf",
        tigrinya: "ናይ ሰነዳት ዝርዝር — ምስ ኦንላይን ኣቤቱታ ስቀሉ"
      },
      {
        form: "IMM 1344",
        title: "Application to Sponsor, Sponsorship Agreement and Undertaking",
        mandatory: true,
        note: "Both sponsor AND principal applicant must electronically sign this form",
        url: "http://www.cic.gc.ca/english/pdf/kits/forms/IMM1344E.pdf",
        tigrinya: "ስፖንሰርን ዋና ሕቶ ኣቕራቢን ዲጂታላዊ ፍርማ ኣቐምጡ"
      },
      {
        form: "IMM 5532",
        title: "Sponsorship Evaluation and Relationship Questionnaire",
        mandatory: true,
        note: "Sponsor signs Part A #9 and Part C #12. Principal applicant signs Part B #5 and Part C #13.",
        url: "http://www.cic.gc.ca/english/pdf/kits/forms/IMM5532E.pdf",
        tigrinya: "ስፖንሰር ክፍሊ ሀ #9 ን ሐ #12 ን ይፍርም። ዋና ሕቶ ኣቕራቢ ክፍሊ ለ #5 ን ሐ #13 ን ይፍርም።"
      },
      {
        form: "IMM 0008",
        title: "Generic Application Form for Canada",
        mandatory: true,
        note: "Completed online by principal applicant for themselves and all dependents",
        url: "https://www.ircc.canada.ca/english/helpcentre/answer.asp?qnum=1355&top=1",
        tigrinya: "ዋና ሕቶ ኣቕራቢ ብኦንላይን ንርእሱን ዝምርኮሱ ሰባትን ዝምላእ"
      },
      {
        form: "IMM 5669",
        title: "Schedule A — Background / Declaration",
        mandatory: true,
        note: "Required for principal applicant AND all family members 18 or older",
        url: "https://www.canada.ca/content/dam/ircc/migration/ircc/english/pdf/kits/forms/imm5669e.pdf",
        tigrinya: "ዋና ሕቶ ኣቕራቢን ኩሎም ናይ ስድራቤት ኣባላት 18+ን ዘድሊ"
      },
      {
        form: "IMM 5406",
        title: "Additional Family Information",
        mandatory: true,
        note: "Completed online. Required for principal applicant and family members 18+",
        url: "https://www.canada.ca/content/dam/ircc/migration/ircc/english/pdf/kits/forms/imm5406e.pdf",
        tigrinya: "ዋና ሕቶ ኣቕራቢን ናይ ስድራቤት ኣባላት 18+ን ዘድሊ"
      },
      {
        form: "IMM 5476",
        title: "Use of Representative",
        mandatory: true,
        note: "REQUIRED when using an RCIC. Authorizes IRCC to communicate with your consultant.",
        url: "http://www.cic.gc.ca/english/pdf/kits/forms/IMM5476E.pdf",
        tigrinya: "RCIC ምጥቃም እንተኾይንኩም ዘድሊ — IRCC ምስ ኮንሰልታንትኩም ክዘራረብ ፍቓድ ይህብ"
      },
      {
        form: "IMM 5475",
        title: "Authority to Release Personal Information to a Designated Individual",
        mandatory: false,
        note: "Only if you want IRCC to share info with someone who is NOT your representative",
        url: "http://www.cic.gc.ca/english/pdf/kits/forms/IMM5475E.pdf",
        tigrinya: "ወኪልኩም ዘይኮነ ሰብ ሓበሬታኩም ክረክብ ምደለኹም እንተኾይንኩም ጥራይ"
      },
      {
        form: "IMM 5562",
        title: "Supplementary Information — Your Travels (if applicable)",
        mandatory: false,
        note: "Required if you have travelled extensively. Completed online.",
        url: "https://www.canada.ca/content/dam/ircc/migration/ircc/english/pdf/kits/forms/imm5562e.pdf",
        tigrinya: "ብዙሕ ጉዕዞ እንተጉዒዝኩም ዘድሊ — ብኦንላይን ዝምላእ"
      },
      {
        form: "IMM 5604",
        title: "Declaration from Non-Accompanying Parent/Guardian (for minors)",
        mandatory: false,
        note: "Required if a minor child's other legal parent is NOT the sponsor",
        url: "http://www.cic.gc.ca/english/pdf/kits/forms/IMM5604E.pdf",
        tigrinya: "ካልእ ወላዲ ስፖንሰር ዘይኮነ ትሕቲ ዕድሜ ቆልዓ ዘሎ እንተኾይኑ ዘድሊ"
      }
    ]
  },

  // Country-specific requirements (from IRCC spousal page)
  country_requirements: {
    eritrea: {
      label: "Eritrea",
      instructions: [
        "Submit 3 ADDITIONAL identity photos for the principal applicant AND all family members (5 photos total per person)",
        "Standard passport, birth certificate, and marriage certificate requirements apply",
        "Ensure all documents are authenticated by Eritrean authorities where required"
      ],
      tigrinya: [
        "3 ተወሳኺ ናይ መለለዪ ስእልታት ንዋና ሕቶ ኣቕራቢን ኩሎም ናይ ስድራቤት ኣባላትን ኣቕርቡ (ሓቢሩ 5 ስእሊ ንሰብ ነፍሲ ወከፍ)",
        "ናይ ፓስፖርት፡ ናይ ልደትን ናይ ምርዕዋትን ምስክር ወረቓቕቲ ናይ ልምዲ ጠለባት ይምልከቱ"
      ]
    },
    ethiopia: {
      label: "Ethiopia",
      instructions: [
        "Birth certificates: Use civil registration certificates. If not available, obtain an affidavit",
        "Marriage certificates must be from the Civil Registration Authority",
        "Police certificates from the Federal Police Commission required"
      ],
      tigrinya: [
        "ናይ ልደት ምስክር ወረቓቕቲ ካብ ናይ ሲቪል ምዝጋብ ቤት ምምሕዳር ኣቕርቡ",
        "ናይ ምርዕዋት ምስክር ወረቐት ካብ ናይ ሲቪል ምዝጋብ ቤት ክኸውን ኣለዎ",
        "ናይ ፖሊስ ምስክር ወረቐት ካብ ናይ ፌደራል ፖሊስ ኮሚሽን ዘድሊ"
      ]
    },
    uganda: {
      label: "Uganda",
      instructions: [
        "No extra forms required for Uganda residents",
        "Standard passport, birth, and marriage certificate requirements apply",
        "Police certificate from Uganda Police Force required"
      ],
      tigrinya: [
        "ንዩጋንዳ ተቐማጦ ተወሳኺ ፎርምታት የለን",
        "ናይ ልምዲ ናይ ፓስፖርት፡ ናይ ልደትን ናይ ምርዕዋትን ምስክር ወረቓቕቲ ጠለባት ይምልከቱ"
      ]
    },
    nigeria: {
      label: "Nigeria",
      instructions: [
        "Birth certificates must be from the National Population Commission (NPC)",
        "Marriage certificates: Church/Mosque records are NOT accepted. Must be government registered.",
        "Police certificates from the Nigeria Police Force headquarters",
        "Traditional marriage requires additional evidence and affidavit"
      ],
      tigrinya: [
        "ናይ ልደት ምስክር ወረቓቕቲ ካብ ናይ ሃገራዊ ህዝቢ ኮሚሽን (NPC) ክኸውን ኣለዎ",
        "ናይ ምርዕዋት ምስክር ወረቐት ካብ ቤተ ክርስቲያን/መስጊድ ኣይቅበልን — ናይ መንግስቲ ምዝጋብ ዘድሊ"
      ]
    },
    philippines: {
      label: "Philippines",
      instructions: [
        "Birth certificates: Philippine Statistics Authority (PSA) authenticated copies only",
        "Marriage certificates: PSA authenticated copies only (not Local Civil Registrar copies)",
        "Police certificates: NBI Clearance required",
        "If married abroad: Report of Marriage (ROM) from PSA required"
      ],
      tigrinya: [
        "ናይ ልደት ምስክር ወረቓቕቲ: ናይ PSA ዝተረጋገጸ ቅዳሕ ጥራይ",
        "ናይ ምርዕዋት ምስክር ወረቐት: ናይ PSA ዝተረጋገጸ ቅዳሕ ጥራይ",
        "ናይ ፖሊስ ምስክር ወረቐት: NBI Clearance ዘድሊ"
      ]
    },
    india: {
      label: "India",
      instructions: [
        "Birth certificates: Municipal Corporation or Panchayat. If not available, affidavit with supporting docs",
        "Marriage certificates: Registrar of Marriages certificate required (not religious certificates alone)",
        "Police certificates: From district police where resided for 6+ months",
        "Name change documents required if name differs from passport"
      ],
      tigrinya: [
        "ናይ ልደት ምስክር ወረቓቕቲ ካብ ናይ ምምሕዳር ቤት ምምሕዳር ወይ ፓንቻያት",
        "ናይ ምርዕዋት ምስክር ወረቐት ካብ ናይ ምምሕዳር ምዝጋብ ዘድሊ"
      ]
    },
    other: {
      label: "Other country",
      instructions: [
        "Check IRCC website for country-specific requirements",
        "Visit: ircc.canada.ca/english/information/applications/spouse.asp",
        "Select your country from the dropdown to get specific instructions"
      ],
      tigrinya: [
        "ናይ IRCC ወብሳይት ናይ ሃገርኩም ፍሉይ ጠለባት ንምፍላጥ ኣዋስዑ"
      ]
    }
  },

  // Sample cases for the demo
  cases: [
    {
      id: "VIS-2026-AB-WB-001",
      client: "Tesfaye Haile",
      type: "Spousal Sponsorship — Spouses",
      status: "Active",
      stage: 4,
      consultant: "RCIC",
      opened: "2026-04-02",
      nextAction: "Follow up on passport copy",
      nextDate: "2026-04-09",
      fee: 2350,
      collected: 500
    },
    {
      id: "VIS-2026-AB-PH-002",
      client: "Maria Santos",
      type: "Work Permit — Overseas",
      status: "In Progress",
      stage: 6,
      consultant: "RCIC",
      opened: "2026-04-02",
      nextAction: "Complete IMM 1295 form",
      nextDate: "2026-04-07",
      fee: 1800,
      collected: 1800
    },
    {
      id: "VIS-2026-AB-RC-003",
      client: "Ahmed Ibrahim",
      type: "Express Entry PR",
      status: "Submitted",
      stage: 10,
      consultant: "RCIC",
      opened: "2026-03-15",
      nextAction: "Monitor IRCC portal for updates",
      nextDate: "2026-04-15",
      fee: 2800,
      collected: 2800
    }
  ],

  // Sample tasks
  tasks: [
    { id: 1, title: "Follow up — passport copy from Tesfaye",   fileId: "VIS-2026-AB-WB-001", assignedTo: "Assistant", type: "team",   status: "Pending",     due: "2026-04-09", priority: "high" },
    { id: 2, title: "Complete IMM 1295 for Maria Santos",       fileId: "VIS-2026-AB-PH-002", assignedTo: "RCIC",      type: "rcic",   status: "In Progress", due: "2026-04-07", priority: "high" },
    { id: 3, title: "Upload passport — client action",          fileId: "VIS-2026-AB-WB-001", assignedTo: "Client",    type: "client", status: "Pending",     due: "2026-04-09", priority: "high" },
    { id: 4, title: "Review relationship evidence package",     fileId: "VIS-2026-AB-WB-001", assignedTo: "RCIC",      type: "rcic",   status: "Pending",     due: "2026-04-15", priority: "medium" },
    { id: 5, title: "Send marriage cert translation to client", fileId: "VIS-2026-AB-WB-001", assignedTo: "Assistant", type: "team",   status: "Pending",     due: "2026-04-12", priority: "medium" }
  ],

  // Calendar events
  events: [
    { id: 1, date: "2026-04-09", title: "Client consultation — Tesfaye",  type: "appt",     time: "2:00 PM", fileId: "VIS-2026-AB-WB-001" },
    { id: 2, date: "2026-04-12", title: "Document review — Maria",        type: "task",     time: "10:00 AM", fileId: "VIS-2026-AB-PH-002" },
    { id: 3, date: "2026-04-15", title: "Forms prep deadline",            type: "deadline", time: "EOD",     fileId: "VIS-2026-AB-WB-001" },
    { id: 4, date: "2026-04-20", title: "Commissioner of Oaths appt",     type: "appt",     time: "1:00 PM", fileId: "" },
    { id: 5, date: "2026-04-22", title: "IRCC portal check — Ahmed",      type: "task",     time: "9:00 AM", fileId: "VIS-2026-AB-RC-003" },
    { id: 6, date: "2026-04-30", title: "Monthly backup — OneDrive",      type: "reminder", time: "EOD",     fileId: "" }
  ],

  // Inadmissibility grounds (from IRPA ENF 1)
  inadmissibility: [
    { category: "Security", ref: "IRPA s.34", severity: "critical", ministerial_relief: true, items: [
      { id: "s34a", title: "Espionage", detail: "Engaging in espionage against Canada or contrary to Canada's interests", standard: "Reasonable grounds" },
      { id: "s34b", title: "Subversion by force", detail: "Engaging in or instigating subversion by force of any government", standard: "Reasonable grounds" },
      { id: "s34b1", title: "Subversion of democratic process", detail: "Engaging in subversion against a democratic government, institution or process as understood in Canada", standard: "Reasonable grounds" },
      { id: "s34c", title: "Terrorism", detail: "Engaging in terrorism — activities directed toward violence for political objectives", standard: "Reasonable grounds" },
      { id: "s34d", title: "Danger to security", detail: "Being a danger to the security of Canada", standard: "Reasonable grounds" },
      { id: "s34e", title: "Acts of violence endangering persons", detail: "Engaging in acts of violence endangering lives/safety of persons in Canada", standard: "Reasonable grounds" },
      { id: "s34f", title: "Member of security-threat organization", detail: "Member of organization engaging in espionage, subversion or terrorism", standard: "Reasonable grounds" }
    ]},
    { category: "Human & international rights violations", ref: "IRPA s.35", severity: "critical", ministerial_relief: true, items: [
      { id: "s35a", title: "War crimes / crimes against humanity", detail: "Committing act outside Canada constituting genocide, crime against humanity, or war crime", standard: "Reasonable grounds" },
      { id: "s35b", title: "Senior official in rights-violating government", detail: "Senior official in government engaging in terrorism, gross human rights violations, genocide or war crimes", standard: "Reasonable grounds" },
      { id: "s35c", title: "Subject to international sanctions", detail: "Entry/stay restricted by international organization sanctions", standard: "Reasonable grounds" }
    ]},
    { category: "Serious criminality", ref: "IRPA s.36(1)", severity: "critical", ministerial_relief: false, items: [
      { id: "s36_1a", title: "Conviction in Canada — 10+ year offence", detail: "Convicted in Canada of offence punishable by max 10+ years OR sentence >6 months imposed. Exception: pardon/record suspension.", standard: "Conviction" },
      { id: "s36_1b", title: "Conviction outside Canada — serious equivalent", detail: "Convicted outside Canada of offence equivalent to 10+ year Canadian offence. Equivalency required.", standard: "Reasonable grounds" },
      { id: "s36_1c", title: "Act outside Canada — serious equivalent", detail: "Committed act outside Canada constituting 10+ year equivalent in Canada. PRs: balance of probabilities.", standard: "RG / Balance of prob (PRs)" }
    ]},
    { category: "Criminality", ref: "IRPA s.36(2) — foreign nationals only", severity: "high", ministerial_relief: false, items: [
      { id: "s36_2a", title: "Conviction in Canada — indictable or two offences", detail: "Convicted in Canada of indictable offence OR two summary offences not from same occurrence. Hybrid = indictable.", standard: "Conviction" },
      { id: "s36_2b", title: "Conviction outside Canada — indictable equivalent", detail: "Convicted outside Canada of equivalent to Canadian indictable offence, or two offences not from single occurrence", standard: "Reasonable grounds" },
      { id: "s36_2c", title: "Act outside Canada — indictable equivalent", detail: "Committed act outside Canada equivalent to Canadian indictable offence", standard: "Reasonable grounds" },
      { id: "s36_2d", title: "Offence on entering Canada", detail: "Committed offence on entering Canada under prescribed Acts (Criminal Code, IRPA, Firearms Act, Customs Act, CDSA)", standard: "Reasonable grounds" }
    ]},
    { category: "Organized criminality", ref: "IRPA s.37", severity: "critical", ministerial_relief: true, items: [
      { id: "s37a", title: "Member of criminal organization", detail: "Member of or participating in pattern of organized criminal activity. Not limited to formal 'membership' (Thanaratnam 2005)", standard: "Reasonable grounds" },
      { id: "s37b", title: "Transnational crime", detail: "Engaging in people smuggling, trafficking in persons or money laundering in context of transnational crime", standard: "Reasonable grounds" }
    ]},
    { category: "Health grounds", ref: "IRPA s.38", severity: "medium", ministerial_relief: false, items: [
      { id: "s38a", title: "Danger to public health", detail: "Health condition likely to be danger to public health. No exception for A38(1)(a).", standard: "Balance of probabilities" },
      { id: "s38b", title: "Danger to public safety", detail: "Health condition likely to be danger to public safety. No exception for A38(1)(b).", standard: "Balance of probabilities" },
      { id: "s38c", title: "Excessive demand on health/social services", detail: "Condition expected to cause excessive demand. Exception: spouse/common-law/child of sponsor (Family Class), protected persons.", standard: "Balance of probabilities" }
    ]},
    { category: "Financial reasons", ref: "IRPA s.39", severity: "medium", ministerial_relief: false, items: [
      { id: "s39", title: "Unable or unwilling to support self", detail: "Unable/unwilling to support self and dependents without social assistance. Applies to potential/current indigence.", standard: "Balance of probabilities" }
    ]},
    { category: "Misrepresentation", ref: "IRPA s.40", severity: "high", ministerial_relief: false, items: [
      { id: "s40a", title: "Misrepresentation of material facts", detail: "Directly/indirectly misrepresenting or withholding material facts inducing error in administration of the Act. 5-year bar. Knowledge NOT required (Mohammed 1997).", standard: "Balance of probabilities" },
      { id: "s40b", title: "Sponsored by misrepresentation person", detail: "Sponsored by person found inadmissible for misrepresentation", standard: "Balance of probabilities" },
      { id: "s40c", title: "Refugee protection vacated", detail: "Final determination to vacate refugee protection claim", standard: "Balance of probabilities" },
      { id: "s40d", title: "Citizenship obtained by misrepresentation", detail: "Ceasing to be citizen under Citizenship Act s.10(1)(a) through false representation or fraud", standard: "Balance of probabilities" }
    ]},
    { category: "Non-compliance with the Act", ref: "IRPA s.41", severity: "medium", ministerial_relief: false, items: [
      { id: "s41a", title: "Non-compliance — foreign national", detail: "Act or omission directly/indirectly contravening IRPA — includes overstay, unauthorized work/study, failure to appear", standard: "Balance of probabilities" },
      { id: "s41b", title: "Non-compliance — permanent resident (residency obligation)", detail: "Failing residency obligation: 730 days in Canada in every 5-year period. H&C may overcome breach.", standard: "Balance of probabilities" }
    ]},
    { category: "Inadmissible family member", ref: "IRPA s.42", severity: "high", ministerial_relief: false, items: [
      { id: "s42a", title: "Accompanying family member inadmissible", detail: "Accompanying family member (or in prescribed circumstances non-accompanying) is inadmissible. Exception: protected persons.", standard: "Balance of probabilities" },
      { id: "s42b", title: "Accompanying inadmissible person", detail: "Being an accompanying family member of an inadmissible person. Exception: protected persons.", standard: "Balance of probabilities" }
    ]}
  ],

  case_stages: [
    "Intake","Consultation","Case open","Doc collection","Doc review",
    "Forms prep","Client review","IRCC fees","Quality check",
    "Submitted","Post-submission","Decision"
  ],

  case_statuses: ["Active","In Progress","Submitted","Approved","Refused","On Hold","Withdrawn","Closed"],

  intake_channels: [
    { code: "WB", label: "Website" }, { code: "IG", label: "Instagram" },
    { code: "FB", label: "Facebook" }, { code: "WA", label: "WhatsApp" },
    { code: "PH", label: "Phone call" }, { code: "WI", label: "Walk-in" },
    { code: "RC", label: "Referral — client" }, { code: "RP", label: "Referral — partner RCIC" },
    { code: "CM", label: "Community event" }, { code: "EM", label: "Email" }
  ],

  opportunity_rules: [
    { trigger: "Child under 18 added to Canadian case", opportunity: "Canada Child Benefit (CCB) eligibility", action: "Notify client to apply for CCB at CRA" },
    { trigger: "Work permit holder — 1+ year Canadian skilled experience", opportunity: "Express Entry / CEC pathway to PR", action: "Assess CRS score, advise on Express Entry profile" },
    { trigger: "Permit expiring within 90 days", opportunity: "Permit renewal required", action: "Send renewal reminder and open extension file" },
    { trigger: "PR holder — approaching 5-year anniversary", opportunity: "Citizenship application eligibility", action: "Calculate physical presence and advise on citizenship" },
    { trigger: "Study permit — final year of studies", opportunity: "Post-Graduation Work Permit (PGWP)", action: "Advise on PGWP eligibility and application timing" },
    { trigger: "Spousal sponsorship approved", opportunity: "Citizenship tracking begins for sponsored person", action: "Start physical presence tracking for future citizenship app" }
  ],

  // ── CHECKLISTS — one per application type ─────────────────────────────────
  checklists: {
    spousal_spouses: {
      title: "Spousal Sponsorship — Spouses",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/family-sponsorship/spouse-partner-children.html",
      sections: [
        { title: "Principal Applicant (Sponsored Person)", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Applicant questionnaire", ti: "ናይ ሕቶ ኣቕራቢ ሕቶታት", required: true },
          { en: "Relationship narrative (written personal statement)", ti: "ናይ ዝምድና ታሪክ ጽሑፍ", required: true },
          { en: "Passport & work permit — all pages", ti: "ፓስፖርት ምስ ናይ ስራሕ ፍቓድ — ኩሎም ገጻት", required: true },
          { en: "Birth certificate with certified English translation", ti: "ናይ ልደት ምስክር ወረቐት ምስ ትርጉም", required: true },
          { en: "Divorce/death certificate of previous spouse (with translation)", ti: "ናይ ፍትሕ ወይ ሞት ምስክር ወረቐት (እንተሃሊዩ)", required: false },
          { en: "Civil status documents (National ID, Family registry with translation)", ti: "ናይ ሲቪል ደረጃ ሰነዳት", required: true },
          { en: "Police certificates (all countries lived 6+ months)", ti: "ናይ ፖሊስ ምስክር ወረቓቕቲ", required: true },
          { en: "2 passport-size photos (IRCC specifications)", ti: "2 ናይ ፓስፖርት ዓይነት ስእልታት", required: true },
          { en: "Application fee receipt (IRCC processing + biometrics)", ti: "ናይ ኣቤቱታ ክፍሊት ደረሰኝ", required: true },
          { en: "Children's info if applicable (passport, birth cert, 2 photos each)", ti: "ናይ ቆልዑ ሓበሬታ (እንተሃሊዩ)", required: false }
        ]},
        { title: "Sponsor (Person in Canada)", ti: "ስፖንሰር", items: [
          { en: "Sponsor history questionnaire", ti: "ናይ ስፖንሰር ታሪክ ሕቶታት", required: true },
          { en: "Most recent Notice of Assessment (NOA) — Line 15000", ti: "ናይ CRA NOA — Line 15000", required: true },
          { en: "Employment reference letter (salary, hours, period)", ti: "ናይ ስራሕ ደብዳቤ", required: true },
          { en: "Canadian passport or PR card — both sides", ti: "ናይ ካናዳ ፓስፖርት ወይ PR ካርድ", required: true },
          { en: "Divorce certificate if applicable (with translation)", ti: "ናይ ፍትሕ ምስክር ወረቐት (እንተሃሊዩ)", required: false },
          { en: "Accompanying/Canadian children's birth certificates", ti: "ናይ ቆልዑ ናይ ልደት ምስክር ወረቓቕቲ", required: false },
          { en: "Custody documents for accompanying children", ti: "ናይ ሕዝነት ሰነዳት", required: false }
        ]},
        { title: "Proof of Relationship", ti: "ናይ ዝምድና ምስክር", items: [
          { en: "Current lease agreement showing both names", ti: "ናይ ሕጂ ናይ ክራይ ቤት ስምምዕ — ስምታት ክልቲኦም", required: true },
          { en: "Sponsor credit card / bank statements (12 months)", ti: "ናይ ስፖንሰር ናይ ባንኪ ቅጺ — 12 ኣዋርሕ", required: true },
          { en: "Applicant credit card / bank statements (12 months)", ti: "ናይ ሕቶ ኣቕራቢ ናይ ባንኪ ቅጺ — 12 ኣዋርሕ", required: true },
          { en: "Sponsor driver's license", ti: "ናይ ስፖንሰር ፍቓድ ምርካብ", required: true },
          { en: "Applicant driver's license or service card", ti: "ናይ ሕቶ ኣቕራቢ ፍቓድ ምርካብ", required: true },
          { en: "20–30 photos together (different times and places)", ti: "20–30 ናይ ሓቢርኩም ስእልታት", required: true },
          { en: "Social media posts / chat transcripts", ti: "ናይ ሶሻል ሚዲያ ጽሑፋት", required: false },
          { en: "Joint bank account or funds transfer evidence", ti: "ናይ ሓባር ባንኪ ሕሳብ", required: false },
          { en: "Sponsor visit airline tickets / passport stamps", ti: "ናይ ስፖንሰር ምብጻሕ ትኬት", required: false }
        ]},
        { title: "IRCC Forms Required", ti: "ዘድልዩ IRCC ፎርምታት", items: [
          { en: "IMM 5533 — Document Checklist (upload with application)", ti: "IMM 5533 — ናይ ሰነዳት ዝርዝር", required: true },
          { en: "IMM 1344 — Sponsorship Agreement (both sign digitally)", ti: "IMM 1344 — ናይ ስፖንሰርሺፕ ስምምዕ", required: true },
          { en: "IMM 5532 — Relationship Questionnaire (both sign)", ti: "IMM 5532 — ናይ ዝምድና ሕቶታት", required: true },
          { en: "IMM 0008 — Generic Application Form (online)", ti: "IMM 0008 — ሓፈሻዊ ናይ ኣቤቱታ ፎርም", required: true },
          { en: "IMM 5669 — Schedule A: Background/Declaration (online)", ti: "IMM 5669 — ሰሌዳ ሀ ድሕረ ባይታ", required: true },
          { en: "IMM 5406 — Additional Family Information (online)", ti: "IMM 5406 — ተወሳኺ ናይ ስድራቤት ሓበሬታ", required: true },
          { en: "IMM 5476 — Use of Representative (RCIC must be named)", ti: "IMM 5476 — ናይ ወኪል ምጥቃም", required: true },
          { en: "IMM 5562 — Travel History (if extensive travel)", ti: "IMM 5562 — ናይ ጉዕዞ ታሪክ (እንተሃሊዩ)", required: false }
        ]}
      ]
    },
    spousal_commonlaw: {
      title: "Spousal Sponsorship — Common-Law Partners",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/family-sponsorship/spouse-partner-children.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Applicant questionnaire", ti: "ናይ ሕቶ ኣቕራቢ ሕቶታት", required: true },
          { en: "Relationship narrative", ti: "ናይ ዝምድና ታሪክ ጽሑፍ", required: true },
          { en: "Passport & work permit — all pages", ti: "ፓስፖርት ምስ ናይ ስራሕ ፍቓድ", required: true },
          { en: "Birth certificate with certified translation", ti: "ናይ ልደት ምስክር ወረቐት ምስ ትርጉም", required: true },
          { en: "Divorce/death certificate of previous spouse (with translation)", ti: "ናይ ፍትሕ ወይ ሞት ምስክር ወረቐት (እንተሃሊዩ)", required: false },
          { en: "Civil status documents (National ID, Family registry)", ti: "ናይ ሲቪል ደረጃ ሰነዳት", required: true },
          { en: "Police certificates (all countries 6+ months)", ti: "ናይ ፖሊስ ምስክር ወረቓቕቲ", required: true },
          { en: "2 passport-size photos (IRCC spec)", ti: "2 ናይ ፓስፖርት ስእልታት", required: true },
          { en: "Application fee receipt", ti: "ናይ ኣቤቱታ ክፍሊት ደረሰኝ", required: true },
          { en: "Children's information if applicable", ti: "ናይ ቆልዑ ሓበሬታ (እንተሃሊዩ)", required: false }
        ]},
        { title: "Sponsor (Person in Canada)", ti: "ስፖንሰር", items: [
          { en: "Sponsor history questionnaire", ti: "ናይ ስፖንሰር ታሪክ ሕቶታት", required: true },
          { en: "Most recent Notice of Assessment (NOA)", ti: "ናይ CRA NOA", required: true },
          { en: "Employment reference letter", ti: "ናይ ስራሕ ደብዳቤ", required: true },
          { en: "Canadian passport or PR card — both sides", ti: "ናይ ካናዳ ፓስፖርት ወይ PR ካርድ", required: true },
          { en: "Divorce certificate if applicable (with translation)", ti: "ናይ ፍትሕ ምስክር ወረቐት (እንተሃሊዩ)", required: false }
        ]},
        { title: "Proof of Common-Law Cohabitation (12+ months)", ti: "ናይ ሓባር ምቕማጥ ምስክር — 12+ ወርሒ", items: [
          { en: "Current lease agreement showing both names", ti: "ናይ ሕጂ ናይ ክራይ ቤት ስምምዕ — ስምታት ክልቲኦም", required: true },
          { en: "Sponsor credit/bank statements (12 months)", ti: "ናይ ስፖንሰር ናይ ባንኪ ቅጺ — 12 ኣዋርሕ", required: true },
          { en: "Applicant credit/bank statements (12 months)", ti: "ናይ ሕቶ ኣቕራቢ ናይ ባንኪ ቅጺ — 12 ኣዋርሕ", required: true },
          { en: "Sponsor 2nd utility bill statements (12 months)", ti: "ናይ ስፖንሰር ካልኣይ ክፍሊት ቅጺ", required: true },
          { en: "Applicant 2nd utility bill statements (12 months)", ti: "ናይ ሕቶ ኣቕራቢ ካልኣይ ክፍሊት ቅጺ", required: true },
          { en: "Sponsor driver's license", ti: "ናይ ስፖንሰር ፍቓድ ምርካብ", required: true },
          { en: "Applicant driver's license / service card", ti: "ናይ ሕቶ ኣቕራቢ ፍቓድ ምርካብ", required: true },
          { en: "Joint bank account statement", ti: "ናይ ሓባር ባንኪ ሕሳብ", required: false },
          { en: "Proof of funds transfers / shared finances", ti: "ናይ ናይ ገንዘብ ምዝውዋር ምስክር", required: false },
          { en: "20–30 photos together (different times/places)", ti: "20–30 ናይ ሓቢርኩም ስእልታት", required: true },
          { en: "Declaration of common-law union", ti: "ናይ ሓባራዊ ሕይወት ምስክር ጽሑፍ", required: true },
          { en: "Social media posts / chat transcripts", ti: "ናይ ሶሻል ሚዲያ ጽሑፋት", required: false }
        ]},
        { title: "IRCC Forms Required", ti: "ዘድልዩ IRCC ፎርምታት", items: [
          { en: "IMM 5533 — Document Checklist", ti: "IMM 5533 — ናይ ሰነዳት ዝርዝር", required: true },
          { en: "IMM 1344 — Sponsorship Agreement", ti: "IMM 1344 — ናይ ስፖንሰርሺፕ ስምምዕ", required: true },
          { en: "IMM 5532 — Relationship Questionnaire", ti: "IMM 5532 — ናይ ዝምድና ሕቶታት", required: true },
          { en: "IMM 0008 — Generic Application Form (online)", ti: "IMM 0008 — ሓፈሻዊ ፎርም", required: true },
          { en: "IMM 5669 — Schedule A: Background/Declaration", ti: "IMM 5669 — ሰሌዳ ሀ", required: true },
          { en: "IMM 5406 — Additional Family Information", ti: "IMM 5406 — ተወሳኺ ናይ ስድራቤት ሓበሬታ", required: true },
          { en: "IMM 5476 — Use of Representative", ti: "IMM 5476 — ናይ ወኪል ምጥቃም", required: true }
        ]}
      ]
    },
    express_entry: {
      title: "Express Entry — Federal Skilled Worker / CEC",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Personal history questionnaire", ti: "ናይ ውልቃዊ ታሪክ ሕቶታት", required: true },
          { en: "Travel history — all countries visited", ti: "ናይ ጕዕዞ ታሪክ", required: true },
          { en: "Language test results (IELTS / CELPIP / TEF)", ti: "ናይ ቋንቋ ፈተና ውጽኢት", required: true },
          { en: "Passport — all pages including stamps", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Medical exam receipt (panel physician)", ti: "ናይ ሕክምና መርምሮ ደረሰኝ", required: true },
          { en: "Application fee receipt (IRCC processing + right of PR)", ti: "ናይ ኣቤቱታ ክፍሊት ደረሰኝ", required: true },
          { en: "University degree & Educational Credential Assessment (ECA)", ti: "ናይ ዩኒቨርሲቲ ዲግሪ ምስ ECA", required: true },
          { en: "Birth certificate with certified translation", ti: "ናይ ልደት ምስክር ወረቐት ምስ ትርጉም", required: true },
          { en: "Marriage certificate (if applicable)", ti: "ናይ ምርዕዋት ምስክር ወረቐት (እንተሃሊዩ)", required: false },
          { en: "Divorce certificate (if applicable)", ti: "ናይ ፍትሕ ምስክር ወረቐት (እንተሃሊዩ)", required: false },
          { en: "Employment reference letters (3+ years skilled — NOC)", ti: "ናይ ስራሕ ደብዳቤታት — 3+ ዓመታት ብቑዕ ስራሕ", required: true },
          { en: "LMIA and job offer (if applicable — 50 or 200 CRS points)", ti: "LMIA ምስ ናይ ስራሕ ሕቶ (እንተሃሊዩ)", required: false },
          { en: "T4 / Notice of Assessment (last 3 years)", ti: "T4 / NOA — ናይ ዝሓለፈ 3 ዓመታት", required: true },
          { en: "Pay stubs (last 3 months)", ti: "ናይ ደሞዝ ደረሰኝ — ናይ ዝሓለፈ 3 ኣዋርሕ", required: true },
          { en: "Police certificates (all countries 6+ months since age 18)", ti: "ናይ ፖሊስ ምስክር ወረቓቕቲ", required: true },
          { en: "Digital photo — IRCC specifications", ti: "ዲጂታላዊ ስእሊ — ናይ IRCC ዝምጥን", required: true },
          { en: "Bank letter & statements (proof of settlement funds)", ti: "ናይ ባንኪ ደብዳቤ ምስ ናይ ፋይናንስ ምስክር", required: true },
          { en: "Submission / cover letter", ti: "ናይ ምቕራብ ደብዳቤ", required: true },
          { en: "PNP nomination certificate (if applicable)", ti: "ናይ PNP ምርጫ ምስክር (እንተሃሊዩ)", required: false }
        ]},
        { title: "Accompanying Spouse / Partner", ti: "ዝስዓብ ሓዳስ", items: [
          { en: "Personal history questionnaire", ti: "ናይ ውልቃዊ ታሪክ ሕቶታት", required: true },
          { en: "Passport — all pages", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Medical exam receipt", ti: "ናይ ሕክምና መርምሮ ደረሰኝ", required: true },
          { en: "Application fee receipt", ti: "ናይ ኣቤቱታ ክፍሊት ደረሰኝ", required: true },
          { en: "Birth certificate with translation", ti: "ናይ ልደት ምስክር ወረቐት", required: true },
          { en: "Police certificates", ti: "ናይ ፖሊስ ምስክር ወረቓቕቲ", required: true },
          { en: "Digital photo", ti: "ዲጂታላዊ ስእሊ", required: true },
          { en: "Language test (if claiming CRS points for spouse)", ti: "ናይ ቋንቋ ፈተና (CRS ነጥብታት ምስ ሓዳስ)", required: false },
          { en: "ECA (if claiming CRS points for spouse's education)", ti: "ECA (ናይ ሓዳስ ትምህርቲ CRS ነጥብታት)", required: false }
        ]},
        { title: "Accompanying Dependent Children", ti: "ዝስዕቡ ዝምርኮሱ ቆልዑ", items: [
          { en: "Passport or travel document", ti: "ፓስፖርት ወይ ናይ ጉዕዞ ሰነድ", required: true },
          { en: "Birth certificate with certified translation", ti: "ናይ ልደት ምስክር ወረቐት ምስ ትርጉም", required: true },
          { en: "Medical exam receipt", ti: "ናይ ሕክምና መርምሮ ደረሰኝ", required: true },
          { en: "Application fee receipt", ti: "ናይ ኣቤቱታ ክፍሊት ደረሰኝ", required: true },
          { en: "Police certificate (if 18+)", ti: "ናይ ፖሊስ ምስክር ወረቐት (18+ ዓመት)", required: false },
          { en: "Custody documents (if applicable)", ti: "ናይ ሕዝነት ሰነዳት (እንተሃሊዩ)", required: false },
          { en: "2 passport-size photos", ti: "2 ናይ ፓስፖርት ስእልታት", required: true }
        ]}
      ]
    },
    work_permit_overseas: {
      title: "Work Permit — Overseas (New Application)",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit/temporary/apply.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Questionnaire / personal history", ti: "ናይ ሕቶ ዝርዝር", required: true },
          { en: "Digital photo (IRCC spec)", ti: "ዲጂታላዊ ስእሊ", required: true },
          { en: "Application fee ($155 or $255) + biometrics $85", ti: "ናይ ኣቤቱታ ክፍሊት + ባዮሜትሪክ $85", required: true },
          { en: "Passport — all pages including stamps", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Job offer letter (employer in Canada)", ti: "ናይ ስራሕ ሕቶ ደብዳቤ", required: true },
          { en: "LMIA (Labour Market Impact Assessment) — if required", ti: "LMIA — ናይ ናይ ሰራሕተኛ ኣድላይነት ምስክር", required: false },
          { en: "Offer of Employment confirmation + IRCC payment receipt (LMIA-exempt)", ti: "ናይ ስራሕ ሕቶ ምርግጋጽ + ደረሰኝ (LMIA-exempt)", required: false },
          { en: "Employment reference letters (work history)", ti: "ናይ ስራሕ ደብዳቤታት", required: true },
          { en: "Education credentials (diploma/degree)", ti: "ናይ ትምህርቲ ምስክር ወረቓቕቲ", required: true },
          { en: "Language test results (if required for NOC)", ti: "ናይ ቋንቋ ፈተና ውጽኢት", required: false },
          { en: "PNP nomination certificate (if applicable)", ti: "ናይ PNP ምርጫ ምስክር (እንተሃሊዩ)", required: false },
          { en: "Country-specific visa office checklist documents", ti: "ናይ ሃገር ፍሉይ ቪዛ ቤት ሰነዳት", required: true },
          { en: "Proof of ties to home country", ti: "ናይ ምትእስሳር ምስ ሃገር ምስክር", required: true },
          { en: "Proof of funds (if applicable)", ti: "ናይ ፋይናንስ ምስክር", required: false }
        ]}
      ]
    },
    work_permit_extension: {
      title: "Work Permit Extension (Inside Canada)",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/permit/temporary/extend.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Current work permit — both sides", ti: "ናይ ሕጂ ናይ ስራሕ ፍቓድ — ክልቲኡ ሸነኽ", required: true },
          { en: "Passport — all pages", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Application fee ($255) — online submission", ti: "ናይ ኣቤቱታ ክፍሊት ($255) — ብኦንላይን", required: true },
          { en: "Updated job offer letter or new employer letter", ti: "ዝሓደሰ ናይ ስራሕ ሕቶ ደብዳቤ", required: true },
          { en: "Updated LMIA or LMIA-exemption confirmation (if changed employer)", ti: "ዝሓደሰ LMIA ወይ ናይ ምምጣን ምስክር", required: false },
          { en: "Recent pay stubs (last 2–3 months)", ti: "ቀሓቢ ናይ ደሞዝ ደረሰኝ — 2–3 ኣዋርሕ", required: true },
          { en: "T4 or employment letter showing active employment", ti: "T4 ወይ ናይ ስራሕ ደብዳቤ", required: true },
          { en: "Status documents for accompanying family (if applicable)", ti: "ናይ ስድራቤት ሰነዳት (እንተሃሊዩ)", required: false }
        ]}
      ]
    },
    study_permit_overseas: {
      title: "Study Permit — Overseas (New Application)",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/apply.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Questionnaire / personal history", ti: "ናይ ሕቶ ዝርዝር", required: true },
          { en: "Digital photo (IRCC spec)", ti: "ዲጂታላዊ ስእሊ", required: true },
          { en: "Application fee $150 + biometrics $85", ti: "ናይ ኣቤቱታ ክፍሊት $150 + ባዮሜትሪክ $85", required: true },
          { en: "Passport — all pages including stamps", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Letter of acceptance from Designated Learning Institution (DLI)", ti: "ናይ ቅቡልነት ደብዳቤ ካብ DLI", required: true },
          { en: "Study plan — why this institution, why Canada", ti: "ናይ ትምህርቲ መደብ ጽሑፍ", required: true },
          { en: "Language test results (IELTS 6.0+ for SDS, or equivalent)", ti: "ናይ ቋንቋ ፈተና ውጽኢት", required: true },
          { en: "Education credentials (transcripts, diplomas)", ti: "ናይ ትምህርቲ ምስክር ወረቓቕቲ", required: true },
          { en: "Proof of funds: tuition + living ($10,000+) + return travel", ti: "ናይ ፋይናንስ ምስክር — ክፍሊት + ናብርን + ምምላስን", required: true },
          { en: "Proof of ties to home country", ti: "ናይ ምትእስሳር ምስ ሃገር ምስክር", required: true },
          { en: "Country-specific visa office checklist documents", ti: "ናይ ሃገር ፍሉይ ቪዛ ቤት ሰነዳት", required: true },
          { en: "Police certificate (some countries)", ti: "ናይ ፖሊስ ምስክር ወረቐት (ንኽምርምሩ)", required: false },
          { en: "Medical exam receipt (if required)", ti: "ናይ ሕክምና መርምሮ ደረሰኝ (እንተሃሊዩ)", required: false },
          { en: "Marriage certificate (if applicable)", ti: "ናይ ምርዕዋት ምስክር ወረቐት (እንተሃሊዩ)", required: false }
        ]}
      ]
    },
    study_permit_extension: {
      title: "Study Permit Extension (Inside Canada)",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/extend-study-permit.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Current study permit — both sides", ti: "ናይ ሕጂ ናይ ትምህርቲ ፍቓድ — ክልቲኡ ሸነኽ", required: true },
          { en: "Passport — all pages", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Application fee $150 — online submission", ti: "ናይ ኣቤቱታ ክፍሊት $150 — ብኦንላይን", required: true },
          { en: "Current enrollment letter from institution", ti: "ናይ ሕጂ ናይ ምዝጋብ ደብዳቤ", required: true },
          { en: "Transcripts (most recent)", ti: "ናይ ዝሓለፈ ምዕቡልነት ቅጺ", required: true },
          { en: "Proof of funds (tuition + living)", ti: "ናይ ፋይናንስ ምስክር — ክፍሊት + ናብርን", required: true },
          { en: "Updated letter of acceptance (if transferring or new program)", ti: "ዝሓደሰ ናይ ቅቡልነት ደብዳቤ (ምስ ለውጢ)", required: false }
        ]}
      ]
    },
    trv_supervisa: {
      title: "TRV or Super Visa Application",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/apply-visitor-visa.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Questionnaire / personal history", ti: "ናይ ሕቶ ዝርዝር", required: true },
          { en: "Digital photo (IRCC spec)", ti: "ዲጂታላዊ ስእሊ", required: true },
          { en: "Application fee $100 + biometrics $85 (if applicable)", ti: "ናይ ኣቤቱታ ክፍሊት $100 + ባዮሜትሪክ $85", required: true },
          { en: "Passport — all pages including stamps", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Proof of relationship to Canadian inviter (sponsor)", ti: "ምስ ካናዳዊ ዓዳሚ ዝምድና ምስክር", required: true },
          { en: "NOA of Canadian inviter (last year)", ti: "ናይ ካናዳዊ ዓዳሚ NOA", required: true },
          { en: "Invitation letter from Canadian host", ti: "ናይ ካናዳዊ ዓዳሚ ናይ ዕድዋ ደብዳቤ", required: true },
          { en: "Marriage certificate (if applicable)", ti: "ናይ ምርዕዋት ምስክር ወረቐት (እንተሃሊዩ)", required: false },
          { en: "Travel insurance — MINIMUM $100,000 / 1 year (Super Visa only)", ti: "ናይ ጕዕዞ ኢንሹራንስ — $100,000+ ናይ 1 ዓመት (Super Visa)", required: true },
          { en: "Proof of ties to home country", ti: "ናይ ምትእስሳር ምስ ሃገር ምስክር", required: true },
          { en: "Proof of funds", ti: "ናይ ፋይናንስ ምስክር", required: true },
          { en: "Police certificate (some countries)", ti: "ናይ ፖሊስ ምስክር ወረቐት", required: false },
          { en: "Medical exam receipt (if required)", ti: "ናይ ሕክምና መርምሮ ደረሰኝ (እንተሃሊዩ)", required: false }
        ]}
      ]
    },
    visitor_extension: {
      title: "Visitor Record Extension (Inside Canada)",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/extend-stay.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "Passport — all pages including entry stamps", ti: "ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Current visitor status document (if any)", ti: "ናይ ሕጂ ናይ ጎብዚ ሰነድ (ምስ ሃለወ)", required: false },
          { en: "Application fee $100 — online submission", ti: "ናይ ኣቤቱታ ክፍሊት $100 — ብኦንላይን", required: true },
          { en: "Reason for extension (written explanation)", ti: "ምኽንያት ናይ ምቅጻል (ናይ ጽሑፍ መብርሂ)", required: true },
          { en: "Proof of funds to support stay", ti: "ናይ ፋይናንስ ምስክር", required: true },
          { en: "Proof of ties to home country (property, employment, family)", ti: "ናይ ምትእስሳር ምስ ሃገር ምስክር", required: true },
          { en: "Invitation letter from host (if visiting family/friends)", ti: "ናይ ዕድዋ ደብዳቤ (ምስ ስድራ ወይ ዓርከ ምብጻሕ)", required: false },
          { en: "Travel insurance (proof of coverage)", ti: "ናይ ጕዕዞ ኢንሹራንስ", required: false }
        ]}
      ]
    },
    pr_card_renewal: {
      title: "PR Card Renewal",
      ircc_link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants/pr-card/apply-renew-restrict.html",
      sections: [
        { title: "Principal Applicant", ti: "ዋና ሕቶ ኣቕራቢ", items: [
          { en: "2 passport-size photos (IRCC spec)", ti: "2 ናይ ፓስፖርት ዓይነት ስእልታት", required: true },
          { en: "Application fee $50", ti: "ናይ ኣቤቱታ ክፍሊት $50", required: true },
          { en: "Copies of every page of current passport", ti: "ቅዳሕ ናይ ሕጂ ፓስፖርት — ኩሎም ገጻት", required: true },
          { en: "Copies of every page of previous passport (if expired < 5 years)", ti: "ቅዳሕ ናይ ቀደም ፓስፖርት (< 5 ዓመት ዝሓለፎ)", required: false },
          { en: "Current PR card — both sides", ti: "ናይ ሕጂ PR ካርድ — ክልቲኡ ሸነኽ", required: true },
          { en: "Driver's license — both sides", ti: "ፍቓድ ምርካብ — ክልቲኡ ሸነኽ", required: true },
          { en: "Travel document / refugee travel document (if applicable)", ti: "ናይ ጉዕዞ ሰነድ (እንተሃሊዩ)", required: false },
          { en: "Proof of physical presence in Canada (730 days / 5 years)", ti: "ምስክር ናይ ምህላው ኣብ ካናዳ — 730 መዓልቲ / 5 ዓመታት", required: true }
        ]}
      ]
    }
  },

  // ── TEAM MEMBERS ──────────────────────────────────────────────────────────
  team_members: [
    { id: "tm1", name: "[YOUR FULL NAME]", role: "RCIC / Owner", pin: "1234", avatar: "RC", color: "#1B3A5C" },
    { id: "tm2", name: "Assistant",        role: "Case Assistant",  pin: "0000", avatar: "AS", color: "#C9A84C" }
  ],

  // ── ACTIVITY LOG — tracks login & task actions ────────────────────────────
  activity_log: [
    { id: 1, member: "[YOUR FULL NAME]", role: "RCIC", action: "Logged in",                        fileId: "",                    timestamp: "2026-04-06T09:00:00" },
    { id: 2, member: "[YOUR FULL NAME]", role: "RCIC", action: "Opened case VIS-2026-AB-WB-001",   fileId: "VIS-2026-AB-WB-001",  timestamp: "2026-04-06T09:05:00" },
    { id: 3, member: "Assistant",        role: "Assistant", action: "Logged in",                   fileId: "",                    timestamp: "2026-04-06T10:00:00" },
    { id: 4, member: "Assistant",        role: "Assistant", action: "Task updated — passport follow-up", fileId: "VIS-2026-AB-WB-001", timestamp: "2026-04-06T10:15:00" },
    { id: 5, member: "[YOUR FULL NAME]", role: "RCIC", action: "Service agreement signed",         fileId: "VIS-2026-AB-WB-001",  timestamp: "2026-04-06T11:00:00" },
    { id: 6, member: "[YOUR FULL NAME]", role: "RCIC", action: "Inadmissibility check completed",  fileId: "VIS-2026-AB-WB-001",  timestamp: "2026-04-06T11:30:00" }
  ]
};
