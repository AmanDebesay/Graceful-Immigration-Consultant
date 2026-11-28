-- Call Log + marketing (owner's request, 2026-11-27, after a marketing video brought 67 calls in 12 hours).
--  * calls: every phone / WhatsApp call, logged by staff or automatically by the business phone line (Twilio),
--    with where it came from and what it turned into (just asking / potential / booked / paying / spam).
--  * phone_lines: the business numbers (e.g. one number per platform, so each call shows its source).
--  * content_posts: the marketing content plan; nothing is posted before the RCIC approves it (CICC advertising rules).
--  * Marketing role: sees content and call COUNTS only (call_stats), never callers' names or numbers.

insert into public.permissions (key, label, category) values
  ('marketing.view',    'See the marketing plan and lead numbers (no client details)', 'Marketing'),
  ('marketing.edit',    'Create and update marketing posts',                            'Marketing'),
  ('marketing.approve', 'Approve marketing content before it is posted',                'Marketing')
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('marketing', 'marketing.view'), ('marketing', 'marketing.edit'),
  ('rcic', 'marketing.view'), ('rcic', 'marketing.approve')
on conflict do nothing;

-- ── Business phone lines ──
create table if not exists public.phone_lines (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique check (number ~ '^\+[1-9][0-9]{7,14}$'),   -- E.164, e.g. +14035550123
  label       text not null,                                                  -- e.g. "TikTok line"
  source      text not null default 'other',
  forward_to  text check (forward_to is null or forward_to ~ '^\+[1-9][0-9]{7,14}$'),
  record      boolean not null default true,     -- announce "this call may be recorded" and record
  text_missed boolean not null default true,     -- text missed callers the booking link
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.phone_lines enable row level security;
create policy phone_lines_select on public.phone_lines for select to authenticated using (public.has_perm('crm.view') or public.has_perm('marketing.view'));
create policy phone_lines_write on public.phone_lines for all to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

-- ── Calls ──
create table if not exists public.calls (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  direction       text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  channel         text not null default 'phone' check (channel in ('phone', 'whatsapp', 'teams', 'messenger', 'other')),
  status          text not null default 'answered' check (status in ('ringing', 'answered', 'missed', 'voicemail', 'outgoing')),
  from_number     text,
  to_number       text,
  caller_name     text,
  caller_location text,
  contact_id      uuid references public.contacts(id) on delete set null,
  line_id         uuid references public.phone_lines(id) on delete set null,
  source          text not null default 'unknown',
  campaign        text,
  category        text not null default 'unreviewed'
                  check (category in ('unreviewed', 'just_asking', 'potential', 'booked', 'paying', 'existing_client', 'spam', 'wrong_number', 'personal')),
  service_interest text,
  language        text,
  duration_sec    int,
  recording_path  text,
  recording_sec   int,
  transcript      text,
  notes           text,
  called_back_at  timestamptz,
  follow_up_on    date,
  handled_by      uuid references public.profiles(id) on delete set null,
  twilio_sid      text unique,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists calls_when on public.calls (occurred_at desc);
create index if not exists calls_from on public.calls (from_number);
alter table public.calls enable row level security;
create policy calls_select on public.calls for select to authenticated using (public.has_perm('crm.view'));
create policy calls_insert on public.calls for insert to authenticated with check (public.has_perm('crm.edit'));
create policy calls_update on public.calls for update to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));
create policy calls_delete on public.calls for delete to authenticated using (public.has_perm('crm.delete'));
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists calls_touch on public.calls;
create trigger calls_touch before update on public.calls for each row execute function public.touch_updated_at();

-- The contact with this phone number (last 10 digits), if any.
create or replace function public.contact_by_phone(p text) returns uuid language sql stable security definer set search_path = public as $$
  select id from public.contacts
  where (auth.role() = 'service_role' or public.has_perm('crm.view'))
    and length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7
    and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p, '\D', '', 'g'), 10)
  order by created_at limit 1
$$;
revoke execute on function public.contact_by_phone(text) from public, anon;

-- Lead numbers without any personal details (for the Marketing page and the marketing role).
create or replace function public.call_stats(p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; tz text := 'America/Edmonton';
begin
  if not (public.has_perm('marketing.view') or public.has_perm('crm.view')) then raise exception 'Not allowed'; end if;
  with c as (
    select (occurred_at at time zone tz)::date as day, * from public.calls
    where direction = 'inbound' and (occurred_at at time zone tz)::date between p_from and p_to
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'answered', (select count(*) from c where status = 'answered'),
    'missed', (select count(*) from c where status in ('missed', 'voicemail')),
    'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from c group by 1) x), '{}'::jsonb),
    'by_source', coalesce((select jsonb_agg(x order by x.total desc) from (select source, count(*) total,
        count(*) filter (where category = 'potential') potential, count(*) filter (where category = 'booked') booked,
        count(*) filter (where category = 'paying') paying, count(*) filter (where category = 'just_asking') just_asking,
        count(*) filter (where status in ('missed', 'voicemail')) missed from c group by 1) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(x order by x.day) from (select day, count(*) total,
        count(*) filter (where status = 'answered') answered, count(*) filter (where status in ('missed', 'voicemail')) missed from c group by 1) x), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_object_agg(h, n) from (select extract(hour from occurred_at at time zone tz)::int h, count(*) n from c group by 1) x), '{}'::jsonb)
  ) into r;
  return r;
end $$;
revoke execute on function public.call_stats(date, date) from public, anon;
grant execute on function public.call_stats(date, date) to authenticated;

-- Call recordings and voicemails, kept in Canada (ca-central) only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('call-recordings', 'call-recordings', false, 52428800, array['audio/mpeg', 'audio/wav', 'audio/x-wav'])
on conflict (id) do nothing;
create policy call_recordings_read on storage.objects for select to authenticated using (bucket_id = 'call-recordings' and public.has_perm('crm.view'));
create policy call_recordings_delete on storage.objects for delete to authenticated using (bucket_id = 'call-recordings' and public.has_perm('crm.delete'));

-- ── Marketing content plan ──
create table if not exists public.content_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  kind         text not null default 'video' check (kind in ('video', 'reel', 'post', 'story', 'graphic', 'live', 'other')),
  platforms    text[] not null default '{}',
  status       text not null default 'idea' check (status in ('idea', 'editing', 'for_approval', 'approved', 'posted', 'rejected')),
  planned_on   date,
  posted_at    timestamptz,
  caption      text,
  draft_link   text,              -- where the draft file is (Google Drive, Canva, OneDrive…)
  post_urls    text,              -- links to the published post(s), one per line
  views        int, likes int, comments int, shares int, new_followers int, leads int,
  notes        text,
  review_note  text,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  assignee_id  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists content_posts_when on public.content_posts (planned_on desc, created_at desc);
alter table public.content_posts enable row level security;
create policy content_select on public.content_posts for select to authenticated using (public.has_perm('marketing.view'));
create policy content_insert on public.content_posts for insert to authenticated with check (public.has_perm('marketing.edit') or public.has_perm('marketing.approve'));
create policy content_update on public.content_posts for update to authenticated using (public.has_perm('marketing.edit') or public.has_perm('marketing.approve'))
  with check (public.has_perm('marketing.edit') or public.has_perm('marketing.approve'));
create policy content_delete on public.content_posts for delete to authenticated using (public.has_perm('marketing.approve') or (created_by = auth.uid() and status <> 'posted'));
drop trigger if exists content_touch on public.content_posts;
create trigger content_touch before update on public.content_posts for each row execute function public.touch_updated_at();

-- Only the RCIC approves, and nothing is marked posted without approval.
create or replace function public.content_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Approved content that is changed afterwards (by someone who cannot approve) goes back for approval.
  if tg_op = 'UPDATE' and old.status in ('approved', 'posted') and not public.has_perm('marketing.approve')
     and (new.caption is distinct from old.caption or new.draft_link is distinct from old.draft_link or new.title is distinct from old.title) then
    if old.status = 'posted' then raise exception 'Posted content cannot be changed. Ask the RCIC.'; end if;
    new.status := 'for_approval'; new.approved_by := null; new.approved_at := null;
    return new;
  end if;
  if (new.approved_by is distinct from (case when tg_op = 'UPDATE' then old.approved_by end)
      or (new.status in ('approved', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status)))
     and not public.has_perm('marketing.approve') then
    raise exception 'Only the RCIC can approve or reject marketing content.';
  end if;
  if new.status = 'posted' and new.approved_by is null then
    raise exception 'This content must be approved by the RCIC before it is posted.';
  end if;
  return new;
end $$;
drop trigger if exists content_guard on public.content_posts;
create trigger content_guard before insert or update on public.content_posts for each row execute function public.content_guard();

-- Weekly / daily content target shown on the Marketing page.
alter table public.org_settings
  add column if not exists content_target int not null default 3,
  add column if not exists content_target_period text not null default 'week' check (content_target_period in ('day', 'week', 'month'));
