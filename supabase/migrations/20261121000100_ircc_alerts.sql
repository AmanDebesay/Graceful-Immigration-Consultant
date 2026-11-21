-- IRCC news email alerts: an hourly job calls the ircc-alerts function, which emails any IRCC news not sent before.
-- The shared secret lives in Vault ('ircc_alert_secret') and in the function's IRCC_ALERT_SECRET; it is never in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.ircc_alerts_seen (
  url text primary key,
  title text not null,
  published date,
  sent_at timestamptz not null default now()
);
alter table public.ircc_alerts_seen enable row level security;   -- no policies: only the server (service role) reads or writes it
revoke all on public.ircc_alerts_seen from anon, authenticated;

select cron.unschedule('ircc-alerts') where exists (select 1 from cron.job where jobname = 'ircc-alerts');
select cron.schedule('ircc-alerts', '17 * * * *', $$
  select net.http_post(
    url := 'https://bmzhcprthrocbqluxpwa.supabase.co/functions/v1/ircc-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-alert-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ircc_alert_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$$);
