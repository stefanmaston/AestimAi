# AestimAi Web — projektstatus

**Senast uppdaterad:** 2026-06-12  
**Repo:** `/Users/stefanlarsson-mastonstrale/Documents/Sunthetics/Websida/AestimAi` → GitHub `stefanmaston/AestimAi`  
**Produktion:** https://aestimai.org (Vercel, projekt `aestim-ai`)  
**Mobilapp (separat):** `/Users/stefanlarsson-mastonstrale/Documents/Sunthetics/Websida/AestimAi-App` → se `AestimAi-App/AGENTS.md`

## Senaste commits (web)

| Commit | Innehåll |
|--------|----------|
| `787f678` | Lazy Stripe-init (503 istället för krasch) |
| `4dc5a87` | Vercel Stripe-deps + billing helpers |
| `ed36bbf` | Pro via Stripe, 50 aktiva annonser |
| `a54d1a1` | Extra annons €1 (Freemium) |
| `5eafc48` | `.env.example` med Stripe-variabler |

**Ocommittat lokalt:** `main.css` (mobil header = samma mönster som sidebar), div. assets — ej deployat.

## Stripe & betalning (Vercel Production)

Miljövariabler som **måste** finnas i Vercel → **Production**:

| Variabel | Syfte |
|----------|--------|
| `STRIPE_SECRET_KEY` | `sk_test_…` (sandlåda) eller `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` från webhook-endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Pro-plan + publicera annons efter betalning |

Webhook-URL: `https://aestimai.org/api/billing/webhook`  
Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

**Status 2026-06-12:** Stripe API OK på produktion (checkout returnerar 401 utan inloggning). `STRIPE_SECRET_KEY` lades till i Vercel efter att den saknades initialt.

**Lokal `.env`:** `/Users/stefanlarsson-mastonstrale/Documents/Sunthetics/Websida/AestimAi/.env` (gitignored). Mall: `.env.example`.

## Priser & planer

| Plan | Bytesmarknad | Betalning |
|------|----------------|-----------|
| Freemium | 1 aktiv annons (+ €1/extra) | Stripe checkout |
| Pro €25/mån | 50 aktiva annonser | Stripe subscription (`/api/billing/checkout`) |
| Enterprise | Obegränsat | Manuellt (e-post) |

Webb-hash för moduler: `#pricing` = Priser & Konto, `#market`, `#uci`, `#account`.  
Mobilappens **Uppgradera** ska länka till `https://aestimai.org/#pricing`.

## API-rutter (Vercel `api/`)

| Rutt | Funktion |
|------|----------|
| `/api/billing/checkout` | Pro-abonnemang |
| `/api/billing/confirm-pro` | Aktivera Pro efter checkout |
| `/api/billing/webhook` | Stripe webhook |
| `/api/billing/portal` | Hantera abonnemang |
| `/api/market/checkout` | Extra annons €1 |
| `/api/market/confirm-listing` | Publicera efter betalning |

Stripe-helper: `api/_stripe.js` (lazy init). Billing-planlogik: `api/billing/_plan.js`.

## Övrigt

- **Nyheter:** `/api/news` — Supabase `aestimai_news_cache`, TTL 2h (`NEWS_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY`)
- **UCI Lab shop:** Stripe API finns men UI länkar Amazon
- **Railway:** `/api/uci/*` proxas via `vercel.json`

## Snabbtest Stripe (produktion)

```bash
curl -X POST https://aestimai.org/api/billing/checkout -H "Content-Type: application/json" -d '{}'
# Förväntat: {"error":"Inloggning krävs."} + HTTP 401
```

Testkort: `4242 4242 4242 4242`
