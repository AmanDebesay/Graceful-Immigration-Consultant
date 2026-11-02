-- 1) Agreement drafting: staff with agreements.draft (e.g. assistants) prepare drafts and send them to the RCIC,
--    who reviews, signs and sends. Drafters can never sign, send, lock for paper or void.
-- 2) Case checklists with hand-offs: documents (assistant) → forms (case manager / RCIC) → RCIC final review → approved.

insert into public.permissions (key, label, category) values
  ('agreements.draft', 'Draft agreements for RCIC review (cannot sign or send)', 'Agreements'),
  ('checklists.work',  'Work on case checklists and hand off to the next person',  'Cases'),
  ('cases.approve',    'Final review & approval of applications (RCIC)',          'Cases')
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values
  ('assistant', 'agreements.draft'),
  ('assistant', 'checklists.work'), ('case_manager', 'checklists.work'), ('rcic', 'checklists.work'),
  ('rcic', 'cases.approve')
on conflict do nothing;

-- Does a given staff member hold a permission (for choosing who work is handed to)?
create or replace function public.user_has_perm(p_user uuid, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles pr where pr.id = p_user and pr.active and pr.role <> 'client'
    and (pr.role = 'owner' or exists (select 1 from public.role_permissions rp where rp.role = pr.role and rp.permission = p)))
$$;

-- Tasks can point at the page they are about.
alter table public.tasks add column if not exists link text;

-- ───────────────────────── Agreement drafting ─────────────────────────
alter table public.agreements
  add column review_requested_at timestamptz,
  add column review_requested_by uuid references public.profiles(id) on delete set null,
  add column reviewer_id uuid references public.profiles(id) on delete set null,
  add column review_note text;

drop policy agreements_select on public.agreements;
drop policy agreements_insert on public.agreements;
drop policy agreements_update on public.agreements;
drop policy agreements_delete on public.agreements;
create policy agreements_select on public.agreements for select to authenticated
  using (public.has_perm('agreements.manage') or public.has_perm('crm.view') or public.has_perm('agreements.draft'));
create policy agreements_insert on public.agreements for insert to authenticated
  with check ((public.has_perm('agreements.manage') or public.has_perm('agreements.draft')) and status = 'draft');
create policy agreements_update on public.agreements for update to authenticated
  using (public.has_perm('agreements.manage') or (public.has_perm('agreements.draft') and status = 'draft'))
  with check (public.has_perm('agreements.manage') or (public.has_perm('agreements.draft') and status = 'draft'));
create policy agreements_delete on public.agreements for delete to authenticated
  using (public.has_perm('agreements.manage') or (public.has_perm('agreements.draft') and status = 'draft'));

-- A drafter's row stays an unsigned draft: no frozen text, signature or signing link.
create or replace function public.agreements_draft_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_perm('agreements.manage') or current_setting('gi.agreement', true) = 'on' then return new; end if;
  if new.status <> 'draft' or new.body_html is not null or new.rcic_signature is not null or new.signing_token is not null then
    raise exception 'Only the RCIC can sign and send agreements. Use “Send to RCIC for review”.';
  end if;
  if tg_op = 'UPDATE' and (new.review_requested_at is distinct from old.review_requested_at or new.reviewer_id is distinct from old.reviewer_id) then
    raise exception 'Use “Send to RCIC for review” to request a review.';
  end if;
  return new;
end $$;
create trigger agreements_draft_guard before insert or update on public.agreements for each row execute function public.agreements_draft_guard();

-- Send a draft to an RCIC/owner for review: logs it and gives the reviewer a task.
create or replace function public.request_agreement_review(p_id uuid, p_reviewer uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.agreements; v_name text; v_client text;
begin
  if not (public.has_perm('agreements.manage') or public.has_perm('agreements.draft')) then raise exception 'You do not have permission to draft agreements.'; end if;
  select * into v from public.agreements where id = p_id for update;
  if v.status <> 'draft' then raise exception 'Only drafts can be sent for review.'; end if;
  if not public.user_has_perm(p_reviewer, 'agreements.manage') then raise exception 'Choose an RCIC who can sign agreements.'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  select full_name into v_client from public.contacts where id = v.contact_id;
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set review_requested_at = now(), review_requested_by = auth.uid(), reviewer_id = p_reviewer, review_note = nullif(trim(p_note), '') where id = p_id;
  perform set_config('gi.agreement', 'off', true);
  update public.tasks set done = true, done_at = now() where link = '#/agreements/' || p_id and not done;
  insert into public.agreement_events (agreement_id, event, actor_id, details) values (p_id, 'review_requested', auth.uid(), jsonb_build_object('by', v_name, 'note', nullif(trim(p_note), '')));
  insert into public.tasks (contact_id, title, details, due_date, priority, assigned_to, created_by, link)
  values (v.contact_id, 'Review & sign draft agreement ' || v.number || ' — ' || coalesce(v_client, ''), nullif(trim(p_note), ''),
    (now() at time zone 'America/Edmonton')::date, 'high', p_reviewer, auth.uid(), '#/agreements/' || p_id);
end $$;

-- The reviewer sends a draft back with what to change.
create or replace function public.return_agreement_draft(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.agreements; v_name text;
begin
  if not public.has_perm('agreements.manage') then raise exception 'Only the RCIC can return a draft.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Say what needs to change.'; end if;
  select * into v from public.agreements where id = p_id for update;
  if v.status <> 'draft' then raise exception 'Only drafts can be returned.'; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  perform set_config('gi.agreement', 'on', true);
  update public.agreements set review_requested_at = null, reviewer_id = null, review_note = trim(p_note) where id = p_id;
  perform set_config('gi.agreement', 'off', true);
  update public.tasks set done = true, done_at = now() where link = '#/agreements/' || p_id and not done;
  insert into public.agreement_events (agreement_id, event, actor_id, details) values (p_id, 'review_returned', auth.uid(), jsonb_build_object('by', v_name, 'note', trim(p_note)));
  if v.review_requested_by is not null and v.review_requested_by <> auth.uid() then
    insert into public.tasks (contact_id, title, details, due_date, priority, assigned_to, created_by, link)
    values (v.contact_id, 'Changes requested on draft agreement ' || v.number, trim(p_note), (now() at time zone 'America/Edmonton')::date, 'high', v.review_requested_by, auth.uid(), '#/agreements/' || p_id);
  end if;
end $$;

-- Once signed and sent (or locked for paper), the review task is finished.
create or replace function public.agreements_review_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'draft' and new.status <> 'draft' then
    update public.tasks set done = true, done_at = now() where link = '#/agreements/' || new.id and not done;
  end if;
  return new;
end $$;
create trigger agreements_review_done after update of status on public.agreements for each row execute function public.agreements_review_done();

-- ───────────────────────── Case checklists ─────────────────────────
create table public.checklist_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  application_types text[] not null default '{}',   -- case types this checklist is suggested for
  items             jsonb not null default '[]',     -- [{stage: documents|forms|review, section, label, required}]
  active            boolean not null default true,
  sort              int not null default 0,
  updated_at        timestamptz not null default now()
);

create table public.case_checklists (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  name         text not null,
  stage        text not null default 'documents' check (stage in ('documents', 'forms', 'rcic_review', 'approved')),
  assigned_to  uuid references public.profiles(id) on delete set null,
  history      jsonb not null default '[]',
  approved_at  timestamptz,
  approved_by  uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index case_checklists_case_idx on public.case_checklists (case_id);
create index case_checklists_assigned_idx on public.case_checklists (assigned_to, stage);
create trigger case_checklists_touch before update on public.case_checklists for each row execute function public.touch_updated_at();

create table public.case_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references public.case_checklists(id) on delete cascade,
  stage         text not null default 'documents' check (stage in ('documents', 'forms', 'review')),
  section       text,
  label         text not null check (length(label) between 1 and 500),
  required      boolean not null default true,
  status        text not null default 'todo' check (status in ('todo', 'done', 'na')),
  note          text,
  done_by       uuid references public.profiles(id) on delete set null,
  done_at       timestamptz,
  sort          int not null default 0
);
create index case_checklist_items_idx on public.case_checklist_items (checklist_id, sort);

alter table public.checklist_templates enable row level security;
alter table public.case_checklists enable row level security;
alter table public.case_checklist_items enable row level security;
create policy checklist_templates_select on public.checklist_templates for select to authenticated using (public.is_staff());
create policy checklist_templates_write on public.checklist_templates for all to authenticated
  using (public.has_perm('settings.manage') or public.has_perm('cases.approve')) with check (public.has_perm('settings.manage') or public.has_perm('cases.approve'));
create policy case_checklists_select on public.case_checklists for select to authenticated
  using (public.has_perm('crm.view') or public.has_perm('checklists.work'));
create policy case_checklists_delete on public.case_checklists for delete to authenticated
  using (public.has_perm('cases.approve') and stage <> 'approved');
-- Stage and assignment change only through checklist_handoff().
create policy case_checklist_items_select on public.case_checklist_items for select to authenticated
  using (public.has_perm('crm.view') or public.has_perm('checklists.work'));
create policy case_checklist_items_write on public.case_checklist_items for all to authenticated
  using (public.has_perm('checklists.work') and exists (select 1 from public.case_checklists c where c.id = checklist_id and c.stage <> 'approved'))
  with check (public.has_perm('checklists.work') and exists (select 1 from public.case_checklists c where c.id = checklist_id and c.stage <> 'approved'));

-- Only the RCIC ticks the final-review items.
create or replace function public.checklist_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.stage = 'review' and not public.has_perm('cases.approve')
     and ((tg_op = 'INSERT' and new.status <> 'todo') or (tg_op = 'UPDATE' and new.status is distinct from old.status)) then
    raise exception 'Only the RCIC completes the final review items.';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.done_by := case when new.status = 'todo' then null else auth.uid() end;
    new.done_at := case when new.status = 'todo' then null else now() end;
  end if;
  return new;
end $$;
create trigger checklist_items_guard before insert or update on public.case_checklist_items for each row execute function public.checklist_items_guard();

create or replace function public.checklist_stage_label(s text) returns text language sql immutable as $$
  select case s when 'documents' then 'Document collection' when 'forms' then 'Forms preparation'
    when 'rcic_review' then 'RCIC final review' when 'approved' then 'Approved — ready to submit' else s end
$$;

-- Start a checklist on a case from a template; the person starting it owns the first step.
create or replace function public.start_checklist(p_case uuid, p_template uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t public.checklist_templates; v_id uuid;
begin
  if not public.has_perm('checklists.work') then raise exception 'You do not have permission to work on checklists.'; end if;
  select * into t from public.checklist_templates where id = p_template;
  if t.id is null then raise exception 'Checklist template not found.'; end if;
  if not exists (select 1 from public.cases where id = p_case) then raise exception 'Case not found.'; end if;
  insert into public.case_checklists (case_id, name, assigned_to, history)
  values (p_case, t.name, auth.uid(), jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'to', 'documents', 'assignee', auth.uid(), 'note', 'Checklist started')))
  returning id into v_id;
  insert into public.case_checklist_items (checklist_id, stage, section, label, required, sort)
  select v_id, coalesce(x->>'stage', 'documents'), x->>'section', x->>'label', coalesce((x->>'required')::boolean, true), o
  from jsonb_array_elements(t.items) with ordinality as e(x, o);
  return v_id;
end $$;

-- Move a checklist to the next (or an earlier) step and hand it to someone, with a task for them.
create or replace function public.checklist_handoff(p_id uuid, p_stage text, p_assignee uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c public.case_checklists; k public.cases; v_client text; v_open int; v_title text; v_rank jsonb := '{"documents":1,"forms":2,"rcic_review":3,"approved":4}';
  v_link text; v_prev uuid;
begin
  select * into c from public.case_checklists where id = p_id for update;
  if c.id is null then raise exception 'Checklist not found.'; end if;
  if p_stage not in ('documents', 'forms', 'rcic_review', 'approved') then raise exception 'Unknown step.'; end if;
  select * into k from public.cases where id = c.case_id;
  select full_name into v_client from public.contacts where id = k.contact_id;
  v_link := '#/checklists/' || p_id;

  -- Who may make this move
  if p_stage = 'approved' or c.stage in ('rcic_review', 'approved') then
    if not public.has_perm('cases.approve') then raise exception 'Only the RCIC can approve or return a file in final review.'; end if;
  elsif not public.has_perm('checklists.work') then raise exception 'You do not have permission to work on checklists.';
  end if;

  -- Moving forward needs the current step's required items finished
  if (v_rank->>p_stage)::int > (v_rank->>c.stage)::int then
    if (v_rank->>p_stage)::int - (v_rank->>c.stage)::int > 1 then raise exception 'Finish the steps in order.'; end if;
    select count(*) into v_open from public.case_checklist_items where checklist_id = p_id and required and status = 'todo'
      and stage = case c.stage when 'documents' then 'documents' when 'forms' then 'forms' else 'review' end;
    if v_open > 0 then raise exception '% required item(s) in this step are still open. Tick them, or mark them N/A with a note.', v_open; end if;
  end if;

  if p_stage = 'approved' then p_assignee := coalesce(p_assignee, auth.uid()); end if;
  if p_assignee is null then raise exception 'Choose who works on the next step.'; end if;
  if not public.user_has_perm(p_assignee, case when p_stage in ('rcic_review', 'approved') then 'cases.approve' else 'checklists.work' end) then
    raise exception '%', case when p_stage = 'rcic_review' then 'Final review must go to an RCIC.' else 'That person cannot work on checklists. Check Team & Access.' end;
  end if;

  update public.case_checklists set stage = p_stage, assigned_to = p_assignee,
    approved_at = case when p_stage = 'approved' then now() end, approved_by = case when p_stage = 'approved' then auth.uid() end,
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'from', c.stage, 'to', p_stage, 'assignee', p_assignee, 'note', nullif(trim(p_note), '')))
  where id = p_id;

  update public.tasks set done = true, done_at = now() where link = v_link and not done;
  if p_stage = 'approved' then
    -- Tell whoever sent it for review that it can be submitted
    select (h->>'by')::uuid into v_prev from jsonb_array_elements(c.history) h where h->>'to' = 'rcic_review' order by h->>'at' desc limit 1;
    p_assignee := coalesce(v_prev, p_assignee);
  end if;
  if p_assignee <> auth.uid() then
    v_title := case p_stage when 'documents' then 'Collect documents' when 'forms' then 'Prepare forms'
      when 'rcic_review' then 'Final review & approval' else 'Approved — submit the application' end
      || ': ' || c.name || ' — ' || coalesce(v_client, '');
    insert into public.tasks (contact_id, title, details, due_date, priority, assigned_to, created_by, link)
    values (k.contact_id, v_title, nullif(trim(p_note), ''), (now() at time zone 'America/Edmonton')::date,
      case when p_stage in ('rcic_review', 'approved') then 'high' else 'normal' end, p_assignee, auth.uid(), v_link);
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['user_has_perm(uuid, text)', 'request_agreement_review(uuid, uuid, text)', 'return_agreement_draft(uuid, text)',
    'start_checklist(uuid, uuid)', 'checklist_handoff(uuid, text, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Starter checklists (edit them in Business Settings → Checklists). Always confirm against IRCC's current instructions.
insert into public.checklist_templates (name, application_types, items, sort) values
('Spousal / common-law sponsorship (Family Class)', array['Spousal Sponsorship']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed (and consultation agreement, if any)", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed by the sponsor and the applicant", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Client questionnaire completed (sponsor and applicant)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Proof of status in Canada (PR card, citizenship certificate or Canadian passport)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Passport or travel document � bio page", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Proof of residence in Canada (or plan to return, if a Canadian citizen living abroad)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Previous sponsorship undertakings / prior marriage documents (if any)", "required": false}, {"stage": "documents", "section": "Principal applicant", "label": "Passport � every page, including blank pages", "required": true}, {"stage": "documents", "section": "Principal applicant", "label": "Birth certificate", "required": true}, {"stage": "documents", "section": "Principal applicant", "label": "National identity card (if the country issues one)", "required": true}, {"stage": "documents", "section": "Principal applicant", "label": "Two digital photos meeting IRCC specifications", "required": true}, {"stage": "documents", "section": "Principal applicant", "label": "Police certificates � each country lived 6+ months since age 18", "required": true}, {"stage": "documents", "section": "Principal applicant", "label": "Upfront medical exam confirmation (IMM 1017B) � only if instructed", "required": false}, {"stage": "documents", "section": "Relationship", "label": "Marriage certificate (or proof of 12 months'' cohabitation for common-law)", "required": true}, {"stage": "documents", "section": "Relationship", "label": "Photos together over time (with dates and people named)", "required": true}, {"stage": "documents", "section": "Relationship", "label": "Communication history (calls, messages, visits)", "required": true}, {"stage": "documents", "section": "Relationship", "label": "Joint documents � lease, bank accounts, bills, insurance", "required": true}, {"stage": "documents", "section": "Relationship", "label": "Wedding evidence � invitations, guest list, receipts", "required": false}, {"stage": "documents", "section": "Relationship", "label": "Divorce or death certificate for any previous marriage", "required": false}, {"stage": "documents", "section": "Dependent children (if any)", "label": "Birth certificates showing both parents", "required": false}, {"stage": "documents", "section": "Dependent children (if any)", "label": "Custody papers / consent of the other parent", "required": false}, {"stage": "documents", "section": "Translations & fees", "label": "Certified translations with translator''s affidavit for documents not in English or French", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Government fees paid (processing, right of PR, biometrics) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application to Sponsor, Sponsorship Agreement and Undertaking (IMM 1344)", "required": true}, {"stage": "forms", "section": null, "label": "Relationship Information and Sponsorship Evaluation (IMM 5532)", "required": true}, {"stage": "forms", "section": null, "label": "Generic Application Form / PR portal profile completed for the applicant", "required": true}, {"stage": "forms", "section": null, "label": "Schedule A � Background/Declaration (IMM 5669)", "required": true}, {"stage": "forms", "section": null, "label": "Additional Family Information (IMM 5406)", "required": true}, {"stage": "forms", "section": null, "label": "Statutory Declaration of Common-law Union (IMM 5409)", "required": false}, {"stage": "forms", "section": null, "label": "Letter of explanation / relationship submissions drafted", "required": true}, {"stage": "forms", "section": null, "label": "Document checklist (IMM 5533) matched against current IRCC instructions", "required": true}, {"stage": "review", "section": null, "label": "All forms validated, signed and dated by the sponsor and the applicant", "required": true}, {"stage": "review", "section": null, "label": "Personal history, addresses, travel and relationship dates match across every form and document", "required": true}, {"stage": "review", "section": null, "label": "Translations and affidavits included for every non-English/French document", "required": true}, {"stage": "review", "section": null, "label": "Fees paid and receipts saved on the file", "required": true}, {"stage": "review", "section": null, "label": "Submission letter reviewed and approved", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 0),
('Parent & grandparent sponsorship (Family Class)', array['Parent/Grandparent Sponsorship']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed by the sponsor and the applicant", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Invitation to apply received (within the deadline)", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Client questionnaire completed (sponsor and parents)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Proof of status in Canada (PR card, citizenship certificate or Canadian passport)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Sponsor''s birth certificate showing the parents'' names (proof of relationship)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "CRA Notices of Assessment for the 3 tax years required (minimum necessary income + 30%)", "required": true}, {"stage": "documents", "section": "Sponsor", "label": "Co-signer''s documents and Notices of Assessment (if a co-signer is used)", "required": false}, {"stage": "documents", "section": "Parents / grandparents", "label": "Passports � every page", "required": true}, {"stage": "documents", "section": "Parents / grandparents", "label": "Birth certificates", "required": true}, {"stage": "documents", "section": "Parents / grandparents", "label": "Marriage certificate (or divorce/death certificates)", "required": true}, {"stage": "documents", "section": "Parents / grandparents", "label": "Two digital photos each, meeting IRCC specifications", "required": true}, {"stage": "documents", "section": "Parents / grandparents", "label": "Police certificates � each country lived 6+ months since age 18", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Certified translations with translator''s affidavit for documents not in English or French", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Government fees paid and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application to Sponsor, Sponsorship Agreement and Undertaking (IMM 1344)", "required": true}, {"stage": "forms", "section": null, "label": "Financial Evaluation for Parents and Grandparents Sponsorship (IMM 5768)", "required": true}, {"stage": "forms", "section": null, "label": "Generic Application Form / PR portal profile for each applicant", "required": true}, {"stage": "forms", "section": null, "label": "Schedule A � Background/Declaration (IMM 5669) for each applicant", "required": true}, {"stage": "forms", "section": null, "label": "Additional Family Information (IMM 5406)", "required": true}, {"stage": "forms", "section": null, "label": "Document checklist matched against current IRCC instructions", "required": true}, {"stage": "review", "section": null, "label": "All forms validated, signed and dated", "required": true}, {"stage": "review", "section": null, "label": "Income meets the required amount for every tax year", "required": true}, {"stage": "review", "section": null, "label": "Personal history and addresses match across all forms and documents", "required": true}, {"stage": "review", "section": null, "label": "Translations included; fees paid and receipts saved", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 1),
('Super Visa (parents & grandparents)', array['Super Visa']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Host child / grandchild in Canada", "label": "Signed invitation letter (promise of support, household members)", "required": true}, {"stage": "documents", "section": "Host child / grandchild in Canada", "label": "Proof of Canadian citizenship or PR status", "required": true}, {"stage": "documents", "section": "Host child / grandchild in Canada", "label": "Proof of income meeting the minimum required (Notice of Assessment, employment letter, pay stubs)", "required": true}, {"stage": "documents", "section": "Host child / grandchild in Canada", "label": "Proof of relationship (birth certificates linking applicant and host)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Passport � every page", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Canadian medical insurance: at least $100,000 coverage, valid 1 year from entry, paid or with payment plan", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Immigration medical exam completed", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Travel history and proof of ties to home country", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Proof of own funds (bank statements)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Digital photo", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Certified translations for documents not in English or French", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Government fees paid (application and biometrics) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application for Temporary Resident Visa (IMM 5257)", "required": true}, {"stage": "forms", "section": null, "label": "Family Information (IMM 5707 or IMM 5645)", "required": true}, {"stage": "forms", "section": null, "label": "Purpose of travel / letter of explanation drafted", "required": true}, {"stage": "review", "section": null, "label": "All forms validated, signed and dated", "required": true}, {"stage": "review", "section": null, "label": "Insurance meets every Super Visa requirement", "required": true}, {"stage": "review", "section": null, "label": "Host income meets the required amount", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 2),
('Express Entry / Provincial Nominee � Permanent Residence', array['Express Entry PR','Provincial Nominee (AAIP)']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Client questionnaire completed (full personal, address, work and travel history)", "required": true}, {"stage": "documents", "section": "Identity", "label": "Passports � every page (applicant, spouse, dependants)", "required": true}, {"stage": "documents", "section": "Identity", "label": "Birth certificates", "required": true}, {"stage": "documents", "section": "Identity", "label": "Marriage certificate (or common-law declaration)", "required": true}, {"stage": "documents", "section": "Identity", "label": "Digital photos for each person", "required": true}, {"stage": "documents", "section": "Eligibility", "label": "Language test results valid (IELTS, CELPIP, PTE Core, TEF or TCF)", "required": true}, {"stage": "documents", "section": "Eligibility", "label": "Educational Credential Assessment (ECA)", "required": true}, {"stage": "documents", "section": "Eligibility", "label": "Reference letters for each job claimed (duties, hours, salary, dates, signed on letterhead)", "required": true}, {"stage": "documents", "section": "Eligibility", "label": "Proof of funds � 6 months of bank statements (unless exempt)", "required": true}, {"stage": "documents", "section": "Eligibility", "label": "Provincial nomination certificate", "required": false}, {"stage": "documents", "section": "Eligibility", "label": "Valid job offer / LMIA", "required": false}, {"stage": "documents", "section": "Eligibility", "label": "Spouse''s language results and ECA (for points)", "required": false}, {"stage": "documents", "section": "Background", "label": "Police certificates � each country lived 6+ months since age 18", "required": true}, {"stage": "documents", "section": "Background", "label": "Upfront or instructed medical exam completed", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Certified translations for documents not in English or French", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Government fees paid (processing, right of PR, biometrics) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Express Entry profile matches the documents exactly (scores re-checked)", "required": true}, {"stage": "forms", "section": null, "label": "Electronic application (eAPR): personal, address, education and work history completed", "required": true}, {"stage": "forms", "section": null, "label": "Schedule A � Background/Declaration completed for each adult", "required": true}, {"stage": "forms", "section": null, "label": "Letters of explanation drafted (gaps, discrepancies, name differences)", "required": true}, {"stage": "review", "section": null, "label": "Every point claimed is supported by a document", "required": true}, {"stage": "review", "section": null, "label": "Work duties match the NOC code claimed", "required": true}, {"stage": "review", "section": null, "label": "Personal history and addresses consistent with documents and earlier applications", "required": true}, {"stage": "review", "section": null, "label": "Translations included; fees paid and receipts saved", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final application and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 3),
('Work permit (new or extension)', array['Work Permit','Work Permit Extension']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Passport � every page", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Current permit / status documents (for an extension)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Resume / CV", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Proof of qualifications (diplomas, licences)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Digital photo", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Language test results (if the job or program needs them)", "required": false}, {"stage": "documents", "section": "Applicant", "label": "Medical exam (if required for the job or country)", "required": false}, {"stage": "documents", "section": "Applicant", "label": "Police certificate (if requested)", "required": false}, {"stage": "documents", "section": "Job & employer", "label": "Job offer letter / employment contract", "required": true}, {"stage": "documents", "section": "Job & employer", "label": "LMIA approval letter, or employer compliance offer number (LMIA-exempt)", "required": true}, {"stage": "documents", "section": "Job & employer", "label": "Recent pay stubs (for an extension)", "required": true}, {"stage": "documents", "section": "Job & employer", "label": "Proof of relationship for a spousal open work permit (marriage certificate, partner''s status)", "required": false}, {"stage": "documents", "section": "Fees", "label": "Government fees paid (processing, open work permit holder fee if applicable, biometrics) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application for Work Permit (IMM 1295 outside Canada or IMM 5710 inside Canada)", "required": true}, {"stage": "forms", "section": null, "label": "Family Information (IMM 5707 or IMM 5645)", "required": true}, {"stage": "forms", "section": null, "label": "Letter of explanation / submission letter drafted", "required": true}, {"stage": "review", "section": null, "label": "Correct work permit category and authorisation chosen", "required": true}, {"stage": "review", "section": null, "label": "Status maintained (application filed before current status expires)", "required": true}, {"stage": "review", "section": null, "label": "Forms validated, signed and dated; fees paid", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 4),
('Study permit (new or extension)', array['Study Permit','Study Permit Extension']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Passport � every page", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Letter of acceptance from a designated learning institution (DLI)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Provincial/territorial attestation letter (PAL/TAL), unless exempt", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Proof of funds: tuition plus living costs at IRCC''s current amount", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Academic transcripts and diplomas", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Digital photo", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Language test results", "required": false}, {"stage": "documents", "section": "Applicant", "label": "Quebec Acceptance Certificate (CAQ) � Quebec only", "required": false}, {"stage": "documents", "section": "Applicant", "label": "Medical exam (if required)", "required": false}, {"stage": "documents", "section": "Applicant", "label": "Proof of enrolment and current permit (for an extension)", "required": false}, {"stage": "documents", "section": "Fees", "label": "Government fees paid (processing and biometrics) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application for Study Permit (IMM 1294 outside Canada or IMM 5709 inside Canada)", "required": true}, {"stage": "forms", "section": null, "label": "Family Information (IMM 5707 or IMM 5645)", "required": true}, {"stage": "forms", "section": null, "label": "Study plan / letter of explanation drafted", "required": true}, {"stage": "review", "section": null, "label": "Funds meet IRCC''s current requirement and the source is explained", "required": true}, {"stage": "review", "section": null, "label": "Study plan is consistent with education and work history", "required": true}, {"stage": "review", "section": null, "label": "Forms validated, signed and dated; fees paid", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 5),
('Visitor visa / visitor record', array['Visitor Visa (TRV)','Visitor Record']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Passport � every page", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Purpose of travel: invitation letter, itinerary or event details", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Proof of funds (bank statements)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Proof of ties to home country (employment letter, property, family)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Travel history (previous visas and stamps)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Digital photo", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Current status documents (for a visitor record inside Canada)", "required": false}, {"stage": "documents", "section": "Fees", "label": "Government fees paid (processing and biometrics) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application for Temporary Resident Visa (IMM 5257) or to Change Conditions/Extend Stay (IMM 5708)", "required": true}, {"stage": "forms", "section": null, "label": "Family Information (IMM 5707 or IMM 5645)", "required": true}, {"stage": "forms", "section": null, "label": "Letter of explanation drafted", "required": true}, {"stage": "review", "section": null, "label": "Purpose of visit and ties clearly supported", "required": true}, {"stage": "review", "section": null, "label": "Forms validated, signed and dated; fees paid", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 6),
('Canadian citizenship (adult)', array['Citizenship']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Applicant", "label": "PR card (front and back) and landing documents", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Passports and travel documents covering the last 5 years", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Physical presence calculation: at least 1,095 days in the last 5 years", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Proof of language level (ages 18�54), e.g. CLB 4 test result or Canadian education", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Income tax filed for 3 of the last 5 years (if required)", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Two photos meeting citizenship specifications", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Police certificates for countries lived 183+ days in the last 4 years", "required": false}, {"stage": "documents", "section": "Applicant", "label": "Name-change documents", "required": false}, {"stage": "documents", "section": "Fees", "label": "Government fees paid (processing and right of citizenship) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "Application for Canadian Citizenship � Adults (CIT 0002) / online application completed", "required": true}, {"stage": "forms", "section": null, "label": "Physical presence calculator printout attached", "required": true}, {"stage": "review", "section": null, "label": "Absences and travel match passports and the calculator exactly", "required": true}, {"stage": "review", "section": null, "label": "No prohibitions (charges, removal orders, residency issues)", "required": true}, {"stage": "review", "section": null, "label": "Forms validated, signed and dated; fees paid", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final application and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 7),
('PR card renewal', array['PR Card Renewal']::text[], '[{"stage": "documents", "section": null, "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": null, "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": null, "label": "Current or expired PR card (front and back)", "required": true}, {"stage": "documents", "section": null, "label": "Passport � every page covering the last 5 years", "required": true}, {"stage": "documents", "section": null, "label": "Proof of 730 days of physical presence in the last 5 years", "required": true}, {"stage": "documents", "section": null, "label": "Proof of residence in Canada (lease, employment, tax)", "required": true}, {"stage": "documents", "section": null, "label": "Two photos meeting PR card specifications", "required": true}, {"stage": "documents", "section": null, "label": "Government fee paid and receipt saved", "required": true}, {"stage": "forms", "section": null, "label": "Application for a Permanent Resident Card (IMM 5444) / online application completed", "required": true}, {"stage": "review", "section": null, "label": "Residency obligation met (or humanitarian explanation prepared)", "required": true}, {"stage": "review", "section": null, "label": "Travel history matches the passport", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the application and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy saved to the client file", "required": true}]'::jsonb, 8),
('Refugee claim (inside Canada)', array['Refugee Claim']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) and IRB counsel contact information filed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Interpreter language confirmed", "required": true}, {"stage": "documents", "section": "Identity", "label": "Passport / national identity documents (originals kept safe)", "required": true}, {"stage": "documents", "section": "Identity", "label": "Birth certificate and other identity proof", "required": true}, {"stage": "documents", "section": "Evidence for the claim", "label": "Client''s detailed account of what happened (timeline)", "required": true}, {"stage": "documents", "section": "Evidence for the claim", "label": "Supporting evidence: police reports, medical records, threats, photos", "required": true}, {"stage": "documents", "section": "Evidence for the claim", "label": "Witness letters / statutory declarations with ID of each author", "required": true}, {"stage": "documents", "section": "Evidence for the claim", "label": "Country condition evidence — IRB National Documentation Package (irb-cisr.gc.ca/en/country-information/ndp)", "required": true}, {"stage": "documents", "section": "Evidence for the claim", "label": "Psychological or medical reports", "required": false}, {"stage": "documents", "section": "Translations", "label": "Certified translations with translator''s declaration for every document", "required": true}, {"stage": "forms", "section": null, "label": "Basis of Claim (BOC) form completed � deadline confirmed", "required": true}, {"stage": "forms", "section": null, "label": "IRCC portal claim forms (generic application, Schedule A, Schedule 12)", "required": true}, {"stage": "forms", "section": null, "label": "Disclosure package organised and paginated for the IRB (deadline: 10 days before the hearing)", "required": true}, {"stage": "review", "section": null, "label": "BOC narrative consistent with every form and document", "required": true}, {"stage": "review", "section": null, "label": "All IRB deadlines entered as key dates", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the BOC with an interpreter and confirmed it is true and complete", "required": true}, {"stage": "review", "section": null, "label": "Copy of everything filed saved to the client file", "required": true}]'::jsonb, 9),
('Private refugee sponsorship (Group of Five / Community Sponsor)', array['Private Refugee Sponsorship']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed (sponsor group and refugee applicants)", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Refugee applicants", "label": "Proof of refugee status � UNHCR or state recognition (required for Group of Five and Community Sponsors)", "required": true}, {"stage": "documents", "section": "Refugee applicants", "label": "Passports / identity documents for each family member", "required": true}, {"stage": "documents", "section": "Refugee applicants", "label": "Family details: names, dates of birth, relationships", "required": true}, {"stage": "documents", "section": "Refugee applicants", "label": "Photos for each person", "required": true}, {"stage": "documents", "section": "Sponsor group", "label": "Proof of status in Canada for each group member", "required": true}, {"stage": "documents", "section": "Sponsor group", "label": "Proof of income and assets for each member (financial profile)", "required": true}, {"stage": "documents", "section": "Sponsor group", "label": "Settlement plan details: housing, orientation, language, employment support", "required": true}, {"stage": "documents", "section": "Sponsor group", "label": "Community organisation''s assessment documents (Community Sponsor)", "required": false}, {"stage": "forms", "section": null, "label": "Sponsorship Undertaking and Settlement Plan completed and signed by every member", "required": true}, {"stage": "forms", "section": null, "label": "Financial profile forms for each group member", "required": true}, {"stage": "forms", "section": null, "label": "Generic Application Form and Schedule 2 (Refugees outside Canada) for the applicants", "required": true}, {"stage": "forms", "section": null, "label": "Schedule A � Background/Declaration (IMM 5669) for each adult applicant", "required": true}, {"stage": "forms", "section": null, "label": "Additional Family Information (IMM 5406)", "required": true}, {"stage": "review", "section": null, "label": "Group''s combined funds meet the current sponsorship cost table", "required": true}, {"stage": "review", "section": null, "label": "Every member signed the undertaking; no member is ineligible to sponsor", "required": true}, {"stage": "review", "section": null, "label": "Refugee status evidence meets the requirement for this sponsor type", "required": true}, {"stage": "review", "section": null, "label": "Client group reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 10),
('Humanitarian & compassionate / PRRA', array['PRRA / H&C']::text[], '[{"stage": "documents", "section": "Getting started", "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": "Getting started", "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Passport and identity documents", "required": true}, {"stage": "documents", "section": "Applicant", "label": "Immigration history (all permits, refusals, removal documents)", "required": true}, {"stage": "documents", "section": "Evidence", "label": "Establishment in Canada: employment, taxes, lease, volunteering, community letters", "required": true}, {"stage": "documents", "section": "Evidence", "label": "Best interests of any children: school, health, relationship letters", "required": true}, {"stage": "documents", "section": "Evidence", "label": "Hardship / risk evidence and country conditions", "required": true}, {"stage": "documents", "section": "Evidence", "label": "Medical or psychological reports", "required": false}, {"stage": "documents", "section": "Translations & fees", "label": "Certified translations for documents not in English or French", "required": true}, {"stage": "documents", "section": "Translations & fees", "label": "Government fees paid (if applicable) and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "H&C application forms (IMM 5283, generic application, Schedule A, IMM 5406) � or PRRA application", "required": true}, {"stage": "forms", "section": null, "label": "Written submissions drafted with an index of evidence", "required": true}, {"stage": "review", "section": null, "label": "Every argument in the submissions is supported by evidence", "required": true}, {"stage": "review", "section": null, "label": "Deadlines confirmed and entered as key dates", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the submissions and agreed to file", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 11),
('General application (any type)', '{}'::text[], '[{"stage": "documents", "section": null, "label": "Retainer agreement signed", "required": true}, {"stage": "documents", "section": null, "label": "Use of a Representative (IMM 5476) signed", "required": true}, {"stage": "documents", "section": null, "label": "Client questionnaire completed", "required": true}, {"stage": "documents", "section": null, "label": "Passport � every page", "required": true}, {"stage": "documents", "section": null, "label": "Identity documents (birth certificate, national ID)", "required": true}, {"stage": "documents", "section": null, "label": "Digital photos meeting IRCC specifications", "required": true}, {"stage": "documents", "section": null, "label": "Supporting documents listed in IRCC''s current document checklist", "required": true}, {"stage": "documents", "section": null, "label": "Certified translations for documents not in English or French", "required": true}, {"stage": "documents", "section": null, "label": "Government fees paid and receipts saved", "required": true}, {"stage": "forms", "section": null, "label": "All IRCC forms in the current document checklist completed", "required": true}, {"stage": "forms", "section": null, "label": "Letter of explanation / submission letter drafted", "required": true}, {"stage": "review", "section": null, "label": "Forms validated, signed and dated", "required": true}, {"stage": "review", "section": null, "label": "Information consistent across all forms and documents", "required": true}, {"stage": "review", "section": null, "label": "Client reviewed the final package and agreed to submit", "required": true}, {"stage": "review", "section": null, "label": "Copy of the complete package saved to the client file", "required": true}]'::jsonb, 12);
