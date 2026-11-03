-- Expenses & Bills, QuickBooks-style:
--   • edit an expense or bill after it is recorded (the journal entry is rewritten in place; before/after kept in the audit log)
--   • attach receipt files to an expense or bill
--   • a scanned receipt is approved as a paid expense OR as a bill to pay later, and the vendor remembers its category

alter table public.receipts add column if not exists bill_id uuid references public.bills(id) on delete set null;
alter table public.receipts add column if not exists doc_kind text not null default 'receipt' check (doc_kind in ('receipt', 'bill'));
alter table public.receipts add column if not exists due_date date;
create index if not exists receipts_expense_idx on public.receipts (expense_id);
create index if not exists receipts_bill_idx on public.receipts (bill_id);

-- Rewrites the lines of a posted entry (used when an expense or bill is edited).
create or replace function public._replace_entry(p_entry uuid, p_date date, p_memo text, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l jsonb;
begin
  if exists (select 1 from public.journal_lines where entry_id = p_entry and reconciled_id is not null) then
    raise exception 'This is part of a completed bank reconciliation, so it can''t be edited. Void it and enter it again instead.';
  end if;
  delete from public.journal_lines where entry_id = p_entry;
  update public.journal_entries set entry_date = p_date, memo = p_memo where id = p_entry;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l->>'debit')::numeric,0) = 0 and coalesce((l->>'credit')::numeric,0) = 0 then continue; end if;
    insert into public.journal_lines (entry_id, account_id, debit, credit, contact_id, vendor_id, description)
    values (p_entry, (l->>'account_id')::uuid, round(coalesce((l->>'debit')::numeric,0),2), round(coalesce((l->>'credit')::numeric,0),2),
            nullif(l->>'contact_id','')::uuid, nullif(l->>'vendor_id','')::uuid, l->>'description');
  end loop;
end $$;
revoke execute on function public._replace_entry(uuid, date, text, jsonb) from public, anon, authenticated;

create or replace function public.update_expense(p_expense uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v public.expenses; n public.expenses; v_amount numeric := (p->>'amount')::numeric; v_tax numeric := coalesce((p->>'tax')::numeric, 0);
        v_vendor uuid := nullif(p->>'vendor_id','')::uuid;
begin
  perform public._require_finance();
  select * into v from public.expenses where id = p_expense for update;
  if v.id is null then raise exception 'Expense not found.'; end if;
  if v.voided then raise exception 'A voided expense can''t be edited.'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Enter the amount paid.'; end if;
  if v_tax < 0 or v_tax > v_amount then raise exception 'Tax must be between 0 and the total.'; end if;
  update public.expenses set expense_date = (p->>'date')::date, vendor_id = v_vendor, payee = p->>'payee', account_id = (p->>'account_id')::uuid,
    payment_account_id = (p->>'payment_account_id')::uuid, amount = v_amount, tax = v_tax, memo = p->>'memo',
    contact_id = nullif(p->>'contact_id','')::uuid, reference = p->>'reference'
  where id = p_expense returning * into n;
  perform public._replace_entry(v.entry_id, n.expense_date, coalesce(n.memo, 'Expense'), jsonb_build_array(
    jsonb_build_object('account_id', n.account_id, 'debit', v_amount - v_tax, 'vendor_id', v_vendor, 'contact_id', n.contact_id, 'description', coalesce(n.payee, n.memo)),
    jsonb_build_object('account_id', public.acct('gst'), 'debit', v_tax, 'vendor_id', v_vendor, 'description', 'GST input tax credit'),
    jsonb_build_object('account_id', n.payment_account_id, 'credit', v_amount, 'vendor_id', v_vendor, 'description', coalesce(n.payee, n.memo))));
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'expense_edited', 'expense', p_expense, jsonb_build_object('before', to_jsonb(v) - 'entry_id', 'after', to_jsonb(n) - 'entry_id'));
end $$;

create or replace function public.update_bill(p_bill uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v public.bills; n public.bills; v_amount numeric := (p->>'amount')::numeric; v_tax numeric := coalesce((p->>'tax')::numeric, 0);
        v_vendor uuid := (p->>'vendor_id')::uuid;
begin
  perform public._require_finance();
  select * into v from public.bills where id = p_bill for update;
  if v.id is null then raise exception 'Bill not found.'; end if;
  if v.status = 'void' then raise exception 'A voided bill can''t be edited.'; end if;
  if v_vendor is null then raise exception 'Choose the vendor.'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Enter the bill total.'; end if;
  if v_tax < 0 or v_tax > v_amount then raise exception 'Tax must be between 0 and the total.'; end if;
  if v_amount < v.amount_paid then raise exception 'The total can''t be less than what has already been paid (%).', v.amount_paid; end if;
  if (p->>'due_date')::date < (p->>'bill_date')::date then raise exception 'The due date is before the bill date.'; end if;
  update public.bills set vendor_id = v_vendor, bill_number = p->>'bill_number', bill_date = (p->>'bill_date')::date, due_date = (p->>'due_date')::date,
    account_id = (p->>'account_id')::uuid, amount = v_amount, tax = v_tax, memo = p->>'memo',
    status = case when amount_paid = 0 then 'open' when amount_paid >= v_amount then 'paid' else 'partial' end
  where id = p_bill returning * into n;
  perform public._replace_entry(v.entry_id, n.bill_date, coalesce('Bill ' || n.bill_number, 'Bill'), jsonb_build_array(
    jsonb_build_object('account_id', n.account_id, 'debit', v_amount - v_tax, 'vendor_id', v_vendor, 'description', n.memo),
    jsonb_build_object('account_id', public.acct('gst'), 'debit', v_tax, 'vendor_id', v_vendor, 'description', 'GST input tax credit'),
    jsonb_build_object('account_id', public.acct('ap'), 'credit', v_amount, 'vendor_id', v_vendor, 'description', n.memo)));
  if v.vendor_id <> v_vendor then   -- payments already made follow the bill to the new vendor
    update public.journal_lines set vendor_id = v_vendor where entry_id in (select entry_id from public.bill_payments where bill_id = p_bill);
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'bill_edited', 'bill', p_bill, jsonb_build_object('before', to_jsonb(v) - 'entry_id', 'after', to_jsonb(n) - 'entry_id'));
end $$;

-- Approves a scanned receipt into the books, as a paid expense or as a bill to pay later.
-- The vendor is found or created, and (when asked) remembers the category for next time.
create or replace function public.approve_receipt(p_receipt uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.receipts; v_kind text := coalesce(p->>'kind', 'expense'); v_name text := nullif(btrim(p->>'vendor'), '');
        v_vendor uuid; v_account uuid := (p->>'account_id')::uuid; v_id uuid;
begin
  perform public._require_finance();
  select * into r from public.receipts where id = p_receipt for update;
  if r.id is null then raise exception 'Receipt not found.'; end if;
  if r.status = 'approved' then raise exception 'This receipt is already in the books.'; end if;
  if v_account is null then raise exception 'Choose a category.'; end if;
  if v_name is not null then
    select id into v_vendor from public.vendors where lower(name) = lower(v_name) and active order by created_at limit 1;
    if v_vendor is null then
      insert into public.vendors (name, default_account_id) values (v_name, v_account) returning id into v_vendor;
    elsif coalesce((p->>'remember')::boolean, true) then
      update public.vendors set default_account_id = v_account where id = v_vendor;
    end if;
  end if;
  if v_kind = 'bill' then
    if v_vendor is null then raise exception 'Enter the vendor for the bill.'; end if;
    v_id := public.record_bill(jsonb_build_object('vendor_id', v_vendor, 'bill_number', nullif(p->>'reference', ''), 'bill_date', p->>'date',
      'due_date', coalesce(nullif(p->>'due_date', ''), p->>'date'), 'account_id', v_account, 'amount', p->>'amount', 'tax', coalesce(p->>'tax', '0'), 'memo', p->>'memo'));
    update public.receipts set status = 'approved', bill_id = v_id, doc_kind = 'bill', vendor_id = v_vendor, vendor = v_name, account_id = v_account,
      total = (p->>'amount')::numeric, tax = coalesce((p->>'tax')::numeric, 0), receipt_date = (p->>'date')::date, due_date = nullif(p->>'due_date', '')::date,
      memo = p->>'memo', approved_at = now(), approved_by = auth.uid() where id = p_receipt;
  else
    v_id := public.record_expense(jsonb_build_object('date', p->>'date', 'vendor_id', v_vendor, 'payee', v_name, 'account_id', v_account,
      'payment_account_id', p->>'payment_account_id', 'amount', p->>'amount', 'tax', coalesce(p->>'tax', '0'), 'memo', coalesce(nullif(p->>'memo', ''), v_name, 'Receipt'),
      'contact_id', nullif(p->>'contact_id', ''), 'reference', nullif(p->>'reference', '')));
    update public.receipts set status = 'approved', expense_id = v_id, doc_kind = 'receipt', vendor_id = v_vendor, vendor = v_name, account_id = v_account,
      payment_account_id = (p->>'payment_account_id')::uuid, contact_id = nullif(p->>'contact_id', '')::uuid,
      total = (p->>'amount')::numeric, tax = coalesce((p->>'tax')::numeric, 0), receipt_date = (p->>'date')::date,
      memo = p->>'memo', approved_at = now(), approved_by = auth.uid() where id = p_receipt;
  end if;
  return v_id;
end $$;
