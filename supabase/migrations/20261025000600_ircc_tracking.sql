-- IRCC Portal tab: track each client application submitted to IRCC (no IRCC credentials are stored).

alter table public.cases
  add column ircc_portal      text check (ircc_portal in ('IRCC Portal (Representative)', 'PR Portal', 'IRCC secure account (GCKey)', 'Paper', 'Other')),
  add column ircc_status      text,
  add column ircc_checked_on  date;

-- Representative IRCC ID (the number on IMM 5476 forms; not a password). Owner-editable via settings.
alter table public.org_settings add column ircc_rep_id text check (ircc_rep_id is null or ircc_rep_id ~ '^[A-Za-z0-9-]{4,20}$');
