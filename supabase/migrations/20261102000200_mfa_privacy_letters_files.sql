-- 1) Two-step verification is required: every permission check needs a session verified with an authenticator code (aal2).
-- 2) Bookkeepers see client names and cases for billing only — no notes, activities, agreements, checklists or documents.
-- 3) New document types: amendment (AM), non-engagement letter (NE), closing / termination letter (TL).
-- 4) Client documents stored in OneDrive (one folder per client); the dashboard keeps the index.

-- ───────────── 1. Required two-step verification ─────────────
create or replace function public.mfa_ok() returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and active and public.mfa_ok() and (role = 'client' or public.is_company_email(public.my_email()))
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profiles where id = auth.uid() and active and role <> 'client')
     and public.is_company_email(public.my_email())
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and public.is_company_email(public.my_email()) and exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.active and pr.role <> 'client'
      and (pr.role = 'owner'
           or exists (select 1 from public.role_permissions rp where rp.role = pr.role and rp.permission = p))
  )
$$;

-- ───────────── 2. Bookkeeper: billing view only ─────────────
delete from public.role_permissions where role = 'bookkeeper' and permission = 'crm.view';
drop policy contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.has_perm('crm.view') or public.has_perm('finance.view') or client_user_id = auth.uid());
drop policy cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated using (public.has_perm('crm.view') or public.has_perm('finance.view') or exists (
  select 1 from public.contacts c where c.id = cases.contact_id and c.client_user_id = auth.uid()));
drop policy companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated using (public.has_perm('crm.view') or public.has_perm('finance.view'));

-- ───────────── 3. Amendments, non-engagement and closing letters ─────────────
alter table public.agreements drop constraint agreements_type_check;
alter table public.agreements add constraint agreements_type_check
  check (type in ('consultation', 'retainer', 'amendment', 'non_engagement', 'termination'));
alter table public.agreements add column parent_id uuid references public.agreements(id) on delete set null;

-- ───────────── 4. Client documents in OneDrive ─────────────
alter table public.integration_settings
  add column files_drive_user text,                        -- whose OneDrive holds the client folders
  add column files_root text not null default 'Graceful Clients';
alter table public.contacts add column drive_folder_id text, add column drive_folder_name text;
alter table public.agreements add column drive_item_id text;

create table public.client_documents (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         uuid not null references public.contacts(id) on delete cascade,
  case_id            uuid references public.cases(id) on delete set null,
  agreement_id       uuid references public.agreements(id) on delete set null,
  checklist_item_id  uuid references public.case_checklist_items(id) on delete set null,
  category           text not null default 'documents' check (category in ('agreements', 'documents', 'forms', 'correspondence', 'decisions')),
  name               text not null,
  drive_item_id      text not null,
  web_url            text,
  size               bigint,
  mime               text,
  uploaded_by        uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index client_documents_contact_idx on public.client_documents (contact_id, created_at desc);
create index client_documents_item_idx on public.client_documents (checklist_item_id);
alter table public.client_documents enable row level security;
-- Rows are written by the "files" function after it checks the file really is in the client's folder.
create policy client_documents_select on public.client_documents for select to authenticated
  using (public.has_perm('crm.view') or public.has_perm('checklists.work'));

-- Recording where the signed copy was filed is the one change allowed on a sent/signed agreement.
-- (Also closes a gap: on a fresh connection the setting is NULL, and "NULL not in (...)" let edits through.)
create or replace function public.agreements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mode text := coalesce(current_setting('gi.agreement', true), '');
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and v_mode <> 'purge' then raise exception 'Only draft agreements can be deleted. Void it instead.'; end if;
    return old;
  end if;
  if old.status <> 'draft' and v_mode not in ('on', 'purge')
     and (to_jsonb(new) - 'drive_item_id') is distinct from (to_jsonb(old) - 'drive_item_id') then
    raise exception 'This agreement has been sent and can no longer be edited. Void it and create a new one.';
  end if;
  return new;
end $$;

-- Who has set up two-step verification (Team & Access).
create or replace function public.staff_mfa_status() returns table (user_id uuid, enabled boolean)
language sql stable security definer set search_path = public, auth as $$
  select p.id, exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
  from public.profiles p where public.has_perm('staff.manage')
$$;
revoke execute on function public.staff_mfa_status() from public, anon;
grant execute on function public.staff_mfa_status() to authenticated;
