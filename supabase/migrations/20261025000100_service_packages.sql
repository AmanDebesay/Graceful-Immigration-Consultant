-- Fee schedule: service packages whose program text, scope and milestone fees pre-fill retainer agreements,
-- plus consultation fees used for Initial Consultation Agreements.

alter table public.org_settings
  add column consult_fee_30 numeric(12,2) not null default 30,
  add column consult_fee_60 numeric(12,2) not null default 60;

create table public.service_packages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  program     text not null default '',          -- "Immigration/citizenship category and program" clause
  scope       text,                               -- one service per line; null = standard scope
  milestones  jsonb not null default '[]'::jsonb, -- [{name, included, fee}]
  active      boolean not null default true,
  sort        int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint service_packages_milestones_array check (jsonb_typeof(milestones) = 'array')
);
create trigger service_packages_touch before update on public.service_packages for each row execute function public.touch_updated_at();

alter table public.service_packages enable row level security;
create policy service_packages_select on public.service_packages for select to authenticated using (public.is_staff());
create policy service_packages_write on public.service_packages for all to authenticated
  using (public.has_perm('settings.manage') or public.has_perm('agreements.manage'))
  with check (public.has_perm('settings.manage') or public.has_perm('agreements.manage'));

-- Starter list. Fees are 0 on purpose: the RCIC sets every price in Business Settings → Fee schedule.
with ms(m) as (values ('[{"name":"Signing of this agreement","included":"Eligibility assessment, document checklist and file opening","fee":0},
  {"name":"Application ready for submission","included":"Forms completed, documents reviewed, submission letter prepared","fee":0},
  {"name":"Application submitted to IRCC","included":"Submission and acknowledgement of receipt; follow-up until decision","fee":0}]'::jsonb))
insert into public.service_packages (name, program, milestones, sort)
select p.name, p.program, ms.m, p.sort from ms, (values
  ('Spousal / common-law sponsorship (outland)', 'Permanent Residence — Family Class, spousal or common-law partner sponsorship (outland)', 10),
  ('Spousal / common-law sponsorship (inland)', 'Permanent Residence — Spouse or Common-law Partner in Canada class (inland), with open work permit', 20),
  ('Parents & grandparents sponsorship', 'Permanent Residence — Family Class, Parents and Grandparents Program', 30),
  ('Dependent child sponsorship', 'Permanent Residence — Family Class, dependent child sponsorship', 40),
  ('Express Entry (permanent residence)', 'Permanent Residence — Economic Class, Express Entry (profile and application for permanent residence)', 50),
  ('Provincial Nominee Program (AAIP)', 'Provincial nomination — Alberta Advantage Immigration Program, and the following application for permanent residence', 60),
  ('Refugee claim (IRB)', 'Refugee protection claim in Canada, including the Basis of Claim form and representation before the Immigration and Refugee Board (RPD)', 70),
  ('PR for protected persons', 'Permanent Residence — Protected Persons and Convention Refugees in Canada class', 80),
  ('Humanitarian & compassionate (H&C)', 'Permanent Residence — Humanitarian and compassionate considerations (A25)', 90),
  ('Study permit', 'Temporary Residence — Study permit (new application or extension)', 100),
  ('Work permit', 'Temporary Residence — Work permit (open or employer-specific)', 110),
  ('Visitor visa / Super Visa', 'Temporary Residence — Temporary resident visa (visitor visa) or Parent and Grandparent Super Visa', 120),
  ('LMIA (employer)', 'Labour Market Impact Assessment (LMIA) application to ESDC for the employer named in this agreement', 130),
  ('Restoration of status', 'Temporary Residence — Restoration of temporary resident status', 140),
  ('Canadian citizenship', 'Citizenship — Grant of Canadian citizenship (adult or minor)', 150),
  ('PR card renewal', 'Permanent resident card renewal', 160)
) as p(name, program, sort);
