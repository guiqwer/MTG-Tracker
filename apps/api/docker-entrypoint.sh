#!/bin/sh
set -e

cd /app/apps/api

echo "▶ prisma generate + db push (sync schema -> database)"
bun run db:setup

echo "▶ seeding baseline data (idempotent)"
bun run src/seed.ts || echo "  (seed skipped)"

echo "▶ starting API"
exec bun run src/index.ts
