-- Dashboard redesign: profile photos, appointments and client document expiry dates.

-- ── Profile photo ──
alter table public.profiles add column avatar_url text;
grant update (avatar_url) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Each user may only write inside their own folder: avatars/<user id>/...
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Appointments ──
create table public.appointments (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid references public.contacts(id) on delete cascade,
  title        text not null,
  kind         text not null default 'consultation' check (kind in ('consultation','document_review','follow_up','hearing','other')),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text not null default 'Zoom',
  meeting_link text,
  notes        text,
  assigned_to  uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint appointments_end_after_start check (ends_at is null or ends_at > starts_at)
);
create index appointments_starts_idx on public.appointments (starts_at);
alter table public.appointments enable row level security;
create policy appointments_select on public.appointments for select to authenticated using (public.has_perm('crm.view'));
create policy appointments_write on public.appointments for all to authenticated
  using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));

-- ── Client document expiry dates (passport, permits, medicals …) ──
create table public.key_dates (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  doc_type    text not null,
  expires_on  date not null,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index key_dates_expires_idx on public.key_dates (expires_on);
alter table public.key_dates enable row level security;
create policy key_dates_select on public.key_dates for select to authenticated using (public.has_perm('crm.view'));
create policy key_dates_write on public.key_dates for all to authenticated
  using (public.has_perm('crm.edit')) with check (public.has_perm('crm.edit'));
