#!/usr/bin/env bash
# Komplett post-uppstart-setup för AestimAi:s self-hosted Supabase.
#
# Kör EFTER:  docker compose up -d supabase-db supabase-auth supabase-rest supabase-kong uci-server
# Användning: ./scripts/apply-migrations.sh
#
# Skriptet är idempotent och gör tre saker:
#   1. Sätter login-rollernas lösenord till POSTGRES_PASSWORD. supabase/postgres
#      skapar rollerna (supabase_auth_admin, authenticator, …) med platshållar-
#      lösenord, så GoTrue/PostgREST kan annars inte ansluta.
#   2. Väntar på att GoTrue skapat auth-schemat (auth.users).
#   3. Applicerar appens migrationer (create ... if not exists).
set -euo pipefail
cd "$(dirname "$0")/.."

PW="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)"
psql_admin() { docker compose exec -T -e PGPASSWORD="$PW" supabase-db psql -U supabase_admin -d postgres "$@"; }

echo "1/3 Väntar på att databasen blir redo..."
until docker compose exec -T supabase-db pg_isready -U supabase_admin >/dev/null 2>&1; do sleep 2; done

echo "1/3 Sätter lösenord för login-roller..."
psql_admin -v ON_ERROR_STOP=1 >/dev/null <<SQL
ALTER USER supabase_auth_admin    WITH PASSWORD '${PW}';
ALTER USER authenticator          WITH PASSWORD '${PW}';
ALTER USER supabase_storage_admin WITH PASSWORD '${PW}';
SQL

echo "2/3 Startar om auth/rest så de återansluter..."
docker compose restart supabase-auth supabase-rest >/dev/null 2>&1 || true

echo "2/3 Väntar på auth.users (GoTrue-migrationer)..."
until psql_admin -tAc "select to_regclass('auth.users');" 2>/dev/null | grep -q "auth.users"; do sleep 2; done

echo "3/3 Applicerar appmigrationer..."
for f in supabase/migrations/*.sql; do
  echo "   → $f"
  psql_admin -v ON_ERROR_STOP=1 < "$f" >/dev/null
done

echo "Klart – backend redo."
