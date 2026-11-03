-- Banking register: edit transfers and bill payments in place (and delete a transfer entered by mistake).
-- Same rules as expense/bill edits: rewritten through _replace_entry (blocked once reconciled), before/after in the audit log.

create or replace function public.update_transfer(p_entry uuid, p_date date, p_from uuid, p_to uuid, p_amount numeric, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries; v_before jsonb;
begin
  perform public._require_finance();
  select * into e from public.journal_entries where id = p_entry for update;
  if e.id is null or e.source_type <> 'transfer' then raise exception 'Transfer not found.'; end if;
  if p_from = p_to then raise exception 'Choose two different accounts.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount.'; end if;
  if p_from = public.acct('trust_bank') or p_to = public.acct('trust_bank') then
    raise exception 'Use Trust deposits and "transfer from trust" on a payment to move client funds.';
  end if;
  select jsonb_build_object('date', e.entry_date, 'memo', e.memo, 'lines', jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', debit, 'credit', credit)))
    into v_before from public.journal_lines where entry_id = p_entry;
  perform public._replace_entry(p_entry, p_date, coalesce(p_memo, 'Transfer'), jsonb_build_array(
    jsonb_build_object('account_id', p_to, 'debit', p_amount, 'description', p_memo),
    jsonb_build_object('account_id', p_from, 'credit', p_amount, 'description', p_memo)));
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'transfer_edited', 'journal_entry', p_entry, jsonb_build_object('before', v_before,
    'after', jsonb_build_object('date', p_date, 'memo', p_memo, 'from', p_from, 'to', p_to, 'amount', p_amount)));
end $$;

create or replace function public.delete_transfer(p_entry uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries; v_before jsonb;
begin
  perform public._require_finance();
  select * into e from public.journal_entries where id = p_entry for update;
  if e.id is null or e.source_type <> 'transfer' then raise exception 'Transfer not found.'; end if;
  if exists (select 1 from public.journal_lines where entry_id = p_entry and reconciled_id is not null) then
    raise exception 'This transfer is part of a completed bank reconciliation, so it can''t be deleted.';
  end if;
  select jsonb_build_object('date', e.entry_date, 'memo', e.memo, 'lines', jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', debit, 'credit', credit)))
    into v_before from public.journal_lines where entry_id = p_entry;
  delete from public.journal_entries where id = p_entry;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'transfer_deleted', 'journal_entry', p_entry, jsonb_build_object('before', v_before));
end $$;

create or replace function public.update_bill_payment(p_payment uuid, p_date date, p_amount numeric, p_account uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare bp public.bill_payments; b public.bills; v_paid numeric;
begin
  perform public._require_finance();
  select * into bp from public.bill_payments where id = p_payment for update;
  if bp.id is null then raise exception 'Payment not found.'; end if;
  select * into b from public.bills where id = bp.bill_id for update;
  if b.status = 'void' then raise exception 'This bill is void.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount paid.'; end if;
  v_paid := b.amount_paid - bp.amount + p_amount;
  if v_paid > b.amount then raise exception 'That is more than the bill total (% still owing before this payment).', b.amount - (b.amount_paid - bp.amount); end if;
  perform public._replace_entry(bp.entry_id, p_date, 'Bill payment', jsonb_build_array(
    jsonb_build_object('account_id', public.acct('ap'), 'debit', p_amount, 'vendor_id', b.vendor_id, 'description', 'Bill payment'),
    jsonb_build_object('account_id', p_account, 'credit', p_amount, 'vendor_id', b.vendor_id, 'description', 'Bill payment')));
  update public.bill_payments set pay_date = p_date, amount = p_amount, account_id = p_account, reference = p_reference where id = p_payment;
  update public.bills set amount_paid = v_paid, status = case when v_paid = 0 then 'open' when v_paid >= amount then 'paid' else 'partial' end where id = b.id;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'bill_payment_edited', 'bill', b.id, jsonb_build_object('before', to_jsonb(bp) - 'entry_id',
    'after', jsonb_build_object('pay_date', p_date, 'amount', p_amount, 'account_id', p_account, 'reference', p_reference)));
end $$;
