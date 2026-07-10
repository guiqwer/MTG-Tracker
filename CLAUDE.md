# CLAUDE.md — agent playbook

MTG Commander match tracker. Monorepo (Bun workspaces): `apps/api` (Bun + Elysia + Prisma v6 + Postgres) and `apps/web` (React 19 + Vite + Tailwind v4 + TanStack Query + Eden Treaty). Fully dockerized; prod deploys automatically on push to `main` (PDC/Coolify). Big picture, roadmap and task split: see [PROJECT.md](./PROJECT.md).

## Commands

```bash
# Run / rebuild everything (db + api + web). Web is served at http://localhost:8090
docker compose up -d --build            # or: --build api / --build web for one service

# Typecheck BOTH apps (run inside the api container — it has the workspace + prisma client)
docker compose exec -T api sh -lc 'cd /app/apps/web && printf "{\n  \"extends\": \"./tsconfig.json\",\n  \"references\": []\n}\n" > tsconfig.check.json; cd /app && bun node_modules/.bun/typescript@5.9.3/node_modules/typescript/lib/tsc.js --noEmit -p apps/api/tsconfig.json && echo API_OK && bun node_modules/.bun/typescript@5.9.3/node_modules/typescript/lib/tsc.js --noEmit -p apps/web/tsconfig.check.json && echo WEB_OK'

# API logs (boot runs prisma db push + seed automatically)
docker compose logs api --tail 30

# DB console
docker compose exec -T db psql -U mtg -d mtgtracker
```

- Schema changes: edit `apps/api/prisma/schema.prisma`, then `docker compose up -d --build api` (the entrypoint runs `db push` + seed). Keep migrations **additive** (nullable columns) — prod uses `db push`, destructive changes fail or lose data.
- There is **no dev hot reload** — the compose is the prod build. Rebuild the changed service.
- No seeded accounts. Create users via `POST /api/auth/signup` or the UI; password min 8 chars.

## Verification workflow (do this before claiming done)

1. Rebuild + typecheck (commands above).
2. API smoke via curl against `http://localhost:8090/api` (login → token → endpoints). Pattern used across this repo's history:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:8090/api/auth/signup -H 'content-type: application/json' \
     -d '{"username":"t_'$RANDOM'","email":"t'$RANDOM'@x.io","password":"secret123","dateOfBirth":"1990-01-01"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
   curl -s http://localhost:8090/api/groups -H "authorization: Bearer $TOKEN"
   ```
   Always test the authz negatives too (no token → 401, outsider → 403/404).
3. Browser E2E: playwright-core + system Chrome. Install in the scratchpad (`bun add playwright-core`), launch with `executablePath: '/usr/bin/google-chrome-stable', args: ['--no-sandbox']`, screenshot pages, assert `console` has no errors.

## Gotchas (hard-won — do not regress)

- **Prisma is pinned to v6.** Never `bunx prisma` (fetches v7, rejects `url = env()`); use `bun run prisma:*` in `apps/api`.
- **Eden route shapes:** group-root is `api.players.get()` (NOT `.index`); path params via call syntax `api.decks({ id }).get()`.
- **Eden error unions:** no response schemas on the API, so error bodies pollute data types. Narrow with `data && 'error' in data ? null : data` in every queryFn/mutationFn; for complex payloads declare an interface and cast (`data as unknown as X`).
- **Never `include: { user: true }`** in Prisma — it leaks `passwordHash`. Always `user: { select: { id, username, avatarColor } }`.
- **Auth:** the global guard (`security/guard.ts`) only verifies the JWT; handlers get the caller via `requireUserId(headers.authorization)`. `PUBLIC_PATHS` is an exact-match set of full prefixed paths.
- **Group scoping:** list endpoints take `groupId` + `isMember` check (403 `FORBIDDEN_GROUP`); detail/delete endpoints resolve the resource's group and 404 outsiders; profile/personal-deck visibility uses `sharedGroupIds`.
- **Members = players:** joining/creating a group calls `ensureMemberPlayer` (lib/players.ts). Guests are players with `userId null`. Deleting linked players → 403; guests with match history → 409.
- **Frontend touch:** never `opacity-0 group-hover:opacity-100` alone (invisible on mobile) — use `sm:opacity-0 sm:group-hover:opacity-100`.
- **`position:fixed` overlays** (deck hover preview): portal to `document.body` and keep `.page-enter` with `animation-fill-mode: backwards` — a filled transform ancestor hijacks fixed positioning.
- **Accent art:** new images in `apps/web/public/mtg/` must be recompressed: `magick in.webp -resize '1600x1600>' -quality 78 -define webp:method=6 out.webp`.
- **Concurrency:** check-then-act must be backstopped by unique constraints + `isUniqueViolation` (P2002) → clean 409, never a raw 500.
- **Moxfield fetches need a browser User-Agent** (`lib/decklist.ts`); it's an unofficial API — text import is the fallback path.
- **Oracle tags** (`lib/card-tags.ts`): cards get Scryfall Tagger otags (removal/ramp/…) via batched `otag:` searches — once per card globally (`taggedAt`), fired in background on deck import/sync, deduped per deck in-process. On Scryfall failure persist NOTHING (so retry stays clean); never mark a card tagged with guessed/empty tags.

## Conventions

- UI text: **English only** (owner's rule). Commits: English, imperative, **no Co-Authored-By trailer**. Push to `main` = production deploy — only push when the owner says so.
- Backend module pattern: `new Elysia({ prefix: '/x' })`, `t.Object` validation, `set.status` + `{ error, error_description }` for failures (OAuth-style codes).
- Frontend page pattern: `useQuery`/`useMutation` wrapping Eden, sonner toasts, `qc.invalidateQueries` on success, `PageHeader` + `Card` + `Skeleton` + `EmptyState` shells, query keys include `groupId`.
- Design system: tokens in `index.css` (Arena light + `.dark`), WUBRG accent classes on `<html>`, hand-rolled primitives in `components/ui/` (no Radix). Charts are pure CSS bars — no chart libraries.
- Secrets live only in the PDC panel (never in the repo). Local compose has safe dev fallbacks.
