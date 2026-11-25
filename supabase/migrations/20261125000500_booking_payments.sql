-- Consultations paid by card when booking on the website (owner's choice: full charge at booking).
-- The time is put in the calendar only after Stripe confirms the payment.
-- The payment is recorded as a paid invoice for the client (contact found by email, or created).

create table if not exists public.pending_bookings (
  id             uuid primary key default gen_random_uuid(),
  session_id     text unique,
  details        jsonb not null,                -- service, start, name, email, phone, tz, notes, in_canada
  booked_at      timestamptz,
  appointment_id uuid references public.appointments(id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table public.pending_bookings enable row level security;
create policy pending_bookings_select on public.pending_bookings for select to authenticated using (public.has_perm('finance.view'));

create or replace function public.stripe_record_booking(p_session text, p_name text, p_email text, p_phone text, p_item text, p_desc text,
  p_net numeric, p_gst numeric, p_fee numeric, p_date date, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_contact uuid; v_inv public.invoices; v_inv_id uuid; v_item public.items; v_entry uuid; v_pay uuid; v_lines jsonb;
        v_clear uuid := public.acct('stripe_clearing'); v_fee_acct uuid := (select id from public.accounts where code = '5200');
        v_rate numeric := case when round(coalesce(p_gst, 0), 2) > 0 then (select coalesce(gst_rate, 5) from public.org_settings where id = 1) else 0 end;
begin
  if exists (select 1 from public.stripe_payments where session_id = p_session) then
    return (select payment_id from public.stripe_payments where session_id = p_session);
  end if;
  select id into v_contact from public.contacts where lower(email) = lower(p_email) order by created_at limit 1;
  if v_contact is null then
    insert into public.contacts (full_name, email, phone, source) values (left(p_name, 120), lower(p_email), nullif(p_phone, ''), 'website')
    returning id into v_contact;
  end if;
  select * into v_item from public.items where name = p_item limit 1;

  insert into public.invoices (contact_id, issue_date, due_date, notes) values (v_contact, p_date, p_date, 'Paid by card when booking on the website.')
  returning id into v_inv_id;
  insert into public.invoice_lines (invoice_id, position, item_id, description, quantity, unit_price, taxable, tax_rate, account_id)
  values (v_inv_id, 0, v_item.id, left(p_desc, 300), 1, round(p_net, 2), v_rate > 0, v_rate,
          coalesce(v_item.income_account_id, public.acct('consult_income'), public.acct('service_income')));
  select * into v_inv from public.invoices where id = v_inv_id;

  -- Post the invoice (same entry as post_invoice).
  select jsonb_agg(x) into v_lines from (
    select jsonb_build_object('account_id', public.acct('ar'), 'debit', v_inv.total, 'contact_id', v_contact, 'description', 'Invoice ' || v_inv.number) x
    union all
    select jsonb_build_object('account_id', account_id, 'credit', sum(amount), 'contact_id', v_contact, 'description', 'Invoice ' || v_inv.number)
      from public.invoice_lines where invoice_id = v_inv_id group by account_id
    union all
    select jsonb_build_object('account_id', public.acct('gst'), 'credit', v_inv.tax_total, 'contact_id', v_contact, 'description', 'GST on ' || v_inv.number)
      where v_inv.tax_total > 0) s;
  v_entry := public._post_entry(p_date, 'Invoice ' || v_inv.number, 'invoice', v_inv_id, v_lines, null);
  perform set_config('gi.posting', 'on', true);
  update public.invoices set status = 'open', entry_id = v_entry, sent_at = now() where id = v_inv_id;
  perform set_config('gi.posting', 'off', true);

  -- The card payment.
  insert into public.payments (contact_id, payment_date, amount, method, deposit_account_id, reference, memo, created_by)
  values (v_contact, p_date, v_inv.total, 'card', v_clear, left(p_reference, 120), 'Consultation paid by card (Stripe) — ' || v_inv.number, null) returning id into v_pay;
  v_entry := public._post_entry(p_date, 'Consultation paid by card (Stripe) — ' || v_inv.number, 'payment', v_pay, jsonb_build_array(
    jsonb_build_object('account_id', v_clear, 'debit', v_inv.total, 'contact_id', v_contact, 'description', 'Card payment received'),
    jsonb_build_object('account_id', public.acct('ar'), 'credit', v_inv.total, 'contact_id', v_contact, 'description', 'Card payment received')), null);
  update public.payments set entry_id = v_entry where id = v_pay;
  perform set_config('gi.posting', 'on', true);
  insert into public.payment_applications (payment_id, invoice_id, amount) values (v_pay, v_inv_id, v_inv.total);
  update public.invoices set amount_paid = total, status = 'paid' where id = v_inv_id;
  perform set_config('gi.posting', 'off', true);

  if coalesce(p_fee, 0) > 0 and v_fee_acct is not null then
    perform public._post_entry(p_date, 'Stripe processing fee for ' || v_inv.number, 'manual', null, jsonb_build_array(
      jsonb_build_object('account_id', v_fee_acct, 'debit', round(p_fee, 2), 'description', 'Stripe fee'),
      jsonb_build_object('account_id', v_clear, 'credit', round(p_fee, 2), 'description', 'Stripe fee')), null);
  end if;
  insert into public.stripe_payments (session_id, invoice_id, payment_id, amount, fee) values (p_session, v_inv_id, v_pay, v_inv.total, round(coalesce(p_fee, 0), 2));
  perform public.log_audit('online_payment', 'invoice', v_inv_id::text, jsonb_build_object('number', v_inv.number, 'total', v_inv.total, 'source', 'website booking'));
  return v_pay;
end $$;
revoke execute on function public.stripe_record_booking(text, text, text, text, text, text, numeric, numeric, numeric, date, text) from public, anon, authenticated;
grant execute on function public.stripe_record_booking(text, text, text, text, text, text, numeric, numeric, numeric, date, text) to service_role;
