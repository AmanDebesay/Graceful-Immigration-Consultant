-- Paper (wet-ink) signing: the RCIC locks the document exactly as printed, everyone signs the printout,
-- then the scan is uploaded and the agreement is recorded as signed.

alter table public.agreements
  add column sign_method text not null default 'electronic' check (sign_method in ('electronic', 'paper')),
  add column paper_scan_path text,
  add column paper_signed_on date;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agreements', 'agreements', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy agreements_files_select on storage.objects for select to authenticated
  using (bucket_id = 'agreements' and (public.has_perm('agreements.manage') or public.has_perm('crm.view')));
create policy agreements_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agreements' and public.has_perm('agreements.manage'));

-- Lock a draft for paper signing: same freeze and fingerprint as electronic sending, without a signing link.
create or replace function public.prepare_paper_agreement(p_id uuid, p_body_html text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.agreements; v_name text;
begin
  if not public.has_perm('agreements.manage') then raise exception 'You do not have permission to manage agreements.'; end if;
  select * into v from public.agreements where id = p_id for update;
  if v.status <> 'draft' then raise exception 'Only drafts can be prepared for paper signing.'; end if;
  if coalesce(length(p_body_html), 0) < 200 then raise exception 'The agreement is empty.'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set status = 'sent', sign_method = 'paper', body_html = p_body_html,
    body_sha256 = encode(sha256(convert_to(p_body_html, 'UTF8')), 'hex'), rcic_name = v_name, rcic_user = auth.uid(), sent_at = now()
  where id = p_id;
  perform set_config('gi.agreement', 'off', true);
  insert into public.agreement_events (agreement_id, event, actor_id, details) values (p_id, 'paper_prepared', auth.uid(), jsonb_build_object('by', v_name));
end $$;

-- Record the signed paper copy (scan already uploaded to the 'agreements' bucket under <agreement id>/...).
create or replace function public.record_paper_signature(p_id uuid, p_path text, p_signed_on date) returns void
language plpgsql security definer set search_path = public as $$
declare v public.agreements; c public.contacts; v_owner uuid;
begin
  if not public.has_perm('agreements.manage') then raise exception 'You do not have permission to manage agreements.'; end if;
  select * into v from public.agreements where id = p_id for update;
  if v.status not in ('sent', 'viewed') or v.sign_method <> 'paper' then raise exception 'This agreement is not waiting for a paper signature.'; end if;
  if coalesce(p_path, '') not like p_id::text || '/%' then raise exception 'Upload the signed copy first.'; end if;
  if p_signed_on is null or p_signed_on > (now() at time zone 'America/Edmonton')::date then raise exception 'Enter the date it was signed (not in the future).'; end if;
  select * into c from public.contacts where id = v.contact_id;
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set status = 'signed', paper_scan_path = p_path, paper_signed_on = p_signed_on,
    client_name = c.full_name, client_signed_at = p_signed_on::timestamp at time zone 'America/Edmonton',
    rcic_signed_at = p_signed_on::timestamp at time zone 'America/Edmonton', signing_token = null
  where id = p_id;
  perform set_config('gi.agreement', 'off', true);
  insert into public.agreement_events (agreement_id, event, actor_id, details)
  values (p_id, 'paper_signed', auth.uid(), jsonb_build_object('signed_on', p_signed_on, 'file', p_path));
  if v.type = 'retainer' then update public.contacts set stage = 'retained' where id = v.contact_id; end if;
  select id into v_owner from public.profiles where role = 'owner' and active order by created_at limit 1;
  insert into public.tasks (contact_id, title, due_date, priority, assigned_to)
  values (v.contact_id, 'Agreement ' || v.number || ' signed on paper — give the client their signed copy', (now() at time zone 'America/Edmonton')::date, 'high', coalesce(v.rcic_user, v_owner));
end $$;

do $$ declare f text; begin
  foreach f in array array['prepare_paper_agreement(uuid, text)', 'record_paper_signature(uuid, text, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Saved RCIC signature: each staff member can keep one signature to reuse when signing agreements.
-- Private to its owner (not visible to other staff).
create table public.user_signatures (
  user_id    uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  signature  text not null check (length(signature) between 2 and 400000),
  updated_at timestamptz not null default now()
);
alter table public.user_signatures enable row level security;
create policy user_signatures_own on public.user_signatures for all to authenticated
  using (user_id = auth.uid() and public.is_staff()) with check (user_id = auth.uid() and public.is_staff());
