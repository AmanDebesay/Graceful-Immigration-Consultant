-- Double-entry accounting: chart of accounts, journal, invoices, payments, trust, expenses, vendors, bills,
-- transfers, reconciliation and reports. The journal can only be written through the posting functions below,
-- so every entry balances and posted documents are corrected by voiding, never by editing.

create type public.account_type as enum ('asset','liability','equity','income','expense');

-- ── Chart of accounts ──
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  type        public.account_type not null,
  subtype     text not null default 'other',   -- bank, trust_bank, ar, ap, tax, trust_liability, credit_card, fixed_asset, equity, retained, income, expense, cogs, other
  system_key  text unique,                      -- accounts the posting logic relies on
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.accounts (code, name, type, subtype, system_key, description) values
  ('1000','Operating Bank Account','asset','bank','operating_bank','Business chequing account for earned fees and expenses'),
  ('1010','Trust Bank Account (Client Funds)','asset','trust_bank','trust_bank','Client money held in trust until fees are earned (CICC client account)'),
  ('1050','Petty Cash','asset','bank',null,null),
  ('1100','Accounts Receivable','asset','ar','ar','Unpaid client invoices'),
  ('1500','Computer & Office Equipment','asset','fixed_asset',null,null),
  ('2000','Accounts Payable','liability','ap','ap','Unpaid vendor bills'),
  ('2100','GST/HST Payable','liability','tax','gst','GST collected less input tax credits'),
  ('2200','Client Trust Liability','liability','trust_liability','trust_liability','Money owed back to clients until earned'),
  ('2300','Business Credit Card','liability','credit_card',null,null),
  ('3000','Owner''s Equity','equity','equity',null,null),
  ('3100','Owner''s Draws','equity','equity',null,null),
  ('3900','Retained Earnings','equity','retained','retained',null),
  ('4000','Consultation Fees','income','income','consult_income',null),
  ('4100','Professional Fees - Applications','income','income','service_income',null),
  ('4200','Recruitment & Employer Services','income','income',null,null),
  ('4900','Other Income','income','income',null,null),
  ('5100','Advertising & Marketing','expense','expense',null,null),
  ('5200','Bank & Payment Processing Fees','expense','expense',null,null),
  ('5300','CICC Dues, Licences & Professional Development','expense','expense',null,null),
  ('5400','Insurance (E&O)','expense','expense',null,null),
  ('5500','Office Supplies','expense','expense',null,null),
  ('5600','Software & Subscriptions','expense','expense',null,null),
  ('5700','Telephone & Internet','expense','expense',null,null),
  ('5800','Rent','expense','expense',null,null),
  ('5900','Travel','expense','expense',null,null),
  ('6000','Meals & Entertainment','expense','expense',null,null),
  ('6100','Translation & Client Disbursements','expense','expense',null,null),
  ('6200','Contractors & Subcontractors','expense','expense',null,null),
  ('6300','Professional Fees (Accounting & Legal)','expense','expense',null,null),
  ('6900','Other Expenses','expense','expense',null,null);

alter table public.items add constraint items_income_account_fk foreign key (income_account_id) references public.accounts(id) on delete set null;
insert into public.items (name, description, unit_price, taxable, income_account_id) values
  ('30-Minute Consultation', 'Immigration consultation (30 minutes)', 30, true, (select id from public.accounts where code = '4000')),
  ('1-Hour Consultation', 'Immigration consultation (1 hour)', 60, true, (select id from public.accounts where code = '4000'));

create or replace function public.acct(p_key text) returns uuid
language sql stable security definer set search_path = public as $$ select id from public.accounts where system_key = p_key $$;

-- ── Journal ──
create table public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_no    bigint generated always as identity,
  entry_date  date not null,
  memo        text,
  source_type text not null check (source_type in ('invoice','invoice_void','payment','payment_void','expense','expense_void','bill','bill_void','bill_payment','trust','transfer','manual')),
  source_id   uuid,
  reverses    uuid references public.journal_entries(id),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index je_date_idx on public.journal_entries (entry_date);

create table public.journal_lines (
  id           bigint generated always as identity primary key,
  entry_id     uuid not null references public.journal_entries(id) on delete cascade,
  account_id   uuid not null references public.accounts(id),
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  contact_id   uuid references public.contacts(id) on delete set null,
  vendor_id    uuid,
  description  text,
  cleared      boolean not null default false,
  reconciled_id uuid,
  check (debit = 0 or credit = 0)
);
create index jl_account_idx on public.journal_lines (account_id);
create index jl_entry_idx on public.journal_lines (entry_id);
create index jl_contact_idx on public.journal_lines (contact_id);

-- Every entry must balance (checked at commit so multi-line inserts work)
create or replace function public.check_entry_balanced() returns trigger
language plpgsql as $$
declare v_id uuid := coalesce(new.entry_id, old.entry_id); v_d numeric; v_c numeric;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_d, v_c from public.journal_lines where entry_id = v_id;
  if v_d <> v_c then raise exception 'Journal entry is out of balance (debits % vs credits %)', v_d, v_c; end if;
  return null;
end $$;
create constraint trigger journal_balanced after insert or update or delete on public.journal_lines
  deferrable initially deferred for each row execute function public.check_entry_balanced();

-- Internal helper: create an entry from a JSON array of lines [{account_id, debit, credit, contact_id, vendor_id, description}]
create or replace function public._post_entry(p_date date, p_memo text, p_source text, p_source_id uuid, p_lines jsonb, p_reverses uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; l jsonb;
begin
  insert into public.journal_entries (entry_date, memo, source_type, source_id, reverses, created_by)
  values (p_date, p_memo, p_source, p_source_id, p_reverses, auth.uid()) returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l->>'debit')::numeric,0) = 0 and coalesce((l->>'credit')::numeric,0) = 0 then continue; end if;
    insert into public.journal_lines (entry_id, account_id, debit, credit, contact_id, vendor_id, description)
    values (v_id, (l->>'account_id')::uuid, round(coalesce((l->>'debit')::numeric,0),2), round(coalesce((l->>'credit')::numeric,0),2),
            nullif(l->>'contact_id','')::uuid, nullif(l->>'vendor_id','')::uuid, l->>'description');
  end loop;
  return v_id;
end $$;

-- Internal helper: post the exact reverse of an entry
create or replace function public._reverse_entry(p_entry uuid, p_date date, p_source text, p_memo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.journal_entries (entry_date, memo, source_type, source_id, reverses, created_by)
  select p_date, p_memo, p_source, source_id, id, auth.uid() from public.journal_entries where id = p_entry returning id into v_id;
  insert into public.journal_lines (entry_id, account_id, debit, credit, contact_id, vendor_id, description)
  select v_id, account_id, credit, debit, contact_id, vendor_id, 'Reversal: ' || coalesce(description,'') from public.journal_lines where entry_id = p_entry;
  return v_id;
end $$;

create or replace function public._require_finance() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.has_perm('finance.manage') then raise exception 'You do not have permission to change the books.'; end if; end $$;

-- ── Vendors ──
create table public.vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  address    text,
  notes      text,
  default_account_id uuid references public.accounts(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.journal_lines add constraint jl_vendor_fk foreign key (vendor_id) references public.vendors(id) on delete set null;

-- ── Invoices ──
create sequence public.invoice_number_seq start 1001;
create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('INV-' || nextval('public.invoice_number_seq')),
  contact_id    uuid not null references public.contacts(id),
  case_id       uuid references public.cases(id) on delete set null,
  issue_date    date not null default ((now() at time zone 'America/Edmonton')::date),
  due_date      date not null default ((now() at time zone 'America/Edmonton')::date + 14),
  status        text not null default 'draft' check (status in ('draft','open','partial','paid','void')),
  subtotal      numeric(14,2) not null default 0,
  tax_total     numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  amount_paid   numeric(14,2) not null default 0,
  balance       numeric(14,2) generated always as (total - amount_paid) stored,
  notes         text,
  terms         text default 'Payment due within 14 days. Thank you for choosing Graceful Immigration.',
  entry_id      uuid references public.journal_entries(id),
  sent_at       timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index invoices_contact_idx on public.invoices (contact_id);
create index invoices_status_idx on public.invoices (status);
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

create table public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  position    int not null default 0,
  item_id     uuid references public.items(id) on delete set null,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  taxable     boolean not null default true,
  tax_rate    numeric(5,2) not null default 0,
  account_id  uuid not null references public.accounts(id),
  amount      numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  tax_amount  numeric(14,2) generated always as (case when taxable then round(round(quantity * unit_price, 2) * tax_rate / 100, 2) else 0 end) stored
);
create index invoice_lines_inv_idx on public.invoice_lines (invoice_id);

-- Lines can only change while the invoice is a draft; totals follow the lines
create or replace function public.invoice_lines_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id); v_status text;
begin
  select status into v_status from public.invoices where id = v_inv;
  if v_status is not null and v_status <> 'draft' and current_setting('gi.posting', true) is distinct from 'on' then
    raise exception 'This invoice is posted. Void it and create a new one to make changes.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines for each row execute function public.invoice_lines_guard();

create or replace function public.invoice_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i set
    subtotal  = coalesce((select sum(amount) from public.invoice_lines where invoice_id = v_inv), 0),
    tax_total = coalesce((select sum(tax_amount) from public.invoice_lines where invoice_id = v_inv), 0),
    total     = coalesce((select sum(amount + tax_amount) from public.invoice_lines where invoice_id = v_inv), 0)
  where i.id = v_inv and i.status = 'draft';
  return null;
end $$;
create trigger invoice_lines_recalc after insert or update or delete on public.invoice_lines for each row execute function public.invoice_recalc();

create or replace function public.invoices_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'draft' and current_setting('gi.posting', true) is distinct from 'on' then
    if new.contact_id is distinct from old.contact_id or new.total is distinct from old.total or new.issue_date is distinct from old.issue_date
       or new.status is distinct from old.status or new.amount_paid is distinct from old.amount_paid then
      raise exception 'Posted invoices can only be changed through payments or voiding.';
    end if;
  end if;
  return new;
end $$;
create trigger invoices_guard before update on public.invoices for each row execute function public.invoices_guard();

create or replace function public.post_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.invoices; v_lines jsonb; v_entry uuid;
begin
  perform public._require_finance();
  select * into v from public.invoices where id = p_invoice for update;
  if v.status <> 'draft' then raise exception 'Only draft invoices can be posted.'; end if;
  if v.total <= 0 then raise exception 'Add at least one line with an amount before posting.'; end if;
  select jsonb_agg(x) into v_lines from (
    select jsonb_build_object('account_id', public.acct('ar'), 'debit', v.total, 'contact_id', v.contact_id, 'description', 'Invoice ' || v.number) x
    union all
    select jsonb_build_object('account_id', account_id, 'credit', sum(amount), 'contact_id', v.contact_id, 'description', 'Invoice ' || v.number)
      from public.invoice_lines where invoice_id = p_invoice group by account_id
    union all
    select jsonb_build_object('account_id', public.acct('gst'), 'credit', v.tax_total, 'contact_id', v.contact_id, 'description', 'GST on ' || v.number)
      where v.tax_total > 0
  ) s;
  v_entry := public._post_entry(v.issue_date, 'Invoice ' || v.number, 'invoice', p_invoice, v_lines);
  perform set_config('gi.posting', 'on', true);
  update public.invoices set status = 'open', entry_id = v_entry, sent_at = coalesce(sent_at, now()) where id = p_invoice;
  perform set_config('gi.posting', 'off', true);
  perform public.log_audit('posted', 'invoice', p_invoice::text, jsonb_build_object('number', v.number, 'total', v.total));
end $$;

create or replace function public.void_invoice(p_invoice uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.invoices;
begin
  perform public._require_finance();
  select * into v from public.invoices where id = p_invoice for update;
  if v.status = 'void' then raise exception 'Invoice is already void.'; end if;
  if v.amount_paid > 0 then raise exception 'Void the payments on this invoice first.'; end if;
  if v.entry_id is not null then
    perform public._reverse_entry(v.entry_id, (now() at time zone 'America/Edmonton')::date, 'invoice_void', 'Void invoice ' || v.number || coalesce(' - ' || p_reason, ''));
  end if;
  perform set_config('gi.posting', 'on', true);
  update public.invoices set status = 'void', notes = coalesce(notes || E'\n', '') || 'Voided: ' || coalesce(p_reason, '') where id = p_invoice;
  perform set_config('gi.posting', 'off', true);
  perform public.log_audit('voided', 'invoice', p_invoice::text, jsonb_build_object('number', v.number, 'reason', p_reason));
end $$;

-- ── Payments received ──
create sequence public.payment_number_seq start 1;
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique default ('PMT-' || lpad(nextval('public.payment_number_seq')::text, 5, '0')),
  contact_id    uuid not null references public.contacts(id),
  payment_date  date not null,
  amount        numeric(14,2) not null check (amount > 0),
  method        text not null check (method in ('etransfer','cash','cheque','card','bank','trust','other')),
  deposit_account_id uuid references public.accounts(id),
  reference     text,
  memo          text,
  entry_id      uuid references public.journal_entries(id),
  voided        boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create table public.payment_applications (
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  amount     numeric(14,2) not null check (amount > 0),
  primary key (payment_id, invoice_id)
);

create or replace function public.trust_balance(p_contact uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(credit - debit), 0) from public.journal_lines where account_id = public.acct('trust_liability') and contact_id = p_contact
$$;

create or replace function public.receive_payment(p_contact uuid, p_date date, p_method text, p_deposit_account uuid,
  p_reference text, p_memo text, p_applications jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_total numeric := 0; a jsonb; v_inv public.invoices; v_pay uuid; v_lines jsonb; v_entry uuid; v_deposit uuid;
begin
  perform public._require_finance();
  for a in select * from jsonb_array_elements(p_applications) loop
    select * into v_inv from public.invoices where id = (a->>'invoice_id')::uuid for update;
    if v_inv.contact_id <> p_contact then raise exception 'Invoice % belongs to another client.', v_inv.number; end if;
    if v_inv.status not in ('open','partial') then raise exception 'Invoice % is not open.', v_inv.number; end if;
    if (a->>'amount')::numeric > v_inv.balance then raise exception 'Payment on % is more than its balance.', v_inv.number; end if;
    v_total := v_total + (a->>'amount')::numeric;
  end loop;
  if v_total <= 0 then raise exception 'Enter an amount to apply to at least one invoice.'; end if;

  v_deposit := case when p_method = 'trust' then public.acct('operating_bank') else coalesce(p_deposit_account, public.acct('operating_bank')) end;
  if p_method = 'trust' and public.trust_balance(p_contact) < v_total then
    raise exception 'Not enough money in this client''s trust balance (available %).', public.trust_balance(p_contact);
  end if;

  insert into public.payments (contact_id, payment_date, amount, method, deposit_account_id, reference, memo, created_by)
  values (p_contact, p_date, v_total, p_method, v_deposit, p_reference, p_memo, auth.uid()) returning id into v_pay;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_deposit, 'debit', v_total, 'contact_id', p_contact, 'description', 'Payment received'),
    jsonb_build_object('account_id', public.acct('ar'), 'credit', v_total, 'contact_id', p_contact, 'description', 'Payment received'));
  if p_method = 'trust' then   -- earned fees move out of trust into the operating account
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', public.acct('trust_liability'), 'debit', v_total, 'contact_id', p_contact, 'description', 'Transfer from trust for earned fees'),
      jsonb_build_object('account_id', public.acct('trust_bank'), 'credit', v_total, 'contact_id', p_contact, 'description', 'Transfer from trust for earned fees'));
  end if;
  v_entry := public._post_entry(p_date, coalesce(p_memo, 'Payment received'), 'payment', v_pay, v_lines);
  update public.payments set entry_id = v_entry where id = v_pay;

  perform set_config('gi.posting', 'on', true);
  for a in select * from jsonb_array_elements(p_applications) loop
    if coalesce((a->>'amount')::numeric, 0) <= 0 then continue; end if;
    insert into public.payment_applications (payment_id, invoice_id, amount) values (v_pay, (a->>'invoice_id')::uuid, (a->>'amount')::numeric);
    update public.invoices set amount_paid = amount_paid + (a->>'amount')::numeric,
      status = case when amount_paid + (a->>'amount')::numeric >= total then 'paid' else 'partial' end
    where id = (a->>'invoice_id')::uuid;
  end loop;
  perform set_config('gi.posting', 'off', true);
  return v_pay;
end $$;

create or replace function public.void_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.payments; a record;
begin
  perform public._require_finance();
  select * into v from public.payments where id = p_payment for update;
  if v.voided then raise exception 'Payment is already void.'; end if;
  perform public._reverse_entry(v.entry_id, (now() at time zone 'America/Edmonton')::date, 'payment_void', 'Void payment ' || v.number);
  perform set_config('gi.posting', 'on', true);
  for a in select * from public.payment_applications where payment_id = p_payment loop
    update public.invoices set amount_paid = amount_paid - a.amount,
      status = case when amount_paid - a.amount <= 0 then 'open' else 'partial' end where id = a.invoice_id;
  end loop;
  perform set_config('gi.posting', 'off', true);
  update public.payments set voided = true where id = p_payment;
  perform public.log_audit('voided', 'payment', p_payment::text, jsonb_build_object('number', v.number, 'amount', v.amount));
end $$;

-- ── Trust (client funds) ──
create table public.trust_transactions (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id),
  txn_date    date not null,
  type        text not null check (type in ('deposit','refund')),
  amount      numeric(14,2) not null check (amount > 0),
  method      text,
  reference   text,
  memo        text,
  entry_id    uuid references public.journal_entries(id),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.trust_transaction(p_contact uuid, p_date date, p_type text, p_amount numeric, p_method text, p_reference text, p_memo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_entry uuid;
begin
  perform public._require_finance();
  if p_amount <= 0 then raise exception 'Enter an amount.'; end if;
  if p_type = 'refund' and public.trust_balance(p_contact) < p_amount then
    raise exception 'Refund is more than the client''s trust balance (available %).', public.trust_balance(p_contact);
  end if;
  insert into public.trust_transactions (contact_id, txn_date, type, amount, method, reference, memo, created_by)
  values (p_contact, p_date, p_type, p_amount, p_method, p_reference, p_memo, auth.uid()) returning id into v_id;
  v_entry := public._post_entry(p_date, coalesce(p_memo, case p_type when 'deposit' then 'Retainer received into trust' else 'Trust refund to client' end), 'trust', v_id,
    case when p_type = 'deposit' then jsonb_build_array(
      jsonb_build_object('account_id', public.acct('trust_bank'), 'debit', p_amount, 'contact_id', p_contact, 'description', 'Retainer into trust'),
      jsonb_build_object('account_id', public.acct('trust_liability'), 'credit', p_amount, 'contact_id', p_contact, 'description', 'Retainer into trust'))
    else jsonb_build_array(
      jsonb_build_object('account_id', public.acct('trust_liability'), 'debit', p_amount, 'contact_id', p_contact, 'description', 'Trust refund'),
      jsonb_build_object('account_id', public.acct('trust_bank'), 'credit', p_amount, 'contact_id', p_contact, 'description', 'Trust refund')) end);
  update public.trust_transactions set entry_id = v_entry where id = v_id;
  return v_id;
end $$;

-- ── Expenses (paid immediately) ──
create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  expense_date       date not null,
  vendor_id          uuid references public.vendors(id) on delete set null,
  payee              text,
  account_id         uuid not null references public.accounts(id),
  payment_account_id uuid not null references public.accounts(id),
  amount             numeric(14,2) not null check (amount > 0),   -- total paid, including tax
  tax                numeric(14,2) not null default 0 check (tax >= 0),
  memo               text,
  contact_id         uuid references public.contacts(id) on delete set null,
  reference          text,
  entry_id           uuid references public.journal_entries(id),
  voided             boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

create or replace function public.record_expense(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_amount numeric := (p->>'amount')::numeric; v_tax numeric := coalesce((p->>'tax')::numeric, 0); v_entry uuid; v_vendor uuid := nullif(p->>'vendor_id','')::uuid;
begin
  perform public._require_finance();
  if v_amount is null or v_amount <= 0 then raise exception 'Enter the amount paid.'; end if;
  if v_tax > v_amount then raise exception 'Tax cannot be more than the total.'; end if;
  insert into public.expenses (expense_date, vendor_id, payee, account_id, payment_account_id, amount, tax, memo, contact_id, reference, created_by)
  values ((p->>'date')::date, v_vendor, p->>'payee', (p->>'account_id')::uuid, (p->>'payment_account_id')::uuid, v_amount, v_tax, p->>'memo',
          nullif(p->>'contact_id','')::uuid, p->>'reference', auth.uid()) returning id into v_id;
  v_entry := public._post_entry((p->>'date')::date, coalesce(p->>'memo', 'Expense'), 'expense', v_id, jsonb_build_array(
    jsonb_build_object('account_id', p->>'account_id', 'debit', v_amount - v_tax, 'vendor_id', v_vendor, 'contact_id', p->>'contact_id', 'description', coalesce(p->>'payee', p->>'memo')),
    jsonb_build_object('account_id', public.acct('gst'), 'debit', v_tax, 'vendor_id', v_vendor, 'description', 'GST input tax credit'),
    jsonb_build_object('account_id', p->>'payment_account_id', 'credit', v_amount, 'vendor_id', v_vendor, 'description', coalesce(p->>'payee', p->>'memo'))));
  update public.expenses set entry_id = v_entry where id = v_id;
  return v_id;
end $$;

create or replace function public.void_expense(p_expense uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.expenses;
begin
  perform public._require_finance();
  select * into v from public.expenses where id = p_expense for update;
  if v.voided then raise exception 'Expense is already void.'; end if;
  perform public._reverse_entry(v.entry_id, (now() at time zone 'America/Edmonton')::date, 'expense_void', 'Void expense');
  update public.expenses set voided = true where id = p_expense;
end $$;

-- ── Bills (accounts payable) ──
create table public.bills (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors(id),
  bill_number text,
  bill_date   date not null,
  due_date    date not null,
  account_id  uuid not null references public.accounts(id),
  amount      numeric(14,2) not null check (amount > 0),   -- total including tax
  tax         numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance     numeric(14,2) generated always as (amount - amount_paid) stored,
  status      text not null default 'open' check (status in ('open','partial','paid','void')),
  memo        text,
  entry_id    uuid references public.journal_entries(id),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create table public.bill_payments (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references public.bills(id),
  pay_date    date not null,
  amount      numeric(14,2) not null check (amount > 0),
  account_id  uuid not null references public.accounts(id),
  reference   text,
  entry_id    uuid references public.journal_entries(id),
  created_at  timestamptz not null default now()
);

create or replace function public.record_bill(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_amount numeric := (p->>'amount')::numeric; v_tax numeric := coalesce((p->>'tax')::numeric,0); v_entry uuid; v_vendor uuid := (p->>'vendor_id')::uuid;
begin
  perform public._require_finance();
  if v_amount is null or v_amount <= 0 then raise exception 'Enter the bill total.'; end if;
  insert into public.bills (vendor_id, bill_number, bill_date, due_date, account_id, amount, tax, memo, created_by)
  values (v_vendor, p->>'bill_number', (p->>'bill_date')::date, (p->>'due_date')::date, (p->>'account_id')::uuid, v_amount, v_tax, p->>'memo', auth.uid())
  returning id into v_id;
  v_entry := public._post_entry((p->>'bill_date')::date, coalesce('Bill ' || (p->>'bill_number'), 'Bill'), 'bill', v_id, jsonb_build_array(
    jsonb_build_object('account_id', p->>'account_id', 'debit', v_amount - v_tax, 'vendor_id', v_vendor, 'description', p->>'memo'),
    jsonb_build_object('account_id', public.acct('gst'), 'debit', v_tax, 'vendor_id', v_vendor, 'description', 'GST input tax credit'),
    jsonb_build_object('account_id', public.acct('ap'), 'credit', v_amount, 'vendor_id', v_vendor, 'description', p->>'memo')));
  update public.bills set entry_id = v_entry where id = v_id;
  return v_id;
end $$;

create or replace function public.pay_bill(p_bill uuid, p_date date, p_amount numeric, p_account uuid, p_reference text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v public.bills; v_id uuid; v_entry uuid;
begin
  perform public._require_finance();
  select * into v from public.bills where id = p_bill for update;
  if v.status in ('paid','void') then raise exception 'This bill is not open.'; end if;
  if p_amount <= 0 or p_amount > v.balance then raise exception 'Payment must be between 0 and the balance (%).', v.balance; end if;
  insert into public.bill_payments (bill_id, pay_date, amount, account_id, reference) values (p_bill, p_date, p_amount, p_account, p_reference) returning id into v_id;
  v_entry := public._post_entry(p_date, 'Bill payment', 'bill_payment', v_id, jsonb_build_array(
    jsonb_build_object('account_id', public.acct('ap'), 'debit', p_amount, 'vendor_id', v.vendor_id, 'description', 'Bill payment'),
    jsonb_build_object('account_id', p_account, 'credit', p_amount, 'vendor_id', v.vendor_id, 'description', 'Bill payment')));
  update public.bill_payments set entry_id = v_entry where id = v_id;
  update public.bills set amount_paid = amount_paid + p_amount, status = case when amount_paid + p_amount >= amount then 'paid' else 'partial' end where id = p_bill;
  return v_id;
end $$;

create or replace function public.void_bill(p_bill uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.bills;
begin
  perform public._require_finance();
  select * into v from public.bills where id = p_bill for update;
  if v.amount_paid > 0 then raise exception 'This bill has payments and cannot be voided.'; end if;
  if v.status = 'void' then raise exception 'Bill is already void.'; end if;
  perform public._reverse_entry(v.entry_id, (now() at time zone 'America/Edmonton')::date, 'bill_void', 'Void bill');
  update public.bills set status = 'void' where id = p_bill;
end $$;

-- ── Transfers & manual journal entries ──
create or replace function public.record_transfer(p_date date, p_from uuid, p_to uuid, p_amount numeric, p_memo text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_finance();
  if p_from = p_to then raise exception 'Choose two different accounts.'; end if;
  if p_amount <= 0 then raise exception 'Enter an amount.'; end if;
  if p_from = public.acct('trust_bank') or p_to = public.acct('trust_bank') then
    raise exception 'Use Trust deposits and "transfer from trust" on a payment to move client funds.';
  end if;
  return public._post_entry(p_date, coalesce(p_memo, 'Transfer'), 'transfer', null, jsonb_build_array(
    jsonb_build_object('account_id', p_to, 'debit', p_amount, 'description', p_memo),
    jsonb_build_object('account_id', p_from, 'credit', p_amount, 'description', p_memo)));
end $$;

create or replace function public.create_journal_entry(p_date date, p_memo text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_finance();
  if public.my_role() not in ('owner','bookkeeper') then raise exception 'Only an owner or bookkeeper can post manual journal entries.'; end if;
  if jsonb_array_length(p_lines) < 2 then raise exception 'A journal entry needs at least two lines.'; end if;
  return public._post_entry(p_date, p_memo, 'manual', null, p_lines);
end $$;

-- ── Reconciliation ──
create table public.reconciliations (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id),
  statement_date date not null,
  ending_balance numeric(14,2) not null,
  completed_by   uuid references public.profiles(id) on delete set null,
  completed_at   timestamptz not null default now()
);
alter table public.journal_lines add constraint jl_recon_fk foreign key (reconciled_id) references public.reconciliations(id) on delete set null;

create or replace function public.complete_reconciliation(p_account uuid, p_statement_date date, p_ending numeric, p_line_ids bigint[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cleared numeric;
begin
  perform public._require_finance();
  select coalesce(sum(debit - credit), 0) into v_cleared from public.journal_lines
    where account_id = p_account and (reconciled_id is not null or id = any(p_line_ids));
  if v_cleared <> p_ending then raise exception 'Cleared balance (%) does not match the statement ending balance (%).', v_cleared, p_ending; end if;
  insert into public.reconciliations (account_id, statement_date, ending_balance, completed_by) values (p_account, p_statement_date, p_ending, auth.uid()) returning id into v_id;
  update public.journal_lines set cleared = true, reconciled_id = v_id where account_id = p_account and id = any(p_line_ids) and reconciled_id is null;
  return v_id;
end $$;

-- ── Reports ──
create or replace function public.report_account_balances(p_from date, p_to date) returns table (
  account_id uuid, code text, name text, type public.account_type, subtype text, debit numeric, credit numeric, balance numeric)
language sql stable security definer set search_path = public as $$
  select a.id, a.code, a.name, a.type, a.subtype,
    coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
    case when a.type in ('asset','expense') then coalesce(sum(l.debit - l.credit), 0) else coalesce(sum(l.credit - l.debit), 0) end
  from public.accounts a
  left join public.journal_lines l on l.account_id = a.id
  left join public.journal_entries e on e.id = l.entry_id
  where public.has_perm('finance.view') and (e.id is null or (e.entry_date >= coalesce(p_from, '1900-01-01') and e.entry_date <= p_to))
  group by a.id order by a.code
$$;

create or replace function public.report_ar_aging(p_as_of date) returns table (
  contact_id uuid, contact_name text, current_amt numeric, d1_30 numeric, d31_60 numeric, d61_90 numeric, d90_plus numeric, total numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.full_name,
    sum(case when p_as_of <= i.due_date then i.balance else 0 end),
    sum(case when p_as_of - i.due_date between 1 and 30 then i.balance else 0 end),
    sum(case when p_as_of - i.due_date between 31 and 60 then i.balance else 0 end),
    sum(case when p_as_of - i.due_date between 61 and 90 then i.balance else 0 end),
    sum(case when p_as_of - i.due_date > 90 then i.balance else 0 end),
    sum(i.balance)
  from public.invoices i join public.contacts c on c.id = i.contact_id
  where public.has_perm('finance.view') and i.status in ('open','partial') and i.issue_date <= p_as_of
  group by c.id order by c.full_name
$$;

create or replace function public.report_gst(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.has_perm('finance.view') then jsonb_build_object(
    'collected', coalesce(sum(l.credit) filter (where e.source_type in ('invoice','invoice_void')), 0) - coalesce(sum(l.debit) filter (where e.source_type in ('invoice','invoice_void')), 0),
    'itc',       coalesce(sum(l.debit) filter (where e.source_type in ('expense','expense_void','bill','bill_void')), 0) - coalesce(sum(l.credit) filter (where e.source_type in ('expense','expense_void','bill','bill_void')), 0),
    'sales',     (select coalesce(sum(credit - debit), 0) from public.journal_lines l2 join public.journal_entries e2 on e2.id = l2.entry_id
                   join public.accounts a2 on a2.id = l2.account_id where a2.type = 'income' and e2.entry_date between p_from and p_to)
  ) end
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
  where l.account_id = public.acct('gst') and e.entry_date between p_from and p_to
$$;

create or replace function public.finance_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_today date := (now() at time zone 'America/Edmonton')::date;
begin
  if not public.has_perm('finance.view') then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('m', m, 'income', inc, 'expense', exp) order by m), '[]'::jsonb) from (
        select to_char(e.entry_date, 'YYYY-MM') m,
          sum(case when a.type = 'income' then l.credit - l.debit else 0 end) inc,
          sum(case when a.type = 'expense' then l.debit - l.credit else 0 end) exp
        from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.accounts a on a.id = l.account_id
        where e.entry_date > (v_today - interval '12 months') and a.type in ('income','expense') group by 1) x),
    'open_invoices',    (select jsonb_build_object('n', count(*), 'amount', coalesce(sum(balance),0)) from public.invoices where status in ('open','partial')),
    'overdue_invoices', (select jsonb_build_object('n', count(*), 'amount', coalesce(sum(balance),0)) from public.invoices where status in ('open','partial') and due_date < v_today),
    'paid_30d',         (select coalesce(sum(amount),0) from public.payments where not voided and payment_date > v_today - 30),
    'drafts',           (select count(*) from public.invoices where status = 'draft'),
    'bills_due',        (select jsonb_build_object('n', count(*), 'amount', coalesce(sum(balance),0)) from public.bills where status in ('open','partial')),
    'banks', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'subtype', a.subtype, 'balance',
                (select coalesce(sum(debit - credit),0) from public.journal_lines where account_id = a.id)) order by a.code), '[]'::jsonb)
              from public.accounts a where a.subtype in ('bank','trust_bank','credit_card') and a.active),
    'expense_categories', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'v', v) order by v desc), '[]'::jsonb) from (
        select a.name, sum(l.debit - l.credit) v from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
        join public.accounts a on a.id = l.account_id where a.type = 'expense' and e.entry_date >= date_trunc('year', v_today)::date
        group by a.name having sum(l.debit - l.credit) <> 0) x),
    'ytd_income',  (select coalesce(sum(l.credit - l.debit),0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.accounts a on a.id = l.account_id where a.type = 'income' and e.entry_date >= date_trunc('year', v_today)::date),
    'ytd_expense', (select coalesce(sum(l.debit - l.credit),0) from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.accounts a on a.id = l.account_id where a.type = 'expense' and e.entry_date >= date_trunc('year', v_today)::date),
    'trust_total', (select coalesce(sum(credit - debit),0) from public.journal_lines where account_id = public.acct('trust_liability'))
  ) into r;
  return r;
end $$;

create or replace function public.trust_ledger() returns table (contact_id uuid, contact_name text, deposits numeric, withdrawals numeric, balance numeric, last_activity date)
language sql stable security definer set search_path = public as $$
  select c.id, c.full_name, sum(l.credit), sum(l.debit), sum(l.credit - l.debit), max(e.entry_date)
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id join public.contacts c on c.id = l.contact_id
  where public.has_perm('finance.view') and l.account_id = public.acct('trust_liability')
  group by c.id order by c.full_name
$$;

-- ── RLS: read with finance.view; documents editable only as drafts; ledger written only by functions ──
alter table public.accounts             enable row level security;
alter table public.journal_entries      enable row level security;
alter table public.journal_lines        enable row level security;
alter table public.vendors              enable row level security;
alter table public.invoices             enable row level security;
alter table public.invoice_lines        enable row level security;
alter table public.payments             enable row level security;
alter table public.payment_applications enable row level security;
alter table public.trust_transactions   enable row level security;
alter table public.expenses             enable row level security;
alter table public.bills                enable row level security;
alter table public.bill_payments        enable row level security;
alter table public.reconciliations      enable row level security;

create policy accounts_select on public.accounts for select to authenticated using (public.has_perm('finance.view'));
create policy accounts_insert on public.accounts for insert to authenticated with check (public.has_perm('finance.manage') and system_key is null);
create policy accounts_update on public.accounts for update to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));
revoke update on public.accounts from authenticated;
grant update (code, name, description, active) on public.accounts to authenticated;

do $$ declare t text; begin
  foreach t in array array['journal_entries','journal_lines','payments','payment_applications','trust_transactions','expenses','bills','bill_payments','reconciliations'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_perm(''finance.view''))', t || '_select', t);
  end loop;
end $$;

create policy vendors_select on public.vendors for select to authenticated using (public.has_perm('finance.view'));
create policy vendors_write  on public.vendors for all to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));

create policy invoices_select on public.invoices for select to authenticated using (public.has_perm('finance.view') or exists (
  select 1 from public.contacts c where c.id = invoices.contact_id and c.client_user_id = auth.uid()) and status <> 'draft');
create policy invoices_insert on public.invoices for insert to authenticated with check (public.has_perm('finance.manage') and status = 'draft');
create policy invoices_update on public.invoices for update to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));
create policy invoices_delete on public.invoices for delete to authenticated using (public.has_perm('finance.manage') and status = 'draft');

create policy invoice_lines_select on public.invoice_lines for select to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_lines_write  on public.invoice_lines for all to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));

-- Lock down direct writes to money-moving columns; posting functions run as definer
revoke update on public.invoices from authenticated;
grant update (contact_id, case_id, issue_date, due_date, notes, terms) on public.invoices to authenticated;

-- Function grants
do $$ declare f text; begin
  foreach f in array array[
    'post_invoice(uuid)','void_invoice(uuid, text)','receive_payment(uuid, date, text, uuid, text, text, jsonb)','void_payment(uuid)',
    'trust_transaction(uuid, date, text, numeric, text, text, text)','trust_balance(uuid)','record_expense(jsonb)','void_expense(uuid)',
    'record_bill(jsonb)','pay_bill(uuid, date, numeric, uuid, text)','void_bill(uuid)','record_transfer(date, uuid, uuid, numeric, text)',
    'create_journal_entry(date, text, jsonb)','complete_reconciliation(uuid, date, numeric, bigint[])',
    'report_account_balances(date, date)','report_ar_aging(date)','report_gst(date, date)','finance_dashboard()','trust_ledger()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_post_entry(date, text, text, uuid, jsonb, uuid)','_reverse_entry(uuid, date, text, text)','_require_finance()','acct(text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
