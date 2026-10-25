-- Receipts by email: staff forward receipts to a shared mailbox (receipts@…); the Receipts page imports them.

alter table public.integration_settings
  add column receipts_mailbox text not null default 'receipts@gracefulimmigration.ca'
  constraint integration_settings_receipts_domain check (public.is_company_email(receipts_mailbox));

alter table public.receipts
  add column source        text not null default 'upload' check (source in ('upload', 'email')),
  add column email_from    text,
  add column email_subject text;

-- Each email is imported once.
create table public.receipt_email_log (
  message_id     text primary key,
  mailbox        text not null,
  sender         text,
  subject        text,
  status         text not null check (status in ('imported', 'skipped_sender', 'no_receipt', 'error')),
  receipt_count  int not null default 0,
  note           text,
  created_at     timestamptz not null default now()
);
alter table public.receipt_email_log enable row level security;
create policy receipt_email_log_select on public.receipt_email_log for select to authenticated using (public.has_perm('finance.view'));

-- Emails without an attachment are kept as their text.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'] where id = 'receipts';
