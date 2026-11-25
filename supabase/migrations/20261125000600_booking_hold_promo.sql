-- Website consultations: book first, pay within 2 hours (owner's choice, 2026-11-25).
-- The time goes into the calendar right away and the client is emailed a Stripe pay link. If it is not paid
-- by the deadline, the booking is cancelled automatically (the client is told) and the record is kept here as history.
-- Refund policy: cancelled 3+ hours before the start = full refund; later or no-show = no refund.
-- Also: promo codes (percentage off), managed in the dashboard.

alter table public.pending_bookings
  add column if not exists status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'free', 'cancelled_unpaid', 'paid_after_cancel', 'cancelled', 'refunded', 'expired')),
  add column if not exists pay_deadline timestamptz,
  add column if not exists pay_url text,
  add column if not exists event_id text,
  add column if not exists cal_mode boolean,
  add column if not exists paid_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists promo_code text,
  add column if not exists discount numeric(12,2) not null default 0;

-- Earlier pay-first rows: booked ones were paid; the rest were never booked.
update public.pending_bookings set status = 'paid', paid_at = booked_at where booked_at is not null and paid_at is null;
update public.pending_bookings set status = 'expired' where booked_at is null and status = 'awaiting_payment';
create index if not exists pending_bookings_due on public.pending_bookings (pay_deadline) where status = 'awaiting_payment';

drop policy if exists pending_bookings_select on public.pending_bookings;
create policy pending_bookings_select on public.pending_bookings for select to authenticated
  using (public.has_perm('finance.view') or public.has_perm('crm.view'));
-- Staff may mark a booking as cancelled or refunded (history stays).
create policy pending_bookings_update on public.pending_bookings for update to authenticated
  using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));

create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  percent     numeric(5,2) not null check (percent > 0 and percent <= 100),
  applies_to  text not null default 'consultations' check (applies_to in ('consultations', '30', '60')),
  starts_on   date,
  ends_on     date,
  max_uses    int check (max_uses is null or max_uses > 0),
  uses        int not null default 0,
  active      boolean not null default true,
  note        text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
create policy promo_codes_select on public.promo_codes for select to authenticated using (public.has_perm('finance.view') or public.has_perm('crm.view'));
create policy promo_codes_insert on public.promo_codes for insert to authenticated with check (public.has_perm('finance.manage'));
create policy promo_codes_update on public.promo_codes for update to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));
create policy promo_codes_delete on public.promo_codes for delete to authenticated using (public.has_perm('finance.manage') and uses = 0);

-- Counted when a booking is paid (server only).
create or replace function public.promo_redeem(p_code text) returns void language sql security definer set search_path = public as $$
  update public.promo_codes set uses = uses + 1 where code = upper(p_code);
$$;
revoke execute on function public.promo_redeem(text) from public, anon, authenticated;
grant execute on function public.promo_redeem(text) to service_role;

-- Every 5 minutes: release unpaid holds past their deadline and send a reminder 30–40 minutes before it.
-- The action only touches holds that are already due, so it needs no secret.
select cron.unschedule('booking-holds') where exists (select 1 from cron.job where jobname = 'booking-holds');
select cron.schedule('booking-holds', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/booking',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_ZcaXkELPK820lTD41ffw2Q_iMTta3uT',
      'Origin', 'https://gracefulimmigration.ca'),
    body := '{"action":"expire"}'::jsonb,
    timeout_milliseconds := 60000);
$$);
