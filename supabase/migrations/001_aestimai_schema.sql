-- AestimAi — initial schema
-- Kör automatiskt av supabase-db-containern vid första uppstart

-- ── Värderingshistorik ────────────────────────────────────
create table if not exists public.aestimai_valuations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  object_data jsonb not null,       -- inmatade fältvärden
  result      jsonb not null,       -- UCI-värderingssvar
  image_url   text,                 -- valfri bild (kameravärdering)
  source      text default 'manual' check (source in ('manual', 'camera')),
  created_at  timestamptz default now()
);

-- RLS: varje användare ser och skriver bara sina egna rader
alter table public.aestimai_valuations enable row level security;

create policy "select own" on public.aestimai_valuations
  for select using (auth.uid() = user_id);

create policy "insert own" on public.aestimai_valuations
  for insert with check (auth.uid() = user_id);

create policy "delete own" on public.aestimai_valuations
  for delete using (auth.uid() = user_id);

-- Index för snabb hämtning per användare
create index if not exists idx_valuations_user_id on public.aestimai_valuations(user_id);
create index if not exists idx_valuations_created_at on public.aestimai_valuations(created_at desc);
