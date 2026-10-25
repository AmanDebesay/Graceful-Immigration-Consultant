-- Website: Google reviews shown on the homepage, and a cache for the news section.

create table public.review_summary (
  id              int primary key default 1 check (id = 1),
  rating          numeric(2,1) not null default 5.0 check (rating between 0 and 5),
  review_count    int not null default 0 check (review_count >= 0),
  reviews_url     text,     -- "See all reviews" (Google Maps listing)
  write_review_url text,    -- "Review us on Google" (the Business Profile's ask-for-review link)
  place_id        text,     -- Google place ID, for automatic sync with the Places API
  synced_at       timestamptz,
  updated_at      timestamptz not null default now(),
  constraint review_summary_urls check ((reviews_url is null or reviews_url ~ '^https://') and (write_review_url is null or write_review_url ~ '^https://'))
);
insert into public.review_summary (id, rating, review_count) values (1, 5.0, 3);
create trigger review_summary_touch before update on public.review_summary for each row execute function public.touch_updated_at();

create table public.site_reviews (
  id           uuid primary key default gen_random_uuid(),
  author       text not null check (char_length(author) between 1 and 80),
  rating       int not null default 5 check (rating between 1 and 5),
  body         text not null default '' check (char_length(body) <= 3000),
  review_date  date,
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  owner_reply  text check (char_length(owner_reply) <= 2000),
  source       text not null default 'google' check (source in ('google', 'manual')),
  external_id  text unique,           -- Google review name, when synced
  visible      boolean not null default true,
  sort         int not null default 100,
  created_at   timestamptz not null default now()
);

alter table public.review_summary enable row level security;
alter table public.site_reviews enable row level security;
-- The public website may read the summary and the visible reviews; staff with settings access manage them.
create policy review_summary_public on public.review_summary for select to anon, authenticated using (true);
create policy review_summary_write on public.review_summary for update to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
create policy site_reviews_public on public.site_reviews for select to anon, authenticated using (visible or public.has_perm('settings.manage'));
create policy site_reviews_write on public.site_reviews for all to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
grant select on public.review_summary, public.site_reviews to anon;

-- News feeds cache (server functions only).
create table public.news_cache (
  key         text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);
alter table public.news_cache enable row level security;   -- no policies: service role only
