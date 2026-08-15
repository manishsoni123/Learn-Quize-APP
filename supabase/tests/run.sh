#!/usr/bin/env bash
# Learn-Quize · apply every migration to a throwaway Postgres and run the
# smoke test. Needs Docker; nothing else. Roughly 15 seconds after the first
# run pulls the image.
#
#   ./supabase/tests/run.sh
#
# This is not a substitute for `supabase start` — it stubs the auth schema
# (see 00_local_auth_stub.sql) so the SQL can be exercised without booting the
# full Supabase stack. It is fast enough to run on every commit.

set -euo pipefail

CONTAINER=lq-verify
DB=learnquize
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$DB" \
  postgres:17-alpine >/dev/null

printf 'waiting for postgres '
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; then
    echo "ready"
    break
  fi
  printf '.'
  sleep 1
done

run() { docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 < "$1"; }

echo
echo "auth stub"
run supabase/tests/00_local_auth_stub.sql
echo "  ok"

echo
echo "migrations"
for f in supabase/migrations/*.sql; do
  printf '  %-46s' "$(basename "$f")"
  run "$f"
  echo 'ok'
done

echo
printf 'seed bank%50s' ''
run supabase/seed.sql >/dev/null
docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc "
  select count(*) || ' questions, ' || (select count(*) from public.options) || ' options'
  from public.questions;"

# Every question must have exactly one correct option, or the player awards
# XP for nothing.
BAD=$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc "
  select count(*) from (
    select q.id from public.questions q
    join public.options o on o.question_id = q.id
    group by q.id having count(*) filter (where o.is_correct) <> 1
  ) x;")
if [ "$BAD" != "0" ]; then
  echo "FAIL — $BAD questions do not have exactly one correct option"
  exit 1
fi

echo
echo "smoke test"
run supabase/tests/01_smoke_test.sql

echo
echo "PASS — schema, seed bank, game loop, arcade rules and security boundary verified"
docker rm -f "$CONTAINER" >/dev/null
