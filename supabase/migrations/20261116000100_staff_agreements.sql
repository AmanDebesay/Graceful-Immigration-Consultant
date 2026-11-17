-- Staff agreements: employment agreements for new hires (for example an Immigration Case Assistant),
-- generated from the dashboard. Every fact in the agreement is in data (jsonb) so the owner can change it;
-- body_html holds text edited directly on the page, and the frozen copy once the agreement is signed.
-- Only people who can manage staff (staff.manage) can see or change them.
create sequence if not exists public.staff_agreement_number_seq;

create table if not exists public.staff_agreements (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique default ('EMP-' || to_char(now() at time zone 'America/Edmonton', 'YYYY') || '-' || lpad(nextval('public.staff_agreement_number_seq')::text, 4, '0')),
  employee_name  text not null default '',
  employee_email text,
  role_title     text not null default '',
  profile_id     uuid references public.profiles(id) on delete set null,   -- the staff login, once they have one
  status         text not null default 'draft' check (status in ('draft','sent','signed','void')),
  data           jsonb not null default '{}'::jsonb,
  body_html      text,
  signed_on      date,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.staff_agreements enable row level security;
drop policy if exists staff_agr_all on public.staff_agreements;
create policy staff_agr_all on public.staff_agreements for all to authenticated
  using (public.has_perm('staff.manage')) with check (public.has_perm('staff.manage'));

-- A signed agreement is a record: it can't be edited or deleted (void it instead). Changes of status are audited.
create or replace function public.staff_agreement_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'signed' then raise exception 'A signed staff agreement can''t be deleted. Void it instead.'; end if;
    return old;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  new.number := old.number; new.created_by := old.created_by; new.created_at := old.created_at;
  if old.status = 'signed' and (new.status = 'signed' and (new.data is distinct from old.data or new.body_html is distinct from old.body_html)) then
    raise exception 'This agreement is signed and can''t be changed. Make a copy for a new agreement.';
  end if;
  if old.status = 'void' and new.status <> 'void' then raise exception 'A voided agreement can''t be reopened. Make a copy instead.'; end if;
  if new.status <> old.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'staff_agreement_' || new.status, 'staff_agreement', new.id,
            jsonb_build_object('number', new.number, 'employee', new.employee_name, 'role', new.role_title));
  end if;
  return new;
end $$;
drop trigger if exists staff_agreement_guard_upd on public.staff_agreements;
drop trigger if exists staff_agreement_guard_del on public.staff_agreements;
create trigger staff_agreement_guard_upd before update on public.staff_agreements for each row execute function public.staff_agreement_guard();
create trigger staff_agreement_guard_del before delete on public.staff_agreements for each row execute function public.staff_agreement_guard();
