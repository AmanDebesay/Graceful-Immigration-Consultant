-- Submission letters: cover / submission letters and reconsideration requests drafted from the client file
-- (H&C, reconsideration, Express Entry, work/study/visitor, spousal, TRP, custom). The letter's content is kept
-- as JSON (particulars, sections, enclosures) and rendered in the browser. A final letter is locked (reopen to change).
create sequence if not exists public.letter_number_seq;

create table public.submission_letters (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('SL-' || to_char(now() at time zone 'America/Edmonton', 'YYYY') || '-' || lpad(nextval('public.letter_number_seq')::text, 4, '0')),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete set null,
  type          text not null,
  title         text not null,
  status        text not null default 'draft' check (status in ('draft','final')),
  data          jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by    uuid references public.profiles(id) on delete set null,
  finalized_by  uuid references public.profiles(id) on delete set null,
  finalized_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.submission_letters (contact_id);
create index on public.submission_letters (case_id);

insert into public.permissions (key, label, category) values
  ('letters.view',     'See submission letters',                         'Cases'),
  ('letters.edit',     'Draft submission letters',                       'Cases'),
  ('letters.finalize', 'Finalize or reopen submission letters (RCIC)',   'Cases')
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('rcic', 'letters.view'), ('rcic', 'letters.edit'), ('rcic', 'letters.finalize'),
  ('case_manager', 'letters.view'), ('case_manager', 'letters.edit'),
  ('assistant', 'letters.view')
on conflict do nothing;

alter table public.submission_letters enable row level security;
create policy letters_select on public.submission_letters for select to authenticated using (public.has_perm('letters.view'));
create policy letters_insert on public.submission_letters for insert to authenticated with check (public.has_perm('letters.edit') and status = 'draft');
create policy letters_update on public.submission_letters for update to authenticated using (public.has_perm('letters.edit')) with check (public.has_perm('letters.edit'));
create policy letters_delete on public.submission_letters for delete to authenticated using (public.has_perm('letters.edit') and status = 'draft');

create or replace function public.letters_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'final' then
      raise exception 'A final submission letter is part of the client file and can''t be deleted. Reopen it first.';
    end if;
    return old;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  new.created_by := old.created_by; new.number := old.number; new.created_at := old.created_at;
  if old.status = 'final' and new.status = 'final' then
    raise exception 'This letter is final. Reopen it to make changes.';
  end if;
  if new.status <> old.status then
    if auth.uid() is not null and not public.has_perm('letters.finalize') then
      raise exception 'Only the RCIC can finalize or reopen a submission letter.';
    end if;
    if new.status = 'final' then new.finalized_by := auth.uid(); new.finalized_at := now();
    else new.finalized_by := null; new.finalized_at := null; end if;
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (auth.uid(), case when new.status = 'final' then 'letter_finalized' else 'letter_reopened' end, 'submission_letter', new.id,
            jsonb_build_object('number', new.number, 'contact_id', new.contact_id, 'type', new.type));
  end if;
  return new;
end $$;
create trigger letters_guard_upd before update on public.submission_letters for each row execute function public.letters_guard();
create trigger letters_guard_del before delete on public.submission_letters for each row execute function public.letters_guard();
