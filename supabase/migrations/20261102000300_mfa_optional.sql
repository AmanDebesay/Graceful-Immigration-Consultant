-- Two-step verification is optional again. Accounts that turned it on must still pass the code check
-- (aal2) before the database shows any client data; accounts without it sign in with their password.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified')
$$;
