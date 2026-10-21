-- Group CRM stats by Lethbridge local date, not UTC.
create or replace function public.crm_stats(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_from date := coalesce(p_from, ((now() at time zone 'America/Edmonton')::date - 365)); v_to date := coalesce(p_to, (now() at time zone 'America/Edmonton')::date);
begin
  if not public.has_perm('crm.view') then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'open_value',      (select coalesce(sum(value),0) from public.deals where stage not in ('won','lost')),
    'weighted_value',  (select coalesce(sum(value*probability/100.0),0) from public.deals where stage not in ('won','lost')),
    'won_value',       (select coalesce(sum(value),0) from public.deals where stage = 'won' and (closed_at at time zone 'America/Edmonton')::date between v_from and v_to),
    'won_count',       (select count(*) from public.deals where stage = 'won' and (closed_at at time zone 'America/Edmonton')::date between v_from and v_to),
    'lost_count',      (select count(*) from public.deals where stage = 'lost' and (closed_at at time zone 'America/Edmonton')::date between v_from and v_to),
    'deals_by_stage',  (select coalesce(jsonb_object_agg(stage, jsonb_build_object('n', n, 'v', v)), '{}'::jsonb)
                        from (select stage, count(*) n, sum(value) v from public.deals group by stage) s),
    'contacts_by_stage',(select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (select stage, count(*) n from public.contacts group by stage) s),
    'sources',         (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n, 'retained', retained) order by n desc), '[]'::jsonb)
                        from (select source, count(*) n, count(*) filter (where stage = 'retained') retained
                              from public.contacts where (created_at at time zone 'America/Edmonton')::date between v_from and v_to group by source) s),
    'won_by_month',    (select coalesce(jsonb_agg(jsonb_build_object('m', m, 'v', v, 'n', n) order by m), '[]'::jsonb)
                        from (select to_char(closed_at at time zone 'America/Edmonton', 'YYYY-MM') m, sum(value) v, count(*) n from public.deals
                              where stage = 'won' and (closed_at at time zone 'America/Edmonton')::date between v_from and v_to group by 1) s),
    'activity_by_type',(select coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
                        from (select type, count(*) n from public.activities where (occurred_at at time zone 'America/Edmonton')::date between v_from and v_to group by type) s),
    'activity_by_user',(select coalesce(jsonb_agg(jsonb_build_object('user', author_id, 'n', n) order by n desc), '[]'::jsonb)
                        from (select author_id, count(*) n from public.activities where (occurred_at at time zone 'America/Edmonton')::date between v_from and v_to group by author_id) s),
    'cases_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.cases group by status) s),
    'new_contacts',    (select count(*) from public.contacts where (created_at at time zone 'America/Edmonton')::date between v_from and v_to)
  ) into r;
  return r;
end $$;
