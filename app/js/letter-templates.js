// Submission letters: templates (legal test, sections, coaching), the readiness checker, and the letter document.
// Coaching follows the course material on persuasive vs rules-based submissions (know the legal test, lead with
// the strongest point, tie every fact to the test, prove everything with an enclosed tab, plain language, CREAC).
// Legal text is a starting point for the RCIC: verify citations and pinpoints against the current sources before filing.
import { esc } from './core.js';

const fmtLong = (d) => { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return isNaN(+t) ? d : t.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); };

export const DELIVERY = { portal: 'Submitted via the IRCC online portal', webform: 'Submitted via IRCC web form', courier: 'Via courier', mail: 'Via mail', email: 'Via email' };

// Particulars shown in the RE: block. Common ones come first; each type adds its own.
const P = {
  applicant: ['Principal applicant', 'Full legal name'], dob: ['Date of birth', 'YYYY-MM-DD', 'date'], passport: ['Passport number', ''], our_file: ['Our file number', ''], uci: ['UCI', 'Client ID'], app_no: ['Application number', 'e.g. W307…'],
  citizenship: ['Country of citizenship', ''], residence: ['Country of residence', ''], status: ['Current status in Canada', 'e.g. worker, maintained status'],
  app_type: ['Application', ''],
};
const T = (key, label) => [key, label];

/** CREAC reminder used on argument sections. */
const CREAC = 'Write each argument as CREAC: Conclusion (what you want the officer to find) → Rule (the test or factor) → Explanation (what it means, with authority) → Application (the client’s facts, each with a Tab) → Conclusion.';

export const TYPES = {
  hc: {
    label: 'Humanitarian & compassionate (H&C) — s. 25(1)', short: 'H&C application', kind: 'persuasive',
    blurb: 'Permanent residence or an exemption on H&C grounds. The most persuasive letter you will write.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'status', T('inadmissibility', 'Exemption requested (if inadmissible)')],
    app_type: 'Application for permanent residence on humanitarian and compassionate grounds (IRPA s. 25(1))',
    test: 'IRPA s. 25(1): relief is justified if the circumstances would excite in a reasonable person in a civilized community a desire to relieve the misfortunes of another (Kanthasamy, 2015 SCC 61). All relevant factors are weighed together; “unusual and undeserved or disproportionate hardship” is descriptive, not a threshold. The best interests of a child directly affected must be well identified, defined and given real weight (Baker; Kanthasamy).',
    opening: {
      help: ['Grab the officer’s attention in 2–3 sentences: who the client is, and why removal would be unjust. This is your “elevator pitch”.', 'Don’t open with a statute recital. The legal framework comes next.', 'Lead with your strongest fact (often the children or a medical need), not the longest.'],
      starter: '[Client] is a [age]-year-old citizen of [country] who has lived in Canada for [number] years and considers Canada [his/her/their] only home. [One sentence that captures the heart of the case — for example: “[Client]’s Canadian-born son, age 4, depends on him every day; separating them would cause the child lasting harm.”] We respectfully ask that [Client] be granted permanent residence on humanitarian and compassionate grounds.',
    },
    sections: [
      { key: 'legal', heading: 'Legal framework', help: ['State the test once, accurately, then move on. The officer knows the law; show you do too.', 'Use the current IRCC program delivery instructions on H&C, not the former IP 5 manual.', 'Check every pinpoint before filing.'],
        starter: 'This application is made under subsection 25(1) of the Immigration and Refugee Protection Act (IRPA), which allows the Minister to grant permanent resident status, or an exemption from any applicable criteria or obligations of the Act, where this is justified by humanitarian and compassionate considerations, taking into account the best interests of a child directly affected.\n\nIn Kanthasamy v. Canada (Citizenship and Immigration), 2015 SCC 61, the Supreme Court of Canada confirmed that subsection 25(1) is meant to offer equitable relief in circumstances that would excite in a reasonable person in a civilized community a desire to relieve the misfortunes of another (para 13). The words “unusual and undeserved or disproportionate hardship” are descriptive and do not create separate thresholds (para 33). Officers must consider and weigh all of the relevant facts and factors together (para 25).\n\nWhere a child is directly affected, the child’s best interests must be well identified and defined and examined with a great deal of attention (Kanthasamy, para 39). The decision maker must be “alert, alive and sensitive” to them (Baker v. Canada (Minister of Citizenship and Immigration), [1999] 2 S.C.R. 817, para 75).',
        snippets: [['Inadmissibility exemption', 'The Applicant is inadmissible under [section] of IRPA. The Applicant respectfully requests an exemption from this inadmissibility under subsection 25(1). In the alternative, the Applicant asks that a temporary resident permit be considered under subsection 24(1) of IRPA.'],
          ['Risk factors (s. 25(1.3))', 'While subsection 25(1.3) of IRPA prevents the officer from considering the factors used to determine refugee protection under sections 96 and 97, the underlying facts remain relevant to hardship and must be considered (Kanthasamy, paras 51–56).']] },
      { key: 'overview', heading: 'Overview of the Applicant', help: ['A short particulars list so the officer can orient quickly.', 'Only include what matters to the decision.'],
        starter: '- Marital status: [ ]\n- Original entry into Canada: [date], [purpose]\n- Current immigration status: [ ]\n- Children: [names/ages; Canadian citizens?]\n- Employment: [employer, since]\n- Social assistance: [No]\n- Financial support: [Self-supporting]' },
      { key: 'background', heading: 'Background', help: ['Tell the story in time order, like a story. Introduce every person before they appear (“his foster father, Mr. X, …”).', 'Quote the client’s own statement sparingly and give the page (Tab 4, p. 2).', 'Keep it factual; save argument for the factor sections.'],
        starter: '[Client] was born in [place] on [date]. [Chronological story: how and why they came to Canada, key events, current situation.] (Tab [#])' },
      { key: 'bioc', heading: 'Best interests of the child', help: ['Explain why staying in Canada is better for THIS child — don’t assume it. What changes for the child if the parent leaves, or if the child leaves with them?', 'Cover age, dependency, establishment in Canada, links to the other country, health or special needs, education, and gender-related considerations, as they apply.', 'Prove involvement: custody order, school letters, photos, support payments, a letter from the other parent.', 'If a child has a diagnosis, get the medical/psychological report AND country evidence that the care isn’t available or affordable there.', CREAC],
        starter: '[Conclusion: the child’s best interests weigh heavily in favour of approval.]\n\n[Facts: the child’s age, relationship with the Applicant, how often they see each other, financial support.] (Tab [#])\n\n[Why separation, or relocation, would harm this child specifically — with evidence.] (Tab [#])' },
      { key: 'establishment', heading: 'Establishment in Canada', help: ['Length of time alone rarely wins. Show what the client built: work history, taxes, savings, home, community, volunteering.', 'Each claim needs a document: employment letter, pay stubs, Notices of Assessment, lease, reference letters.', 'Explain any gaps (layoffs, injury) rather than hoping the officer won’t notice.', CREAC],
        starter: '[Conclusion: the Applicant is well established in Canada.]\n\n- Employment: [employer, position, since, earnings] (Tab [#])\n- Taxes filed: [years] (Tab [#])\n- Community and family ties: [ ] (Tab [#])' },
      { key: 'hardship', heading: 'Hardship and conditions in [country]', help: ['Tie country evidence to THIS client: why would they personally face hardship (no family, no work history there, language, discrimination, health care access)?', 'Use 2–3 reputable, current sources (government reports, UN, major media). Tab only the relevant pages.', 'Don’t exaggerate. Overstatement makes the strong points look weak.', CREAC],
        starter: '[Conclusion: returning to [country] would cause the Applicant significant hardship.]\n\n[Personal circumstances in [country]: family, housing, work prospects.] (Tab [#])\n\n[Objective country evidence and how it affects the Applicant.] (Tab [#])' },
      { key: 'rehab', heading: 'Rehabilitation', optional: true, help: ['Only if there is criminality or another negative factor. Address it head-on; never minimize.', 'Show time since the last offence, completed sentences, counselling, stable work, support letters, remorse in the client’s own words.', CREAC],
        starter: '[Conclusion: the Applicant has rehabilitated and poses no risk.] [Offence history, time crime-free, steps taken.] (Tab [#])' },
    ],
    conclusion: 'When all of the circumstances are considered together — [strongest point], [second point] and [third point] — they would excite in a reasonable person a desire to relieve the Applicant’s misfortune. We respectfully request that the Applicant be granted permanent residence on humanitarian and compassionate grounds[, together with an exemption from the inadmissibility described above].\n\nIf the officer has any concern about the credibility of the evidence, we ask that the Applicant be given an opportunity to respond, including by interview, before a decision is made.',
    enclosures: ['Use of a Representative (IMM 5476)', 'Application forms and supplementary information (IMM 5283)', 'Fee receipt', 'Applicant’s personal statement / affidavit', 'Identity documents', 'Evidence of establishment (employment letter, pay stubs, tax returns)', 'Evidence relating to the children', 'Reference and support letters', 'Country condition evidence'],
  },

  recon: {
    label: 'Request for reconsideration (after a refusal)', short: 'Reconsideration request', kind: 'persuasive',
    blurb: 'Ask the officer to reopen a refused application because of an error, overlooked evidence or unfairness.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', T('app_type', 'Application refused'), T('decision_date', 'Date of refusal letter'), T('refusal_ground', 'Refusal ground(s) cited')],
    extraFields: [['decided_where', 'Where the decision was made', 'select', [['in', 'Inside Canada (Federal Court leave: 15 days)'], ['out', 'Outside Canada (Federal Court leave: 60 days)']]]],
    test: 'No statutory right; the officer has discretion to reconsider (Kurukkal, 2010 FCA 230). Show a specific, reviewable problem: evidence on file was overlooked or misread, procedural fairness was breached (e.g. a credibility concern never put to the applicant — Hassani, 2006 FC 1283), or the reasons don’t justify the result (Vavilov, 2019 SCC 65). A request does NOT stop the Federal Court deadline (IRPA s. 72(2)(b)).',
    opening: {
      help: ['Say what you want and why in two sentences: “We ask that you reconsider the refusal dated X because the officer did not consider the employment letter submitted on Y.”', 'Be respectful. You are asking the officer to fix a mistake, not accusing them.', 'Get the GCMS notes first — they show the officer’s real reasons.'],
      starter: 'We respectfully request reconsideration of the decision dated [date] refusing [Client]’s [application type]. The refusal states that [ground]; however, [the specific document / fact] that answers this concern was submitted on [date] and is on file (Tab [#]). We ask that the application be reopened and assessed on the complete record.',
    },
    sections: [
      { key: 'history', heading: 'Application history', help: ['Timeline only: filed, any requests for documents (and what was sent, with confirmation), refusal.', 'Attach the submission confirmations — they prove what the officer had.'],
        starter: '- [Date]: Application submitted (Tab [#])\n- [Date]: Request for additional documents received (Tab [#])\n- [Date]: Documents submitted in response (confirmation at Tab [#])\n- [Date]: Application refused (Tab [#])' },
      { key: 'legal', heading: 'Authority to reconsider', help: ['Short. One paragraph on discretion to reconsider, one on the standard your ground relies on.', 'Cite only what you rely on.'],
        starter: 'Although there is no statutory appeal from this decision, an officer has discretion to reconsider it. In Kurukkal v. Canada (Minister of Citizenship and Immigration), 2010 FCA 230, the Federal Court of Appeal confirmed that the doctrine of functus officio does not strictly apply to decisions of this kind, so an officer may reopen a decision where the circumstances warrant it.\n\nA reasonable decision must be justified in relation to the facts and law that constrain the decision maker (Canada (Minister of Citizenship and Immigration) v. Vavilov, 2019 SCC 65, para 85). A decision that fails to account for the evidence before the decision maker may be unreasonable (Vavilov, para 126).',
        snippets: [['Procedural fairness (credibility concern)', 'Where an officer has concerns about the credibility, accuracy or genuineness of the information submitted, procedural fairness requires that the applicant be given an opportunity to respond to those concerns (Hassani v. Canada (Minister of Citizenship and Immigration), 2006 FC 1283, para 24). No such opportunity was given here.']] },
      { key: 'error1', heading: 'Ground 1: [e.g. Evidence on file was not considered]', help: ['One ground per heading. Quote the refusal letter or GCMS line, then point to the evidence that answers it (Tab + page).', 'Show it was already on file — reconsideration is about the record the officer had.', CREAC],
        starter: '[Conclusion.] The refusal letter / GCMS notes state: “[quote]” (Tab [#]). However, [document] submitted on [date] shows [fact] (Tab [#], p. [#]). [Why this changes the outcome.]' },
      { key: 'error2', heading: 'Ground 2: [optional]', optional: true, help: ['Only include a second ground if it is genuinely strong. Weak grounds dilute strong ones.'], starter: '' },
      { key: 'newinfo', heading: 'New information', optional: true, help: ['If you add new documents, explain why they weren’t provided earlier. Consider whether a fresh application would be more effective.'], starter: '' },
    ],
    conclusion: 'For these reasons, we respectfully request that the decision dated [date] be reconsidered and the application be assessed on the complete record[, or, in the alternative, that the Applicant be given an opportunity to respond to any remaining concerns]. We would be grateful for a response at your earliest convenience, as the Applicant’s [status / employment] depends on the outcome.',
    enclosures: ['Refusal letter', 'GCMS notes', 'Original submission confirmation', 'Request for additional documents', 'Confirmation of documents submitted in response', 'Use of a Representative (IMM 5476)'],
  },

  ee_pr: {
    label: 'Express Entry permanent residence (CEC / FSW / FST / PNP)', short: 'Express Entry PR', kind: 'rules',
    blurb: 'Rules-based cover letter: show each requirement is met, list the documents, explain anything missing.',
    particulars: ['applicant', 'dob', 'uci', T('profile_no', 'Express Entry profile number'), 'citizenship', 'residence', 'status', T('noc', 'Primary occupation & NOC (TEER)'), T('ita', 'ITA date & CRS score')],
    app_type: 'Application for permanent residence — Canadian Experience Class (Express Entry)',
    test: 'CEC (IRPR s. 87.1): at least 1 year (1,560 hours) of authorized, full-time-equivalent skilled work in Canada (TEER 0–3) in the 3 years before applying, performing the NOC lead statement and main duties; CLB 7 for TEER 0/1 or CLB 5 for TEER 2/3; intends to live outside Quebec. Work while a full-time student or self-employed doesn’t count.',
    opening: {
      help: ['Rules-based: be concise. State the program, the ITA, and that the requirements are met.', 'Make sure the facts agree with each other (CRS score vs. draw cut-off, dates vs. letters). Inconsistency invites doubt.'],
      starter: 'Please accept the enclosed application for permanent residence for [Client] under the Canadian Experience Class, submitted following an invitation to apply issued on [date] (CRS score [score]). As summarized below, [Client] meets every requirement of section 87.1 of the Immigration and Refugee Protection Regulations.',
    },
    sections: [
      { key: 'legal', heading: 'Program requirements', help: ['Name the exact provision. If the program isn’t CEC, use a snippet below.'],
        starter: 'Under subsection 87.1(2) of the Immigration and Refugee Protection Regulations (IRPR), a foreign national is a member of the Canadian Experience Class if, within the three years before applying, they acquired at least one year of full-time work experience in Canada (or the equivalent in part-time work) in one or more occupations in TEER category 0, 1, 2 or 3 of the National Occupational Classification, performed the actions in the lead statement and a substantial number of the main duties of that occupation, and meet the language threshold for that occupation. Work experience gained while a full-time student or while self-employed is excluded (subsection 87.1(3)).',
        snippets: [['Federal Skilled Worker (s. 75)', 'Under section 75 of IRPR, a foreign national is a member of the federal skilled worker class if they have at least one year of continuous full-time (or equivalent) paid work experience in the last ten years in a TEER 0, 1, 2 or 3 occupation, meet the minimum language threshold, have the required education credential and assessment, obtain the minimum points under section 76, and have the settlement funds required under subsection 76(1)(b).'],
          ['Substituted evaluation (FSW, s. 76(3))', 'Should it be determined that the Applicant does not obtain the minimum points, we respectfully request a substituted evaluation under subsection 76(3) of IRPR, because the points awarded are not a sufficient indicator of the Applicant’s ability to become economically established in Canada, for the reasons set out below.'],
          ['Substituted evaluation (PNP, s. 87(3))', 'Should the officer have concerns that the provincial nomination is not a sufficient indicator of the Applicant’s ability to become economically established in Canada, we respectfully ask that the officer consider the evidence below before substituting their evaluation under subsection 87(3) of IRPR, which also requires the concurrence of a second officer (subsection 87(4)).'],
          ['Provincial Nominee (s. 87)', 'Under section 87 of IRPR, a foreign national is a member of the provincial nominee class if they have been nominated by a province under a provincial nomination agreement and intend to reside in the nominating province. A copy of the nomination certificate is enclosed (Tab [#]).']] },
      { key: 'work', heading: 'Qualifying Canadian work experience', help: ['One line per job: dates, employer, title, NOC/TEER, hours per week, and the Tab of the employment letter.', 'Letters must show duties, hours, salary and dates on company letterhead, signed.', 'Mention other experience only if it adds points, and say whether you rely on it.'],
        starter: '1. [Start] – [End/present]: [Job title], [Employer], NOC [code] (TEER [#]), [hours] hours/week (Tab [#])\n2. [Start] – [End]: [Job title], [Employer], NOC [code] (TEER [#]), [hours] hours/week (Tab [#])\n\nTotal qualifying experience: [months / hours] within the three years before this application.' },
      { key: 'language', heading: 'Official language ability', help: ['Test type, date, CLB in each skill, and that the result is valid (under 2 years) on the date of application.'],
        starter: '[Client] scored CLB [#] or higher in all four abilities on the [IELTS General / CELPIP-General / TEF Canada / TCF Canada] test taken on [date] (Tab [#]), meeting the CLB [7/5] threshold for TEER [#].' },
      { key: 'education', heading: 'Education', optional: true, help: ['Canadian credential or foreign credential with ECA (issuer, date, Canadian equivalency).'],
        starter: '[Client] holds [credential] from [institution] ([year]) (Tab [#])[ and an Educational Credential Assessment from [organization] confirming equivalency to a Canadian [level] (Tab [#])].' },
      { key: 'missing', heading: 'Documents to follow', optional: true, help: ['Explain anything missing and why, with proof you requested it (e.g. police certificate in process). Say how and when it will be sent.'],
        starter: 'The police certificate from [country] has been requested and is in process; proof of the request is enclosed (Tab [#]). It will be submitted by web form as soon as it is received.' },
    ],
    conclusion: 'Because [Client] meets all of the requirements of section 87.1 of IRPR, we respectfully request that a permanent resident visa be issued.',
    enclosures: ['Invitation to apply', 'Passport', 'Employment reference letters', 'Pay stubs / T4s', 'Work permits', 'Language test results', 'Education credentials / ECA', 'Police certificates', 'Proof of medical examination', 'Use of a Representative (IMM 5476)'],
  },

  work_permit: {
    label: 'Work permit (new, extension or restoration)', short: 'Work permit', kind: 'rules',
    blurb: 'Show the basis (LMIA or exemption), the client’s qualifications, and status compliance.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'status', T('noc', 'Position & NOC'), T('employer', 'Employer'), T('lmia', 'LMIA number or exemption code'), T('permit_expiry', 'Current permit expires')],
    app_type: 'Application to extend a work permit',
    test: 'IRPR s. 200(1): the officer shall issue a work permit if the person will leave by the end of their authorized stay and meets the requirements, including a positive LMIA or an exemption (ss. 204–205), and can perform the work. Applying before expiry keeps maintained status (s. 183(5)) and the right to keep working (s. 186(u)). Restoration (s. 182): within 90 days, still meeting the initial requirements.',
    opening: {
      help: ['One paragraph: what is being applied for and on what basis (LMIA/exemption code).', 'If status is maintained or being restored, say so up front.'],
      starter: 'Please accept the enclosed application for [an extension of / a new] work permit for [Client] to continue working as a [position] (NOC [code]) for [Employer], based on [a positive LMIA, number [#] / LMIA exemption code [code]]. The application was submitted before [his/her/their] current permit expires on [date], so [Client] has maintained status under subsection 183(5) of IRPR.',
    },
    sections: [
      { key: 'legal', heading: 'Basis of the application', help: ['Name the exact provision and exemption code. Rules-based: keep it short.'],
        starter: 'Under subsection 200(1) of the Immigration and Refugee Protection Regulations (IRPR), an officer shall issue a work permit where the foreign national applied in accordance with the Regulations, will leave Canada by the end of the period authorized for their stay, and [holds an offer of employment supported by a positive labour market impact assessment / is exempt from the LMIA requirement under section [204/205] of IRPR (code [code])].',
        snippets: [['Restoration (s. 182)', 'This application is made together with a request for restoration of temporary resident status under section 182 of IRPR. The Applicant applied within 90 days of losing status, continues to meet the initial requirements for the status sought, and has complied with all other conditions imposed (Tab [#]).'],
          ['Dual intent (IRPA s. 22(2))', 'Under subsection 22(2) of IRPA, an intention to become a permanent resident does not preclude a foreign national from becoming a temporary resident if the officer is satisfied that they will leave Canada by the end of the period authorized for their stay.']] },
      { key: 'job', heading: 'Employment offer and qualifications', help: ['Match the client’s experience and education to the job requirements and NOC duties, with Tabs.', 'Include the employer compliance fee/offer number for exempt permits.'],
        starter: '[Employer] has offered [Client] the position of [title] (NOC [code]) at [wage] for [hours] hours per week (Tab [#]). [Client] meets the job requirements: [experience / education / licence] (Tab [#]).' },
      { key: 'status', heading: 'Status history and compliance', help: ['Show the client always respected their conditions. Explain any gap or overstay openly with evidence.'],
        starter: '[Client] entered Canada on [date] as a [status] and has maintained valid status since: [permits and dates] (Tab [#]).' },
      { key: 'temporary', heading: 'Temporary intention', optional: true, help: ['Needed when intent to leave may be questioned. Ties, pathway to PR (legal), past compliance.'], starter: '' },
    ],
    conclusion: 'As [Client] meets the requirements of subsection 200(1) of IRPR, we respectfully request that the work permit be issued for [period / until date].',
    enclosures: ['Current work permit', 'Passport', 'Job offer / employment contract', 'LMIA or offer of employment number', 'Recent pay stubs', 'Proof of qualifications', 'Use of a Representative (IMM 5476)'],
  },

  study_permit: {
    label: 'Study permit', short: 'Study permit', kind: 'rules',
    blurb: 'Study plan, funds, and that the student will leave at the end of their stay.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'residence', T('dli', 'School & DLI number'), T('program', 'Program & start date'), T('pal', 'PAL/TAL number')],
    app_type: 'Application for a study permit',
    test: 'IRPR s. 216(1): the officer shall issue a study permit if the person will leave by the end of their authorized stay and meets the requirements, including a letter of acceptance from a designated learning institution (s. 219) and enough money for tuition, living costs and return travel without working (s. 220). An intention to become a permanent resident doesn’t disqualify them (IRPA s. 22(2)).',
    opening: { help: ['State the program and school, and in one sentence why this program makes sense for this student’s path.'],
      starter: 'Please accept the enclosed study permit application for [Client], who has been accepted to the [program] at [school] (DLI [number]), starting [date]. This program builds directly on [Client]’s [previous education / work] and leads to [career goal].' },
    sections: [
      { key: 'legal', heading: 'Requirements', help: ['Short and exact.'],
        starter: 'Under subsection 216(1) of the Immigration and Refugee Protection Regulations (IRPR), an officer shall issue a study permit if the foreign national will leave Canada by the end of the period authorized for their stay and meets the requirements of Part 12, including acceptance by a designated learning institution (section 219) and sufficient financial resources, without working in Canada, to pay tuition, maintain themselves and any accompanying family members, and pay for return transportation (section 220).' },
      { key: 'plan', heading: 'Study plan', help: ['Why this program, why this school, why Canada, why now — tied to the student’s past and future.', 'If it looks like a step down (e.g. master’s holder taking a diploma), explain it.'], starter: '' },
      { key: 'funds', heading: 'Financial capacity', help: ['Show funds ≥ tuition + living costs + travel. Source of funds must be explained (sponsor’s income, history of the savings).'], starter: 'Tuition for the first year is $[ ] (Tab [#]). [Client] has $[ ] available from [source] (Tab [#]).' },
      { key: 'ties', heading: 'Ties to home country', help: ['Family, job offer or career prospects at home, property. Tie each to the likelihood of leaving.'], starter: '' },
    ],
    conclusion: 'As [Client] meets the requirements of subsection 216(1) and section 220 of IRPR, we respectfully request that a study permit be issued.',
    enclosures: ['Letter of acceptance', 'Provincial/territorial attestation letter', 'Passport', 'Proof of funds', 'Study plan', 'Academic transcripts', 'Use of a Representative (IMM 5476)'],
  },

  visitor: {
    label: 'Visitor visa or visitor record', short: 'Visitor visa', kind: 'rules',
    blurb: 'Purpose of the visit and why the visitor will go home.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'residence', T('purpose', 'Purpose and dates of visit')],
    app_type: 'Application for a temporary resident visa',
    test: 'IRPR s. 179: the officer shall issue a visa if the person will leave by the end of their authorized stay (and meets the other requirements). Officers look at ties to the home country, purpose of travel, finances, travel history and conditions at home. Dual intent is allowed (IRPA s. 22(2)).',
    opening: { help: ['Purpose, dates, who they’re visiting, and the strongest reason they’ll return — in two sentences.'],
      starter: '[Client] wishes to visit [person / place] in [city] from [date] to [date] to [purpose]. [Client] will return to [country] at the end of the visit to [strongest tie — e.g. her position as a teacher and her 12-year-old son].' },
    sections: [
      { key: 'purpose', heading: 'Purpose of the visit', help: ['Invitation letter, itinerary, event details.'], starter: '' },
      { key: 'ties', heading: 'Ties to [country]', help: ['Connect each tie to the decision: “her son, age 12, stays at home in school — no mother leaves her child behind indefinitely.” Prove each one.'], starter: '' },
      { key: 'funds', heading: 'Financial means', help: ['Bank statements with history, employment income, who pays for what.'], starter: '' },
      { key: 'history', heading: 'Travel history', optional: true, help: ['Previous visas and returns on time. If refused before, explain what is different now — without saying the last officer was wrong.'], starter: '' },
    ],
    conclusion: 'As [Client] will leave Canada at the end of the authorized stay, we respectfully request that a temporary resident visa be issued.',
    enclosures: ['Passport and travel history', 'Invitation letter', 'Proof of employment and leave', 'Bank statements', 'Proof of family ties', 'Use of a Representative (IMM 5476)'],
  },

  spousal: {
    label: 'Spousal / common-law sponsorship', short: 'Spousal sponsorship', kind: 'persuasive',
    blurb: 'Show the relationship is genuine and not mainly for immigration — and answer obvious concerns.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'residence', T('sponsor', 'Sponsor'), T('relationship', 'Relationship (spouse / common-law / conjugal)')],
    app_type: 'Sponsorship of a spouse or common-law partner',
    test: 'IRPR s. 4(1): a person isn’t a spouse or partner if the relationship was entered into primarily to obtain status OR isn’t genuine — address both. Common-law = cohabiting in a conjugal relationship for at least 1 year (s. 1(1)). Family class s. 117(1)(a); in-Canada class s. 124.',
    opening: { help: ['Introduce the couple and what makes the relationship real in two sentences.', 'If there is an obvious concern (age gap, short courtship, prior sponsorship), say you will address it.'],
      starter: '[Sponsor] and [Applicant] met in [year] through [how] and married on [date] in [place]. [One sentence on the life they share — e.g. their daughter, the home they rent together, how they stay connected.]' },
    sections: [
      { key: 'legal', heading: 'Legal framework', help: ['Short. The two prongs of s. 4(1) are separate — your evidence must answer both.'],
        snippets: [['Introduction (in-Canada class)', 'We have been retained with respect to an application for permanent residence in the Spouse or Common-law Partner in Canada class, made under subsection 12(1) of the Immigration and Refugee Protection Act (IRPA) and sections 123 to 125 of the Immigration and Refugee Protection Regulations (IRPR).'],
          ['Introduction (family class, outside Canada)', 'We have been retained with respect to an application for permanent residence in the family class as the spouse of a Canadian sponsor, made under subsection 12(1) of the Immigration and Refugee Protection Act (IRPA) and paragraph 117(1)(a) of the Immigration and Refugee Protection Regulations (IRPR).']],
        starter: 'Under subsection 4(1) of the Immigration and Refugee Protection Regulations, a foreign national is not considered a spouse or common-law partner if the marriage or relationship was entered into primarily for the purpose of acquiring any status or privilege under the Act, or is not genuine. The evidence below addresses both elements.' },
      { key: 'history', heading: 'History of the relationship', help: ['Timeline with evidence: meeting, dating, engagement, wedding, living together, visits.', 'Consistency with the forms matters — check every date against IMM 5532.'], starter: '' },
      { key: 'genuine', heading: 'Evidence the relationship is genuine', help: ['Cohabitation, joint finances, communication, family knowledge/involvement, children, future plans.', 'Quality over quantity: a curated, labelled selection.'], starter: '' },
      { key: 'sponsor', heading: 'Sponsor eligibility (IRPR s. 133)', help: ['Confirm each requirement of IRPR subsection 133(1) and point to the proof (status document, income where required).', 'Paraphrase the law; don’t paste whole sections.'],
        starter: 'In accordance with subsection 133(1) of IRPR, the sponsor, [Sponsor]:\n- is a sponsor as described in section 130 (a Canadian citizen or permanent resident, at least 18 years old) (Tab [#]);\n- intends to fulfil the obligations in the sponsorship undertaking;\n- is not subject to a removal order;\n- is not detained in any penitentiary, jail, reformatory or prison;\n- has not been convicted of an offence referred to in paragraph 133(1)(e);\n- is not in default of any previous sponsorship undertaking or court-ordered support payments;\n- is not in default of the repayment of any debt referred to in subsection 145(1) of IRPA;\n- is not an undischarged bankrupt;\n- is not in receipt of social assistance for a reason other than disability; and\n- resides in [province].' },
      { key: 'concerns', heading: 'Addressing possible concerns', optional: true, help: ['Name the concern yourself and answer it with evidence. Don’t let the officer discover it first.'], starter: '' },
    ],
    conclusion: 'The relationship between [Sponsor] and [Applicant] is genuine and was not entered into primarily for immigration purposes. We respectfully request that the application be approved.',
    enclosures: ['Document checklist (current IRCC form)', 'Generic Application Form for Canada (IMM 0008)', 'Additional Family Information (IMM 5406)', 'Schedule A – Background/Declaration (IMM 5669)', 'Relationship Information and Sponsorship Evaluation (IMM 5532)', 'Application to Sponsor, Sponsorship Agreement and Undertaking (IMM 1344)', 'Use of a Representative (IMM 5476) — applicant and sponsor', 'Proof of fee payment', 'Applicant’s passport', 'Applicant’s birth certificate with certified translation', 'Applicant’s police certificates', 'Proof of medical examination', 'Sponsor’s proof of status (PR card / citizenship certificate)', 'Marriage certificate with translation', 'Divorce certificate (if applicable)', 'Wedding and relationship photos with descriptions', 'Proof of cohabitation and joint finances', 'Communication history', 'Sponsor’s proof of income and employment', 'Open work permit application (IMM 5710), if in Canada'],
  },

  trp: {
    label: 'Temporary resident permit (TRP)', short: 'TRP request', kind: 'persuasive',
    blurb: 'Overcome inadmissibility: the need to enter or remain outweighs any risk.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'residence', T('inadmissibility', 'Inadmissibility (IRPA section)'), T('trp_period', 'Period requested')],
    app_type: 'Request for a temporary resident permit (IRPA s. 24(1))',
    test: 'IRPA s. 24(1): a TRP may be issued if justified in the circumstances. The officer weighs the need to enter or remain against the risk to Canadians (Farhat, 2006 FC 1275). Show a compelling need, low risk, and why other remedies (criminal rehabilitation, record suspension) aren’t available yet.',
    opening: { help: ['The need and the low risk, in two sentences.'],
      starter: '[Client] needs to [enter / remain in] Canada to [purpose] from [date] to [date]. Although [Client] is inadmissible under [section] of IRPA because of [offence] in [year], [he/she/they] has [time] without any further offence and poses no risk to Canadians.' },
    sections: [
      { key: 'legal', heading: 'Legal framework', help: ['Short and exact.'],
        starter: 'Subsection 24(1) of the Immigration and Refugee Protection Act allows an officer to issue a temporary resident permit to a foreign national who is inadmissible, or who does not meet the requirements of the Act, if the officer is of the opinion that it is justified in the circumstances. The officer weighs the need for the foreign national to enter or remain in Canada against any risk to Canadians or Canadian society (Farhat v. Canada (Minister of Citizenship and Immigration), 2006 FC 1275).' },
      { key: 'inadmissibility', heading: 'The inadmissibility', help: ['State the offence, date, sentence and Canadian equivalent honestly. Attach court records.'], starter: '' },
      { key: 'need', heading: 'Need to enter or remain in Canada', help: ['Concrete, time-specific need with evidence (work contract, family event, medical).'], starter: '' },
      { key: 'risk', heading: 'Risk is minimal', help: ['Time since offence, completed sentence, no pattern, rehabilitation steps, references.', 'Explain why criminal rehabilitation isn’t yet available (e.g. 5 years not yet passed since the sentence was completed — IRPA s. 36(3)(c), IRPR s. 17).'], starter: '' },
    ],
    conclusion: 'The Applicant’s need to [enter/remain in] Canada clearly outweighs the minimal risk. We respectfully request that a temporary resident permit be issued for [period].',
    enclosures: ['Court records and proof of sentence completion', 'Police certificates', 'Evidence of the need to enter/remain', 'Reference letters', 'Personal statement', 'Use of a Representative (IMM 5476)'],
  },

  extension: {
    label: 'Request for an extension of time', short: 'Extension request', kind: 'rules',
    blurb: 'Ask IRCC for more time to answer a procedural fairness letter or a request for documents. Send it before the deadline.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', T('app_type', 'Application'), T('decision_date', 'Date of IRCC letter'), T('deadline', 'Current deadline')],
    test: 'There is no automatic right to more time; the officer decides. Send the request before the deadline, explain the specific reason the response cannot be completed in time, show what has already been done (with proof), and propose a realistic date. Meanwhile, send whatever is ready.',
    opening: { help: ['One sentence: what you are asking for and until when.', 'Send it through the same channel IRCC asked you to use (portal or web form), before the deadline.'],
      starter: 'We respectfully request an extension of time until [proposed date] to respond to your letter dated [date], which asks for [documents / response] by [deadline].' },
    sections: [
      { key: 'reasons', heading: 'Why more time is needed', help: ['Specific and verifiable: a government office has not issued a document yet, a medical appointment date, a police certificate processing time.', 'Attach proof of the request and the date it was made.'],
        starter: 'On [date], [Client] requested [document] from [authority] (proof of request at Tab [#]). [Authority] advises that it takes [time] to issue. The document cannot be obtained before [deadline] despite [Client]’s diligent efforts.' },
      { key: 'done', heading: 'What is being submitted now', help: ['Send everything that is ready with this request — it shows good faith.'], starter: 'With this letter we submit [documents ready now] (Tabs [#]). The remaining document will be submitted as soon as it is received, and no later than [proposed date].' },
    ],
    conclusion: 'For these reasons, we respectfully request an extension until [proposed date] to submit [documents / the response]. Thank you for considering this request.',
    enclosures: ['Proof that the documents were requested (receipt, email or letter)', 'Documents available now', 'Use of a Representative (IMM 5476), if not already on file'],
  },
  status: {
    label: 'Status inquiry (case-specific enquiry)', short: 'Status inquiry', kind: 'rules',
    blurb: 'Ask IRCC about an application that is outside the normal processing time, or report a change. Usually sent through the IRCC web form.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', T('app_type', 'Application'), T('decision_date', 'Date submitted (AOR date)')],
    test: 'Check the current processing time first: an enquiry is useful once the application is outside it, or when something changed (new passport, address, a deadline such as an expiring status or job offer). Keep it short and factual; one enquiry per issue.',
    opening: { help: ['Identify the application and say exactly what you are asking.'], starter: 'We are writing about the [application type] submitted on [date] (application number [number]), which is now [number] months beyond the published processing time of [time].' },
    sections: [
      { key: 'request', heading: 'Request', help: ['What you need: an update, confirmation that a document was received, or recording a change.', 'If there is a real urgency (expiring status, job start date, medical issue), state it with proof.'],
        starter: 'We would be grateful for an update on the status of this application and confirmation of whether anything further is required from [Client].' },
    ],
    conclusion: 'Thank you for your assistance. Please contact the undersigned with any questions.',
    enclosures: ['Use of a Representative (IMM 5476), if not already on file'],
  },
  atip: {
    label: 'ATIP request text (GCMS notes)', short: 'ATIP request', kind: 'rules',
    blurb: 'Text for an Access to Information and Privacy (ATIP) request for the client’s IRCC records, including GCMS notes. Filed through the ATIP online request service with the client’s signed consent.',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', T('app_type', 'Application(s) concerned')],
    test: 'Privacy Act requests (no fee) are for Canadian citizens, permanent residents and people present in Canada; others may request under the Access to Information Act (application fee applies — check the current amount). The requester’s signed consent (IMM 5744) must be enclosed when you request on their behalf. Be specific about the records and the period.',
    opening: { help: ['Name the person, the records and the period.'], starter: 'On behalf of [Client] (date of birth [date], UCI [UCI]), and with their enclosed written consent, we request a copy of all records held by Immigration, Refugees and Citizenship Canada about them.' },
    sections: [
      { key: 'records', heading: 'Records requested', help: ['List exactly what you need. GCMS notes show the officer’s real reasons.'],
        starter: '- Complete Global Case Management System (GCMS) notes, including officer notes and decision notes\n- All documents and correspondence on file for application [number]\n- Any records of interviews, risk assessments or referrals\nPeriod: from [date] to the date of this request.' },
      { key: 'delivery', heading: 'Delivery', help: ['Ask for electronic copies.'], starter: 'Please provide the records electronically through the ATIP online service.' },
    ],
    conclusion: 'Thank you for processing this request.',
    enclosures: ['Consent form (IMM 5744), signed in ink by the client', 'Copy of the client’s identity document'],
  },
  general: {
    label: 'Other / custom letter', short: 'Submission letter', kind: 'persuasive',
    blurb: 'Blank structure for anything else (PRRA, restoration, IRB submissions, procedural fairness responses).',
    particulars: ['applicant', 'dob', 'uci', 'app_no', 'citizenship', 'app_type'],
    test: 'Start with the legal test from the Act, then the Regulations, then IRCC program delivery instructions and case law. Use the elements of the test as your subheadings.',
    opening: { help: ['What is this letter asking for, and the single best reason to grant it?'], starter: '' },
    sections: [
      { key: 'legal', heading: 'Legal framework', help: ['Act → Regulations → policy → case law. The Act always wins.'], starter: '' },
      { key: 's1', heading: '[Heading from the legal test]', help: [CREAC], starter: '' },
    ],
    conclusion: 'For these reasons, we respectfully request that [remedy].',
    enclosures: ['Use of a Representative (IMM 5476)'],
  },
};

// Every letter gets passport and our file number in the RE block, and an optional "special circumstances" section.
const SPECIAL = { key: 'special', heading: 'Special circumstances', optional: true,
  help: ['Address anything unusual before the officer finds it: “yes” answers to background questions, missing or confusing documents, inconsistent dates, gaps, a previous refusal.', 'Problem → facts → remedy. If it was resolved in an earlier application, say what the issue was and how it was resolved.', 'Explain what is missing and why, and when it will follow (with proof of the request).'],
  starter: '[Issue — e.g. the employment dates on the reference letter differ from the IMM 5669.] [Explanation, with evidence.] (Tab [#]) [Remedy, or why it does not affect eligibility.]' };
for (const t of Object.values(TYPES)) {
  const keys = t.particulars.map((p) => (Array.isArray(p) ? p[0] : p));
  if (!keys.includes('passport')) t.particulars.splice(Math.max(0, keys.indexOf('dob') + 1), 0, 'passport');
  if (!keys.includes('our_file')) t.particulars.push('our_file');
  if (!t.sections.some((x) => x.key === 'special')) t.sections.push(SPECIAL);
}

// Coaching shown beside every letter (from the course material).
export const COACH = {
  before: ['Know the legal test before you type a word: Act → Regulations → program delivery instructions → case law.', 'Write your one-sentence theory of the case (the “elevator pitch”) — every section should support it.', 'Rank your facts: lead with the strongest, close with the second strongest, put weaker points in the middle.', 'Request documents in writing early, explain WHY you need each one, and diary follow-ups.'],
  writing: ['It is a formal business letter: full sentences and paragraphs. Use bullet points sparingly.', 'Rules-based cases: IRPA/IRPR references are usually enough. Add policy or case law only when the client’s situation isn’t clear from the provisions.', 'Paraphrase the law accurately; quote only what you need.', 'Tell the facts, but also the story — a personal detail makes the case “sticky”. Never embellish.', 'Don’t hide problems: state the problem, the facts, then the remedy (or how it was already resolved).', 'Use the test’s elements as subheadings — you speak the officer’s language.', 'Plain language, short paragraphs, 12-point font. Don’t bold or underline everything.', 'Tie every fact to the test: “so what?” If you can’t answer, cut it.', 'Submissions are not evidence. Every factual statement needs a Tab (affidavit > letter > nothing).', 'Explain what is missing and why, not just what is there.', 'Don’t exaggerate — it weakens your strong points.', 'Precedents are for structure only. Old names and countries left in a letter are embarrassing.'],
  filing: ['Read it out loud, several times. Check grammar, spelling, dates and names against the forms.', 'Make sure the forms are complete, signed and consistent with each other and with this letter.', 'Have someone else read it — give them 2–3 days.', 'Send the draft to the client to check facts; keep the record.', 'Check the enclosure list matches the package exactly.', 'Keep a copy for a possible judicial review — the record is what the officer had.', 'If something important changes before a decision, tell IRCC by web form that an update is coming.', 'Upload in the order of the enclosure list with numbered file names (use “Upload file names”). Online PR portal: the letter goes under “Documents related to the e-APR not captured in other fields”. Files must be under 4 MB.', 'Paper applications: number the pages discreetly, scan the whole package before sending, and use paper clips — never staples or binders.', 'Save the submission confirmation in the client file.'],
  client: ['Send the draft to the client before filing: they know their lives better than you and catch errors you miss.', 'Explain the legal terms and references — use “Explain to client” for a plain-language summary.', 'This is the moment the client sees the value of your work.'],
};

// ── Building a new letter ──
export function newLetterData(type, { contact = {}, caseRow = null, org = {} } = {}) {
  const t = TYPES[type];
  const part = {};
  for (const p of t.particulars) {
    const k = Array.isArray(p) ? p[0] : p;
    part[k] = ({ applicant: contact.full_name, dob: contact.date_of_birth, citizenship: contact.citizenship, uci: caseRow?.uci, app_no: caseRow?.ircc_file_number, our_file: caseRow?.case_number,
      residence: contact.location === 'in' ? 'Canada' : contact.country, status: contact.status_in_canada, app_type: t.app_type || caseRow?.application_type || '' })[k] || '';
  }
  const first = String(contact.full_name || '').trim();
  const fill = (s) => String(s || '').replaceAll('[Client]', first || '[Client]');
  return {
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' }), delivery: 'portal',
    recipient: 'Immigration, Refugees and Citizenship Canada', salutation: 'Dear Officer:',
    particulars: part, extra: { decided_where: contact.location === 'out' ? 'out' : 'in' }, fees: 'online',
    opening: fill(t.opening.starter), rep_statement: true,
    sections: t.sections.map((s) => ({ key: s.key, heading: s.heading, text: fill(s.starter), on: !s.optional })),
    conclusion: fill(t.conclusion), enclosures: t.enclosures.map((d) => ({ desc: d })),
    closing: 'Respectfully submitted,',
  };
}

// ── Text → HTML (paragraphs, "- " bullets, "1. " lists, "> " quotes; Tab references in bold) ──
export function textHtml(s) {
  const out = []; let list = null; let quote = [];
  const inline = (x) => esc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\b(Tabs? \d+[\w–,\- ]*?)(?=[),.;:]|$)/g, '<b>$1</b>').replace(/\[(?!\d{4}\]|sic\]|[a-z]\]|\.\.\.\]|…\])[^\]]*\]/g, (m) => `<span class="ph">${m}</span>`);
  const flushQ = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
  const flushL = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(s || '').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*>\s?/.test(line)) { flushL(); quote.push(line.replace(/^\s*>\s?/, '')); continue; }
    flushQ();
    const ul = line.match(/^\s*[-•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) { const ty = ul ? 'ul' : 'ol'; if (list !== ty) { flushL(); out.push(`<${ty}>`); list = ty; } out.push(`<li>${inline((ul || ol)[1])}</li>`); continue; }
    flushL();
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flushQ(); flushL();
  return out.join('');
}

// ── The letter document ──
const STYLE = `<style>
.sl{font-family:Arial,Helvetica,sans-serif;color:#1C2333;background:#fff;max-width:816px;box-sizing:border-box;padding:48px 64px 56px;font-size:12pt;line-height:1.5}
.sl table{border-collapse:collapse}.sl p{margin:0 0 10px}.sl ul,.sl ol{margin:0 0 10px 22px;padding:0}.sl li{margin:0 0 4px}
.sl .lh td{vertical-align:middle}.sl .lh img{width:104px;height:auto;display:block}
.sl .org{font-family:Georgia,'Times New Roman',serif;font-size:17pt;color:#0B2A5C;font-weight:bold}
.sl .oline{font-size:9.5pt;color:#555E70;line-height:1.45}
.sl .rule{border-top:2px solid #C9A24A;border-bottom:1px solid #0B2A5C;height:2px;margin:14px 0 22px}
.sl .re{margin:14px 0 16px}.sl .re td{padding:1px 0;font-size:11pt;vertical-align:top}.sl .re td.k{color:#555E70;padding-right:14px;white-space:nowrap}
.sl h2{font-family:Georgia,'Times New Roman',serif;font-size:13pt;color:#0B2A5C;margin:20px 0 8px;font-weight:bold}
.sl blockquote{margin:6px 30px 12px;font-size:11pt;color:#333}
.sl .ph{background:#FFF3C4;color:#7A5B00;border-radius:3px;padding:0 2px}
.sl .sig{margin-top:26px}.sl .sig img{max-height:64px;max-width:260px;display:block;margin:4px 0}
.sl .typed{font-family:'Brush Script MT','Segoe Script',cursive;font-size:24pt;color:#0B2A5C;line-height:1.1;margin:6px 0}
.sl .encl li{margin-bottom:2px}
.sl .ftr{margin-top:30px;border-top:1px solid #E3DCCD;padding-top:8px;font-size:8.5pt;color:#8A90A0;text-align:center}
.sl.print-clean .ph{background:none;color:inherit}
@media print{@page{size:letter;margin:0.6in}.sl{padding:0;max-width:none}.sl .ph{background:none}}
</style>`;

/** ctx: { org, logo, signer: { name, credentials, title, college_id }, signature, clean } */
export function letterHtml(L, type, ctx) {
  const t = TYPES[type] || TYPES.general, d = L || {}, o = ctx.org || {};
  const pl = t.particulars.map((p) => (Array.isArray(p) ? p : [p, P[p]?.[0] || p]));
  const val = (k) => { const v = d.particulars?.[k]; return k === 'dob' || k === 'decision_date' ? fmtLong(v) : v; };
  const rows = pl.filter(([k]) => String(d.particulars?.[k] || '').trim()).map(([k, l]) => `<tr><td class="k">${esc(l)}:</td><td><b>${esc(val(k))}</b></td></tr>`).join('');
  const s = ctx.signer || {};
  const secs = (d.sections || []).filter((x) => x.on && (String(x.text || '').trim() || String(x.heading || '').trim()));
  const encl = (d.enclosures || []).filter((e) => String(e.desc || '').trim());
  const name = d.particulars?.applicant || '';
  const fee = { online: 'The processing fees were paid online; the receipt is enclosed.', included: 'Payment of the processing fees is included with this application.', exempt: 'No processing fee is payable for this request.' }[d.fees] || '';
  const rep = d.rep_statement ? `<p>We have been retained by ${esc(name || 'the Applicant')} to represent them in this matter. Enclosed is the Use of a Representative form (IMM 5476), which authorizes us under the <i>Privacy Act</i> to act and receive information on the Applicant’s behalf, together with the completed application forms and supporting documents. ${fee} We ask that all correspondence be directed to our office.</p>` : (fee ? `<p>${fee}</p>` : '');
  return `${STYLE}<div class="sl${ctx.clean ? ' print-clean' : ''}">
  <table class="lh" width="100%"><tr><td style="width:120px">${ctx.logo ? `<img src="${esc(ctx.logo)}" alt="">` : ''}</td>
    <td style="text-align:right"><div class="org">${esc(o.business_name || '')}</div>
    <div class="oline">${esc(o.address || '')}<br>${esc([o.phone, o.email].filter(Boolean).join(' · '))}<br>www.gracefulimmigration.ca<br>${esc([o.rcic_name, 'RCIC-IRB'].filter(Boolean).join(', '))}${o.licence_number ? ' · CICC College ID ' + esc(o.licence_number) : ''}</div></td></tr></table>
  <div class="rule"></div>
  <p>${esc(fmtLong(d.date))}</p>
  ${d.delivery && DELIVERY[d.delivery] ? `<p style="font-weight:bold;font-size:10.5pt;letter-spacing:.04em;text-transform:uppercase">${esc(DELIVERY[d.delivery])}</p>` : ''}
  <p>${esc(d.recipient || '').replace(/\n/g, '<br>')}</p>
  <table class="re"><tr><td style="font-weight:bold;padding-right:16px;vertical-align:top">RE:</td><td><table>${rows}</table></td></tr></table>
  <p>${esc(d.salutation || 'Dear Officer:')}</p>
  ${textHtml(d.opening)}${rep}
  ${secs.map((x) => `${x.heading ? `<h2>${esc(x.heading)}</h2>` : ''}${textHtml(x.text)}`).join('')}
  ${d.conclusion ? `<h2>Conclusion</h2>${textHtml(d.conclusion)}` : ''}
  ${encl.length ? `<h2>Enclosures</h2><ol class="encl">${encl.map((e, i) => `<li>Tab ${i + 1} — ${esc(e.desc)}</li>`).join('')}</ol>` : ''}
  <p>Thank you for your time and consideration. If you require any further information, please contact ${esc(s.name || o.rcic_name || 'our office')} at ${esc(o.phone || '')}${o.email ? ' or by email at ' + esc(o.email) + ', which is the fastest way to reach us' : ''}.</p>
  <div class="sig"><p style="margin:0">${esc(d.closing || 'Respectfully submitted,')}</p>
    ${ctx.signature ? `<img src="${esc(ctx.signature)}" alt="Signature">` : `<div class="typed">${esc(s.name || o.rcic_name || '')}</div>`}
    <div style="border-top:1px solid #0B2A5C;width:260px;margin:2px 0 6px"></div>
    <b>${esc(s.name || o.rcic_name || '')}${s.credentials ? ', ' + esc(s.credentials) : ', RCIC-IRB'}</b><br>
    ${s.title ? esc(s.title) + '<br>' : ''}${esc(String(o.business_name || '').replace(/\.$/, '') + (o.business_name ? '.' : ''))}<br>
    ${s.college_id || o.licence_number ? 'CICC College ID ' + esc(s.college_id || o.licence_number) : ''}</div>
  <div class="ftr">${esc(String(o.business_name || '').replace(/\.$/, ''))} · Regulated Canadian Immigration Consultant · ${esc(o.phone || '')} · ${esc(o.email || '')}</div>
</div>`;
}

/** Plain text of the letter (for word counts and the AI review). */
export function letterText(L, type) {
  const t = TYPES[type] || TYPES.general, d = L || {};
  const secs = (d.sections || []).filter((x) => x.on);
  return [`TYPE: ${t.label}`, `OPENING:\n${d.opening || ''}`, ...secs.map((x) => `## ${x.heading}\n${x.text || ''}`), `## Conclusion\n${d.conclusion || ''}`,
    `## Enclosures\n${(d.enclosures || []).map((e, i) => `Tab ${i + 1} — ${e.desc}`).join('\n')}`].join('\n\n');
}

// ── Readiness checker ──
const MISSPELL = { recieve: 'receive', recieved: 'received', seperate: 'separate', occured: 'occurred', accomodation: 'accommodation', goverment: 'government', definately: 'definitely', untill: 'until', wich: 'which', thier: 'their', beleive: 'believe', trane: 'train', 'graduated form': 'graduated from', 'childs ': 'child’s ', 'applicant’s may': 'applicants may', "applicant's may": 'applicants may', 'its especially': 'it’s especially', ' alot ': ' a lot ' };

export function checkLetter(L, type, ctx = {}) {
  const t = TYPES[type] || TYPES.general, d = L || {}, out = [];
  const add = (level, where, msg) => out.push({ level, where, msg });
  const secs = (d.sections || []).filter((x) => x.on);
  const parts = [['Opening', d.opening || ''], ...secs.map((x) => [x.heading || 'Section', `${x.heading || ''}\n${x.text || ''}`]), ['Conclusion', d.conclusion || '']];
  const all = parts.map((p) => p[1]).join('\n\n');
  const words = (all.match(/\b[\w’'-]+\b/g) || []).length;

  // Unfinished
  for (const [w, txt] of parts) {
    const ph = (txt.match(/\[(?!\d{4}\]|sic\]|[a-z]\]|\.\.\.\]|…\])[^\]]*\]|\*{3,}|\bmm\/dd\/yyyy\b|\bdd\/mm\/yyyy\b|\bxx+\b/gi) || []);
    if (ph.length) add('error', w, `${ph.length} placeholder${ph.length > 1 ? 's' : ''} still to fill in (e.g. ${ph.slice(0, 2).join(', ')}).`);
  }
  if (!String(d.opening || '').trim()) add('error', 'Opening', 'No opening paragraph. Start with the core of the case in 2–3 sentences.');
  if (t.kind === 'persuasive' && /^\s*(this is an application|pursuant to|please be advised|we have been retained)/i.test(d.opening || '')) add('warn', 'Opening', 'The opening recites procedure. Lead with what the case is really about — the legal framework can follow.');
  if (!/request|ask that|ask you/i.test(d.conclusion || '')) add('error', 'Conclusion', 'The conclusion doesn’t make a clear request. Say exactly what you want the officer to do.');
  const encl = (d.enclosures || []).filter((e) => String(e.desc || '').trim());
  if (!encl.length) add('error', 'Enclosures', 'No list of enclosures. It shows the officer (and a reviewing court) what was submitted.');

  // Particulars
  const pk = (k) => String(d.particulars?.[k] || '').trim();
  if (!pk('applicant')) add('error', 'RE block', 'Principal applicant’s name is missing.');
  if (t.particulars.includes('uci') && !pk('uci') && !pk('app_no') && !pk('profile_no')) add('warn', 'RE block', 'Add the UCI or application number so the letter is matched to the file.');
  if (type === 'recon') {
    if (!pk('decision_date')) add('error', 'RE block', 'Enter the date of the refusal letter.');
    else {
      const days = d.extra?.decided_where === 'out' ? 60 : 15;
      const due = new Date(pk('decision_date') + 'T12:00:00'); due.setDate(due.getDate() + days);
      const left = Math.ceil((due - new Date()) / 86400000);
      add(left < 0 ? 'info' : 'warn', 'Deadline', `Federal Court leave deadline: ${due.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })} (${days} days from notification${left >= 0 ? `, ${left} day${left === 1 ? '' : 's'} left` : ' — passed'}). A reconsideration request does NOT stop this clock.`);
    }
  }

  // Evidence and tabs
  const maxTab = encl.length;
  for (const x of secs) {
    const refs = [...String(x.text || '').matchAll(/\bTabs? (\d+)/g)].map((m) => +m[1]);
    for (const r of refs) if (r > maxTab) add('error', x.heading, `Refers to Tab ${r}, but the enclosure list has only ${maxTab}.`);
    if (t.kind === 'persuasive' && !['legal', 'overview'].includes(x.key)) {
      const paras = String(x.text || '').split(/\n\s*\n/).filter((p) => (p.match(/\b\w+\b/g) || []).length > 45 && !/\bTabs? (\d+|\[)/.test(p) && !/^\s*>/.test(p));
      if (paras.length) add('warn', x.heading, `${paras.length} paragraph${paras.length > 1 ? 's make' : ' makes'} factual statements with no Tab reference. Submissions are not evidence.`);
    }
  }
  const usedTabs = new Set([...all.matchAll(/\bTabs? (\d+)/g)].map((m) => +m[1]));
  const unused = encl.map((_, i) => i + 1).filter((n) => !usedTabs.has(n));
  if (t.kind === 'persuasive' && encl.length && unused.length && unused.length < encl.length) add('info', 'Enclosures', `Tab${unused.length > 1 ? 's' : ''} ${unused.join(', ')} ${unused.length > 1 ? 'are' : 'is'} never referred to. Point the officer to each document where it matters.`);

  // Tone and law
  const tone = [[/\bhello\b|\bbonjour\b/i, 'Greeting is informal. Use “Dear Officer:”.'], [/\bcheers\b/i, 'Sign-off is informal. Use “Respectfully submitted,”.'], [/!/, 'Avoid exclamation marks in a submission.'],
    [/\byou (need|should|must|have) to\b/i, 'Don’t instruct the officer (“you need to…”). Use “we respectfully ask that you consider…”.'], [/\bno one wants\b|\bwill kill\b|\bobviously\b|\bclearly the best\b/i, 'Emotive or overstated wording. Let the evidence carry the emotion.'],
    [/\bas soon as possible\b/i, 'Don’t ask the officer to hurry; explain any real urgency with evidence.']];
  for (const [re, msg] of tone) if (re.test(all)) add('warn', 'Tone', msg);
  if (/\bIP ?5\b/.test(all)) add('info', 'Law', 'IP 5 is the former manual. Cite IRCC’s current program delivery instructions (you may write “formerly IP 5”).');
  if (/unusual and undeserved or disproportionate hardship/i.test(all) && !/descriptive|not a threshold|not create/i.test(all)) add('warn', 'Law', 'Since Kanthasamy (2015 SCC 61), this phrase is descriptive, not the test. Don’t present it as the threshold.');
  if (/\bimplied status\b/i.test(all)) add('info', 'Law', 'The current term is “maintained status” (IRPR s. 183(5)).');
  if (/\bsection 114\(2\)|\bs\. ?114\(2\)/i.test(all)) add('info', 'Law', 's. 114(2) is from the former Immigration Act. Make sure it’s quoted from a case, not cited as current law.');
  if (/\b182\(1\)/.test(all) && type !== 'work_permit') add('info', 'Law', 'IRPR s. 182 is restoration of status. Check this is the provision you mean.');

  // Precedent leftovers and consistency
  const last = pk('applicant').split(/\s+/).filter(Boolean).pop() || '';
  const others = [...new Set([...all.matchAll(/\b(Mr|Ms|Mrs|Miss|Mx)\.? ([A-Z][a-z-]+)/g)].map((m) => m[2]))].filter((n) => last && n.toLowerCase() !== last.toLowerCase() && !(ctx.knownNames || []).some((k) => k.toLowerCase() === n.toLowerCase()));
  if (others.length) add('warn', 'Names', `Mentions ${others.map((n) => '“' + n + '”').join(', ')} — not the applicant’s last name (${last}). Introduce each person, or remove names left from a precedent.`);
  for (const [bad, good] of Object.entries(MISSPELL)) if (all.toLowerCase().includes(bad)) add('warn', 'Spelling', `“${bad.trim()}” → “${good.trim()}”.`);
  const dup = all.match(/\b(\w{2,})\s+\1\b/i); if (dup) add('warn', 'Spelling', `Repeated word: “${dup[0]}”.`);

  // Style (course notes)
  const bodyLines = secs.flatMap((x) => String(x.text || '').split('\n').filter((l) => l.trim()));
  const bullets = bodyLines.filter((l) => /^\s*([-•]|\d+[.)])\s+/.test(l)).length;
  if (bodyLines.length >= 8 && bullets / bodyLines.length > 0.6) add('warn', 'Style', 'Most of the letter is bullet points. A submission is a formal business letter — write in full sentences and use bullets sparingly.');
  const legalese = all.match(/\b(whereof|hereunto|hereinafter|herein|hereby|aforementioned|aforesaid|heretofore|witnesseth)\b/gi);
  if (legalese) add('warn', 'Style', `Plain language: avoid “${[...new Set(legalese.map((w) => w.toLowerCase()))].join('”, “')}”.`);
  if (t.kind === 'rules' && / v\. [A-Z]/.test(all)) add('info', 'Law', 'Rules-based letter cites case law. IRPA/IRPR references are usually enough — keep case law only if the client’s situation isn’t clear from the provisions.');
  const bolds = (all.match(/\*\*[^*]+\*\*/g) || []).length;
  if (bolds > 6) add('info', 'Style', `${bolds} bolded phrases. If everything is emphasized, nothing is.`);
  if (!d.fees) add('info', 'Fees', 'Say how the processing fees were paid (Letter details → Fees).');
  if (!d.client_reviewed) add('info', 'Client review', 'Send the draft to the client to check before filing, then record the date under Sign-off.');

  // Length and readability
  if (t.kind === 'rules' && words > 1100) add('info', 'Length', `${words} words. Rules-based letters should be concise — the officer wants to tick the boxes quickly.`);
  if (t.kind === 'persuasive' && type === 'hc' && words < 900) add('warn', 'Length', `${words} words. A short H&C submission rarely persuades; develop each factor with evidence.`);
  const longP = parts.flatMap(([w, txt]) => txt.split(/\n\s*\n/).filter((p) => (p.match(/\b\w+\b/g) || []).length > 190).map(() => w));
  if (longP.length) add('info', 'Readability', `Very long paragraph in ${[...new Set(longP)].join(', ')}. Break it up so the officer can skim.`);
  const caps = (all.match(/\b[A-Z]{5,}\b/g) || []).filter((w) => !/^(IRPA|IRPR|IMM|LMIA|GCMS|ITA|UCI|TEER|IELTS|CELPIP|CICC|IRCC|RCIC|PRRA)$/.test(w));
  if (caps.length > 4) add('info', 'Readability', 'Lots of words in capitals. Emphasize only what matters most.');

  const score = Math.max(0, 100 - out.reduce((s, i) => s + (i.level === 'error' ? 14 : i.level === 'warn' ? 6 : ['Deadline', 'Client review', 'Fees'].includes(i.where) ? 0 : 2), 0));
  return { issues: out, score, words };
}
