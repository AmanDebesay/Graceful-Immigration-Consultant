-- Client-side signing, called only by the agreement-sign edge function (service role).

create or replace function public.client_view_agreement(p_token uuid, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.agreements; c public.contacts;
begin
  select * into v from public.agreements where signing_token = p_token;
  if v.id is null or v.status = 'void' then raise exception 'This signing link is not valid.'; end if;
  if v.token_expires_at < now() then raise exception 'This signing link has expired. Please ask your consultant for a new link.'; end if;
  select * into c from public.contacts where id = v.contact_id;
  if v.status = 'sent' then
    perform set_config('gi.agreement', 'on', true);
    update public.agreements set status = 'viewed', viewed_at = now() where id = v.id;
    perform set_config('gi.agreement', 'off', true);
    insert into public.agreement_events (agreement_id, event, ip, user_agent) values (v.id, 'viewed', p_ip, p_ua);
    v.status := 'viewed';
  end if;
  return jsonb_build_object('number', v.number, 'title', v.title, 'type', v.type, 'status', v.status, 'body_html', v.body_html,
    'sha256', v.body_sha256, 'client_name', c.full_name, 'rcic_name', v.rcic_name, 'rcic_signature', v.rcic_signature,
    'rcic_signed_at', v.rcic_signed_at, 'client_signature', v.client_signature, 'client_signed_name', v.client_name,
    'client_initials', v.client_initials, 'client_signed_at', v.client_signed_at, 'client_ip', v.client_ip);
end $$;

create or replace function public.client_sign_agreement(p_token uuid, p_name text, p_signature text, p_initials text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.agreements; v_owner uuid;
begin
  select * into v from public.agreements where signing_token = p_token for update;
  if v.id is null or v.status = 'void' then raise exception 'This signing link is not valid.'; end if;
  if v.token_expires_at < now() then raise exception 'This signing link has expired. Please ask your consultant for a new link.'; end if;
  if v.status = 'signed' then raise exception 'This agreement has already been signed.'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Type your full legal name.'; end if;
  if coalesce(length(p_signature), 0) < 2 then raise exception 'Add your signature.'; end if;
  if length(p_signature) > 400000 then raise exception 'Signature image is too large.'; end if;
  if coalesce(length(trim(p_initials)), 0) < 1 then raise exception 'Add your initials.'; end if;
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set status = 'signed', client_name = trim(p_name), client_signature = p_signature, client_initials = upper(trim(p_initials)),
    client_signed_at = now(), client_ip = p_ip, client_user_agent = p_ua where id = v.id;
  perform set_config('gi.agreement', 'off', true);
  insert into public.agreement_events (agreement_id, event, ip, user_agent, details)
  values (v.id, 'signed', p_ip, p_ua, jsonb_build_object('name', trim(p_name), 'initials', upper(trim(p_initials)), 'sha256', v.body_sha256));
  if v.type = 'retainer' then update public.contacts set stage = 'retained' where id = v.contact_id; end if;
  select id into v_owner from public.profiles where role = 'owner' and active order by created_at limit 1;
  insert into public.tasks (contact_id, title, due_date, priority, assigned_to)
  values (v.contact_id, 'Agreement ' || v.number || ' signed — send the client their signed copy', (now() at time zone 'America/Edmonton')::date, 'high', coalesce(v.rcic_user, v_owner));
  return jsonb_build_object('ok', true, 'id', v.id, 'number', v.number, 'title', v.title, 'contact_id', v.contact_id);
end $$;

revoke execute on function public.client_view_agreement(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.client_sign_agreement(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.client_view_agreement(uuid, text, text) to service_role;
grant execute on function public.client_sign_agreement(uuid, text, text, text, text, text) to service_role;
