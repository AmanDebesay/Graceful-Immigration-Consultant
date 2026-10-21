-- Count days in the practice's local time (Lethbridge = America/Edmonton), not UTC.
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_today date := (now() at time zone 'America/Edmonton')::date;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'new_assessments',  case when public.has_perm('intake.view') then (select count(*) from public.intake_submissions where status = 'new') end,
    'red_open',         case when public.has_perm('intake.view') then (select count(*) from public.intake_submissions where triage_level = 'RED' and status in ('new','in_review')) end,
    'leads_open',       case when public.has_perm('crm.view') then (select count(*) from public.contacts where stage not in ('retained','closed_lost')) end,
    'clients',          case when public.has_perm('crm.view') then (select count(*) from public.contacts where stage = 'retained') end,
    'tasks_open',       (select count(*) from public.tasks where not done and (assigned_to = auth.uid() or public.has_perm('tasks.manage'))),
    'tasks_overdue',    (select count(*) from public.tasks where not done and due_date < v_today and (assigned_to = auth.uid() or public.has_perm('tasks.manage'))),
    'subscribers',      case when public.has_perm('newsletter.view') then (select count(*) from public.newsletter_subscribers where unsubscribed_at is null) end,
    'pipeline',         case when public.has_perm('crm.view') then (select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (select stage, count(*) n from public.contacts group by stage) s) end,
    'assessments_30d',  case when public.has_perm('intake.view') then (
                          select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
                            select (created_at at time zone 'America/Edmonton')::date d, count(*) n from public.intake_submissions
                            where created_at > now() - interval '31 days' group by 1) x) end
  ) into r;
  return r;
end $$;
