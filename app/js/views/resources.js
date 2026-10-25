import { esc, icon } from '../core.js';

// Reference library for the practice. Every link opens the official source in a new tab.
const SECTIONS = [
  { title: 'Acts, regulations & the Constitution', ico: 'scale', note: 'Consolidated federal law from Justice Laws Website.', links: [
    ['Immigration and Refugee Protection Act (IRPA)', 'S.C. 2001, c. 27', 'https://laws-lois.justice.gc.ca/eng/acts/I-2.5/'],
    ['Immigration and Refugee Protection Regulations (IRPR)', 'SOR/2002-227', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-227/'],
    ['Citizenship Act', 'R.S.C. 1985, c. C-29', 'https://laws-lois.justice.gc.ca/eng/acts/C-29/'],
    ['Citizenship Regulations', 'SOR/93-246', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-93-246/'],
    ['Constitution Acts, 1867 to 1982', 'Including the Constitution Act, 1982', 'https://laws-lois.justice.gc.ca/eng/const/'],
    ['Canadian Charter of Rights and Freedoms', 'Part I of the Constitution Act, 1982', 'https://laws-lois.justice.gc.ca/eng/const/page-12.html'],
    ['College of Immigration and Citizenship Consultants Act', 'S.C. 2019, c. 29, s. 292', 'https://laws-lois.justice.gc.ca/eng/acts/C-33.6/'],
    ['Code of Professional Conduct for College Licensees', 'SOR/2022-128', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/'],
    ['Refugee Protection Division Rules', 'SOR/2012-256', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2012-256/'],
    ['Refugee Appeal Division Rules', 'SOR/2012-257', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2012-257/'],
    ['Immigration Division Rules', 'SOR/2002-229', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-229/'],
    ['Immigration Appeal Division Rules', 'SOR/2022-277', 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-277/'],
    ['Canada Gazette', 'New and proposed regulations', 'https://www.gazette.gc.ca/accueil-home-eng.html'],
  ] },
  { title: 'IRCC — policy & operations', ico: 'book', note: 'Immigration, Refugees and Citizenship Canada.', links: [
    ['Program delivery instructions (operational instructions & guidelines)', 'Operational bulletins and manuals', 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals.html'],
    ['Ministerial Instructions', 'Express Entry, caps and pauses', 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions.html'],
    ['Express Entry rounds of invitations', 'Draw history and CRS cut-offs', 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html'],
    ['CRS points calculator', 'Comprehensive Ranking System tool', 'https://www.cic.gc.ca/english/immigrate/skilled/crs-tool.asp'],
    ['Application forms and guides', 'Current IRCC forms', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides.html'],
    ['Processing times', 'Check current processing times', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html'],
    ['Check application status', 'Status trackers and accounts', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-status.html'],
    ['Sign in to IRCC accounts', 'IRCC secure account and portals', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/account.html'],
    ['IRCC Help Centre', 'Answers to common questions', 'https://www.cic.gc.ca/english/helpcentre/index-featured-can.asp'],
    ['Claiming refugee protection in Canada', 'IRCC overview for claimants', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/refugees/claim-protection-inside-canada.html'],
    ['Language test equivalency (CLB)', 'Approved tests and CLB levels', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-requirements/language-testing.html'],
    ['Educational credential assessment (ECA)', 'Designated organizations', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/education-assessed.html'],
    ['Find a panel physician', 'Immigration medical exams', 'https://secure.cic.gc.ca/pp-md/pp-list.aspx'],
    ['IRCC news releases', 'Announcements and policy changes', 'https://www.canada.ca/en/immigration-refugees-citizenship/news.html'],
  ] },
  { title: 'Immigration and Refugee Board (IRB)', ico: 'shield', note: "Canada's largest independent administrative tribunal.", links: [
    ['IRB main page', 'All four divisions', 'https://www.irb-cisr.gc.ca/en/Pages/index.aspx'],
    ['National Documentation Packages (NDP)', 'Country evidence used at hearings', 'https://www.irb-cisr.gc.ca/en/country-information/ndp/Pages/index.aspx'],
    ['Responses to Information Requests (RIR)', 'Research answers on specific country issues', 'https://www.irb-cisr.gc.ca/en/country-information/rir/Pages/index.aspx'],
    ["Chairperson's Guidelines & policies", 'Gender, SOGIESC, vulnerable persons and more', 'https://www.irb-cisr.gc.ca/en/legal-policy/policies/Pages/index.aspx'],
    ['IRB forms', 'Basis of Claim and other forms', 'https://www.irb-cisr.gc.ca/en/forms/Pages/index.aspx'],
  ] },
  { title: 'Case law', ico: 'scale', note: 'Court and tribunal decisions.', links: [
    ['CanLII', 'Free Canadian case law and legislation', 'https://www.canlii.org/en/'],
    ['IRB decisions on CanLII', 'RPD, RAD, ID and IAD decisions', 'https://www.canlii.org/en/ca/irb/'],
    ['Federal Court decisions', 'Judicial review of immigration decisions', 'https://decisions.fct-cf.gc.ca/fc-cf/en/d/s/index.do'],
    ['Federal Court of Appeal decisions', 'Certified questions and appeals', 'https://decisions.fca-caf.gc.ca/fca-caf/en/d/s/index.do'],
    ['Supreme Court of Canada judgments', 'Leading decisions (e.g. Vavilov)', 'https://decisions.scc-csc.ca/scc-csc/en/nav.do'],
  ] },
  { title: 'Country conditions & human rights', ico: 'globe', note: 'Country-of-origin information for refugee and H&C files. Always cite the source and date.', links: [
    ['Human Rights Watch — countries', 'Country pages and the annual World Report', 'https://www.hrw.org/countries'],
    ['Human Rights Watch — World Reports archive', 'Past annual reports', 'https://www.hrw.org/previous-world-reports'],
    ['U.S. State Department — Country Reports on Human Rights Practices', 'Annual reports by country', 'https://www.state.gov/reports-bureau-of-democracy-human-rights-and-labor/country-reports-on-human-rights-practices/'],
    ['U.S. State Department — International Religious Freedom Reports', 'Religion-based persecution', 'https://www.state.gov/international-religious-freedom-reports/'],
    ['U.S. State Department — Trafficking in Persons Report', 'Trafficking risks by country', 'https://www.state.gov/trafficking-in-persons-report/'],
    ['Amnesty International — countries', 'Country reports and news', 'https://www.amnesty.org/en/countries/'],
    ['UNHCR Refworld', 'UN refugee agency legal and country database', 'https://www.refworld.org/'],
    ['UNHCR', 'UN Refugee Agency', 'https://www.unhcr.org/'],
    ['ecoi.net', 'European country-of-origin information network', 'https://www.ecoi.net/'],
    ['EUAA COI Portal', 'EU Agency for Asylum country information', 'https://coi.euaa.europa.eu/'],
    ['UK Home Office — Country Policy and Information Notes', 'CPIN reports', 'https://www.gov.uk/government/collections/country-policy-and-information-notes'],
    ['Australia DFAT — Country Information Reports', 'Government country assessments', 'https://www.dfat.gov.au/about-us/publications/country-information-reports'],
    ['Freedom House — Freedom in the World', 'Country freedom scores', 'https://freedomhouse.org/countries/freedom-world/scores'],
    ['UN Human Rights (OHCHR) — countries', 'UN country human rights pages', 'https://www.ohchr.org/en/countries'],
    ['International Crisis Group', 'Conflict analysis', 'https://www.crisisgroup.org/'],
    ['ReliefWeb', 'Humanitarian situation reports', 'https://reliefweb.int/'],
    ['Government of Canada travel advisories', 'Official risk levels by country', 'https://travel.gc.ca/travelling/advisories'],
  ] },
  { title: 'Regulator & practice tools', ico: 'award', note: 'Licensing, employer programs and provincial resources.', links: [
    ['College of Immigration and Citizenship Consultants (CICC)', 'Your regulator', 'https://college-ic.ca/'],
    ['CICC public register', 'Verify a licensee', 'https://register.college-ic.ca/Public-Register-EN/RCIC_Search.aspx'],
    ['Hire a temporary foreign worker (LMIA)', 'Employment and Social Development Canada', 'https://www.canada.ca/en/employment-social-development/services/foreign-workers.html'],
    ['National Occupational Classification (NOC)', 'Find NOC codes and TEER levels', 'https://noc.esdc.gc.ca/'],
    ['Job Bank — wages', 'Prevailing wages for LMIA and PNP', 'https://www.jobbank.gc.ca/trend-analysis/search-wages'],
    ['Alberta Advantage Immigration Program (AAIP)', 'Alberta provincial nominee program', 'https://www.alberta.ca/alberta-advantage-immigration-program'],
    ['Legal Aid Alberta', 'Refugee and immigration legal aid', 'https://www.legalaid.ab.ca/'],
    ['Office of the Information and Privacy Commissioner of Alberta', 'PIPA privacy obligations', 'https://www.oipc.ab.ca/'],
  ] },
];

export async function render(el) {
  el.innerHTML = `<div class="res-head"><div><p>Official sources for legislation, policy, case law and country conditions. Links open in a new tab.</p></div>
      <div class="search res-search">${icon('search')}<input id="rq" placeholder="Filter resources…" autocomplete="off"></div></div>
    <div class="res-grid" id="rg">${SECTIONS.map((s) => `<section class="dk-card res-sec"><div class="res-sec-h"><span class="dk-kpi-ico navy">${icon(s.ico)}</span><div><h3>${esc(s.title)}</h3><small>${esc(s.note)}</small></div></div>
      <ul>${s.links.map(([t, d, u]) => `<li data-q="${esc((t + ' ' + d).toLowerCase())}"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span><b>${esc(t)}</b><small>${esc(d)}</small></span>${icon('external')}</a></li>`).join('')}</ul></section>`).join('')}</div>
    <p class="dk-muted" style="margin-top:14px">Laws and policies change often. Always confirm you are reading the current consolidated version before relying on it in advice or submissions.</p>`;
  el.querySelector('#rq').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    el.querySelectorAll('.res-sec').forEach((sec) => {
      let any = false;
      sec.querySelectorAll('li').forEach((li) => { const hit = !q || li.dataset.q.includes(q); li.hidden = !hit; any ||= hit; });
      sec.hidden = !any;
    });
  };
}
