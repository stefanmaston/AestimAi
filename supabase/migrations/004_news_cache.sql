-- Delad nyhetscache — en rad per kategori, uppdateras högst var 2:e timme från NewsAPI.
-- Skrivs/läses endast via service_role (api/news.js). RLS utan policies = ingen publik direktåtkomst.

create table if not exists public.aestimai_news_cache (
  category   text primary key,
  articles   jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  source     text not null default 'newsapi'
);

create index if not exists idx_news_cache_fetched_at
  on public.aestimai_news_cache (fetched_at desc);

alter table public.aestimai_news_cache enable row level security;

comment on table public.aestimai_news_cache is
  'Cached NewsAPI articles per category; refreshed at most every ~2h by /api/news.';
