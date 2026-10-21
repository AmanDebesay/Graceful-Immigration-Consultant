-- Agreements: Initial Consultation Agreements and Retainer (Service) Agreements with e-signature.
-- Drafts are editable; "send" freezes the HTML and stores its SHA-256 so the signed document cannot change.

create sequence public.agreement_number_seq start 1;

create table public.agreements (
  id               uuid primary key default gen_random_uuid(),
  number           text not null unique default ('AGR-' || to_char(now() at time zone 'America/Edmonton', 'YYYY') || '-' || lpad(nextval('public.agreement_number_seq')::text, 4, '0')),
  type             text not null check (type in ('consultation','retainer')),
  title            text not null,
  contact_id       uuid not null references public.contacts(id),
  case_id          uuid references public.cases(id) on delete set null,
  status           text not null default 'draft' check (status in ('draft','sent','viewed','signed','void')),
  data             jsonb not null default '{}'::jsonb,       -- form fields used to render the document
  body_html        text,                                     -- frozen at send
  body_sha256      text,
  rcic_name        text,
  rcic_signature   text,                                     -- PNG data URL or typed name
  rcic_signed_at   timestamptz,
  rcic_user        uuid references public.profiles(id) on delete set null,
  signing_token    uuid unique,
  token_expires_at timestamptz,
  sent_at          timestamptz,
  viewed_at        timestamptz,
  client_name      text,
  client_signature text,
  client_initials  text,
  client_signed_at timestamptz,
  client_ip        text,
  client_user_agent text,
  void_reason      text,
  voided_at        timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index agreements_contact_idx on public.agreements (contact_id);
create index agreements_status_idx on public.agreements (status);
create trigger agreements_touch before update on public.agreements for each row execute function public.touch_updated_at();

create table public.agreement_events (
  id           bigint generated always as identity primary key,
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  event        text not null,            -- created, sent, viewed, signed, voided, link_renewed
  actor_id     uuid references public.profiles(id) on delete set null,
  ip           text,
  user_agent   text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index agreement_events_idx on public.agreement_events (agreement_id, created_at);

-- Only drafts may be edited directly; everything after "send" goes through functions.
create or replace function public.agreements_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only draft agreements can be deleted. Void it instead.'; end if;
    return old;
  end if;
  if old.status <> 'draft' and current_setting('gi.agreement', true) is distinct from 'on' then
    raise exception 'This agreement has been sent and can no longer be edited. Void it and create a new one.';
  end if;
  return new;
end $$;
create trigger agreements_guard before update or delete on public.agreements for each row execute function public.agreements_guard();

create or replace function public.agreements_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.agreement_events (agreement_id, event, actor_id) values (new.id, 'created', auth.uid());
  return new;
end $$;
create trigger agreements_created after insert on public.agreements for each row execute function public.agreements_created();

-- Freeze the document, record the RCIC signature and issue a signing link (valid 30 days).
create or replace function public.send_agreement(p_id uuid, p_body_html text, p_rcic_signature text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.agreements; v_token uuid := gen_random_uuid(); v_name text;
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
  insert into public.agreement_events (agreement_id, event, actor_id, details) values (p_id, 'voided', auth.uid(), jsonb_build_object('reason', p_reason));
end $$;

-- RLS
alter table public.agreements enable row level security;
alter table public.agreement_events enable row level security;
create policy agreements_select on public.agreements for select to authenticated using (public.has_perm('agreements.manage') or public.has_perm('crm.view'));
create policy agreements_insert on public.agreements for insert to authenticated with check (public.has_perm('agreements.manage') and status = 'draft');
create policy agreements_update on public.agreements for update to authenticated using (public.has_perm('agreements.manage')) with check (public.has_perm('agreements.manage'));
create policy agreements_delete on public.agreements for delete to authenticated using (public.has_perm('agreements.manage'));
create policy agreement_events_select on public.agreement_events for select to authenticated using (public.has_perm('agreements.manage') or public.has_perm('crm.view'));

revoke update on public.agreements from authenticated;
grant update (title, case_id, data, contact_id) on public.agreements to authenticated;

do $$ declare f text; begin
  foreach f in array array['send_agreement(uuid, text, text)', 'renew_agreement_link(uuid)', 'void_agreement(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
