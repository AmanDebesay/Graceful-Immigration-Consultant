-- Work Time: how long each staff member actively works in the dashboard.
-- Time counts only while the dashboard tab is on screen, focused, and the person moved, clicked or typed
-- in the last 5 minutes. Minimized, another tab or app in front, or idle = not counted.
-- Each person sees their own record; people who manage staff see everyone's.
create table public.work_sessions (
  id              uuid primary key,                        -- made by the browser when the dashboard opens
  user_id         uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  auth_session    uuid,                                    -- the sign-in this visit belongs to
  signed_in_at    timestamptz,                             -- when that sign-in happened
  started_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  active_seconds  int not null default 0 check (active_seconds >= 0),
  pages           jsonb not null default '{}'::jsonb,      -- page -> active seconds
  device          text
);
create index work_sessions_user_idx on public.work_sessions (user_id, started_at desc);
alter table public.work_sessions enable row level security;
create policy work_sessions_select on public.work_sessions for select to authenticated
  using (public.is_staff() and (user_id = auth.uid() or public.has_perm('staff.manage')));
-- Rows are written only through work_ping, which checks the numbers.

-- Called by the dashboard about once a minute with the visit's running totals.
-- The server never lets the active time grow faster than the clock.
create or replace function public.work_ping(p_id uuid, p_active int, p_pages jsonb, p_device text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare r public.work_sessions; v_sid uuid; v_allowed int; v_new int;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select * into r from public.work_sessions where id = p_id;
  if not found then
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
    insert into public.work_sessions (id, user_id, auth_session, signed_in_at, device, active_seconds, pages)
    values (p_id, auth.uid(), v_sid, (select s.created_at from auth.sessions s where s.id = v_sid), left(p_device, 120),
            least(greatest(coalesce(p_active, 0), 0), 90), '{}');
    return;
  end if;
  if r.user_id <> auth.uid() then raise exception 'Not allowed'; end if;
  v_allowed := r.active_seconds + ceil(extract(epoch from now() - r.last_seen_at))::int + 15;
  v_new := least(greatest(coalesce(p_active, 0), r.active_seconds), v_allowed);
  update public.work_sessions set active_seconds = v_new, last_seen_at = now(),
    pages = case when jsonb_typeof(p_pages) = 'object' and length(p_pages::text) < 8000 then p_pages else pages end
  where id = p_id;
end $$;

-- One person's report for a date range: visits (with active time) and what they did (from the audit log).
-- Allowed for yourself, or for anyone if you manage staff.
create or replace function public.work_report(p_user uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := (p_from::timestamp at time zone 'America/Edmonton');
        v_to   timestamptz := ((p_to + 1)::timestamp at time zone 'America/Edmonton');
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_user is distinct from auth.uid() and not public.has_perm('staff.manage') then raise exception 'You can only see your own work report.'; end if;
  return jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(to_jsonb(w) order by w.started_at) from public.work_sessions w
                          where w.user_id = p_user and w.started_at >= v_from and w.started_at < v_to), '[]'),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('created_at', a.created_at, 'action', a.action, 'entity', a.entity,
                                 'entity_id', a.entity_id, 'details', a.details,
                                 'contact', (select c.full_name from public.contacts c
                                             where c.id::text = coalesce(case when a.entity = 'contact' then a.entity_id end, a.details ->> 'contact_id'))) order by a.created_at)
                         from public.audit_log a where a.actor_id = p_user and a.created_at >= v_from and a.created_at < v_to), '[]'),
    'tasks_done', coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'done_at', t.done_at) order by t.done_at)
                            from public.tasks t where t.assigned_to = p_user and t.done and t.done_at >= v_from and t.done_at < v_to), '[]'));
end $$;

revoke execute on function public.work_ping(uuid, int, jsonb, text), public.work_report(uuid, date, date) from public, anon;
grant execute on function public.work_ping(uuid, int, jsonb, text), public.work_report(uuid, date, date) to authenticated;
