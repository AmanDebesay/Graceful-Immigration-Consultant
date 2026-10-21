-- CRM expansion: companies, deals (opportunities), activities, cases (immigration files), products & services.

create type public.deal_stage as enum ('qualified','consultation','proposal','negotiation','won','lost');
create type public.case_status as enum ('open','in_progress','submitted','decision_pending','approved','refused','withdrawn','closed');

-- ── Companies (employers, partner organizations) ──
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  website     text,
  phone       text,
  email       text,
  address     text,
  city        text,
  province    text,
  notes       text,
  owner_id    uuid references public.profiles(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();

alter table public.contacts
  add column company_id    uuid references public.companies(id) on delete set null,
  add column job_title     text,
  add column date_of_birth date,
  add column address       text,
  add column city          text,
  add column province      text,
  add column postal_code   text,
  add column country       text,
  add column last_activity_at timestamptz;
create index contacts_company_idx on public.contacts (company_id);

-- ── Products & services (price list shared by deals and invoices) ──
create table public.items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  unit_price   numeric(12,2) not null default 0,
  taxable      boolean not null default true,
  income_account_id uuid,                -- set after accounts exist (finance migration)
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── Deals ──
create table public.deals (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  contact_id     uuid references public.contacts(id) on delete cascade,
  company_id     uuid references public.companies(id) on delete set null,
  item_id        uuid references public.items(id) on delete set null,
  value          numeric(12,2) not null default 0,
  stage          public.deal_stage not null default 'qualified',
  probability    int not null default 20 check (probability between 0 and 100),
  expected_close date,
  owner_id       uuid references public.profiles(id) on delete set null,
  lost_reason    text,
  closed_at      timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index deals_stage_idx on public.deals (stage);
create index deals_contact_idx on public.deals (contact_id);
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

create or replace function public.deals_stage_defaults() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.probability := case new.stage when 'qualified' then 20 when 'consultation' then 40 when 'proposal' then 60
                         when 'negotiation' then 80 when 'won' then 100 else 0 end;
    new.closed_at := case when new.stage in ('won','lost') then now() else null end;
  end if;
  return new;
end $$;
create trigger deals_stage_defaults before insert or update on public.deals for each row execute function public.deals_stage_defaults();

-- ── Activities (calls, emails, meetings, messages) ──
create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('call','email','meeting','whatsapp','sms','note')),
  direction    text check (direction in ('inbound','outbound')),
  subject      text,
  body         text,
  outcome      text,
  duration_min int,
  occurred_at  timestamptz not null default now(),
  contact_id   uuid references public.contacts(id) on delete cascade,
  company_id   uuid references public.companies(id) on delete cascade,
  deal_id      uuid references public.deals(id) on delete set null,
  author_id    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index activities_contact_idx on public.activities (contact_id, occurred_at desc);
create index activities_when_idx on public.activities (occurred_at desc);

create or replace function public.touch_contact_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    update public.contacts set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at) where id = new.contact_id;
  end if;
  return new;
end $$;
create trigger activities_touch_contact after insert on public.activities for each row execute function public.touch_contact_activity();

-- ── Cases (immigration files) ──
create sequence public.case_number_seq start 1;
create table public.cases (
  id              uuid primary key default gen_random_uuid(),
  case_number     text not null unique default ('GI-' || to_char(now() at time zone 'America/Edmonton', 'YYYY') || '-' || lpad(nextval('public.case_number_seq')::text, 4, '0')),
  title           text not null,
  application_type text,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  deal_id         uuid references public.deals(id) on delete set null,
  status          public.case_status not null default 'open',
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to     uuid references public.profiles(id) on delete set null,
  ircc_file_number text,
  uci             text,
  opened_on       date not null default ((now() at time zone 'America/Edmonton')::date),
  submitted_on    date,
  deadline        date,
  decision_on     date,
  description     text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index cases_contact_idx on public.cases (contact_id);
create index cases_status_idx on public.cases (status);
create trigger cases_touch before update on public.cases for each row execute function public.touch_updated_at();

create or replace function public.audit_cases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('created', 'case', new.id::text, jsonb_build_object('number', new.case_number, 'title', new.title));
  elsif new.status is distinct from old.status then
    perform public.log_audit('status_changed', 'case', new.id::text, jsonb_build_object('number', new.case_number, 'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger cases_audit after insert or update on public.cases for each row execute function public.audit_cases();

-- ── RLS ──
alter table public.companies  enable row level security;
alter table public.items      enable row level security;
alter table public.deals      enable row level security;
alter table public.activities enable row level security;
alter table public.cases      enable row level security;

create policy companies_select on public.companies for select to authenticated using (public.has_perm('crm.view'));
create policy companies_write  on public.companies for all    to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));

create policy items_select on public.items for select to authenticated using (public.is_staff());
create policy items_write  on public.items for all    to authenticated using (public.has_perm('finance.manage') or public.has_perm('crm.edit'))
  with check (public.has_perm('finance.manage') or public.has_perm('crm.edit'));

create policy deals_select on public.deals for select to authenticated using (public.has_perm('crm.view'));
create policy deals_write  on public.deals for all    to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));

create policy activities_select on public.activities for select to authenticated using (public.has_perm('crm.view'));
create policy activities_insert on public.activities for insert to authenticated with check (public.has_perm('crm.edit') and author_id = auth.uid());
create policy activities_update on public.activities for update to authenticated using (author_id = auth.uid() or public.my_role() = 'owner');
create policy activities_delete on public.activities for delete to authenticated using (author_id = auth.uid() or public.my_role() = 'owner');

create policy cases_select on public.cases for select to authenticated using (public.has_perm('crm.view') or exists (
  select 1 from public.contacts c where c.id = cases.contact_id and c.client_user_id = auth.uid()));
create policy cases_write  on public.cases for all    to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));

-- ── CRM analytics in one call ──
create or replace function public.crm_stats(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_from date := coalesce(p_from, ((now() at time zone 'America/Edmonton')::date - 365)); v_to date := coalesce(p_to, (now() at time zone 'America/Edmonton')::date);
begin
  if not public.has_perm('crm.view') then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'open_value',      (select coalesce(sum(value),0) from public.deals where stage not in ('won','lost')),
    'weighted_value',  (select coalesce(sum(value*probability/100.0),0) from public.deals where stage not in ('won','lost')),
    'won_value',       (select coalesce(sum(value),0) from public.deals where stage = 'won' and closed_at::date between v_from and v_to),
    'won_count',       (select count(*) from public.deals where stage = 'won' and closed_at::date between v_from and v_to),
    'lost_count',      (select count(*) from public.deals where stage = 'lost' and closed_at::date between v_from and v_to),
    'deals_by_stage',  (select coalesce(jsonb_object_agg(stage, jsonb_build_object('n', n, 'v', v)), '{}'::jsonb)
                        from (select stage, count(*) n, sum(value) v from public.deals group by stage) s),
    'contacts_by_stage',(select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (select stage, count(*) n from public.contacts group by stage) s),
    'sources',         (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n, 'retained', retained) order by n desc), '[]'::jsonb)
                        from (select source, count(*) n, count(*) filter (where stage = 'retained') retained
                              from public.contacts where created_at::date between v_from and v_to group by source) s),
    'won_by_month',    (select coalesce(jsonb_agg(jsonb_build_object('m', m, 'v', v, 'n', n) order by m), '[]'::jsonb)
                        from (select to_char(closed_at, 'YYYY-MM') m, sum(value) v, count(*) n from public.deals
                              where stage = 'won' and closed_at::date between v_from and v_to group by 1) s),
    'activity_by_type',(select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
                        from (select type, count(*) n from public.activities where occurred_at::date between v_from and v_to group by type) s),
    'activity_by_user',(select coalesce(jsonb_agg(jsonb_build_object('user', author_id, 'n', n) order by n desc), '[]'::jsonb)
                        from (select author_id, count(*) n from public.activities where occurred_at::date between v_from and v_to group by author_id) s),
    'cases_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.cases group by status) s),
    'new_contacts',    (select count(*) from public.contacts where created_at::date between v_from and v_to)
  ) into r;
  return r;
end $$;
revoke execute on function public.crm_stats(date, date) from public, anon;
grant execute on function public.crm_stats(date, date) to authenticated;
