-- Pathway assessments: the RCIC's structured assessment of a client's routes (Pathway map tool),
-- usually done after the Initial Consultation Agreement is signed. Answers are kept as JSON so a
-- trained AI reviewer can read them later. A final assessment is part of the client file: it is
-- locked (reopen to change) and can't be deleted.
create sequence if not exists public.pathway_number_seq;

create table public.pathway_assessments (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('PA-' || to_char(now() at time zone 'America/Edmonton', 'YYYY') || '-' || lpad(nextval('public.pathway_number_seq')::text, 4, '0')),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete set null,
  agreement_id  uuid references public.agreements(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','final')),
  answers       jsonb not null default '{}'::jsonb,   -- the tool's answers, keyed by question id
  checks        jsonb not null default '{}'::jsonb,   -- practice checks ticked
  result        jsonb not null default '{}'::jsonb,   -- ranked routes and flags at last save
  top_route     text,
  urgent_flags  int not null default 0,
  assessor      text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by    uuid references public.profiles(id) on delete set null,
  finalized_by  uuid references public.profiles(id) on delete set null,
  finalized_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.pathway_assessments (contact_id);

insert into public.permissions (key, label, category) values
  ('pathway.view',     'See pathway assessments',                       'Assessments'),
  ('pathway.edit',     'Start and fill in pathway assessments',         'Assessments'),
  ('pathway.finalize', 'Finalize or reopen pathway assessments (RCIC)', 'Assessments')
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('rcic', 'pathway.view'), ('rcic', 'pathway.edit'), ('rcic', 'pathway.finalize'),
  ('case_manager', 'pathway.view'), ('case_manager', 'pathway.edit'),
  ('assistant', 'pathway.view')
on conflict do nothing;

alter table public.pathway_assessments enable row level security;
create policy pathway_select on public.pathway_assessments for select to authenticated using (public.has_perm('pathway.view'));
create policy pathway_insert on public.pathway_assessments for insert to authenticated with check (public.has_perm('pathway.edit') and status = 'draft');
create policy pathway_update on public.pathway_assessments for update to authenticated using (public.has_perm('pathway.edit')) with check (public.has_perm('pathway.edit'));
create policy pathway_delete on public.pathway_assessments for delete to authenticated using (public.has_perm('pathway.edit') and status = 'draft');

-- Final assessments are locked; only an RCIC (pathway.finalize) can finalize or reopen, and each is audited.
create or replace function public.pathway_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'final' then  -- also stops a contact delete from removing it
      raise exception 'A final pathway assessment is part of the client file and can''t be deleted.';
    end if;
    return old;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  new.created_by := old.created_by; new.number := old.number; new.created_at := old.created_at;
  if old.status = 'final' and new.status = 'final' then
    raise exception 'This assessment is final. Reopen it to make changes.';
  end if;
  if new.status <> old.status then
    if auth.uid() is not null and not public.has_perm('pathway.finalize') then
      raise exception 'Only the RCIC can finalize or reopen an assessment.';
    end if;
    if new.status = 'final' then new.finalized_by := auth.uid(); new.finalized_at := now();
    else new.finalized_by := null; new.finalized_at := null; end if;
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (auth.uid(), case when new.status = 'final' then 'pathway_finalized' else 'pathway_reopened' end, 'pathway_assessment', new.id,
            jsonb_build_object('number', new.number, 'contact_id', new.contact_id, 'top_route', new.top_route));
  end if;
  return new;
end $$;
create trigger pathway_guard_upd before update on public.pathway_assessments for each row execute function public.pathway_guard();
create trigger pathway_guard_del before delete on public.pathway_assessments for each row execute function public.pathway_guard();

-- Whether the College-required Client Account is open (the tool warns against advance payments until it is).
alter table public.org_settings add column if not exists client_account_open boolean not null default false;
