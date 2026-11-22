-- Practice Operating System (design document 2026-11-21): client file, representation forms (IMM 5476/5744),
-- deadlines with 14/7/2-day alerts, IRCC correspondence log with the scope question, pricing (add-ons, complexity,
-- promo codes, capped discounts) and quotes, monthly three-way reconciliation sign-off, file closing gate,
-- six more agreement types, and daily alerts / weekly report by email.

-- ───────────── 0. Permissions ─────────────
insert into public.permissions (key, label, category) values
  ('pricing.approve', 'Approve discounts above the maximum percent (RCIC)', 'Finance'),
  ('files.close',     'Close or reopen client files (RCIC)',               'Cases')
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values ('rcic', 'pricing.approve'), ('rcic', 'files.close') on conflict do nothing;

-- ───────────── 1. Settings: pricing and College / IRCC rules (one place, editable) ─────────────
alter table public.org_settings add column if not exists pricing jsonb not null default jsonb_build_object(
  'complexity', jsonb_build_object('low', 1.00, 'mid', 1.15, 'high', 1.30),
  'max_discount_pct', 20,
  'addons', jsonb_build_array(
    jsonb_build_object('key', 'family', 'name', 'Each added family member', 'kind', 'percent', 'value', 25),
    jsonb_build_object('key', 'rush', 'name', 'Rush (under 5 business days)', 'kind', 'percent', 'value', 30),
    jsonb_build_object('key', 'interpreter', 'name', 'Interpreter coordination / translation review', 'kind', 'fixed', 'value', 75),
    jsonb_build_object('key', 'ircc_contact', 'name', 'Extra IRCC contact', 'kind', 'fixed', 'value', 100)));
alter table public.org_settings add column if not exists rules jsonb not null default jsonb_build_object(
  'imm5744_valid_months', 12, 'portal_mb', 4, 'atip_mb', 2, 'retention_years', 6, 'reconciliation_day', 5,
  'status_check_days', 30, 'client_account_notice_days', 15, 'client_account_opened_on', null, 'college_notified_on', null);

-- Starting price list from the design document (illustrative; edit in Products & Services).
insert into public.items (name, description, unit_price, taxable, income_account_id)
select x.n, x.d, x.p, true, (select id from public.accounts where system_key = 'service_income')
from (values ('Application status check and report', 'Check the application status with IRCC and report to the client', 150),
             ('ATIP / GCMS notes request', 'Access to Information and Privacy request for the client''s file notes (Privacy Act, no government fee)', 200),
             ('Email or letter to IRCC', 'One written communication to IRCC on the client''s behalf', 250),
             ('Procedural fairness response / supplementary submission', 'Written response to a procedural fairness letter or a supplementary submission (quote by complexity)', 1200)) x(n, d, p)
where not exists (select 1 from public.items i where i.name = x.n);

-- ───────────── 2. The client file (one per contact) ─────────────
create table if not exists public.client_files (
  contact_id          uuid primary key references public.contacts(id) on delete cascade,
  aliases             text,
  interpreter_needed  boolean not null default false,
  interpreter_language text,
  payer_contact_id    uuid references public.contacts(id) on delete set null,
  sponsor_contact_id  uuid references public.contacts(id) on delete set null,
  related             jsonb not null default '[]'::jsonb,     -- [{contact_id, name, role}] joint clients and other parties
  payment_model       text check (payment_model in ('A', 'B', 'C')),
  risk_flags          text[] not null default '{}',
  risk_notes          text,
  scope_text          text,
  scope_end           date,
  history             jsonb not null default '{}'::jsonb,     -- form data: addresses, personal history, background answers
  retention_until     date,
  closed_at           timestamptz,
  closed_by           uuid references public.profiles(id),
  closing             jsonb not null default '{}'::jsonb,
  updated_by          uuid references public.profiles(id),
  updated_at          timestamptz not null default now()
);
create trigger client_files_touch before update on public.client_files for each row execute function public.touch_updated_at();
alter table public.client_files enable row level security;
create policy client_files_select on public.client_files for select to authenticated using (public.has_perm('crm.view'));
create policy client_files_insert on public.client_files for insert to authenticated with check (public.has_perm('crm.edit'));
create policy client_files_update on public.client_files for update to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));
-- Closing is done only through close_client_file / reopen_client_file.
revoke update on public.client_files from authenticated;
grant update (aliases, interpreter_needed, interpreter_language, payer_contact_id, sponsor_contact_id, related, payment_model, risk_flags, risk_notes,
  scope_text, scope_end, history, retention_until, updated_by) on public.client_files to authenticated;

-- Complexity score: one point per scoring flag; 0–1 = low, 2–3 = mid, 4+ = high (manual review before quoting).
create or replace function public.complexity_points(p_flags text[]) returns int language sql immutable as $$
  select count(*)::int from unnest(coalesce(p_flags, '{}')) f
  where f in ('prior_refusal', 'gaps', 'security_history', 'inconsistent_forms', 'expired_docs', 'other_country', 'urgent_deadline')
$$;
create or replace function public.complexity_factor(p_points int) returns numeric language sql stable security definer set search_path = public as $$
  select case when p_points <= 1 then coalesce((pricing->'complexity'->>'low')::numeric, 1.00)
              when p_points <= 3 then coalesce((pricing->'complexity'->>'mid')::numeric, 1.15)
              else coalesce((pricing->'complexity'->>'high')::numeric, 1.30) end
  from public.org_settings where id = 1
$$;

-- Application fields on cases
alter table public.cases add column if not exists visa_office text;
alter table public.cases add column if not exists next_action text;
alter table public.cases add column if not exists next_action_on date;

-- ───────────── 3. Representation forms: IMM 5476 and IMM 5744 (wet ink — never e-signed) ─────────────
create table if not exists public.rep_forms (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  case_id      uuid references public.cases(id) on delete set null,
  form         text not null check (form in ('IMM5476', 'IMM5744')),
  state        text not null default 'printed' check (state in ('not_needed', 'printed', 'signed', 'scanned', 'filed', 'withdrawn')),
  paid_box     text check (paid_box in ('paid', 'unpaid')),
  signed_on    date,
  filed_on     date,
  withdrawn_on date,
  expires_on   date,
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rep_forms_contact on public.rep_forms(contact_id);
create trigger rep_forms_touch before update on public.rep_forms for each row execute function public.touch_updated_at();
create or replace function public.rep_forms_guard() returns trigger language plpgsql set search_path = public as $$
declare v_months int;
begin
  if new.state in ('signed', 'scanned', 'filed') and new.signed_on is null then
    raise exception '% must have the date it was signed in ink (YYYY-MM-DD).', new.form;
  end if;
  if new.signed_on is not null and new.signed_on > current_date then raise exception 'The signature date cannot be in the future.'; end if;
  if new.state = 'filed' and new.filed_on is null then new.filed_on := current_date; end if;
  if new.state = 'withdrawn' and new.withdrawn_on is null then new.withdrawn_on := current_date; end if;
  if new.form = 'IMM5476' and new.state in ('signed', 'scanned', 'filed') and new.paid_box is null then
    raise exception 'Record which representative box was ticked on the IMM 5476 (paid or unpaid).';
  end if;
  if new.form = 'IMM5744' and new.signed_on is not null then
    select coalesce((rules->>'imm5744_valid_months')::int, 12) into v_months from public.org_settings where id = 1;
    new.expires_on := (new.signed_on + make_interval(months => v_months))::date;
  end if;
  return new;
end $$;
create trigger rep_forms_guard before insert or update on public.rep_forms for each row execute function public.rep_forms_guard();
alter table public.rep_forms enable row level security;
create policy rep_forms_select on public.rep_forms for select to authenticated using (public.has_perm('crm.view'));
create policy rep_forms_write on public.rep_forms for all to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));

-- ───────────── 4. Deadlines (14 / 7 / 2-day alerts) ─────────────
create table if not exists public.deadlines (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  case_id       uuid references public.cases(id) on delete set null,
  title         text not null check (char_length(title) between 2 and 300),
  due_on        date not null,
  kind          text not null default 'ircc_letter' check (kind in ('ircc_letter', 'medical', 'biometrics', 'passport', 'imm5744', 'status_check', 'court', 'internal', 'agreement_end', 'other')),
  source        text,
  owner         text not null default 'us' check (owner in ('us', 'client', 'ircc')),
  assigned_to   uuid references public.profiles(id),
  done          boolean not null default false,
  done_at       timestamptz,
  response_sent boolean not null default false,
  correspondence_id uuid,
  alerts_sent   int[] not null default '{}',
  note          text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists deadlines_open on public.deadlines(due_on) where not done;
create index if not exists deadlines_contact on public.deadlines(contact_id);
alter table public.deadlines enable row level security;
create policy deadlines_select on public.deadlines for select to authenticated using (public.has_perm('crm.view'));
create policy deadlines_write on public.deadlines for all to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));
alter table public.key_dates add column if not exists alerts_sent int[] not null default '{}';

-- ───────────── 5. Correspondence log ─────────────
create table if not exists public.correspondence (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  case_id         uuid references public.cases(id) on delete set null,
  occurred_on     date not null default current_date,
  direction       text not null check (direction in ('in', 'out')),
  party           text not null default 'ircc' check (party in ('ircc', 'client', 'payer', 'sponsor', 'other')),
  channel         text not null default 'IRCC portal' check (char_length(channel) <= 60),
  subject         text not null check (char_length(subject) between 2 and 300),
  summary         text,
  response_days   int check (response_days is null or response_days between 1 and 365),
  in_scope        boolean,
  client_informed boolean not null default false,
  client_informed_on date,
  addendum_status text check (addendum_status in ('pending', 'offered', 'accepted', 'declined', 'not_needed')),
  deadline_id     uuid references public.deadlines(id) on delete set null,
  task_id         uuid references public.tasks(id) on delete set null,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists correspondence_contact on public.correspondence(contact_id, occurred_on desc);
alter table public.correspondence enable row level security;
create policy correspondence_select on public.correspondence for select to authenticated using (public.has_perm('crm.view'));
create policy correspondence_update on public.correspondence for update to authenticated using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));
create policy correspondence_delete on public.correspondence for delete to authenticated using (public.has_perm('crm.edit'));
-- Inserts go through log_correspondence so the deadline and the scope task are always created together.

create or replace function public.log_correspondence(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.correspondence; v_dl uuid; v_task uuid; v_contact uuid := (p->>'contact_id')::uuid; v_name text;
  v_in_ircc boolean := p->>'direction' = 'in' and coalesce(p->>'party', 'ircc') = 'ircc';
begin
  if not public.has_perm('crm.edit') then raise exception 'You do not have permission to log correspondence.'; end if;
  select full_name into v_name from public.contacts where id = v_contact;
  if v_name is null then raise exception 'Client not found.'; end if;
  if v_in_ircc and p->'in_scope' is null or v_in_ircc and jsonb_typeof(p->'in_scope') = 'null' then
    raise exception 'Answer the scope question: is this IRCC letter inside the current scope?';
  end if;
  insert into public.correspondence (contact_id, case_id, occurred_on, direction, party, channel, subject, summary, response_days, in_scope,
    client_informed, client_informed_on, addendum_status, created_by)
  values (v_contact, nullif(p->>'case_id', '')::uuid, coalesce(nullif(p->>'occurred_on', '')::date, current_date), p->>'direction', coalesce(p->>'party', 'ircc'),
    coalesce(nullif(p->>'channel', ''), 'IRCC portal'), p->>'subject', nullif(p->>'summary', ''), nullif(p->>'response_days', '')::int,
    case when v_in_ircc then (p->>'in_scope')::boolean end, coalesce((p->>'client_informed')::boolean, false),
    case when coalesce((p->>'client_informed')::boolean, false) then current_date end,
    case when v_in_ircc and not (p->>'in_scope')::boolean then 'pending' end, auth.uid())
  returning * into v;
  -- An IRCC letter with a response period creates the deadline.
  if v_in_ircc and v.response_days is not null then
    insert into public.deadlines (contact_id, case_id, title, due_on, kind, source, owner, assigned_to, correspondence_id, created_by)
    values (v.contact_id, v.case_id, 'Respond to IRCC: ' || v.subject, v.occurred_on + v.response_days, 'ircc_letter',
      'IRCC letter of ' || to_char(v.occurred_on, 'YYYY-MM-DD') || ' (' || v.response_days || ' days)', 'us',
      coalesce((select assigned_to from public.contacts where id = v.contact_id), auth.uid()), v.id, auth.uid())
    returning id into v_dl;
  end if;
  -- Out of scope: forward it to the client today and offer an addendum.
  if v_in_ircc and not v.in_scope then
    insert into public.tasks (title, details, contact_id, due_date, priority, assigned_to, created_by)
    values ('Forward IRCC letter to ' || v_name || ' today and offer an addendum',
      'The IRCC letter "' || v.subject || '" is outside the current scope. Send the client the letter the same day, explain any deadline, and offer an addendum (Agreements → Amendment) before doing any work on it.',
      v.contact_id, current_date, 'urgent', coalesce((select assigned_to from public.contacts where id = v.contact_id), auth.uid()), auth.uid())
    returning id into v_task;
  end if;
  update public.correspondence set deadline_id = v_dl, task_id = v_task where id = v.id;
  perform public.log_audit('correspondence_logged', 'contact', v.contact_id::text, jsonb_build_object('subject', v.subject, 'in_scope', v.in_scope, 'deadline', v_dl is not null));
  return jsonb_build_object('id', v.id, 'deadline_id', v_dl, 'task_id', v_task, 'due_on', case when v_dl is not null then v.occurred_on + v.response_days end);
end $$;
revoke execute on function public.log_correspondence(jsonb) from public, anon;
grant execute on function public.log_correspondence(jsonb) to authenticated;

-- ───────────── 6. Promo codes and quotes ─────────────
create table if not exists public.promo_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  kind       text not null default 'percent' check (kind in ('percent', 'fixed')),
  value      numeric(10,2) not null check (value > 0),
  starts_on  date,
  ends_on    date,
  item_ids   uuid[] not null default '{}',     -- empty = every professional service
  use_limit  int check (use_limit is null or use_limit > 0),
  uses       int not null default 0,
  active     boolean not null default true,
  terms      text,                              -- written terms of the promotion (kept on record)
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
alter table public.promo_codes enable row level security;
create policy promo_select on public.promo_codes for select to authenticated using (public.has_perm('finance.view') or public.has_perm('settings.manage'));
create policy promo_write on public.promo_codes for all to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create sequence if not exists public.quote_number_seq;
create table if not exists public.quotes (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique default ('Q-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quote_number_seq')::text, 4, '0')),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  case_id           uuid references public.cases(id) on delete set null,
  payer_contact_id  uuid references public.contacts(id) on delete set null,
  bill_to           jsonb,
  lines             jsonb not null default '[]'::jsonb,
  complexity_points int not null default 0,
  complexity_factor numeric(6,3) not null default 1,
  promo_code        text,
  discount_pct      numeric(6,2),
  discount_reason   text,
  discount_approved_by uuid references public.profiles(id),
  base_total        numeric(12,2) not null default 0,
  addons_total      numeric(12,2) not null default 0,
  fee_subtotal      numeric(12,2) not null default 0,
  discount_amount   numeric(12,2) not null default 0,
  fee_total         numeric(12,2) not null default 0,
  gst_rate          numeric(5,2) not null default 0,
  gst               numeric(12,2) not null default 0,
  disbursements     numeric(12,2) not null default 0,
  amount_due        numeric(12,2) not null default 0,
  status            text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'invoiced', 'void')),
  invoice_id        uuid references public.invoices(id) on delete set null,
  notes             text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger quotes_touch before update on public.quotes for each row execute function public.touch_updated_at();
alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select to authenticated using (public.has_perm('finance.view'));
create policy quotes_delete on public.quotes for delete to authenticated using (public.has_perm('finance.manage') and status = 'draft');
-- Inserts and updates only through save_quote / quote_status / quote_to_invoice, so the totals are always the server's.

-- Pure calculation, also used by the tests: the design document's formula.
--   base = Σ service lines; add-ons = % of base (× qty) or fixed × qty; subtotal = (base + add-ons) × complexity factor
--   discount (professional fees only) = promo or manual %, on eligible services (× factor) ; fee total = subtotal − discount
--   GST = rate × fee total; disbursements at cost, never discounted; amount due = fee total + GST + disbursements
create or replace function public._quote_totals(p_lines jsonb, p_factor numeric, p_gst_rate numeric, p_disc_kind text, p_disc_value numeric, p_eligible_ids uuid[])
returns jsonb language plpgsql immutable as $$
declare l jsonb; v_base numeric := 0; v_add numeric := 0; v_disb numeric := 0; v_elig numeric := 0; v_sub numeric; v_disc numeric := 0; v_fee numeric; v_gst numeric;
  v_qty numeric; v_amt numeric;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce(nullif(l->>'qty', '')::numeric, 1);
    if v_qty <= 0 then raise exception 'Quantities must be more than zero.'; end if;
    if coalesce(l->>'kind', 'service') = 'service' then
      v_amt := round(v_qty * coalesce(nullif(l->>'unit_price', '')::numeric, 0), 2);
      if v_amt < 0 then raise exception 'Service prices cannot be negative; use a discount instead.'; end if;
      v_base := v_base + v_amt;
      if p_eligible_ids is null or cardinality(p_eligible_ids) = 0 or (l->>'item_id') = any (p_eligible_ids::text[]) then v_elig := v_elig + v_amt; end if;
    elsif l->>'kind' = 'disb' then
      v_disb := v_disb + round(v_qty * coalesce(nullif(l->>'unit_price', '')::numeric, 0), 2);
    end if;
  end loop;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if l->>'kind' = 'addon' then
      v_qty := coalesce(nullif(l->>'qty', '')::numeric, 1);
      v_add := v_add + case when nullif(l->>'pct', '') is not null then round(v_base * (l->>'pct')::numeric / 100 * v_qty, 2)
                            else round(v_qty * coalesce(nullif(l->>'unit_price', '')::numeric, 0), 2) end;
    end if;
  end loop;
  v_sub := round((v_base + v_add) * coalesce(p_factor, 1), 2);
  -- A manual discount or an unrestricted promo applies to all professional fees; a promo limited to some services, to those services.
  v_elig := case when p_eligible_ids is null or cardinality(p_eligible_ids) = 0 then v_sub else round(v_elig * coalesce(p_factor, 1), 2) end;
  if p_disc_kind = 'percent' then v_disc := round(v_elig * p_disc_value / 100, 2);
  elsif p_disc_kind = 'fixed' then v_disc := least(p_disc_value, v_elig); end if;
  v_fee := v_sub - v_disc;
  v_gst := round(v_fee * coalesce(p_gst_rate, 0) / 100, 2);
  return jsonb_build_object('base_total', v_base, 'addons_total', v_add, 'fee_subtotal', v_sub, 'discount_amount', v_disc, 'fee_total', v_fee,
    'gst', v_gst, 'disbursements', v_disb, 'amount_due', v_fee + v_gst + v_disb);
end $$;

-- Check a promo code for a set of lines: active, in its dates, under its use limit, and at least one service it covers.
create or replace function public.check_promo(p_code text, p_lines jsonb) returns public.promo_codes
language plpgsql stable security definer set search_path = public as $$
declare v public.promo_codes;
begin
  select * into v from public.promo_codes where code = upper(trim(p_code));
  if v.id is null then raise exception 'Promo code % does not exist.', upper(trim(p_code)); end if;
  if not v.active then raise exception 'Promo code % is not active.', v.code; end if;
  if v.starts_on is not null and current_date < v.starts_on then raise exception 'Promo code % starts on %.', v.code, v.starts_on; end if;
  if v.ends_on is not null and current_date > v.ends_on then raise exception 'Promo code % expired on %.', v.code, v.ends_on; end if;
  if v.use_limit is not null and v.uses >= v.use_limit then raise exception 'Promo code % has reached its use limit (%).', v.code, v.use_limit; end if;
  if cardinality(v.item_ids) > 0 and not exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
      where coalesce(l->>'kind', 'service') = 'service' and (l->>'item_id') = any (v.item_ids::text[])) then
    raise exception 'Promo code % does not apply to any service on this quote.', v.code;
  end if;
  return v;
end $$;

create or replace function public.save_quote(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; q public.quotes; s public.org_settings; v_flags text[]; v_points int; v_factor numeric;
  v_promo public.promo_codes; v_kind text; v_val numeric; v_ids uuid[]; v_pct numeric; v_max numeric; v_t jsonb; v_rate numeric; v_approver uuid;
begin
  if not public.has_perm('finance.manage') then raise exception 'You do not have permission to prepare quotes.'; end if;
  select * into s from public.org_settings where id = 1;
  if v_id is not null then
    select * into q from public.quotes where id = v_id for update;
    if q.id is null then raise exception 'Quote not found.'; end if;
    if q.status <> 'draft' then raise exception 'Quote % is %; only drafts can be changed.', q.number, q.status; end if;
  end if;
  select risk_flags into v_flags from public.client_files where contact_id = (p->>'contact_id')::uuid;
  v_points := public.complexity_points(v_flags);
  -- The factor follows the risk flags unless the RCIC picks another tier on the quote.
  v_factor := case p->>'tier' when 'low' then (s.pricing->'complexity'->>'low')::numeric when 'mid' then (s.pricing->'complexity'->>'mid')::numeric
                when 'high' then (s.pricing->'complexity'->>'high')::numeric else public.complexity_factor(v_points) end;
  v_rate := case when coalesce(s.gst_number, '') <> '' then s.gst_rate else 0 end;
  v_pct := nullif(p->>'discount_pct', '')::numeric;
  if nullif(trim(coalesce(p->>'promo_code', '')), '') is not null and v_pct is not null then
    raise exception 'Use either a promo code or a manual discount on one quote, not both.';
  end if;
  if nullif(trim(coalesce(p->>'promo_code', '')), '') is not null then
    v_promo := public.check_promo(p->>'promo_code', p->'lines'); v_kind := v_promo.kind; v_val := v_promo.value; v_ids := v_promo.item_ids;
  elsif v_pct is not null and v_pct > 0 then
    if coalesce(trim(p->>'discount_reason'), '') = '' then raise exception 'A manual discount needs a reason (returning client, hardship, community event, bundle…).'; end if;
    v_max := coalesce((s.pricing->>'max_discount_pct')::numeric, 20);
    if v_pct > 100 then raise exception 'A discount cannot be more than 100%%.'; end if;
    if v_pct > v_max then
      if not public.has_perm('pricing.approve') then
        raise exception 'A % %% discount is above the maximum of % %%. Ask the RCIC to approve it.', v_pct, v_max;
      end if;
      v_approver := auth.uid();
    end if;
    v_kind := 'percent'; v_val := v_pct;
  end if;
  v_t := public._quote_totals(p->'lines', v_factor, v_rate, v_kind, v_val, v_ids);
  if v_id is null then
    insert into public.quotes (contact_id, created_by) values ((p->>'contact_id')::uuid, auth.uid()) returning * into q;
  end if;
  update public.quotes set
    case_id = nullif(p->>'case_id', '')::uuid, payer_contact_id = nullif(p->>'payer_contact_id', '')::uuid, bill_to = case when jsonb_typeof(p->'bill_to') = 'object' then p->'bill_to' end,
    lines = coalesce(p->'lines', '[]'::jsonb), complexity_points = v_points, complexity_factor = v_factor,
    promo_code = v_promo.code, discount_pct = case when v_promo.id is null and v_pct > 0 then v_pct end,
    discount_reason = case when v_promo.id is null and v_pct > 0 then trim(p->>'discount_reason') end, discount_approved_by = v_approver,
    base_total = (v_t->>'base_total')::numeric, addons_total = (v_t->>'addons_total')::numeric, fee_subtotal = (v_t->>'fee_subtotal')::numeric,
    discount_amount = (v_t->>'discount_amount')::numeric, fee_total = (v_t->>'fee_total')::numeric, gst_rate = v_rate, gst = (v_t->>'gst')::numeric,
    disbursements = (v_t->>'disbursements')::numeric, amount_due = (v_t->>'amount_due')::numeric, notes = nullif(p->>'notes', '')
  where id = q.id returning * into q;
  return to_jsonb(q) || jsonb_build_object('manual_review', v_points >= 4);
end $$;

create or replace function public.quote_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare q public.quotes;
begin
  if not public.has_perm('finance.manage') then raise exception 'You do not have permission to change quotes.'; end if;
  select * into q from public.quotes where id = p_id for update;
  if q.id is null then raise exception 'Quote not found.'; end if;
  if p_status not in ('draft', 'sent', 'accepted', 'void') then raise exception 'Unknown status.'; end if;
  if q.status = 'invoiced' then raise exception 'Quote % is already invoiced; void the invoice instead.', q.number; end if;
  update public.quotes set status = p_status where id = p_id;
end $$;

-- Turn a quote into a draft invoice: service and add-on lines, a complexity line, the discount line, disbursements at cost (no GST).
create or replace function public.quote_to_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare q public.quotes; v_inv uuid; l jsonb; v_pos int := 0; v_service uuid; v_disb uuid; v_tax boolean; v_adj numeric; v_amt numeric; v_promo public.promo_codes;
begin
  if not public.has_perm('finance.manage') then raise exception 'You do not have permission to create invoices.'; end if;
  select * into q from public.quotes where id = p_id for update;
  if q.id is null then raise exception 'Quote not found.'; end if;
  if q.status in ('invoiced', 'void') then raise exception 'Quote % is %.', q.number, q.status; end if;
  if q.promo_code is not null then v_promo := public.check_promo(q.promo_code, q.lines); end if;   -- still valid today
  v_service := public.acct('service_income');
  select id into v_disb from public.accounts where code = '6100';
  v_disb := coalesce(v_disb, v_service);
  v_tax := q.gst_rate > 0;
  insert into public.invoices (contact_id, case_id, bill_to, notes, created_by)
  values (q.contact_id, q.case_id, q.bill_to, 'From quote ' || q.number, auth.uid()) returning id into v_inv;
  for l in select * from jsonb_array_elements(q.lines) loop
    continue when l->>'kind' = 'disb';
    v_pos := v_pos + 1;
    v_amt := case when l->>'kind' = 'addon' and nullif(l->>'pct', '') is not null then round(q.base_total * (l->>'pct')::numeric / 100, 2) else coalesce(nullif(l->>'unit_price', '')::numeric, 0) end;
    insert into public.invoice_lines (invoice_id, position, item_id, description, quantity, unit_price, taxable, tax_rate, account_id)
    values (v_inv, v_pos, case when l->>'kind' = 'service' then nullif(l->>'item_id', '')::uuid end,
      coalesce(l->>'name', 'Service') || case when l->>'kind' = 'addon' and nullif(l->>'pct', '') is not null then ' (' || (l->>'pct') || '% of base)' else '' end,
      coalesce(nullif(l->>'qty', '')::numeric, 1), v_amt, v_tax, q.gst_rate,
      coalesce((select income_account_id from public.items where id = nullif(l->>'item_id', '')::uuid), v_service));
  end loop;
  v_adj := q.fee_subtotal - q.base_total - q.addons_total;
  if v_adj <> 0 then
    v_pos := v_pos + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price, taxable, tax_rate, account_id)
    values (v_inv, v_pos, 'Complexity adjustment (×' || trim(to_char(q.complexity_factor, 'FM9.00')) || ')', 1, v_adj, v_tax, q.gst_rate, v_service);
  end if;
  if q.discount_amount > 0 then
    v_pos := v_pos + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price, taxable, tax_rate, account_id)
    values (v_inv, v_pos, case when q.promo_code is not null then 'Promo code ' || q.promo_code else 'Discount (' || trim(to_char(q.discount_pct, 'FM990.##')) || '%) — ' || coalesce(q.discount_reason, '') end,
      1, -q.discount_amount, v_tax, q.gst_rate, v_service);
  end if;
  for l in select * from jsonb_array_elements(q.lines) loop
    continue when l->>'kind' <> 'disb';
    v_pos := v_pos + 1;
    insert into public.invoice_lines (invoice_id, position, description, quantity, unit_price, taxable, tax_rate, account_id)
    values (v_inv, v_pos, coalesce(l->>'name', 'Disbursement') || ' (disbursement at cost)', coalesce(nullif(l->>'qty', '')::numeric, 1),
      coalesce(nullif(l->>'unit_price', '')::numeric, 0), false, 0, v_disb);
  end loop;
  if v_promo.id is not null then update public.promo_codes set uses = uses + 1 where id = v_promo.id; end if;
  update public.quotes set status = 'invoiced', invoice_id = v_inv where id = q.id;
  perform public.log_audit('quote_invoiced', 'quote', q.id::text, jsonb_build_object('number', q.number, 'invoice_id', v_inv, 'amount_due', q.amount_due));
  return v_inv;
end $$;
revoke execute on function public.save_quote(jsonb), public.quote_status(uuid, text), public.quote_to_invoice(uuid), public.check_promo(text, jsonb) from public, anon;
grant execute on function public.save_quote(jsonb), public.quote_status(uuid, text), public.quote_to_invoice(uuid), public.check_promo(text, jsonb) to authenticated;

-- ───────────── 7. Monthly reconciliation sign-off (bank statement, journal, client ledgers) ─────────────
create table if not exists public.month_closes (
  month      date primary key check (extract(day from month) = 1),
  bank_ok    boolean not null default false,
  journal_ok boolean not null default false,
  ledgers_ok boolean not null default false,
  note       text,
  signed_by  uuid references public.profiles(id),
  signed_at  timestamptz
);
alter table public.month_closes enable row level security;
create policy month_closes_select on public.month_closes for select to authenticated using (public.has_perm('finance.view'));
create or replace function public.sign_month_close(p_month date, p_bank boolean, p_journal boolean, p_ledgers boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date;
begin
  if not public.has_perm('finance.manage') then raise exception 'You do not have permission to sign off reconciliations.'; end if;
  if v_m >= date_trunc('month', current_date)::date then raise exception 'You can sign off a month only after it ends.'; end if;
  if not (p_bank and p_journal and p_ledgers) then
    raise exception 'The month stays open until the bank statement, the journal and every client ledger match.';
  end if;
  insert into public.month_closes (month, bank_ok, journal_ok, ledgers_ok, note, signed_by, signed_at)
  values (v_m, true, true, true, nullif(trim(p_note), ''), auth.uid(), now())
  on conflict (month) do update set bank_ok = true, journal_ok = true, ledgers_ok = true, note = excluded.note, signed_by = excluded.signed_by, signed_at = now();
  perform public.log_audit('month_reconciled', 'month_close', v_m::text, '{}'::jsonb);
end $$;
revoke execute on function public.sign_month_close(date, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.sign_month_close(date, boolean, boolean, boolean, text) to authenticated;

-- ───────────── 8. Closing a file ─────────────
-- A file closes only when: no unpaid invoices, client account balance zero, every IMM 5476 withdrawn (Section D) or not needed,
-- a closing letter generated, and a retention date set.
create or replace function public.file_closing_check(p_contact uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_open int; v_trust numeric; v_rep int; v_letter text; v_ret date;
begin
  if not public.has_perm('crm.view') then raise exception 'Not allowed.'; end if;
  select count(*) into v_open from public.invoices where contact_id = p_contact and status in ('draft', 'open', 'partial');
  v_trust := public.trust_balance(p_contact);
  select count(*) into v_rep from public.rep_forms where contact_id = p_contact and form = 'IMM5476' and state in ('printed', 'signed', 'scanned', 'filed');
  select number into v_letter from public.agreements where contact_id = p_contact and type = 'termination' and status <> 'void' order by created_at desc limit 1;
  select retention_until into v_ret from public.client_files where contact_id = p_contact;
  return jsonb_build_array(
    jsonb_build_object('key', 'invoices', 'ok', v_open = 0, 'label', 'Final invoice sent and paid (no draft or unpaid invoices)', 'detail', case when v_open > 0 then v_open || ' invoice(s) still draft or unpaid' end),
    jsonb_build_object('key', 'trust', 'ok', v_trust = 0, 'label', 'Client account balance is zero (moved to operating or refunded)', 'detail', case when v_trust <> 0 then 'Balance ' || v_trust end),
    jsonb_build_object('key', 'withdrawal', 'ok', v_rep = 0, 'label', 'IMM 5476 Section D withdrawal recorded (or not needed)', 'detail', case when v_rep > 0 then v_rep || ' IMM 5476 still active' end),
    jsonb_build_object('key', 'letter', 'ok', v_letter is not null, 'label', 'Closing letter generated', 'detail', v_letter),
    jsonb_build_object('key', 'retention', 'ok', v_ret is not null, 'label', 'Retention-until date set', 'detail', v_ret::text));
end $$;
create or replace function public.close_client_file(p_contact uuid, p_retention date) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_fail text;
begin
  if not public.has_perm('files.close') then raise exception 'Only the RCIC can close a client file.'; end if;
  insert into public.client_files (contact_id, retention_until, updated_by) values (p_contact, p_retention, auth.uid())
  on conflict (contact_id) do update set retention_until = coalesce(p_retention, client_files.retention_until), updated_by = auth.uid();
  v := public.file_closing_check(p_contact);
  select string_agg(x->>'label', '; ') into v_fail from jsonb_array_elements(v) x where not (x->>'ok')::boolean;
  if v_fail is not null then raise exception 'The file cannot be closed yet: %', v_fail; end if;
  update public.client_files set closed_at = now(), closed_by = auth.uid(), closing = v where contact_id = p_contact;
  perform public.log_audit('file_closed', 'contact', p_contact::text, jsonb_build_object('checks', v));
end $$;
create or replace function public.reopen_client_file(p_contact uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('files.close') then raise exception 'Only the RCIC can reopen a client file.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for reopening the file.'; end if;
  update public.client_files set closed_at = null, closed_by = null where contact_id = p_contact;
  perform public.log_audit('file_reopened', 'contact', p_contact::text, jsonb_build_object('reason', p_reason));
end $$;
revoke execute on function public.file_closing_check(uuid), public.close_client_file(uuid, date), public.reopen_client_file(uuid, text) from public, anon;
grant execute on function public.file_closing_check(uuid), public.close_client_file(uuid, date), public.reopen_client_file(uuid, text) to authenticated;

-- ───────────── 9. More agreement types ─────────────
alter table public.agreements drop constraint agreements_type_check;
alter table public.agreements add constraint agreements_type_check
  check (type in ('consultation', 'retainer', 'amendment', 'non_engagement', 'termination',
                  'limited_scope', 'doc_review', 'payer', 'conflict', 'monitoring', 'consent_share'));
create or replace function public.agreement_code(p_type text, p_joint boolean default false) returns text language sql immutable as $$
  select case
    when p_type = 'retainer' and p_joint then 'JA' when p_type = 'consultation' and p_joint then 'JC'
    when p_type = 'consultation' then 'CA' when p_type = 'retainer' then 'SA' when p_type = 'joint' then 'JA'
    when p_type = 'amendment' then 'AM' when p_type = 'non_engagement' then 'NE' when p_type = 'termination' then 'TL'
    when p_type = 'limited_scope' then 'LS' when p_type = 'doc_review' then 'DR' when p_type = 'payer' then 'PA'
    when p_type = 'conflict' then 'CC' when p_type = 'monitoring' then 'MP' when p_type = 'consent_share' then 'CS' else 'AG' end
$$;

-- ───────────── 10. Weekly report data (screen and email) ─────────────
create or replace function public.weekly_report_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_service boolean := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role';
  v_fin boolean;
begin
  if not v_service and not public.has_perm('crm.view') then raise exception 'Not allowed.'; end if;
  v_fin := v_service or public.has_perm('finance.view');
  return jsonb_build_object(
    'generated_at', now(),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'contact_id', d.contact_id, 'client', c.full_name, 'title', d.title, 'due_on', d.due_on, 'owner', d.owner, 'kind', d.kind) order by d.due_on)
      from public.deadlines d join public.contacts c on c.id = d.contact_id where not d.done and d.due_on <= current_date + 14), '[]'),
    'expiring', coalesce((select jsonb_agg(jsonb_build_object('contact_id', k.contact_id, 'client', c.full_name, 'doc', k.doc_type, 'expires_on', k.expires_on) order by k.expires_on)
      from public.key_dates k join public.contacts c on c.id = k.contact_id where k.expires_on <= current_date + 60), '[]'),
    'unsigned_agreements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'contact_id', a.contact_id, 'client', c.full_name, 'number', a.number, 'type', a.type, 'status', a.status, 'sent_at', a.sent_at) order by a.created_at)
      from public.agreements a join public.contacts c on c.id = a.contact_id where a.status in ('draft', 'sent', 'viewed')), '[]'),
    'rep_forms', coalesce((select jsonb_agg(jsonb_build_object('contact_id', r.contact_id, 'client', c.full_name, 'form', r.form, 'state', r.state, 'expires_on', r.expires_on))
      from public.rep_forms r join public.contacts c on c.id = r.contact_id
      where r.state in ('printed', 'signed', 'scanned') or (r.form = 'IMM5744' and r.state <> 'withdrawn' and r.expires_on <= current_date + 30)), '[]'),
    'unpaid_invoices', case when v_fin then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'contact_id', i.contact_id, 'client', c.full_name, 'number', i.number, 'due_date', i.due_date, 'balance', i.balance) order by i.due_date)
      from public.invoices i join public.contacts c on c.id = i.contact_id where i.status in ('open', 'partial')), '[]') end,
    'trust_balances', case when v_fin then coalesce((select jsonb_agg(jsonb_build_object('contact_id', x.contact_id, 'client', c.full_name, 'balance', x.bal, 'last', x.last) order by c.full_name)
      from (select contact_id, public.trust_balance(contact_id) bal, max(txn_date) last from public.trust_transactions group by contact_id) x
      join public.contacts c on c.id = x.contact_id where x.bal <> 0), '[]') end,
    'out_of_scope', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'contact_id', r.contact_id, 'client', c.full_name, 'subject', r.subject, 'occurred_on', r.occurred_on, 'client_informed', r.client_informed))
      from public.correspondence r join public.contacts c on c.id = r.contact_id where r.addendum_status in ('pending', 'offered')), '[]'),
    'inactive', coalesce((select jsonb_agg(jsonb_build_object('contact_id', c.id, 'client', c.full_name, 'last', c.last_activity_at) order by c.last_activity_at nulls first)
      from public.contacts c left join public.client_files f on f.contact_id = c.id
      where c.stage = 'retained' and f.closed_at is null and coalesce(c.last_activity_at, c.created_at) < now() - interval '30 days'), '[]'),
    'month_open', case when v_fin then (select not exists (select 1 from public.month_closes where month = (date_trunc('month', current_date) - interval '1 month')::date)) end,
    'reconciliation_day', (select coalesce((rules->>'reconciliation_day')::int, 5) from public.org_settings where id = 1)
  );
end $$;
revoke execute on function public.weekly_report_data() from public, anon;
grant execute on function public.weekly_report_data() to authenticated, service_role;

-- ───────────── 11. Daily alerts and the Monday report by email ─────────────
-- Same shared secret as the IRCC alerts job (Vault 'ircc_alert_secret' = function secret IRCC_ALERT_SECRET).
select cron.unschedule('practice-alerts') where exists (select 1 from cron.job where jobname = 'practice-alerts');
select cron.schedule('practice-alerts', '10 13 * * *', $$
  select net.http_post(
    url := 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/practice-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-alert-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ircc_alert_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$$);
