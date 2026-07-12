import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { importCard } from '../lib/cards'
import { fetchCollection, type CardIdentifier, type ScryfallCard } from '../lib/scryfall'
import {
  findDeckSource,
  parseTextDecklist,
  SUPPORTED_DECK_SITES,
  type ParsedDeck,
  type ParsedEntry,
} from '../lib/decklist'
import { requireUserId } from '../security/tokens'
import { isMember, sharedGroupIds, FORBIDDEN_GROUP } from '../lib/membership'
import { ensureDeckTagged } from '../lib/card-tags'

// Never include the raw user relation (it carries passwordHash) — select only
// what the UI shows.
const deckInclude = {
  owner: true,
  user: { select: { id: true, username: true, avatarColor: true } },
  commander: true,
  partner: true,
  _count: { select: { participations: true, cards: true } },
} as const

const NOT_FOUND = { error: 'not_found', error_description: 'Deck not found' } as const

// Total card count = SUM of quantities, not the number of DeckCard rows
// (a list with 9 Mountains is one row but nine cards).
async function withCardCounts<T extends { id: string }>(decks: T[]) {
  const sums = await prisma.deckCard.groupBy({
    by: ['deckId'],
    where: { deckId: { in: decks.map((d) => d.id) } },
    _sum: { quantity: true },
  })
  const totals = new Map(sums.map((s) => [s.deckId, s._sum.quantity ?? 0]))
  return decks.map((d) => ({ ...d, cardCount: totals.get(d.id) ?? 0 }))
}

// A deck is visible to its account owner and to members of its player-owner's
// group (imported personal decks have userId; group decks have a Player owner).
async function canAccessDeck(
  userId: string,
  deck: { userId: string | null; owner: { groupId: string | null } | null },
): Promise<boolean> {
  if (deck.userId === userId) return true
  if (deck.owner?.groupId) return isMember(userId, deck.owner.groupId)
  // Personal decks are visible to people who share a group with the owner
  // (that's what makes profiles browsable).
  if (deck.userId) return (await sharedGroupIds(userId, deck.userId)).length > 0
  return false
}

// Management (delete/retire) is stricter than visibility: only the owning
// account; guest decks (no account behind the player) are manageable by any
// member of their group.
async function canManageDeck(
  userId: string,
  deck: {
    userId: string | null
    owner: { userId: string | null; groupId: string | null } | null
  },
): Promise<boolean> {
  const ownerAccount = deck.userId ?? deck.owner?.userId
  if (ownerAccount) return ownerAccount === userId
  return !!deck.owner?.groupId && isMember(userId, deck.owner.groupId)
}

// Resolve parsed entries to cards in our DB. Cards imported once by ANYONE are
// served straight from the DB — staples cost zero external requests; only
// genuinely new cards go to Scryfall (bulk, 75 identifiers per request).
// `refresh: true` (sync) skips the cache so prices come back fresh.
type ResolvedHit = {
  db: { id: string; colorIdentity: string[] }
  scryfall?: ScryfallCard
}

async function resolveEntries(entries: ParsedEntry[], opts: { refresh?: boolean } = {}) {
  const wantIds = new Set<string>()
  const wantNames = new Map<string, string>() // lowercase -> original casing
  for (const e of entries) {
    if (e.scryfallId) wantIds.add(e.scryfallId)
    else if (e.name) wantNames.set(e.name.toLowerCase(), e.name)
  }

  const cardSelect = { id: true, scryfallId: true, name: true, colorIdentity: true } as const
  const cachedById = new Map<string, ResolvedHit>()
  const cachedByName = new Map<string, ResolvedHit>()
  if (!opts.refresh && (wantIds.size > 0 || wantNames.size > 0)) {
    const cached = await prisma.card.findMany({
      where: {
        OR: [
          { scryfallId: { in: [...wantIds] } },
          { name: { in: [...wantNames.values()], mode: 'insensitive' } },
        ],
      },
      select: cardSelect,
    })
    for (const c of cached) {
      const hit = { db: { id: c.id, colorIdentity: c.colorIdentity } }
      cachedById.set(c.scryfallId, hit)
      cachedByName.set(c.name.toLowerCase(), hit)
      cachedByName.set(c.name.split(' // ')[0].toLowerCase(), hit)
    }
  }

  // Whatever the cache didn't cover goes to Scryfall in one bulk lookup.
  const identifiers: CardIdentifier[] = []
  for (const id of wantIds) if (!cachedById.has(id)) identifiers.push({ id })
  for (const [lower, original] of wantNames) {
    // Scryfall's collection lookup matches front faces; full "A // B" names miss.
    if (!cachedByName.has(lower)) identifiers.push({ name: original.split(' // ')[0] })
  }
  const { cards, notFound } = identifiers.length
    ? await fetchCollection(identifiers)
    : { cards: [] as ScryfallCard[], notFound: [] as string[] }

  // Index by scryfall id + full name + front-face name so text entries like
  // "Fire" still match "Fire // Ice".
  const byKey = new Map<string, ScryfallCard>()
  for (const c of cards) {
    byKey.set(c.scryfallId, c)
    byKey.set(c.name.toLowerCase(), c)
    byKey.set(c.name.split(' // ')[0].toLowerCase(), c)
  }

  // Bulk-store: one read for what we already have, one createMany for the
  // rest, one re-read — 3 queries instead of one upsert per card.
  const scryfallIds = cards.map((c) => c.scryfallId)
  const existing = await prisma.card.findMany({
    where: { scryfallId: { in: scryfallIds } },
    select: cardSelect,
  })
  const known = new Set(existing.map((e) => e.scryfallId))
  const missing = cards.filter((c) => !known.has(c.scryfallId))
  let rows = existing
  if (missing.length > 0) {
    await prisma.card.createMany({ data: missing, skipDuplicates: true })
    rows = await prisma.card.findMany({
      where: { scryfallId: { in: scryfallIds } },
      select: cardSelect,
    })
  }
  const stored = new Map(
    rows.map((r) => [r.scryfallId, { id: r.id, colorIdentity: r.colorIdentity }]),
  )

  const lookup = (e: ParsedEntry): ResolvedHit | null => {
    const cachedHit = e.scryfallId
      ? cachedById.get(e.scryfallId)
      : cachedByName.get(e.name?.toLowerCase() ?? '')
    if (cachedHit) return cachedHit
    const sc = e.scryfallId
      ? byKey.get(e.scryfallId)
      : byKey.get(e.name?.toLowerCase() ?? '')
    return sc ? { scryfall: sc, db: stored.get(sc.scryfallId)! } : null
  }
  return { lookup, notFound }
}

// Shared by import and sync: commanders drive identity, mainboard rows are
// aggregated by card, and fresh Scryfall prices are collected for updates
// (cache hits carry no scryfall payload, so they never touch prices).
function buildDeckPayload(parsed: ParsedDeck, lookup: (e: ParsedEntry) => ResolvedHit | null) {
  const commanderCards = parsed.commanders
    .map(lookup)
    .filter((c): c is NonNullable<typeof c> => c !== null)
  const commander = commanderCards[0] ?? null
  const partner = commanderCards[1] ?? null
  const colorIdentity = Array.from(
    new Set(commanderCards.flatMap((c) => c.db.colorIdentity)),
  )

  const quantities = new Map<string, number>()
  const prices = new Map<string, number>() // db card id -> fresh price
  const add = (entry: ParsedEntry) => {
    const hit = lookup(entry)
    if (!hit) return
    quantities.set(hit.db.id, (quantities.get(hit.db.id) ?? 0) + entry.quantity)
    if (hit.scryfall?.priceUsd != null) prices.set(hit.db.id, hit.scryfall.priceUsd)
  }
  for (const entry of parsed.mainboard) add(entry)
  for (const c of commanderCards) {
    if (!quantities.has(c.db.id)) quantities.set(c.db.id, 1)
    if (c.scryfall?.priceUsd != null) prices.set(c.db.id, c.scryfall.priceUsd)
  }

  return {
    commander,
    partner,
    colorIdentity,
    rows: [...quantities.entries()].map(([cardId, quantity]) => ({ cardId, quantity })),
    prices,
  }
}

export const decks = new Elysia({ prefix: '/decks' })
  .get(
    '/',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      // Group decks (owned by a table player) + personal decks that members
      // brought with their account — everyone at the table can browse both.
      return withCardCounts(
        await prisma.deck.findMany({
          where: {
            OR: [
              { owner: { groupId: query.groupId } },
              { user: { memberships: { some: { groupId: query.groupId } } } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: deckInclude,
        }),
      )
    },
    { query: t.Object({ groupId: t.String() }) },
  )
  // The caller's personal decks — portable to any playgroup they're in.
  .get('/mine', async ({ headers }) => {
    const userId = await requireUserId(headers.authorization)
    return withCardCounts(
      await prisma.deck.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: deckInclude,
      }),
    )
  })
  // Import a personal deck from a deck-site link or a pasted decklist.
  .post(
    '/import',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)

      let parsed: ParsedDeck
      if (body.url) {
        const source = findDeckSource(body.url)
        if (!source) {
          set.status = 400
          return {
            error: 'invalid_url',
            error_description: `That does not look like a deck link — paste one from ${SUPPORTED_DECK_SITES}`,
          }
        }
        try {
          parsed = await source.fetch()
        } catch (e) {
          set.status = 502
          return {
            error: 'import_failed',
            error_description: `Could not fetch the deck from ${source.site} (${
              e instanceof Error ? e.message : 'unknown error'
            }). Try pasting the decklist as text instead.`,
          }
        }
      } else if (body.text?.trim()) {
        parsed = parseTextDecklist(body.text)
        // A commander typed in the form wins over anything detected in the text.
        if (body.commanderName?.trim()) {
          parsed.commanders = [{ quantity: 1, name: body.commanderName.trim() }]
        }
      } else {
        set.status = 400
        return {
          error: 'empty_import',
          error_description: 'Provide a deck link or paste a decklist',
        }
      }

      if (!parsed.mainboard.length && !parsed.commanders.length) {
        set.status = 400
        return { error: 'empty_import', error_description: 'No cards found to import' }
      }

      const { lookup, notFound } = await resolveEntries([
        ...parsed.commanders,
        ...parsed.mainboard,
      ])
      const payload = buildDeckPayload(parsed, lookup)

      const deck = await prisma.deck.create({
        data: {
          name: body.name?.trim() || parsed.name || 'Imported deck',
          userId,
          commanderId: payload.commander?.db.id,
          partnerId: payload.partner?.db.id,
          colorIdentity: payload.colorIdentity,
          moxfieldUrl: body.url?.trim() || undefined,
          cards: { create: payload.rows },
        },
        include: deckInclude,
      })
      // Warm the Scryfall oracle tags in the background so event suggestions
      // are instant by the time this deck sits at a table.
      void ensureDeckTagged(deck.id)
      return { deck: (await withCardCounts([deck]))[0], notFound }
    },
    {
      body: t.Object({
        url: t.Optional(t.String()),
        text: t.Optional(t.String()),
        name: t.Optional(t.String({ maxLength: 80 })),
        commanderName: t.Optional(t.String({ maxLength: 120 })),
      }),
    },
  )
  // Re-sync an imported deck from its Moxfield source (owner only). Replaces
  // the card list, refreshes commander/identity and card prices.
  .post('/:id/sync', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const deck = await prisma.deck.findUnique({
      where: { id: params.id },
      include: { owner: true },
    })
    if (!deck || !(await canAccessDeck(userId, deck))) {
      set.status = 404
      return NOT_FOUND
    }
    if (deck.userId !== userId) {
      set.status = 403
      return { error: 'forbidden', error_description: 'Only the deck owner can sync it' }
    }
    const source = deck.moxfieldUrl ? findDeckSource(deck.moxfieldUrl) : null
    if (!source) {
      set.status = 400
      return {
        error: 'not_linked',
        error_description: 'This deck is not linked to a deck-site list',
      }
    }
    let parsed: ParsedDeck
    try {
      parsed = await source.fetch()
    } catch (e) {
      set.status = 502
      return {
        error: 'import_failed',
        error_description: `Could not fetch the deck from ${source.site} (${
          e instanceof Error ? e.message : 'unknown error'
        })`,
      }
    }
    // refresh: skip the DB cache so card prices come back fresh from Scryfall.
    const { lookup, notFound } = await resolveEntries(
      [...parsed.commanders, ...parsed.mainboard],
      { refresh: true },
    )
    const payload = buildDeckPayload(parsed, lookup)

    // One transaction: fresh prices, swap the list, update the header fields.
    await prisma.$transaction([
      ...[...payload.prices.entries()].map(([id, priceUsd]) =>
        prisma.card.update({ where: { id }, data: { priceUsd } }),
      ),
      prisma.deckCard.deleteMany({ where: { deckId: deck.id } }),
      prisma.deck.update({
        where: { id: deck.id },
        data: {
          commanderId: payload.commander?.db.id ?? null,
          partnerId: payload.partner?.db.id ?? null,
          colorIdentity: payload.colorIdentity,
          cards: { create: payload.rows },
        },
      }),
    ])
    const fresh = await prisma.deck.findUnique({
      where: { id: deck.id },
      include: deckInclude,
    })
    void ensureDeckTagged(deck.id) // new cards may need oracle tags
    return { deck: (await withCardCounts([fresh!]))[0], notFound }
  })
  // Deck cards with their Scryfall oracle tags — feeds the "pick from deck"
  // select on the match event form. Tagging is lazy (first call may hit
  // Scryfall for still-untagged cards); afterwards this is a pure DB read.
  .get('/:id/card-tags', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const deck = await prisma.deck.findUnique({
      where: { id: params.id },
      include: { owner: true },
    })
    if (!deck || !(await canAccessDeck(userId, deck))) {
      set.status = 404
      return NOT_FOUND
    }
    await ensureDeckTagged(deck.id)
    const rows = await prisma.deckCard.findMany({
      where: { deckId: deck.id },
      select: {
        card: {
          select: {
            scryfallId: true,
            name: true,
            manaCost: true,
            typeLine: true,
            artCropUrl: true,
            oracleTags: true,
          },
        },
      },
      orderBy: { card: { name: 'asc' } },
    })
    return rows.map((r) => r.card)
  })
  // Deck detail with its full card list (the deck-view page groups by type).
  .get('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const deck = await prisma.deck.findUnique({
      where: { id: params.id },
      include: {
        ...deckInclude,
        cards: { include: { card: true }, orderBy: { card: { name: 'asc' } } },
      },
    })
    if (!deck || !(await canAccessDeck(userId, deck))) {
      set.status = 404
      return NOT_FOUND
    }
    return deck
  })
  .post(
    '/',
    async ({ headers, body, set }) => {
      // The caller must be in the owner player's group.
      const userId = await requireUserId(headers.authorization)
      const owner = await prisma.player.findUnique({ where: { id: body.ownerId } })
      if (!owner?.groupId || !(await isMember(userId, owner.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      // Resolve commander / partner from Scryfall (upserted into our Card table).
      const commander = body.commanderScryfallId
        ? await importCard(body.commanderScryfallId)
        : null
      const partner = body.partnerScryfallId
        ? await importCard(body.partnerScryfallId)
        : null

      // Color identity = union of commander + partner identities.
      const colorIdentity = Array.from(
        new Set([
          ...(commander?.colorIdentity ?? []),
          ...(partner?.colorIdentity ?? []),
        ]),
      )

      return prisma.deck.create({
        data: {
          name: body.name,
          ownerId: body.ownerId,
          commanderId: commander?.id,
          partnerId: partner?.id,
          archetype: body.archetype,
          powerLevel: body.powerLevel,
          bracket: body.bracket,
          moxfieldUrl: body.moxfieldUrl,
          colorIdentity,
        },
        include: deckInclude,
      })
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        ownerId: t.String(),
        commanderScryfallId: t.Optional(t.String()),
        partnerScryfallId: t.Optional(t.String()),
        archetype: t.Optional(t.String()),
        powerLevel: t.Optional(t.Number({ minimum: 1, maximum: 10 })),
        bracket: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
        moxfieldUrl: t.Optional(t.String()),
      }),
    },
  )
  // Retire (or bring back) a deck: it keeps all match history and stats but
  // leaves the active lists and seat pickers.
  .post(
    '/:id/retire',
    async ({ headers, params, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      const deck = await prisma.deck.findUnique({
        where: { id: params.id },
        include: { owner: true },
      })
      if (!deck || !(await canAccessDeck(userId, deck))) {
        set.status = 404
        return NOT_FOUND
      }
      if (!(await canManageDeck(userId, deck))) {
        set.status = 403
        return { error: 'forbidden', error_description: 'Only the deck owner can retire it' }
      }
      return prisma.deck.update({
        where: { id: deck.id },
        data: { retiredAt: body.retired ? new Date() : null },
      })
    },
    { body: t.Object({ retired: t.Boolean() }) },
  )
  .delete('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const deck = await prisma.deck.findUnique({
      where: { id: params.id },
      include: { owner: true, _count: { select: { participations: true } } },
    })
    if (!deck || !(await canAccessDeck(userId, deck))) {
      set.status = 404
      return NOT_FOUND
    }
    if (!(await canManageDeck(userId, deck))) {
      set.status = 403
      return { error: 'forbidden', error_description: 'Only the deck owner can delete it' }
    }
    // Decks that sat at a table anchor match history and stats — keep them.
    if (deck._count.participations > 0) {
      set.status = 409
      return {
        error: 'deck_in_use',
        error_description:
          'This deck has match history. Deleting it would break past matches and stats.',
      }
    }
    return prisma.deck.delete({ where: { id: params.id } })
  })
