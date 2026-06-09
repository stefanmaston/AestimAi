-- AestimAi — valutahistorik (ECB-data via frankfurter.app)
-- En rad per handelsdag. Lagrar SEK-pris per valutaenhet.
-- Fylls på automatiskt av uci-server vid uppstart och dagligen.

create table if not exists public.uci_fx_rates (
  date   date    primary key,
  eur    numeric(12,6),
  usd    numeric(12,6),
  gbp    numeric(12,6),
  nok    numeric(12,6),
  dkk    numeric(12,6),
  chf    numeric(12,6),
  jpy    numeric(12,6),
  fetched_at timestamptz default now()
);

-- Läs-access för anon (frontend kan läsa direkt om behövs)
alter table public.uci_fx_rates enable row level security;
create policy "fx public read" on public.uci_fx_rates
  for select using (true);

-- Index för tidsintervall-frågor
create index if not exists idx_fx_date on public.uci_fx_rates (date);
