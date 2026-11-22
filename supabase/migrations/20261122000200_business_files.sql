-- Business Files: the practice's own important documents (insurance, CRA, incorporation, College, bank),
-- kept in a private bucket, visible only to people who manage business settings, with expiry alerts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-files', 'business-files', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'])
on conflict (id) do nothing;

create policy business_files_select on storage.objects for select to authenticated
  using (bucket_id = 'business-files' and public.has_perm('settings.manage'));
create policy business_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-files' and public.has_perm('settings.manage'));
create policy business_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-files' and public.has_perm('settings.manage'));

create table public.business_documents (
  id            uuid primary key default gen_random_uuid(),
  category      text not null default 'other' check (category in ('insurance', 'tax', 'corporate', 'college', 'banking', 'licences', 'contracts', 'other')),
  title         text not null,
  issuer        text,
  reference_no  text,
  issued_on     date,
  expires_on    date,
  notes         text,
  file_path     text,
  file_name     text,
  file_size     bigint,
  mime          text,
  alerts_sent   int[] not null default '{}',
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index business_documents_cat_idx on public.business_documents (category, created_at desc);
alter table public.business_documents enable row level security;
create policy business_documents_all on public.business_documents for all to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create or replace function public.business_documents_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.uploaded_by := coalesce(new.uploaded_by, auth.uid()); end if;
  -- A new expiry date restarts the alerts.
  if tg_op = 'UPDATE' and new.expires_on is distinct from old.expires_on then new.alerts_sent := '{}'; end if;
  perform public.log_audit(case when tg_op = 'INSERT' then 'business_doc_added' else 'business_doc_updated' end,
    'business_document', new.id::text, jsonb_build_object('title', new.title, 'category', new.category, 'file', new.file_name));
  return new;
end $$;
create trigger business_documents_touch before insert or update on public.business_documents
  for each row execute function public.business_documents_touch();

create or replace function public.business_documents_deleted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_audit('business_doc_deleted', 'business_document', old.id::text, jsonb_build_object('title', old.title, 'file', old.file_name));
  return old;
end $$;
create trigger business_documents_deleted after delete on public.business_documents
  for each row execute function public.business_documents_deleted();

-- Records already known (files to be uploaded by the owner).
insert into public.business_documents (category, title, issuer, reference_no, issued_on, expires_on, notes) values
  ('insurance', 'Professional liability (E&O) insurance', 'Victor Insurance Managers / Navacord', 'Policy SRD676419', '2026-11-22', '2027-07-01',
   'Certificate R1056136. $1,000,000 per loss, $500 deductible. Premium $244 + agency fee $54, paid 2026-11-22. Includes legal helpline (ARAG 1-866-344-4141) and cyber breach coach (844-772-9237).'),
  ('tax', 'GST/HST registration', 'Canada Revenue Agency', '752774570 RT0001', '2026-09-15', null,
   'First return (GST34) covers 2026-09-15 to 2026-12-31, due 2027-03-31.'),
  ('banking', 'Client (trust) account opening', 'TD Canada Trust', null, '2026-11-13', null,
   'e-Transfer Autodeposit: clientfunds@ to the client account, payments@ to the operating account.'),
  ('college', 'College notified of client account', 'College of Immigration and Citizenship Consultants', null, '2026-11-22', null,
   'Notice sent by email on 2026-11-22.');
