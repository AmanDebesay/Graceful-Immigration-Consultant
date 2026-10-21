-- Phase 1: accounts, roles & permissions, audit log, business settings
-- Phase 2: CRM (contacts, pipeline), assessments (intake), notes, tasks, newsletter

-- ─────────────────────────────── Types ───────────────────────────────
create type public.app_role as enum ('owner','rcic','case_manager','bookkeeper','assistant','client');
create type public.lead_stage as enum ('new','contacted','consultation_booked','assessed','retained','closed_lost');
create type public.triage_level as enum ('RED','AMBER','GREEN');

-- ─────────────────────────────── Helpers ─────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ─────────────────────────────── Profiles ────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  phone       text,
  job_title   text,
  role        public.app_role not null default 'client',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Role comes only from app_metadata (settable by the service role), never from user-supplied metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_app_meta_data->>'role')::public.app_role, 'client')
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ─────────────────────────────── Permissions ─────────────────────────
create table public.permissions (
  key          text primary key,
  label        text not null,
  category     text not null
);
create table public.role_permissions (
  role        public.app_role not null,
  permission  text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);

insert into public.permissions (key, label, category) values
  ('crm.view',          'View contacts & leads',            'CRM'),
  ('crm.edit',          'Add & edit contacts, notes, stages','CRM'),
  ('crm.delete',        'Delete contacts',                   'CRM'),
  ('intake.view',       'View assessment submissions',       'Assessments'),
  ('intake.manage',     'Review & assign assessments',       'Assessments'),
  ('tasks.manage',      'Create & manage all tasks',         'Tasks'),
  ('newsletter.view',   'View newsletter subscribers',       'Marketing'),
  ('finance.view',      'View invoices & finances',          'Finance'),
  ('finance.manage',    'Create invoices & record payments', 'Finance'),
  ('agreements.manage', 'Generate & send agreements',        'Agreements'),
  ('staff.manage',      'Invite staff & change roles',       'Administration'),
  ('settings.manage',   'Edit business settings',            'Administration'),
  ('audit.view',        'View the audit log',                'Administration');

insert into public.role_permissions (role, permission) values
  ('rcic','crm.view'),('rcic','crm.edit'),('rcic','intake.view'),('rcic','intake.manage'),('rcic','tasks.manage'),
  ('rcic','newsletter.view'),('rcic','finance.view'),('rcic','agreements.manage'),
  ('case_manager','crm.view'),('case_manager','crm.edit'),('case_manager','intake.view'),('case_manager','tasks.manage'),
  ('bookkeeper','crm.view'),('bookkeeper','finance.view'),('bookkeeper','finance.manage'),
  ('assistant','crm.view'),('assistant','intake.view');

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role <> 'client')
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.active
      and (pr.role = 'owner'
           or exists (select 1 from public.role_permissions rp where rp.role = pr.role and rp.permission = p))
  )
$$;

create or replace function public.my_permissions() returns setof text
language sql stable security definer set search_path = public as $$
  select key from public.permissions where public.has_perm(key)
$$;

-- ─────────────────────────────── Audit log ───────────────────────────
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function public.log_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, details) values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details,'{}'::jsonb))
$$;

-- ─────────────────────────────── Business settings ───────────────────
create table public.org_settings (
  id              int primary key default 1 check (id = 1),
  business_name   text not null default 'Graceful Immigration Consultant Inc.',
  rcic_name       text not null default 'Aman Debesay',
  licence_number  text not null default 'R1056136',
  phone           text not null default '(403) 915-4230',
  email           text not null default 'info@gracefulimmigration.ca',
  address         text not null default 'Lethbridge, AB, Canada',
  gst_number      text,
  gst_rate        numeric(5,2) not null default 5.00,
  notify_email    text not null default 'aman.debesay@gracefulimmigration.ca',
  updated_at      timestamptz not null default now()
);
insert into public.org_settings (id) values (1);
create trigger org_settings_touch before update on public.org_settings for each row execute function public.touch_updated_at();

-- ─────────────────────────────── CRM ─────────────────────────────────
create table public.contacts (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text,
  phone          text,
  citizenship    text,
  language       text,
  contact_pref   text,
  location       text,              -- in / out of Canada
  status_in_canada text,
  services       text[] not null default '{}',
  stage          public.lead_stage not null default 'new',
  source         text not null default 'website',
  priority       public.triage_level,
  assigned_to    uuid references public.profiles(id) on delete set null,
  client_user_id uuid references public.profiles(id) on delete set null,
  tags           text[] not null default '{}',
  next_action_at date,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index contacts_email_uidx on public.contacts (lower(email)) where email is not null;
create index contacts_stage_idx on public.contacts (stage);
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();

create table public.intake_submissions (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete cascade,
  form_version  text not null,
  answers       jsonb not null,           -- raw answers
  rows          jsonb not null,           -- [[label, value], ...] for display
  triage_level  public.triage_level not null,
  triage        jsonb not null,           -- {red:[], amber:[], notes:[]}
  source        text not null default 'website',   -- website / staff
  status        text not null default 'new' check (status in ('new','in_review','reviewed','archived')),
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  submitted_by  uuid references public.profiles(id) on delete set null,
  ip_hash       text,
  created_at    timestamptz not null default now()
);
create index intake_created_idx on public.intake_submissions (created_at desc);
create index intake_contact_idx on public.intake_submissions (contact_id);

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notes_contact_idx on public.notes (contact_id, created_at desc);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid references public.contacts(id) on delete cascade,
  title        text not null,
  details      text,
  due_date     date,
  priority     text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to  uuid references public.profiles(id) on delete set null,
  done         boolean not null default false,
  done_at      timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_open_idx on public.tasks (done, due_date);
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create table public.newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  full_name        text,
  language         text,
  consent_text     text not null,
  consent_at       timestamptz not null default now(),
  source           text not null default 'website',
  unsubscribe_token uuid not null default gen_random_uuid(),
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now()
);
create unique index newsletter_email_uidx on public.newsletter_subscribers (lower(email));

-- Rate limiting for public endpoints (written only by edge functions)
create table public.rate_limits (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  key_hash   text not null,
  created_at timestamptz not null default now()
);
create index rate_limits_lookup on public.rate_limits (bucket, key_hash, created_at desc);

-- ─────────────────────────────── Audit triggers ──────────────────────
create or replace function public.audit_contacts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('created', 'contact', new.id::text, jsonb_build_object('name', new.full_name, 'source', new.source));
  elsif tg_op = 'UPDATE' then
    if new.stage is distinct from old.stage then
      perform public.log_audit('stage_changed', 'contact', new.id::text, jsonb_build_object('from', old.stage, 'to', new.stage));
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      perform public.log_audit('assigned', 'contact', new.id::text, jsonb_build_object('to', new.assigned_to));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_audit('deleted', 'contact', old.id::text, jsonb_build_object('name', old.full_name));
  end if;
  return coalesce(new, old);
end $$;
create trigger contacts_audit after insert or update or delete on public.contacts for each row execute function public.audit_contacts();

create or replace function public.audit_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    perform public.log_audit('access_changed', 'profile', new.id::text,
      jsonb_build_object('email', new.email, 'role_from', old.role, 'role_to', new.role, 'active_from', old.active, 'active_to', new.active));
  end if;
  return new;
end $$;
create trigger profiles_audit after update on public.profiles for each row execute function public.audit_profiles();

create or replace function public.audit_intake() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('submitted', 'assessment', new.id::text, jsonb_build_object('triage', new.triage_level, 'source', new.source));
  elsif new.status is distinct from old.status then
    perform public.log_audit('status_changed', 'assessment', new.id::text, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger intake_audit after insert or update on public.intake_submissions for each row execute function public.audit_intake();

-- ─────────────────────────────── Admin RPCs ──────────────────────────
-- Change a user's role / active flag. Owners cannot remove the last active owner.
create or replace function public.set_user_access(p_user uuid, p_role public.app_role, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_owners int;
begin
  if not public.has_perm('staff.manage') then raise exception 'Not allowed'; end if;
  if p_role = 'owner' and public.my_role() <> 'owner' then raise exception 'Only an owner can grant the owner role'; end if;
  if (select role from public.profiles where id = p_user) = 'owner' and public.my_role() <> 'owner' then
    raise exception 'Only an owner can change another owner';
  end if;
  select count(*) into v_owners from public.profiles where role = 'owner' and active and id <> p_user;
  if v_owners = 0 and (p_role <> 'owner' or not p_active) then raise exception 'There must be at least one active owner'; end if;
  update public.profiles set role = p_role, active = p_active where id = p_user;
end $$;

-- Toggle a permission for a role (owner only).
create or replace function public.set_role_permission(p_role public.app_role, p_permission text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'owner' then raise exception 'Only an owner can change role permissions'; end if;
  if p_role in ('owner','client') then raise exception 'Owner and client permissions are fixed'; end if;
  if p_enabled then
    insert into public.role_permissions (role, permission) values (p_role, p_permission) on conflict do nothing;
  else
    delete from public.role_permissions where role = p_role and permission = p_permission;
  end if;
  perform public.log_audit('permission_changed', 'role', p_role::text, jsonb_build_object('permission', p_permission, 'enabled', p_enabled));
end $$;

-- Dashboard numbers in one call
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'new_assessments',  case when public.has_perm('intake.view') then (select count(*) from public.intake_submissions where status = 'new') end,
    'red_open',         case when public.has_perm('intake.view') then (select count(*) from public.intake_submissions where triage_level = 'RED' and status in ('new','in_review')) end,
    'leads_open',       case when public.has_perm('crm.view') then (select count(*) from public.contacts where stage not in ('retained','closed_lost')) end,
    'clients',          case when public.has_perm('crm.view') then (select count(*) from public.contacts where stage = 'retained') end,
    'tasks_open',       (select count(*) from public.tasks where not done and (assigned_to = auth.uid() or public.has_perm('tasks.manage'))),
    'tasks_overdue',    (select count(*) from public.tasks where not done and due_date < current_date and (assigned_to = auth.uid() or public.has_perm('tasks.manage'))),
    'subscribers',      case when public.has_perm('newsletter.view') then (select count(*) from public.newsletter_subscribers where unsubscribed_at is null) end,
    'pipeline',         case when public.has_perm('crm.view') then (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (select stage, count(*) n from public.contacts group by stage) s) end,
    'assessments_30d',  case when public.has_perm('intake.view') then (
                          select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
                            select date_trunc('day', created_at)::date d, count(*) n from public.intake_submissions
                            where created_at > now() - interval '30 days' group by 1) x) end
  ) into r;
  return r;
end $$;

-- ─────────────────────────────── Row Level Security ──────────────────
alter table public.profiles               enable row level security;
alter table public.permissions            enable row level security;
alter table public.role_permissions       enable row level security;
alter table public.audit_log              enable row level security;
alter table public.org_settings           enable row level security;
alter table public.contacts               enable row level security;
alter table public.intake_submissions     enable row level security;
alter table public.notes                  enable row level security;
alter table public.tasks                  enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.rate_limits            enable row level security;   -- no policies: service role only

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, phone, job_title) on public.profiles to authenticated;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.has_perm('staff.manage')) with check (public.has_perm('staff.manage'));

-- permissions (read by staff; writes via RPC)
create policy permissions_select on public.permissions for select to authenticated using (public.is_staff());
create policy role_permissions_select on public.role_permissions for select to authenticated using (public.is_staff());

-- audit log
create policy audit_select on public.audit_log for select to authenticated using (public.has_perm('audit.view'));

-- settings
create policy settings_select on public.org_settings for select to authenticated using (public.is_staff());
create policy settings_update on public.org_settings for update to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

-- contacts
create policy contacts_select on public.contacts for select to authenticated
  using (public.has_perm('crm.view') or client_user_id = auth.uid());
create policy contacts_insert on public.contacts for insert to authenticated with check (public.has_perm('crm.edit'));
create policy contacts_update on public.contacts for update to authenticated
  using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));
create policy contacts_delete on public.contacts for delete to authenticated using (public.has_perm('crm.delete'));

-- assessments (inserted by the edge function with the service role)
create policy intake_select on public.intake_submissions for select to authenticated using (public.has_perm('intake.view'));
create policy intake_update on public.intake_submissions for update to authenticated
  using (public.has_perm('intake.manage')) with check (public.has_perm('intake.manage'));

-- notes
create policy notes_select on public.notes for select to authenticated using (public.has_perm('crm.view'));
create policy notes_insert on public.notes for insert to authenticated
  with check (public.has_perm('crm.edit') and author_id = auth.uid());
create policy notes_update on public.notes for update to authenticated
  using (author_id = auth.uid() or public.my_role() = 'owner');
create policy notes_delete on public.notes for delete to authenticated
  using (author_id = auth.uid() or public.my_role() = 'owner');

-- tasks: managers see all; everyone sees tasks assigned to them
create policy tasks_select on public.tasks for select to authenticated
  using (public.has_perm('tasks.manage') or (public.is_staff() and (assigned_to = auth.uid() or created_by = auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid() and (public.has_perm('tasks.manage') or assigned_to = auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_perm('tasks.manage') or (public.is_staff() and assigned_to = auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.has_perm('tasks.manage') or created_by = auth.uid());

-- newsletter
create policy newsletter_select on public.newsletter_subscribers for select to authenticated using (public.has_perm('newsletter.view'));
create policy newsletter_update on public.newsletter_subscribers for update to authenticated
  using (public.has_perm('newsletter.view')) with check (public.has_perm('newsletter.view'));

-- Functions callable by signed-in users only
revoke execute on function public.set_user_access(uuid, public.app_role, boolean) from public, anon;
revoke execute on function public.set_role_permission(public.app_role, text, boolean) from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.set_user_access(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.set_role_permission(public.app_role, text, boolean) to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
