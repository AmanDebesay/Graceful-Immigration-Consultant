-- Correct WHERE money received is held: trust (client funds) vs operating (business) accounts.
-- Nothing is deleted: the original entry is reversed and the money is recorded again in the right place,
-- and the two receipts point to each other. This only fixes the records; the real money must be in that bank account too.

alter table public.trust_transactions
  add column if not exists moved_to_payment uuid references public.payments(id) on delete set null,
  add column if not exists moved_at timestamptz;
alter table public.payments
  add column if not exists moved_from_trust uuid references public.trust_transactions(id) on delete set null,
  add column if not exists moved_to_trust uuid references public.trust_transactions(id) on delete set null;

-- The date a correction is posted on: the original date, or the day after the books were closed.
create or replace function public._correction_date(p date) returns date language sql stable security definer set search_path = public as $$
  select greatest(p, coalesce((select books_closed_through + 1 from public.org_settings where id = 1), p))
$$;

-- 1) A retainer recorded in TRUST that was really paid into an operating account (or was really earned fees).
--    p_apps: [{invoice_id, amount}] of the client's open invoices; if empty, a paid invoice is made for p_item / p_desc.
create or replace function public.move_trust_to_operating(p_trust uuid, p_deposit_account uuid, p_apps jsonb default '[]'::jsonb,
  p_item uuid default null, p_desc text default null, p_gst_included boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.trust_transactions; v_date date; v_acct public.accounts; v_inv uuid; v_rate numeric; v_net numeric; v_total numeric;
  v_apps jsonb := coalesce(p_apps, '[]'::jsonb); v_applied numeric := 0; v_pay uuid; v_income uuid; a jsonb;
begin
  perform public._require_finance();
  select * into t from public.trust_transactions where id = p_trust and type = 'deposit' for update;
  if not found then raise exception 'Trust receipt not found.'; end if;
  if t.moved_to_payment is not null then raise exception 'This money was already moved out of trust.'; end if;
  select * into v_acct from public.accounts where id = p_deposit_account;
  if not found or v_acct.subtype <> 'bank' then raise exception 'Choose an operating bank account.'; end if;
  if public.trust_balance(t.contact_id) < t.amount then
    raise exception 'Part of this money was already used from trust (the client''s trust balance is %). Fix the later trust entries first.', public.trust_balance(t.contact_id);
  end if;
  v_date := public._correction_date(t.txn_date);

  -- Take it out of trust: exact reversal of the original trust entry.
  perform public._reverse_entry(t.entry_id, v_date, 'trust_move', 'Moved out of trust (' || coalesce(t.number, '') || '): recorded in trust by mistake');

  for a in select * from jsonb_array_elements(v_apps) loop v_applied := v_applied + coalesce((a->>'amount')::numeric, 0); end loop;
  if v_applied > t.amount then raise exception 'The invoice amounts are more than the money received.'; end if;
  if v_applied < t.amount then
    -- What is not applied to existing invoices becomes a paid invoice for the service.
    if coalesce(trim(p_desc), '') = '' then raise exception 'Describe what the payment was for, or apply it to invoices.'; end if;
    select case when gst_number is not null and gst_number <> '' then coalesce(gst_rate, 5) else 0 end into v_rate from public.org_settings where id = 1;
    if not p_gst_included then v_rate := 0; end if;
    v_total := t.amount - v_applied;
    v_net := round(v_total / (1 + v_rate / 100), 2);
    if round(v_net * v_rate / 100, 2) + v_net <> v_total then v_net := v_net + (v_total - (v_net + round(v_net * v_rate / 100, 2))); end if;
    select coalesce((select income_account_id from public.items where id = p_item), public.acct('service_income')) into v_income;
    insert into public.invoices (contact_id, created_by, issue_date, due_date) values (t.contact_id, auth.uid(), v_date, v_date) returning id into v_inv;
    insert into public.invoice_lines (invoice_id, position, item_id, description, quantity, unit_price, taxable, tax_rate, account_id)
      values (v_inv, 0, p_item, trim(p_desc), 1, v_net, v_rate > 0, v_rate, v_income);
    perform public.post_invoice(v_inv);
    select total into v_total from public.invoices where id = v_inv;
    if v_total > t.amount - v_applied then raise exception 'Rounding: the new invoice total (%) is more than the amount (%).', v_total, t.amount - v_applied; end if;
    v_apps := v_apps || jsonb_build_array(jsonb_build_object('invoice_id', v_inv, 'amount', v_total));
  end if;

  v_pay := public.receive_payment(t.contact_id, v_date, coalesce(nullif(t.method, 'trust'), 'etransfer'), p_deposit_account, t.reference,
    'Moved from trust receipt ' || coalesce(t.number, ''), v_apps);
  update public.payments set moved_from_trust = t.id, received_from = t.received_from, receipt_edits = t.receipt_edits where id = v_pay;
  update public.trust_transactions set moved_to_payment = v_pay, moved_at = now() where id = t.id;
  perform public.log_audit('moved_to_operating', 'trust', t.id::text, jsonb_build_object('number', t.number, 'amount', t.amount, 'payment', v_pay, 'account', v_acct.name));
  return v_pay;
end $$;

-- 2) A payment recorded in an operating account that was really a retainer paid into TRUST.
create or replace function public.move_payment_to_trust(p_payment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.payments; v_t uuid; v_date date;
begin
  perform public._require_finance();
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found.'; end if;
  if p.voided then raise exception 'This payment is void.'; end if;
  if p.method = 'trust' then raise exception 'This payment was paid out of trust for earned fees; it cannot be moved into trust.'; end if;
  if p.moved_from_trust is not null then raise exception 'This payment came out of trust. Open the original trust receipt instead.'; end if;
  v_date := public._correction_date(p.payment_date);
  perform public.void_payment(p_payment);
  v_t := public.trust_transaction(p.contact_id, v_date, 'deposit', p.amount, p.method, p.reference, 'Retainer received into trust (moved from payment ' || coalesce(p.number, '') || ')');
  update public.trust_transactions set received_from = p.received_from, receipt_edits = p.receipt_edits where id = v_t;
  update public.payments set moved_to_trust = v_t where id = p_payment;
  perform public.log_audit('moved_to_trust', 'payment', p.id::text, jsonb_build_object('number', p.number, 'amount', p.amount, 'trust', v_t));
  return v_t;
end $$;

-- 3) Between operating accounts (e.g. Operating bank ↔ Stripe balance ↔ petty cash): a transfer entry, same receipt.
create or replace function public.change_payment_account(p_payment uuid, p_account uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments; v_acct public.accounts; v_old public.accounts;
begin
  perform public._require_finance();
  select * into p from public.payments where id = p_payment for update;
  if not found or p.voided then raise exception 'Payment not found or void.'; end if;
  if p.method = 'trust' then raise exception 'This payment was paid out of trust; its money is already in the operating account.'; end if;
  select * into v_acct from public.accounts where id = p_account;
  if not found or v_acct.subtype <> 'bank' then raise exception 'Choose an operating bank account.'; end if;
  if p.deposit_account_id = p_account then return; end if;
  select * into v_old from public.accounts where id = p.deposit_account_id;
  perform public._post_entry(public._correction_date(p.payment_date), 'Payment ' || coalesce(p.number, '') || ' recorded in ' || coalesce(v_old.name, 'another account') || ', moved to ' || v_acct.name,
    'payment_move', p.id, jsonb_build_array(
      jsonb_build_object('account_id', p_account, 'debit', p.amount, 'contact_id', p.contact_id, 'description', 'Account correction'),
      jsonb_build_object('account_id', p.deposit_account_id, 'credit', p.amount, 'contact_id', p.contact_id, 'description', 'Account correction')));
  update public.payments set deposit_account_id = p_account where id = p_payment;
  perform public.log_audit('payment_account_changed', 'payment', p.id::text, jsonb_build_object('number', p.number, 'from', v_old.name, 'to', v_acct.name));
end $$;

revoke all on function public.move_trust_to_operating(uuid, uuid, jsonb, uuid, text, boolean) from public, anon;
revoke all on function public.move_payment_to_trust(uuid) from public, anon;
revoke all on function public.change_payment_account(uuid, uuid) from public, anon;
revoke all on function public._correction_date(date) from public, anon;
grant execute on function public.move_trust_to_operating(uuid, uuid, jsonb, uuid, text, boolean) to authenticated;
grant execute on function public.move_payment_to_trust(uuid) to authenticated;
grant execute on function public.change_payment_account(uuid, uuid) to authenticated;

-- The journal accepts the two new kinds of correction entries.
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type = any (array['invoice', 'invoice_void', 'payment', 'payment_void',
  'expense', 'expense_void', 'bill', 'bill_void', 'bill_payment', 'trust', 'transfer', 'manual', 'trust_move', 'payment_move']));
