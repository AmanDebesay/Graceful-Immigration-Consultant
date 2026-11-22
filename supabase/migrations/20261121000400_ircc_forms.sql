-- IRCC forms library: every form links to its official canada.ca page and current PDF. A daily job reads each
-- form page, records the current edition, and emails the RCIC when IRCC publishes a new version.
create table if not exists public.ircc_forms (
  code          text primary key check (code ~ '^[A-Z]{3,4}[0-9A-Z]{3,10}$'),
  title         text not null,
  category      text not null default 'Other',
  page_url      text not null,
  pdf_url       text,
  edition       text,
  page_updated  text,
  page_modified date,
  notice        text,
  esign         text,
  status        text not null default 'unknown' check (status in ('unknown', 'ok', 'broken')),
  checked_at    timestamptz,
  changed_at    timestamptz,
  prev_edition  text,
  active        boolean not null default true,
  sort          int not null default 100
);
alter table public.ircc_forms enable row level security;
create policy ircc_forms_select on public.ircc_forms for select to authenticated using (public.is_staff());
create policy ircc_forms_write on public.ircc_forms for all to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

insert into public.ircc_forms (code, title, category, page_url, sort)
select x.code, x.title, x.cat, 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/' || lower(x.code) || '.html', x.s
from (values
  ('IMM5476', 'Use of a Representative', 'Representation', 1), ('IMM5744', 'Consent / ATIP consent', 'Representation', 2),
  ('IMM5475', 'Authority to Release Personal Information to a Designated Individual', 'Representation', 3),
  ('IMM0008', 'Generic Application Form for Canada', 'Permanent residence', 10), ('IMM5669', 'Schedule A — Background / Declaration', 'Permanent residence', 11),
  ('IMM0008DEP', 'Additional Dependants / Declaration', 'Permanent residence', 12), ('IMM5406', 'Additional Family Information', 'Permanent residence', 13),
  ('IMM5562', 'Supplementary Information — Your Travels', 'Permanent residence', 14), ('IMM5604', 'Declaration from Non-Accompanying Parent / Guardian', 'Permanent residence', 15),
  ('IMM1344', 'Application to Sponsor, Sponsorship Agreement and Undertaking', 'Family sponsorship', 20), ('IMM5532', 'Relationship Information and Sponsorship Evaluation', 'Family sponsorship', 21),
  ('IMM5409', 'Statutory Declaration of Common-law Union', 'Family sponsorship', 22), ('IMM5768', 'Financial Evaluation for Parents and Grandparents Sponsorship', 'Family sponsorship', 23),
  ('IMM1283', 'Financial Evaluation', 'Family sponsorship', 24),
  ('IMM5257', 'Application for Temporary Resident Visa', 'Visitors', 30), ('IMM5645', 'Family Information', 'Visitors', 31), ('IMM5707', 'Family Information', 'Visitors', 32),
  ('IMM5708', 'Application to Change Conditions or Extend Stay as a Visitor', 'Visitors', 33),
  ('IMM1294', 'Application for Study Permit Made Outside of Canada', 'Study', 40), ('IMM5709', 'Application to Change Conditions or Extend Stay as a Student', 'Study', 41),
  ('IMM1295', 'Application for Work Permit Made Outside of Canada', 'Work', 50), ('IMM5710', 'Application to Change Conditions or Extend Stay as a Worker', 'Work', 51),
  ('IMM5444', 'Application for a Permanent Resident Card', 'PR card & travel', 60), ('IMM5524', 'Application for a Permanent Resident Travel Document', 'PR card & travel', 61),
  ('CIT0002', 'Application for Canadian Citizenship — Adults', 'Citizenship', 70), ('CIT0003', 'Application for Canadian Citizenship — Minors', 'Citizenship', 71)
) x(code, title, cat, s)
on conflict (code) do nothing;

-- Signature method on representation forms (IRCC's IMM 5476 page accepts hand or electronic signatures).
alter table public.rep_forms add column if not exists sign_method text check (sign_method in ('wet', 'esign'));

-- Staff can ask for a check now (same secret header as the scheduled job).
create or replace function public.request_forms_check() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_staff() then raise exception 'Not allowed.'; end if;
  return net.http_post(url := 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/ircc-forms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alert-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ircc_alert_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
end $$;
revoke execute on function public.request_forms_check() from public, anon;
grant execute on function public.request_forms_check() to authenticated;

select cron.unschedule('ircc-forms') where exists (select 1 from cron.job where jobname = 'ircc-forms');
select cron.schedule('ircc-forms', '25 12 * * *', $$
  select net.http_post(url := 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/ircc-forms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alert-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ircc_alert_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 120000)
$$);
