-- Client portal: invited clients sign in at /app/ and see only their own file (agreements, documents shared with
-- them, invoices, case status, the documents still needed) and exchange secure messages with the office.
-- Clients never read these tables directly: the "portal" function checks who they are and returns their records only.
alter table public.client_documents add column if not exists shared boolean not null default false;      -- visible in the client's portal
alter table public.client_documents add column if not exists from_client boolean not null default false; -- uploaded by the client
alter table public.contacts add column if not exists portal_invited_at timestamptz;

create table if not exists public.portal_messages (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  sender_id        uuid references public.profiles(id) on delete set null,
  from_client      boolean not null,
  body             text not null check (length(body) between 1 and 5000),
  read_by_staff_at timestamptz,
  read_by_client_at timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists portal_messages_contact_idx on public.portal_messages (contact_id, created_at);
create index if not exists portal_messages_unread_idx on public.portal_messages (contact_id) where from_client and read_by_staff_at is null;
alter table public.portal_messages enable row level security;
drop policy if exists portal_messages_select on public.portal_messages;
create policy portal_messages_select on public.portal_messages for select to authenticated using (public.has_perm('crm.view'));

insert into public.permissions (key, label, category) values
  ('portal.manage', 'Invite clients to the portal, share documents and message clients', 'Clients')
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values ('rcic', 'portal.manage'), ('case_manager', 'portal.manage')
on conflict do nothing;
