#!/bin/sh
set -e

cd /app

# Reinstall only if the seeded node_modules volumes came up empty.
if [ ! -d node_modules ] || [ ! -d apps/web/node_modules ]; then
  echo "▶ installing dependencies"
  bun install
fi

cd /app/apps/web

echo "▶ starting Vite dev server"
exec bun run dev
