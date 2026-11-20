-- Fee payer and client receipts.
-- Sometimes the person who pays (a spouse, parent or employer in Canada) is not the client. The client stays the
-- client: the agreement, the consultation and the books (accounts receivable, trust) stay on the client's contact.
-- The payer is who invoices are addressed to and who receipts are issued to.
--   invoices.bill_to           the payer on this invoice ({name, relationship, email, phone, address}); null = the client
--   payments / trust deposits  received_from (who paid) and receipt_sent_at (when the receipt was emailed)
--   trust deposits             get a receipt number (TRD-00001), like payments have PMT-00001

alter table public.invoices add column if not exists bill_to jsonb;
grant update (bill_to) on public.invoices to authenticated;   -- the payer's details can be corrected on a posted invoice; amounts can't

alter table public.payments add column if not exists received_from text;
alter table public.payments add column if not exists receipt_sent_at timestamptz;

create sequence if not exists public.trust_receipt_seq;
alter table public.trust_transactions add column if not exists number text unique default ('TRD-' || lpad(nextval('public.trust_receipt_seq')::text, 5, '0'));
alter table public.trust_transactions add column if not exists received_from text;
alter table public.trust_transactions add column if not exists receipt_sent_at timestamptz;

-- Who paid, and "receipt emailed", for a payment ('payment') or a trust deposit ('trust'). Amounts never change here.
create or replace function public.update_receipt(p_kind text, p_id uuid, p_received_from text default null, p_sent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text := nullif(trim(coalesce(p_received_from, '')), '');
begin
  perform public._require_finance();
  if p_kind = 'payment' then
    update public.payments set received_from = coalesce(v_from, received_from),
      receipt_sent_at = case when p_sent then now() else receipt_sent_at end where id = p_id;
  elsif p_kind = 'trust' then
    update public.trust_transactions set received_from = coalesce(v_from, received_from),
      receipt_sent_at = case when p_sent then now() else receipt_sent_at end where id = p_id and type = 'deposit';
  else
    raise exception 'Unknown receipt type.';
  end if;
  if not found then raise exception 'Receipt not found.'; end if;
  if p_sent then perform public.log_audit('receipt_sent', p_kind, p_id::text, jsonb_build_object('received_from', v_from)); end if;
end $$;
revoke all on function public.update_receipt(text, uuid, text, boolean) from public, anon;
grant execute on function public.update_receipt(text, uuid, text, boolean) to authenticated;
