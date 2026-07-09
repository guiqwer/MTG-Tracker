# Magic Match Tracker — Project Handbook

> Commander/EDH match tracker for playgroups: log matches with a full podium,
> import decks from Moxfield, and see who really runs the table.
> Live at https://mtg-tracker.projetos.ltap.ifce.edu.br
>
> Agent-facing operational guide (commands, gotchas, test recipes): see [CLAUDE.md](./CLAUDE.md).

---

## 1. Current feature set

### Accounts & auth
- Self-hosted auth: username/email + password (argon2id via `Bun.password`), JWT HS256 (`jose`, 7d, iss/aud/sub claims)
- Global route guard: everything requires a valid token except `/`, `/health`, `/auth/signup`, `/auth/login`
- Settings: change email / change password (both re-authenticated with current password), profile customization (avatar color, bio, signature deck)

### Groups (the core model — "gym rats" style)
- Create a group → shareable invite code (7-char, ambiguity-free alphabet); others join with the code
- Roles: OWNER / MEMBER; owner deletes the group, members leave (last leave deletes; owner leave auto-promotes the oldest member)
- **All data is group-scoped**: players, decks, matches, stats. Non-members get 403/404; cross-group access is impossible by construction
- Active-group switcher in the nav (persisted per browser); pages gate behind having a group

### Players — members and guests
- **Member = player automatically**: creating/joining a group creates your seat (linked to the account); a boot backfill covers pre-existing members
- **Guests**: hand-added players for friends without an account; count in stats
- **Claim**: merge a guest's whole history (matches + decks) into a member's seat when the friend finally signs up (409 when both sat in one match)

### Decks
- Group decks (owned by a table player) and **personal decks** (owned by the account — portable to every playgroup, visible to groupmates)
- **Import** from a Moxfield link (their API, full 100 cards) or pasted text (Arena/Moxfield formats, `Commander:` sections, set-code suffixes)
- **Moxfield-style deck view**: banner with commander art, list grouped by card type, hover card preview (viewport-clamped), mana curve + type charts, deck price (Scryfall USD)
- **Sync**: owner re-imports a Moxfield-linked deck (list, commander, identity, prices)
- **Copy list / download .txt** in Moxfield-compatible format

### Matches
- Post-game logging with **podium** (placement per seat, the way Commander actually plays), duration/turns/win condition/end reason
- **Event timeline** per match: removals, counters, tutors, wipes, ramp, draws, combos… with actor, target and card (Scryfall picker)
- **Edit after the fact**: metadata and placements
- **CSV export** of the group's full history (one row per seat)

### Stats & dashboard
- Overview counters, top players / top decks with winrate bars
- **Table personalities** (event superlatives: Assassin, Destroyer, Police, Librarian, Farmer, Engine, Combo Player, Archenemy)
- Table meta: win-condition distribution, winrate by seat, winning colors, most played cards
- Podium & eliminations (avg placement, top-2 rate, first blood), monthly activity chart, recent-matches feed

### Profiles
- `/app/profile/:id` (opaque cuid — no usernames in URLs), visible **only to people sharing a group**; every number aggregates only shared groups
- Banner from the signature deck, stats, **head-to-head** ("You vs them"), personality titles, favorite commander, colors played, all their decks, recent matches

### UX / platform
- Landing page, light/dark mode (no-flash init, OS fallback), WUBRG accent rotation per visit (logo mark follows the color: sun/drop/skull/fire/tree), per-color backdrop art
- English-only UI. Mobile-friendly (touch-visible actions, responsive grids). Page transitions (reduced-motion aware)
- Dockerized: `db` (Postgres 16) + `api` (Bun/Elysia) + `web` (nginx serving the built SPA, proxying `/api/`); deployed on PDC/Coolify, push to `main` auto-deploys

---

## 2. Architecture snapshot

```
apps/api  (Bun + Elysia + Prisma v6 + Postgres)
  src/index.ts          app assembly + global auth guard (onBeforeHandle)
  src/modules/          auth, groups, profiles, players, cards, decks, matches, stats
  src/security/         tokens (JWT sign/verify, requireUserId), guard, passwords
  src/lib/              prisma, membership (isMember/sharedGroupIds), players
                        (ensureMemberPlayer), scryfall, decklist (moxfield/text parsers),
                        cards, invite, prisma-errors
  src/seed.ts           boot script: legacy-demo cleanup + member-player backfill
apps/web  (React 19 + Vite + Tailwind v4 + TanStack Query + Eden Treaty)
  src/lib/              eden (typed client), auth (token), query (client), group
                        (active-group context), theme, me, accent
  src/pages/            landing, login, signup, dashboard, players, decks, deck-detail,
                        matches, match-detail, groups, group-new/join/detail, settings, profile
  src/components/       layout, user-menu, group-switcher, theme-toggle, require-group,
                        deck-card, invite-code, logo, mana, ui/* primitives
```

Key invariants:
- **Auth**: guard only *verifies* the token; handlers resolve the caller via `requireUserId(headers.authorization)`. There is no `ctx.user`.
- **Scoping**: list endpoints take `groupId` and check `isMember`; detail endpoints resolve the resource's group and 404 outsiders; profiles/personal decks use `sharedGroupIds`.
- **Types end-to-end**: the API's `App` type feeds Eden Treaty. No response schemas → error bodies pollute the data type; the client narrows with `data && 'error' in data ? null : data`.
- **Never `user: true`** in Prisma includes (leaks `passwordHash`) — always a `select`.

---

## 3. Verification backlog (needs checking / known gaps)

Ordered by risk. Everything shipped was verified manually (curl + Playwright), but there is **no automated regression suite** — that's the #1 gap.

| # | Item | Risk | Notes |
|---|------|------|-------|
| 1 | **No automated tests** | High | All checks are ad-hoc. Priority: API integration suite (see §6 workstream T) |
| 2 | **No rate limiting** | High | `/auth/login` is brute-forceable; argon2id slows it but doesn't stop it |
| 3 | **No token revocation / refresh** | Med | 7d JWTs; logout is client-side only. A leaked token stays valid until expiry. `JWT_SECRET` rotation logs everyone out (acceptable escape hatch) |
| 4 | **No password reset / email verification** | Med | Locked-out users have no recovery path. Needs SMTP (not configured on PDC) |
| 5 | **No global error handler** | Med | Unexpected throws → raw 500 without the `{error, error_description}` shape. Add `onError` in `index.ts` |
| 6 | **Unbounded lists** | Med | `GET /matches` returns everything with full includes. Fine for pods; needs pagination before groups with 500+ matches |
| 7 | **Moxfield API is unofficial** | Med | `api2.moxfield.com` may start blocking. Text import is the fallback; consider caching last-good sync |
| 8 | **DB backups** | Med | `pgdata` volume on PDC has no backup routine. Verify Coolify volume backup or add pg_dump cron |
| 9 | Check-then-act races | Low | Mostly backstopped by unique constraints (join, email, invite code); leave/promote path could still race owner-promotion (worst case: two owners — benign) |
| 10 | Prices only refresh on import/sync | Low | Deliberate; a weekly job could refresh stale prices |
| 11 | Group deletion is destructive | Low | Cascades players/matches with no export prompt. CSV export exists — consider suggesting it in the confirm dialog |
| 12 | `dateOfBirth` collected but unused | Low | Either use it (age gate?) or drop it (privacy minimization) |
| 13 | Deck detail fetches full card rows | Low | ~100 rows incl. oracle text; could `select` down if payloads matter |

---

## 4. Scalability plan

Current design assumptions: pods of ~4–20 people, dozens of groups, thousands of matches. The stack is comfortable well beyond that; scale work should follow **measured** pain, in this order:

### Stage 1 — hundreds of active users (mostly done)
- ✅ Group-scoped queries with proper indexes (`groupId`, `userId`, composite uniques)
- ✅ HTTP: gzip, immutable asset caching, compressed art (3.4MB → 660KB)
- ✅ Bulk operations (import = 3 queries; no N+1 upserts)
- ✅ Client: 60s staleTime, targeted invalidations
- ☐ Pagination on `GET /matches` (+ frontend infinite scroll) — first real need
- ☐ Rate limiting (in-memory sliding window is enough at this stage)
- ☐ Structured logs (request id + latency) to see the truth before optimizing more

### Stage 2 — thousands of users
- Stats move from fetch-and-reduce to SQL aggregates (`GROUP BY` / window functions); `/stats/insights` becomes 3–4 aggregate queries instead of loading all events/matches
- Cache hot reads (insights per group, 60s TTL) — in-process cache first, Redis only when there are multiple API instances
- Background jobs (price refresh, Moxfield re-sync) via a simple queue table + interval worker — no extra infra
- Postgres connection pooling (pgbouncer) when connections become the ceiling

### Stage 3 — beyond
- The API is **stateless** (JWT, no sessions) → horizontal scale is trivial behind the existing nginx; only the DB is shared state
- Live match mode (roadmap) introduces WebSockets: prefer a single "table host" connection model; sticky sessions or a pub/sub layer if multi-instance
- Static/art to object storage + CDN; card images already come from Scryfall's CDN
- Data growth is inherently small: a match ≈ 1 + 4 participants + ~10 events rows; the global card cache tops out at ~30k rows (all of Magic)

**Anti-goals:** no microservices, no Kubernetes, no premature Redis. One Postgres + one API container goes a very long way for this domain.

---

## 5. Roadmap (agreed with the owner)

| Priority | Feature | Status |
|----------|---------|--------|
| done | Deck tools (price, sync, charts, copy/export) + flow gaps (match edit, claim, CSV) | shipped 2026-07-09 |
| next | **Live match mode** — life/commander damage/poison at the table, finish → auto-creates the match | backlog |
| next | **Seasons + achievements** — periodic leaderboards, champion badges, achievement system | backlog |
| later | Notifications / group activity feed | backlog |
| later | Password reset via email, refresh tokens, rate limiting | backlog (see §3) |
| later | PWA (installable, offline shell) | backlog |

---

## 6. Task division (workstreams for parallel agents)

Independent workstreams, each self-contained enough for one agent/dev. Dependencies noted.

### T — Test suite (unblocks everything; do first)
1. **T1** API integration harness: `bun test` + Eden Treaty against the compose stack (spin `docker compose up`, run against `:8090/api`, unique usernames per run). Cover: auth (signup/login/401/409), group scoping (403/404 matrix), claim (merge + conflict), match edit, deck import (text fixture, no network) — *size M*
2. **T2** Authorization regression matrix as table-driven tests (every endpoint × outsider/member/owner) — *size S, after T1*
3. **T3** Playwright E2E in CI style: login → create group → add guest → log match → dashboard renders (the scripts in this repo's history are the blueprint) — *size M, independent*

### L — Live match mode (flagship)
1. **L1** Design doc: table session model (host device vs per-player), reconnection, storage (a `LiveSession` table vs in-memory) — *size S*
2. **L2** API: session endpoints + WebSocket (Elysia `.ws()`) for state broadcast — *size L, after L1*
3. **L3** UI: table screen (life totals, commander damage grid, poison, turn tracker), finish → prefilled match form — *size L, after L2*
4. **L4** Fallback polling mode for flaky venue Wi-Fi — *size S, after L3*

### S — Seasons & achievements
1. **S1** Schema: `Season` (groupId, name, startsAt, endsAt) + season filter on stats endpoints (`?seasonId=`) — *size M*
2. **S2** Achievements: definition table + evaluation on match create/edit (First Blood, 10 wins, five colors, streaks); badges on profile — *size M, independent of S1*
3. **S3** Dashboard/profile UI: season picker, champion banner, badge case — *size M, after S1/S2*

### H — Hardening (independent, small tasks)
1. **H1** Global `onError` → consistent error shape + request-id logging — *size S*
2. **H2** Rate limit `/auth/*` (sliding window, in-memory) — *size S*
3. **H3** Pagination for matches (+ UI "load more") — *size M*
4. **H4** Backup story: verify PDC volume backups or add pg_dump cron to compose — *size S*
5. **H5** Password reset (needs SMTP decision first) — *size M, blocked on infra*

Suggested parallelization: one agent on **T1–T2** (foundation), one on **H1–H3**, design review on **L1** with the owner before L2/L3. S can start anytime.

---

## 7. Working agreements

- Commits: English, imperative, **no Co-Authored-By trailer**. Push to `main` deploys production — push only with the owner's go-ahead.
- UI text: English only. Design system: Arena (light) + dark tokens, WUBRG accent, existing primitives in `components/ui/` (no Radix — hand-rolled patterns).
- Every change ships with: typecheck (both apps), targeted curl/Playwright verification, and honest reporting of what was and wasn't tested.
- Secrets only via the PDC panel (never in the repo); `JWT_SECRET` is set in prod.
