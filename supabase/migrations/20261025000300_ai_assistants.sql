-- AI assistants (Claude): practice instructions in settings + token usage log for cost tracking.
-- Conversation text is never stored; only token counts.

alter table public.org_settings
  add column ai_staff_instructions  text not null default '',
  add column ai_public_instructions text not null default '',
  add column ai_public_enabled      boolean not null default true;

create table public.ai_usage (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('staff','public')),
  user_id       uuid references public.profiles(id) on delete set null,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  created_at    timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated using (public.has_perm('settings.manage'));
