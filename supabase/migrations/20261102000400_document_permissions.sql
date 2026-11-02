-- Client documents get their own permissions, so the owner decides on Team & Access who can see,
-- upload and delete them. Starting grants match what each role could already do.
insert into public.permissions (key, label, category) values
  ('documents.view',   'See and open client documents (OneDrive)',  'Documents'),
  ('documents.upload', 'Upload client documents',                   'Documents'),
  ('documents.delete', 'Delete client documents',                   'Documents')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission) values
  ('rcic', 'documents.view'), ('rcic', 'documents.upload'), ('rcic', 'documents.delete'),
  ('case_manager', 'documents.view'), ('case_manager', 'documents.upload'), ('case_manager', 'documents.delete'),
  ('assistant', 'documents.view'), ('assistant', 'documents.upload')
on conflict do nothing;

drop policy if exists client_documents_select on public.client_documents;
create policy client_documents_select on public.client_documents for select to authenticated
  using (public.has_perm('documents.view'));
