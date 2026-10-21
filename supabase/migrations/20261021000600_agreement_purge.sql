-- Signed/sent agreements cannot be deleted by staff. This service-role-only function exists for
-- data-retention purges (and test cleanup); it is not callable from the app.
create or replace function public.agreements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and current_setting('gi.agreement', true) is distinct from 'purge' then
      raise exception 'Only draft agreements can be deleted. Void it instead.';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and current_setting('gi.agreement', true) not in ('on', 'purge') then
    raise exception 'This agreement has been sent and can no longer be edited. Void it and create a new one.';
  end if;
  return new;
end $$;

create or replace function public.purge_contact_agreements(p_contact uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('gi.agreement', 'purge', true);
  delete from public.agreements where contact_id = p_contact;
  get diagnostics n = row_count;
  perform set_config('gi.agreement', 'off', true);
  return n;
end $$;
revoke execute on function public.purge_contact_agreements(uuid) from public, anon, authenticated;
grant execute on function public.purge_contact_agreements(uuid) to service_role;
