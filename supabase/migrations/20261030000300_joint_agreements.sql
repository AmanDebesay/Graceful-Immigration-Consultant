-- Joint agreements: more than one client on one Consultation or Retainer Agreement.
-- The main client keeps the existing client_* columns and signing_token. Additional clients come from
-- data.co_clients when the agreement is sent; each gets a row here with their own private signing link.
-- The agreement becomes 'signed' only when every client has signed.

create table public.agreement_signers (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.agreements(id) on delete cascade,
  position      int  not null,                  -- 2, 3, ... (the main client is 1)
  contact_id    uuid references public.contacts(id) on delete set null,
  name          text not null,
  email         text,
  phone         text,
  token         uuid unique,
  viewed_at     timestamptz,
  signed_name   text,
  signature     text,
  initials      text,
  signed_at     timestamptz,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  unique (agreement_id, position)
);
alter table public.agreement_signers enable row level security;
create policy agreement_signers_select on public.agreement_signers for select to authenticated
  using (public.has_perm('agreements.manage') or public.has_perm('crm.view'));

-- Number codes: joint versions are JA (retainer) and JC (consultation). The code follows the client list while the
-- agreement is a draft; the date and counter part never change.
drop function public.agreement_code(text);
create or replace function public.agreement_code(p_type text, p_joint boolean default false) returns text language sql immutable as $$
  select case
    when p_type = 'retainer' and p_joint then 'JA' when p_type = 'consultation' and p_joint then 'JC'
    when p_type = 'consultation' then 'CA' when p_type = 'retainer' then 'SA' when p_type = 'joint' then 'JA'
    when p_type = 'amendment' then 'AM' when p_type = 'non_engagement' then 'NE' when p_type = 'termination' then 'TL' else 'AG' end
$$;
create or replace function public.agreement_is_joint(p_data jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p_data->'co_clients') = 'array' and jsonb_array_length(p_data->'co_clients') > 0
$$;

create or replace function public.agreements_set_number() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.number := public.next_agreement_number(new.type, coalesce(new.created_at, now()));
  if public.agreement_is_joint(new.data) then
    new.number := public.agreement_code(new.type, true) || substr(new.number, strpos(new.number, '-'));
  end if;
  return new;
end $$;

create or replace function public.agreements_recode() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'draft' and new.data is distinct from old.data and strpos(new.number, '-') > 0 then
    new.number := public.agreement_code(new.type, public.agreement_is_joint(new.data)) || substr(new.number, strpos(new.number, '-'));
  end if;
  return new;
end $$;
create trigger agreements_recode before update on public.agreements for each row execute function public.agreements_recode();

-- Send: as before, plus one signer row (with its own token) per additional client.
create or replace function public.send_agreement(p_id uuid, p_body_html text, p_rcic_signature text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.agreements; v_token uuid := gen_random_uuid(); v_name text; c jsonb; i int := 1;
begin
  if not public.has_perm('agreements.manage') then raise exception 'You do not have permission to send agreements.'; end if;
  select * into v from public.agreements where id = p_id for update;
  if v.status <> 'draft' then raise exception 'Only drafts can be sent.'; end if;
  if coalesce(length(p_body_html), 0) < 200 then raise exception 'The agreement is empty.'; end if;
  if coalesce(length(p_rcic_signature), 0) < 2 then raise exception 'Add your signature before sending.'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set status = 'sent', body_html = p_body_html,
    body_sha256 = encode(sha256(convert_to(p_body_html, 'UTF8')), 'hex'),
    rcic_name = v_name, rcic_signature = p_rcic_signature, rcic_signed_at = now(), rcic_user = auth.uid(),
    signing_token = v_token, token_expires_at = now() + interval '30 days', sent_at = now()
  where id = p_id;
  perform set_config('gi.agreement', 'off', true);
  delete from public.agreement_signers where agreement_id = p_id;
  if public.agreement_is_joint(v.data) then
    for c in select * from jsonb_array_elements(v.data->'co_clients') loop
      i := i + 1;
      if coalesce(trim(c->>'name'), '') = '' then raise exception 'Every additional client needs a name.'; end if;
      insert into public.agreement_signers (agreement_id, position, contact_id, name, email, phone, token)
      values (p_id, i, nullif(c->>'contact_id', '')::uuid, trim(c->>'name'), nullif(trim(c->>'email'), ''), nullif(trim(c->>'phone'), ''), gen_random_uuid());
    end loop;
  end if;
  insert into public.agreement_events (agreement_id, event, actor_id, details) values (p_id, 'sent', auth.uid(), jsonb_build_object('signed_by', v_name));
  return jsonb_build_object('token', v_token);
end $$;

create or replace function public.renew_agreement_link(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token uuid := gen_random_uuid();
begin
  if not public.has_perm('agreements.manage') then raise exception 'Not allowed'; end if;
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set signing_token = v_token, token_expires_at = now() + interval '30 days'
  where id = p_id and status in ('sent','viewed','signed');
  if not found then raise exception 'This agreement has no active signing link.'; end if;
  perform set_config('gi.agreement', 'off', true);
  update public.agreement_signers set token = gen_random_uuid() where agreement_id = p_id;
  insert into public.agreement_events (agreement_id, event, actor_id) values (p_id, 'link_renewed', auth.uid());
  return jsonb_build_object('token', v_token);
end $$;

create or replace function public.void_agreement(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('agreements.manage') then raise exception 'Not allowed'; end if;
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set status = 'void', void_reason = p_reason, voided_at = now(), signing_token = null
  where id = p_id and status <> 'void';
  perform set_config('gi.agreement', 'off', true);
  update public.agreement_signers set token = null where agreement_id = p_id;
  insert into public.agreement_events (agreement_id, event, actor_id, details) values (p_id, 'voided', auth.uid(), jsonb_build_object('reason', p_reason));
end $$;

-- Find the agreement and the signer slot (1 = main client) for a signing token.
create or replace function public.agreement_by_token(p_token uuid, out a public.agreements, out slot int, out signer public.agreement_signers)
language plpgsql security definer set search_path = public as $$
begin
  select * into a from public.agreements where signing_token = p_token;
  if a.id is not null then slot := 1; return; end if;
  select * into signer from public.agreement_signers where token = p_token;
  if signer.id is null then return; end if;
  select * into a from public.agreements where id = signer.agreement_id;
  slot := signer.position;
end $$;
revoke execute on function public.agreement_by_token(uuid) from public, anon, authenticated;

create or replace function public.agreement_signers_json(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('position', position, 'name', name, 'signed_name', signed_name, 'signature', signature,
    'initials', initials, 'signed_at', signed_at, 'ip', ip) order by position), '[]'::jsonb)
  from public.agreement_signers where agreement_id = p_id
$$;
revoke execute on function public.agreement_signers_json(uuid) from public, anon, authenticated;

create or replace function public.client_view_agreement(p_token uuid, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; v public.agreements; c public.contacts; first_view boolean;
begin
  select * into t from public.agreement_by_token(p_token);
  v := t.a;
  if v.id is null or v.status = 'void' then raise exception 'This signing link is not valid.'; end if;
  if v.token_expires_at < now() then raise exception 'This signing link has expired. Please ask your consultant for a new link.'; end if;
  select * into c from public.contacts where id = v.contact_id;
  first_view := case when t.slot = 1 then v.viewed_at is null else (t.signer).viewed_at is null end;
  if v.status = 'sent' then
    perform set_config('gi.agreement', 'on', true);
    update public.agreements set status = 'viewed', viewed_at = coalesce(viewed_at, now()) where id = v.id;
    perform set_config('gi.agreement', 'off', true);
    v.status := 'viewed';
  end if;
  if t.slot > 1 and first_view then update public.agreement_signers set viewed_at = now() where id = (t.signer).id; end if;
  if first_view then
    insert into public.agreement_events (agreement_id, event, ip, user_agent, details)
    values (v.id, 'viewed', p_ip, p_ua, jsonb_build_object('name', case when t.slot = 1 then c.full_name else (t.signer).name end));
  end if;
  return jsonb_build_object('number', v.number, 'title', v.title, 'type', v.type, 'status', v.status, 'body_html', v.body_html,
    'sha256', v.body_sha256, 'client_name', case when t.slot = 1 then c.full_name else (t.signer).name end, 'slot', t.slot,
    'me_signed', case when t.slot = 1 then v.client_signed_at is not null else (t.signer).signed_at is not null end,
    'rcic_name', v.rcic_name, 'rcic_signature', v.rcic_signature,
    'rcic_signed_at', v.rcic_signed_at, 'client_signature', v.client_signature, 'client_signed_name', v.client_name,
    'client_initials', v.client_initials, 'client_signed_at', v.client_signed_at, 'client_ip', v.client_ip,
    'signers', public.agreement_signers_json(v.id));
end $$;

create or replace function public.client_sign_agreement(p_token uuid, p_name text, p_signature text, p_initials text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; v public.agreements; v_owner uuid; done boolean;
begin
  select * into t from public.agreement_by_token(p_token);
  v := t.a;
  if v.id is null or v.status = 'void' then raise exception 'This signing link is not valid.'; end if;
  perform 1 from public.agreements where id = v.id for update;
  if v.token_expires_at < now() then raise exception 'This signing link has expired. Please ask your consultant for a new link.'; end if;
  if (t.slot = 1 and v.client_signed_at is not null) or (t.slot > 1 and (t.signer).signed_at is not null) then raise exception 'You have already signed this agreement.'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Type your full legal name.'; end if;
  if coalesce(length(p_signature), 0) < 2 then raise exception 'Add your signature.'; end if;
  if length(p_signature) > 400000 then raise exception 'Signature image is too large.'; end if;
  if coalesce(length(trim(p_initials)), 0) < 1 then raise exception 'Add your initials.'; end if;
  perform set_config('gi.agreement', 'on', true);
  if t.slot = 1 then
    update public.agreements set client_name = trim(p_name), client_signature = p_signature, client_initials = upper(trim(p_initials)),
      client_signed_at = now(), client_ip = p_ip, client_user_agent = p_ua where id = v.id;
  else
    update public.agreement_signers set signed_name = trim(p_name), signature = p_signature, initials = upper(trim(p_initials)),
      signed_at = now(), ip = p_ip, user_agent = p_ua where id = (t.signer).id;
  end if;
  select (select client_signed_at is not null from public.agreements where id = v.id)
     and not exists (select 1 from public.agreement_signers where agreement_id = v.id and signed_at is null) into done;
  if done then update public.agreements set status = 'signed' where id = v.id; end if;
  perform set_config('gi.agreement', 'off', true);
  insert into public.agreement_events (agreement_id, event, ip, user_agent, details)
  values (v.id, case when done then 'signed' else 'client_signed' end, p_ip, p_ua,
    jsonb_build_object('name', trim(p_name), 'initials', upper(trim(p_initials)), 'sha256', v.body_sha256, 'slot', t.slot));
  if done then
    if v.type = 'retainer' then
      update public.contacts set stage = 'retained' where id = v.contact_id
        or id in (select contact_id from public.agreement_signers where agreement_id = v.id and contact_id is not null);
    end if;
    select id into v_owner from public.profiles where role = 'owner' and active order by created_at limit 1;
    insert into public.tasks (contact_id, title, due_date, priority, assigned_to)
    values (v.contact_id, 'Agreement ' || v.number || ' signed — send the client' || case when public.agreement_is_joint(v.data) then 's' else '' end || ' their signed copy',
      (now() at time zone 'America/Edmonton')::date, 'high', coalesce(v.rcic_user, v_owner));
  end if;
  return jsonb_build_object('ok', true, 'id', v.id, 'number', v.number, 'title', v.title, 'contact_id', v.contact_id, 'complete', done);
end $$;

revoke execute on function public.client_view_agreement(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.client_sign_agreement(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.client_view_agreement(uuid, text, text) to service_role;
grant execute on function public.client_sign_agreement(uuid, text, text, text, text, text) to service_role;
