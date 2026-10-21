-- Auth sets app_metadata after the user row is first inserted, so also sync the role on update.
-- app_metadata can only be written with the service role, so this cannot be abused by users.
create or replace function public.handle_user_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.raw_app_meta_data->>'role') is not null
     and (new.raw_app_meta_data->>'role') is distinct from (old.raw_app_meta_data->>'role') then
    update public.profiles set role = (new.raw_app_meta_data->>'role')::public.app_role where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_role_change
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_role_change();
