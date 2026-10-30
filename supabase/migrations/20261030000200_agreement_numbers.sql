-- Agreement numbers: <document code>-<YYYYMMDD>-<NN>, e.g. SA-20261030-07.
-- The date is the day the agreement was created (Alberta time); NN counts every agreement in that month and restarts at 01
-- each new month (two digits minimum, then 100, 101 ...). Codes: CA consultation, SA service (retainer), JA joint retainer,
-- AM amendment, NE non-engagement letter, TL termination/closing letter.

create table public.agreement_counters (
  month text primary key,          -- 'YYYY-MM' in Alberta time
  last  int  not null default 0
);
alter table public.agreement_counters enable row level security;  -- only the security-definer functions below use it

create or replace function public.agreement_code(p_type text) returns text language sql immutable as $$
  select case p_type when 'consultation' then 'CA' when 'retainer' then 'SA' when 'joint' then 'JA'
    when 'amendment' then 'AM' when 'non_engagement' then 'NE' when 'termination' then 'TL' else 'AG' end
$$;

create or replace function public.next_agreement_number(p_type text, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare
  d date := (p_at at time zone 'America/Edmonton')::date;
  n int;
begin
  -- The upsert locks the month's row, so two agreements created at the same moment never get the same number.
  insert into public.agreement_counters (month, last) values (to_char(d, 'YYYY-MM'), 1)
  on conflict (month) do update set last = public.agreement_counters.last + 1
  returning last into n;
  return public.agreement_code(p_type) || '-' || to_char(d, 'YYYYMMDD') || '-' || case when n < 10 then '0' || n else n::text end;
end $$;
revoke all on function public.next_agreement_number(text, timestamptz) from public, anon, authenticated;

alter table public.agreements alter column number drop default;

create or replace function public.agreements_set_number() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.number := public.next_agreement_number(new.type, coalesce(new.created_at, now()));
  return new;
end $$;
create trigger agreements_number before insert on public.agreements for each row execute function public.agreements_set_number();

-- Renumber existing agreements in the order they were created. Only drafts are renumbered: a sent or signed agreement
-- keeps its number, because that number is inside the frozen, fingerprinted document the client received.
do $$
declare r record;
begin
  for r in select id, type, created_at from public.agreements where status = 'draft' order by created_at loop
    update public.agreements set number = public.next_agreement_number(r.type, r.created_at) where id = r.id;
  end loop;
end $$;
