-- Interac e-Transfer Autodeposit: one email per bank account.
-- Earned fees / invoices -> operating account; advance money (retainers) -> client (trust) account.
alter table public.org_settings
  add column if not exists pay_email   text default 'payments@gracefulimmigration.ca',
  add column if not exists trust_email text default 'clientfunds@gracefulimmigration.ca';
update public.org_settings set pay_email = coalesce(pay_email, 'payments@gracefulimmigration.ca'),
  trust_email = coalesce(trust_email, 'clientfunds@gracefulimmigration.ca') where id = 1;

update public.accounts set description = 'TD business operating account (e-Transfer Autodeposit: payments@). Earned fees and expenses.'
  where code = '1000' and subtype = 'bank';
update public.accounts set description = 'TD client account (e-Transfer Autodeposit: clientfunds@). Client money held in trust until fees are earned (CICC client account).'
  where code = '1010' and subtype = 'trust_bank';
