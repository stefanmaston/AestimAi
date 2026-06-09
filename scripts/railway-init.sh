#!/usr/bin/env bash
###############################################################################
# Post-deploy-init för Railway-Supabase (kör EFTER deploy-to-railway.sh,
# när supabase-db och supabase-auth har startat).
#
# Gör samma sak som lokalt:
#   1. Sätter login-rollernas lösenord till POSTGRES_PASSWORD
#   2. Väntar på att GoTrue skapat auth.users
#   3. Applicerar appens migrationer (create ... if not exists)
#
# Kräver att TCP-proxy är på för supabase-db i Railway:
#   Railway → supabase-db → Settings → Networking → "TCP Proxy" (Enable)
#
# Använder en tillfällig postgres-container som psql-klient (inget lokalt psql).
#
# Kör:  ./scripts/railway-init.sh   [proxy-host] [proxy-port]
###############################################################################
set -uo pipefail
cd "$(dirname "$0")/.."

PW="$(grep '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2-)"

HOST="${1:-}"; PORT="${2:-}"
if [ -z "$HOST" ] || [ -z "$PORT" ]; then
  echo "▶ Hämtar TCP-proxy-adress från Railway (supabase-db)..."
  railway service supabase-db >/dev/null 2>&1
  VARS="$(railway variables 2>/dev/null)"
  HOST="$(echo "$VARS" | grep -i RAILWAY_TCP_PROXY_DOMAIN | grep -oE '[a-zA-Z0-9.-]+\.railway\.app|[a-zA-Z0-9.-]+\.rlwy\.net|[a-zA-Z0-9.-]+\.proxy\.rlwy\.net' | head -1)"
  PORT="$(echo "$VARS" | grep -i RAILWAY_TCP_PROXY_PORT | grep -oE '[0-9]+' | head -1)"
fi

if [ -z "$HOST" ] || [ -z "$PORT" ]; then
  echo "✗ Hittade ingen TCP-proxy. Aktivera den i Railway:"
  echo "   supabase-db → Settings → Networking → TCP Proxy (Enable)"
  echo "   Kör sedan:  ./scripts/railway-init.sh <host> <port>"
  exit 1
fi

URL="postgresql://supabase_admin:${PW}@${HOST}:${PORT}/postgres"
echo "▶ Ansluter till Railway-DB via ${HOST}:${PORT}"
psql() { docker run --rm -i postgres:15-alpine psql "$URL" "$@"; }

echo "1/3 Sätter lösenord för login-roller..."
until psql -tAc "select 1" >/dev/null 2>&1; do echo "   väntar på DB..."; sleep 3; done
psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
ALTER USER supabase_auth_admin    WITH PASSWORD '${PW}';
ALTER USER authenticator          WITH PASSWORD '${PW}';
ALTER USER supabase_storage_admin WITH PASSWORD '${PW}';
SQL
echo "   ✓ klart"

echo "2/3 Väntar på auth.users (GoTrue-migrationer)..."
echo "    (om det dröjer: starta om supabase-auth i Railway så återansluter den)"
until psql -tAc "select to_regclass('auth.users');" 2>/dev/null | grep -q "auth.users"; do sleep 3; done
echo "   ✓ auth.users finns"

echo "3/3 Applicerar appmigrationer..."
for f in supabase/migrations/*.sql; do
  echo "   → $f"
  psql -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

echo ""
echo "✓ Klart – Railway-backenden är initierad och redo."
