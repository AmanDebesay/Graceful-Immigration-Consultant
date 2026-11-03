-- Each client document records what it is (e.g. "Use of a Representative (IMM 5476)"), and representative /
-- consent forms get their own OneDrive sub-folder ("06 Representative & consent").
alter table public.client_documents add column if not exists doc_type text check (char_length(doc_type) <= 120);
alter table public.client_documents drop constraint if exists client_documents_category_check;
alter table public.client_documents add constraint client_documents_category_check
  check (category in ('agreements', 'documents', 'forms', 'correspondence', 'decisions', 'representative'));
update public.client_documents set doc_type = 'Signed agreement' where category = 'agreements' and doc_type is null and agreement_id is not null;
