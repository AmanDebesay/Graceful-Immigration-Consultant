-- Communication: in-dashboard team chat (channels + direct messages, live), and integration settings
-- for Microsoft Teams alerts and Microsoft 365 email.

-- ── Integration settings (owner/settings.manage only; read by server functions) ──
create table public.integration_settings (
  id                 int primary key default 1 check (id = 1),
  teams_webhook_url  text,
  shared_mailbox     text not null default 'info@gracefulimmigration.ca',
  updated_at         timestamptz not null default now()
);
insert into public.integration_settings (id) values (1);
create trigger integration_settings_touch before update on public.integration_settings for each row execute function public.touch_updated_at();
alter table public.integration_settings enable row level security;
create policy integration_settings_select on public.integration_settings for select to authenticated using (public.has_perm('settings.manage'));
create policy integration_settings_update on public.integration_settings for update to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
alter table public.integration_settings add constraint integration_settings_teams_https
  check (teams_webhook_url is null or teams_webhook_url ~ '^https://');
alter table public.integration_settings add constraint integration_settings_mailbox_domain
  check (public.is_company_email(shared_mailbox));

-- ── Team chat ──
create table public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'channel' check (kind in ('channel', 'dm')),
  dm_key      text unique,                       -- "<uuid>:<uuid>" (sorted) for direct messages
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint chat_channels_dm_key check ((kind = 'dm') = (dm_key is not null))
);
create unique index chat_channels_name_idx on public.chat_channels (lower(name)) where kind = 'channel';

create table public.chat_members (
  channel_id    uuid not null references public.chat_channels(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table public.chat_messages (
  id          bigint generated always as identity primary key,
  channel_id  uuid not null references public.chat_channels(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  contact_id  uuid references public.contacts(id) on delete set null,   -- optional link to a client file
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc);

create or replace function public.can_see_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() and exists (
    select 1 from public.chat_channels c
    where c.id = cid and (c.kind = 'channel' or exists (select 1 from public.chat_members m where m.channel_id = c.id and m.user_id = auth.uid()))
  )
$$;

alter table public.chat_channels enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_messages enable row level security;

create policy chat_channels_select on public.chat_channels for select to authenticated using (public.can_see_channel(id));
create policy chat_channels_insert on public.chat_channels for insert to authenticated with check (public.is_staff() and kind = 'channel');
create policy chat_channels_delete on public.chat_channels for delete to authenticated using (kind = 'channel' and public.my_role() = 'owner');

create policy chat_members_select on public.chat_members for select to authenticated using (public.can_see_channel(channel_id));
create policy chat_members_insert on public.chat_members for insert to authenticated with check (user_id = auth.uid() and public.can_see_channel(channel_id));
create policy chat_members_update on public.chat_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chat_messages_select on public.chat_messages for select to authenticated using (public.can_see_channel(channel_id));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_channel(channel_id) and (contact_id is null or public.has_perm('crm.view')));
create policy chat_messages_update on public.chat_messages for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy chat_messages_delete on public.chat_messages for delete to authenticated using (author_id = auth.uid() or public.my_role() = 'owner');
revoke update on public.chat_messages from authenticated;
grant update (body, edited_at) on public.chat_messages to authenticated;

-- Opens (or creates) the direct-message channel between the caller and another active staff member.
create or replace function public.open_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_key text; v_id uuid;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_other = auth.uid() then raise exception 'Choose someone else'; end if;
  if not exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                 where p.id = p_other and p.active and p.role <> 'client' and public.is_company_email(u.email)) then
    raise exception 'That person is not an active staff member';
  end if;
  v_key := least(auth.uid()::text, p_other::text) || ':' || greatest(auth.uid()::text, p_other::text);
  select id into v_id from public.chat_channels where dm_key = v_key;
  if v_id is null then
    insert into public.chat_channels (name, kind, dm_key) values ('Direct message', 'dm', v_key) returning id into v_id;
    insert into public.chat_members (channel_id, user_id) values (v_id, auth.uid()), (v_id, p_other);
  end if;
  return v_id;
end $$;

-- Marks a channel read for the caller.
create or replace function public.chat_mark_read(p_channel uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_channel(p_channel) then raise exception 'Not allowed'; end if;
  insert into public.chat_members (channel_id, user_id, last_read_at) values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = now();
end $$;

-- Unread messages (from others) per visible channel for the caller.
create or replace function public.chat_unread() returns table (channel_id uuid, unread bigint)
language sql stable security definer set search_path = public as $$
  select c.id, count(m.id)
  from public.chat_channels c
  left join public.chat_members me on me.channel_id = c.id and me.user_id = auth.uid()
  join public.chat_messages m on m.channel_id = c.id and m.author_id is distinct from auth.uid()
    and m.created_at > coalesce(me.last_read_at, (select p.created_at from public.profiles p where p.id = auth.uid()))
  where public.can_see_channel(c.id)
  group by c.id
$$;

revoke execute on function public.open_dm(uuid), public.chat_mark_read(uuid), public.chat_unread() from public, anon;
grant execute on function public.open_dm(uuid), public.chat_mark_read(uuid), public.chat_unread() to authenticated;

insert into public.chat_channels (name, kind, created_by) values ('general', 'channel', null), ('cases', 'channel', null);

-- Live updates for chat
alter publication supabase_realtime add table public.chat_messages;
