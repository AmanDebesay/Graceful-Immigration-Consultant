-- Starting price list for every common application type (professional fees, before GST).
-- Estimates for a new Alberta RCIC practice, set at the lower-middle of published 2025–2026 Canadian consultant fees.
-- Government (IRCC / AAIP / IRB) fees are always separate. Edit any price in Products & Services.
insert into public.items (name, description, unit_price, taxable, income_account_id)
select x.n, x.d || ' Professional fee estimate; government fees are separate. Adjust for complexity, family members and past refusals.', x.p, true,
       (select id from public.accounts where system_key = 'service_income')
from (values
  -- Visitors
  ('Visitor visa (TRV) — single applicant', 'Temporary resident visa application, documents review and cover letter.', 700),
  ('Super Visa — parent or grandparent', 'Super Visa application including income and insurance checks.', 1000),
  ('Visitor record / extension of stay', 'Extend or change status as a visitor inside Canada.', 500),
  ('eTA — complex or after a refusal', 'Electronic travel authorization where there is a history or refusal.', 250),
  ('Temporary Resident Permit (TRP)', 'Permit to overcome inadmissibility, with written submissions.', 1500),
  ('Restoration of status', 'Restore visitor, student or worker status within 90 days of losing it.', 800),
  -- Study
  ('Study permit — applying from outside Canada', 'New study permit, study plan and financial documents.', 1200),
  ('Study permit — inside Canada or extension', 'Extension or new permit applied for from inside Canada.', 750),
  ('Study permit — after a refusal', 'Reapplication addressing the reasons for the previous refusal.', 1500),
  -- Work
  ('Post-Graduation Work Permit (PGWP)', 'PGWP application after graduation.', 650),
  ('Spousal open work permit', 'Open work permit for the spouse or partner of a worker or student.', 900),
  ('Bridging open work permit (BOWP)', 'Work permit while a permanent residence application is processing.', 650),
  ('Work permit — LMIA-based, employer-specific', 'Work permit using an approved LMIA.', 1500),
  ('Work permit — LMIA-exempt (intra-company, CUSMA, other)', 'Work permit under an LMIA exemption.', 1500),
  ('Work permit extension', 'Extend an existing work permit.', 700),
  ('International Experience Canada (working holiday)', 'IEC profile and work permit.', 500),
  ('Vulnerable worker open work permit', 'Open work permit for workers facing abuse in their job.', 900),
  ('LMIA application — employer', 'Labour Market Impact Assessment for an employer, including recruitment review.', 2500),
  -- Permanent residence
  ('Express Entry — profile creation and management', 'Create and maintain the Express Entry profile until an invitation.', 800),
  ('Express Entry — PR application after invitation', 'Full permanent residence application after an invitation to apply (single applicant).', 3000),
  ('Express Entry — full service (profile and PR)', 'Profile through to permanent residence (single applicant).', 3500),
  ('Alberta Advantage Immigration Program (AAIP)', 'Expression of interest and provincial nomination application.', 2500),
  ('PR application after a provincial nomination', 'Federal permanent residence application for a nominee.', 2000),
  ('Rural Community Immigration Pilot', 'Community recommendation and permanent residence application.', 2500),
  ('Caregiver / home care worker permanent residence', 'Caregiver pathway to permanent residence.', 2500),
  ('Atlantic Immigration Program', 'Endorsement and permanent residence application.', 2500),
  ('Humanitarian and compassionate (H&C) application', 'Permanent residence on H&C grounds with detailed submissions.', 3500),
  -- Family
  ('Spousal / common-law sponsorship — outside Canada', 'Sponsorship and permanent residence for a spouse or partner abroad.', 3000),
  ('Spousal / common-law sponsorship — inside Canada', 'Inland sponsorship, including the open work permit.', 3500),
  ('Dependent child sponsorship', 'Sponsorship of a dependent child.', 2000),
  ('Parents and grandparents sponsorship (PGP)', 'Sponsorship after an invitation, including income proof.', 3000),
  -- Citizenship and documents
  ('Canadian citizenship — adult', 'Citizenship application, presence calculation and document review.', 800),
  ('Canadian citizenship — minor', 'Citizenship application for a child under 18.', 400),
  ('PR card renewal', 'Permanent resident card renewal or replacement.', 400),
  ('Permanent Resident Travel Document (PRTD)', 'Travel document to return to Canada, with residency submissions.', 650),
  ('Proof of citizenship (certificate)', 'Citizenship certificate application.', 450),
  ('Criminal rehabilitation application', 'Application to be deemed rehabilitated for past offences.', 1800),
  -- Refugee and IRB
  ('Refugee claim — Basis of Claim form and preparation', 'Prepare the claim, Basis of Claim form and evidence.', 2500),
  ('Refugee hearing representation (RPD), per hearing', 'Hearing preparation and representation at the Refugee Protection Division.', 1500),
  ('Refugee Appeal Division (RAD) appeal', 'Appeal of a negative refugee decision with written memorandum.', 2500),
  ('Pre-Removal Risk Assessment (PRRA)', 'PRRA application and written submissions.', 2000),
  ('Immigration Appeal Division — sponsorship appeal', 'Appeal of a refused family sponsorship, including hearing.', 4000),
  ('Immigration Appeal Division — residency obligation appeal', 'Appeal of a loss of PR status decision, including hearing.', 4000),
  ('Immigration Division — detention review or admissibility hearing', 'Representation at one Immigration Division hearing.', 1500),
  ('Private refugee sponsorship (Group of Five / SAH)', 'Sponsorship application by a group or sponsorship agreement holder.', 2500),
  -- Other
  ('Application review — client-prepared', 'Check a completed application before the client submits it (no representation).', 400),
  ('Reconsideration request after a refusal', 'Written request to IRCC to reconsider a refusal.', 800)
) x(n, d, p)
where not exists (select 1 from public.items i where i.name = x.n);
