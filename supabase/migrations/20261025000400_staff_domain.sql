-- Staff access is limited to company email addresses (@gracefulimmigration.ca).
-- Enforced inside the permission helpers, so a staff role on any other email grants nothing.
-- Client accounts may use any email.

create or replace function public.is_company_email(e text) returns boolean
language sql immutable as $$
  select coalesce(lower(e) like '%@gracefulimmigration.ca', false)
$$;

-- Email of the signed-in user, read from auth (not the editable profile copy).
create or replace function public.my_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select email from auth.users where id = auth.uid()
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and active and (role = 'client' or public.is_company_email(public.my_email()))
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role <> 'client')
     and public.is_company_email(public.my_email())
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_company_email(public.my_email()) and exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.active and pr.role <> 'client'
      and (pr.role = 'owner'
           or exists (select 1 from public.role_permissions rp where rp.role = pr.role and rp.permission = p))
  )
$$;

-- Role changes: staff roles only for company emails.
create or replace function public.set_user_access(p_user uuid, p_role public.app_role, p_active boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_owners int;
begin
  if not public.has_perm('staff.manage') then raise exception 'Not allowed'; end if;
  if p_role <> 'client' and not public.is_company_email((select email from auth.users where id = p_user)) then
    raise exception 'Staff access requires an @gracefulimmigration.ca email address';
  end if;
  if p_role = 'owner' and public.my_role() <> 'owner' then raise exception 'Only an owner can grant the owner role'; end if;
  if (select role from public.profiles where id = p_user) = 'owner' and public.my_role() <> 'owner' then
    raise exception 'Only an owner can change another owner';
  end if;
  select count(*) into v_owners from public.profiles where role = 'owner' and active and id <> p_user;
  if v_owners = 0 and (p_role <> 'owner' or not p_active) then raise exception 'There must be at least one active owner'; end if;
  update public.profiles set role = p_role, active = p_active where id = p_user;
end $$;

revoke execute on function public.my_email() from public, anon;
grant execute on function public.my_email() to authenticated;
