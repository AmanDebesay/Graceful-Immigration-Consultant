-- Receipt capture: upload a photo/PDF, Claude reads it, staff review and approve it into an expense.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy receipts_files_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.has_perm('finance.view'));
create policy receipts_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_perm('finance.manage'));
create policy receipts_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.has_perm('finance.manage'));

create table public.receipts (
  id                  uuid primary key default gen_random_uuid(),
  file_path           text not null unique,
  file_name           text,
  mime_type           text not null,
  status              text not null default 'processing' check (status in ('processing', 'ready', 'approved', 'error', 'discarded')),
  vendor              text,
  receipt_date        date,
  subtotal            numeric(14,2),
  tax                 numeric(14,2),
  total               numeric(14,2),
  currency            text,
  payment_hint        text,                    -- e.g. "Visa ****1234", "Cash"
  receipt_number      text,
  line_items          jsonb not null default '[]'::jsonb,
  account_id          uuid references public.accounts(id),          -- suggested / chosen expense category
  payment_account_id  uuid references public.accounts(id),          -- suggested / chosen bank or card
  vendor_id           uuid references public.vendors(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  memo                text,
  ai_notes            text,
  error               text,
  expense_id          uuid references public.expenses(id) on delete set null,
  uploaded_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  approved_by         uuid references public.profiles(id) on delete set null,
  approved_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index receipts_status_idx on public.receipts (status, created_at desc);

alter table public.receipts enable row level security;
create policy receipts_select on public.receipts for select to authenticated using (public.has_perm('finance.view'));
create policy receipts_write on public.receipts for all to authenticated
  using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));

alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('staff', 'public', 'receipt'));
