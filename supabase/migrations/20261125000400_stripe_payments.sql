-- Online card payments through Stripe Checkout (earned fees / invoices only — never trust money).
-- Each invoice gets a secret pay link. The pay function checks every payment directly with Stripe,
-- then records it here: money into "Stripe Balance" (cleared to the operating account on payout), the Stripe fee as a bank fee.

insert into public.accounts (code, name, type, subtype, system_key, description)
select '1020', 'Stripe Balance (card payments)', 'asset', 'bank', 'stripe_clearing',
       'Card payments collected by Stripe, before Stripe pays them out to the TD operating account. Record each payout as a transfer to the operating account.'
where not exists (select 1 from public.accounts where system_key = 'stripe_clearing' or code = '1020');

alter table public.invoices add column if not exists pay_token text;
update public.invoices set pay_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where pay_token is null;
alter table public.invoices alter column pay_token set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create unique index if not exists invoices_pay_token_idx on public.invoices (pay_token);

create table if not exists public.stripe_payments (
  session_id   text primary key,
  invoice_id   uuid not null references public.invoices(id),
  payment_id   uuid references public.payments(id),
  amount       numeric(12,2) not null,
  fee          numeric(12,2) not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.stripe_payments enable row level security;
create policy stripe_payments_select on public.stripe_payments for select to authenticated using (public.has_perm('finance.view'));

-- Called only by the pay function (service role) after Stripe confirms the payment. Safe to call twice.
create or replace function public.stripe_record_payment(p_session text, p_invoice uuid, p_amount numeric, p_fee numeric, p_date date, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.invoices; v_pay uuid; v_entry uuid; v_amt numeric; v_clear uuid := public.acct('stripe_clearing');
        v_fee_acct uuid := (select id from public.accounts where code = '5200');
begin
  if exists (select 1 from public.stripe_payments where session_id = p_session) then
    return (select payment_id from public.stripe_payments where session_id = p_session);
  end if;
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  v_amt := least(round(p_amount, 2), greatest(v_inv.balance, 0));
  if v_inv.status in ('open', 'partial') and v_amt > 0 then
    insert into public.payments (contact_id, payment_date, amount, method, deposit_account_id, reference, memo, created_by)
    values (v_inv.contact_id, p_date, v_amt, 'card', v_clear, left(p_reference, 120), 'Online card payment (Stripe) for ' || v_inv.number, null) returning id into v_pay;
    v_entry := public._post_entry(p_date, 'Online card payment (Stripe) for ' || v_inv.number, 'payment', v_pay, jsonb_build_array(
      jsonb_build_object('account_id', v_clear, 'debit', v_amt, 'contact_id', v_inv.contact_id, 'description', 'Card payment received'),
      jsonb_build_object('account_id', public.acct('ar'), 'credit', v_amt, 'contact_id', v_inv.contact_id, 'description', 'Card payment received')), null);
    update public.payments set entry_id = v_entry where id = v_pay;
    perform set_config('gi.posting', 'on', true);
    insert into public.payment_applications (payment_id, invoice_id, amount) values (v_pay, p_invoice, v_amt);
    update public.invoices set amount_paid = amount_paid + v_amt, status = case when amount_paid + v_amt >= total then 'paid' else 'partial' end where id = p_invoice;
    perform set_config('gi.posting', 'off', true);
  end if;
  if coalesce(p_fee, 0) > 0 and v_fee_acct is not null then
    perform public._post_entry(p_date, 'Stripe processing fee for ' || v_inv.number, 'manual', null, jsonb_build_array(
      jsonb_build_object('account_id', v_fee_acct, 'debit', round(p_fee, 2), 'description', 'Stripe fee'),
      jsonb_build_object('account_id', v_clear, 'credit', round(p_fee, 2), 'description', 'Stripe fee')), null);
  end if;
  insert into public.stripe_payments (session_id, invoice_id, payment_id, amount, fee) values (p_session, p_invoice, v_pay, round(p_amount, 2), round(coalesce(p_fee, 0), 2));
  perform public.log_audit('online_payment', 'invoice', p_invoice::text, jsonb_build_object('number', v_inv.number, 'total', round(p_amount, 2)));
  return v_pay;
end $$;
revoke execute on function public.stripe_record_payment(text, uuid, numeric, numeric, date, text) from public, anon, authenticated;
grant execute on function public.stripe_record_payment(text, uuid, numeric, numeric, date, text) to service_role;
