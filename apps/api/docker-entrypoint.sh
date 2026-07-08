#!/bin/sh
set -e

cd /app

# Named volumes are seeded from the image, but if that ever comes up empty
# (e.g. a fresh `up` after changing deps), reinstall. Writes only land in the
# node_modules volumes, never on the host bind mount.
if [ ! -d node_modules ] || [ ! -d apps/api/node_modules ]; then
  echo "▶ installing dependencies"
  bun install
fi

cd /app/apps/api

echo "▶ prisma generate + db push (sync schema -> database)"
bun run db:setup

echo "▶ seeding baseline data (idempotent)"
bun run src/seed.ts || echo "  (seed skipped)"

echo "▶ starting API in watch mode"
exec bun run --watch src/index.ts
