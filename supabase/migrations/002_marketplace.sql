-- AestimAi — UCI Bytesmarknad
-- Utökar aestimai_valuations så att en värdering kan publiceras som listning.
-- Ingen ny tabell: en "listning" är en värdering som ägaren markerat publik.
-- Körs mot det HOSTADE Supabase-projektet (vaxtylcqnscnflsucyiv), där
-- aestimai_valuations redan finns och både mobil och webb skriver.

-- ── Nya kolumner ───────────────────────────────────────────
alter table public.aestimai_valuations
  add column if not exists is_public    boolean     not null default false,
  add column if not exists kind         text        not null default 'offer'
    check (kind in ('offer', 'wanted')),
  add column if not exists published_at timestamptz,
  add column if not exists slug         text,
  add column if not exists marketplace  jsonb       not null default '{}'::jsonb;

-- Genererad fulltext-kolumn (svensk stemming) från titel/beskrivning/kategori.
-- to_tsvector med konstant regconfig är immutable → tillåtet i generated column.
alter table public.aestimai_valuations
  add column if not exists search tsvector
  generated always as (
    to_tsvector('swedish',
      coalesce(marketplace->>'title', '')        || ' ' ||
      coalesce(object_data->>'description', '')   || ' ' ||
      coalesce(object_data->>'title', '')         || ' ' ||
      coalesce(object_data->>'category', '')      || ' ' ||
      coalesce(result->>'reasoning', '')
    )
  ) stored;

-- ── Index ──────────────────────────────────────────────────
-- Fulltextsökning (endast meningsfull för publika rader, men GIN täcker alla)
create index if not exists idx_valuations_search
  on public.aestimai_valuations using gin (search);

-- Snabb listning av publika objekt, nyast först
create index if not exists idx_valuations_public
  on public.aestimai_valuations (published_at desc)
  where is_public = true;

-- Kategori-filter på publika rader
create index if not exists idx_valuations_public_category
  on public.aestimai_valuations ((object_data->>'category'))
  where is_public = true;

-- UCI-värde-filter (heltal/numeriskt ur result-jsonb)
create index if not exists idx_valuations_public_uci
  on public.aestimai_valuations (((result->>'uci_value')::numeric))
  where is_public = true;

-- ── RLS-policyer ───────────────────────────────────────────
-- Tabellen har redan RLS på + policyer "select own"/"insert own"/"delete own"
-- (från 001). Vi skriver om insert-policyn + lägger till publik läsning och
-- update-policy.

-- Ersätt 001:ans insert-policy: anonyma sessioner får INTE sätta is_public=true
-- vid insättning (UI:t gatar det, men RLS skall garantera det på DB-nivå).
drop policy if exists "insert own" on public.aestimai_valuations;
create policy "insert own" on public.aestimai_valuations
  for insert with check (
    auth.uid() = user_id
    and (
      is_public = false
      or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    )
  );

-- Alla (även anon) får läsa publika rader.
drop policy if exists "select public listings" on public.aestimai_valuations;
create policy "select public listings" on public.aestimai_valuations
  for select using (is_public = true);

-- Ägaren får uppdatera sina egna rader (krävs för att publicera/avpublicera).
-- För att PUBLICERA krävs ett riktigt konto: anonyma sessioner får inte sätta
-- is_public = true.
drop policy if exists "update own" on public.aestimai_valuations;
create policy "update own" on public.aestimai_valuations
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      is_public = false
      or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    )
  );

-- Säkerställ grants (Supabase sätter normalt dessa, men explicit är tryggt).
grant select on public.aestimai_valuations to anon;
grant select, insert, update, delete on public.aestimai_valuations to authenticated;

-- ── Storage: bucket för publiceringsbilder ─────────────────
insert into storage.buckets (id, name, public)
  values ('listing-images', 'listing-images', true)
  on conflict (id) do nothing;

-- Publik läsning av bilder i bucketen.
drop policy if exists "listing images public read" on storage.objects;
create policy "listing images public read" on storage.objects
  for select using (bucket_id = 'listing-images');

-- Inloggade användare får ladda upp i bucketen.
drop policy if exists "listing images authenticated upload" on storage.objects;
create policy "listing images authenticated upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-images');

-- Användare får ta bort sina egna uppladdade bilder.
drop policy if exists "listing images owner delete" on storage.objects;
create policy "listing images owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-images' and owner = auth.uid());
