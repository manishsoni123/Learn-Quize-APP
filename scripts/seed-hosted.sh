#!/usr/bin/env bash
# Learn-Quize · load the seed question bank into a HOSTED Supabase project.
#
#   bash scripts/seed-hosted.sh "postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres"
#
# The connection string is in the Dashboard under Connect → Session pooler.
# Uses psql because `supabase db query` sends a file as one prepared statement
# and seed.sql is a multi-statement script — that path can never work.
#
# Idempotent: seed.sql inserts by fixed slugs/content under source='seed' and
# skips what already exists. Questions land as `in_review`; approving them is
# a separate deliberate act (supabase/dev/promote_staff.sql, then
# supabase/dev/publish_seed.sql).

set -euo pipefail

URL="${1:-${SUPABASE_DB_URL:-}}"
if [ -z "$URL" ]; then
  echo "usage: bash scripts/seed-hosted.sh <postgres-connection-string>" >&2
  echo "       (Dashboard → Connect → Session pooler)" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED="$ROOT/supabase/seed.sql"

if command -v psql >/dev/null 2>&1; then
  psql "$URL" -v ON_ERROR_STOP=1 -f "$SEED"
else
  # No local psql: borrow one. Docker is already a project requirement
  # (supabase start, tests/run.sh).
  docker run --rm -i postgres:17-alpine psql "$URL" -v ON_ERROR_STOP=1 < "$SEED"
fi

echo
echo "Seed loaded (in_review). Next:"
echo "  1. Sign up in the app against this project."
echo "  2. psql \"\$URL\" -v email=\"'you@example.com'\" -f supabase/dev/promote_staff.sql"
echo "  3. npx supabase db query --linked --file supabase/dev/publish_seed.sql"
