-- Editable receipts: what the receipt SHOWS (names, details, date, method, reference, description, note) can be corrected.
-- The amount and the books are not changed here (that stays with the payment / trust record), and every edit is in the audit log.
alter table public.payments add column if not exists receipt_edits jsonb not null default '{}'::jsonb;
alter table public.trust_transactions add column if not exists receipt_edits jsonb not null default '{}'::jsonb;

create or replace function public.edit_receipt(p_kind text, p_id uuid, p_edits jsonb, p_received_from text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_from text := nullif(trim(coalesce(p_received_from, '')), '');
  v_new jsonb := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(coalesce(p_edits, '{}'::jsonb))
                  where key in ('from_lines', 'client_name', 'date', 'method', 'reference', 'desc_title', 'desc_detail', 'note')
                    and jsonb_typeof(value) = 'string' and length(value #>> '{}') <= 2000);
begin
  perform public._require_finance();
  if (v_new ? 'date') and (v_new ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date.'; end if;
  if p_kind = 'payment' then
    select receipt_edits into v_old from public.payments where id = p_id for update;
    if not found then raise exception 'Receipt not found.'; end if;
    update public.payments set receipt_edits = v_new, received_from = coalesce(v_from, received_from) where id = p_id;
  elsif p_kind = 'trust' then
    select receipt_edits into v_old from public.trust_transactions where id = p_id and type = 'deposit' for update;
    if not found then raise exception 'Receipt not found.'; end if;
    update public.trust_transactions set receipt_edits = v_new, received_from = coalesce(v_from, received_from) where id = p_id;
  else
    raise exception 'Unknown receipt type.';
  end if;
  perform public.log_audit('receipt_edited', p_kind, p_id::text, jsonb_build_object('before', v_old, 'after', v_new, 'received_from', v_from));
end $$;
revoke all on function public.edit_receipt(text, uuid, jsonb, text) from public, anon;
grant execute on function public.edit_receipt(text, uuid, jsonb, text) to authenticated;
