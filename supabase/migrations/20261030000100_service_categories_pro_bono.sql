-- Group the fee schedule by category and add more processes (refusals, private refugee sponsorship, IRB appeals, ...).
-- Pro bono (no professional fee) is chosen per agreement and stored in agreements.data (fee_basis, pro_bono_reason).

alter table public.service_packages add column category text not null default 'Other services';

update public.service_packages set category = case
  when name ilike '%sponsorship%' and name not ilike '%refugee%' then 'Family sponsorship'
  when name ilike 'Express Entry%' or name ilike 'Provincial Nominee%' then 'Economic immigration'
  when name in ('Refugee claim (IRB)', 'PR for protected persons', 'Humanitarian & compassionate (H&C)') then 'Refugee & humanitarian'
  when name in ('Study permit', 'Work permit', 'Visitor visa / Super Visa', 'LMIA (employer)', 'Restoration of status') then 'Temporary residence'
  when name in ('Canadian citizenship', 'PR card renewal') then 'Citizenship & PR status'
  else category end;

-- New services. Fees are 0 on purpose: the RCIC sets every price in Business Settings → Fee schedule.
with ms(m) as (values ('[{"name":"Signing of this agreement","included":"Review of the file, document checklist and file opening","fee":0},
  {"name":"Application ready for submission","included":"Forms completed, documents reviewed, submissions prepared","fee":0},
  {"name":"Application submitted","included":"Submission and acknowledgement of receipt; follow-up until decision","fee":0}]'::jsonb))
insert into public.service_packages (name, category, program, milestones, sort)
select p.name, p.category, p.program, ms.m, p.sort from ms, (values
  ('Refused application — review & re-application', 'Refusals & reconsideration', 'Review of a refused application (including a request for GCMS notes), refusal analysis, and preparation of a new application in the same program that addresses the reasons for refusal', 300),
  ('Request for reconsideration', 'Refusals & reconsideration', 'Written request to IRCC to reconsider a refused application, with supporting submissions', 310),
  ('Procedural fairness letter response', 'Refusals & reconsideration', 'Response to a procedural fairness letter from IRCC, including written submissions and supporting evidence', 320),
  ('GCMS notes / ATIP request', 'Refusals & reconsideration', 'Access to Information and Privacy (ATIP) request for the Client''s IRCC / CBSA file notes (GCMS), and explanation of the notes', 330),
  ('Group of Five refugee sponsorship', 'Private refugee sponsorship', 'Permanent Residence — Convention Refugee Abroad / Humanitarian-protected Persons Abroad class, Private Sponsorship of Refugees Program, sponsorship by a Group of Five', 400),
  ('Community Sponsor refugee sponsorship', 'Private refugee sponsorship', 'Permanent Residence — Convention Refugee Abroad / Humanitarian-protected Persons Abroad class, Private Sponsorship of Refugees Program, sponsorship by a Community Sponsor organization', 410),
  ('Sponsorship Agreement Holder (SAH) application', 'Private refugee sponsorship', 'Permanent Residence — Private Sponsorship of Refugees Program, sponsorship through a Sponsorship Agreement Holder or its Constituent Group', 420),
  ('One-Year Window family reunification', 'Private refugee sponsorship', 'Permanent Residence — One-Year Window of Opportunity for family members of resettled refugees and protected persons', 430),
  ('Refugee Appeal Division appeal (RAD)', 'IRB hearings & appeals', 'Appeal to the Refugee Appeal Division of the Immigration and Refugee Board against a negative refugee decision, including the appeal record and memorandum', 500),
  ('Sponsorship appeal (IAD)', 'IRB hearings & appeals', 'Appeal to the Immigration Appeal Division of the Immigration and Refugee Board against the refusal of a family class sponsorship', 510),
  ('Removal order / residency obligation appeal (IAD)', 'IRB hearings & appeals', 'Appeal to the Immigration Appeal Division against a removal order or a residency obligation decision', 520),
  ('Admissibility hearing or detention review (ID)', 'IRB hearings & appeals', 'Representation at an admissibility hearing or detention review before the Immigration Division of the Immigration and Refugee Board', 530),
  ('Pre-Removal Risk Assessment (PRRA)', 'Refugee & humanitarian', 'Pre-Removal Risk Assessment application to IRCC, including written submissions and evidence', 540),
  ('Temporary resident permit / criminal rehabilitation', 'Temporary residence', 'Temporary resident permit and/or application for criminal rehabilitation to overcome inadmissibility to Canada', 550),
  ('Visitor record / status extension', 'Temporary residence', 'Temporary Residence — Visitor record or extension of temporary resident status in Canada', 560),
  ('Post-graduation work permit', 'Temporary residence', 'Temporary Residence — Post-graduation work permit (PGWP)', 570),
  ('Caregiver programs', 'Economic immigration', 'Permanent Residence / work permit — Home care worker (caregiver) pathway', 580)
) as p(name, category, program, sort)
where not exists (select 1 from public.service_packages s where s.name = p.name);
