import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { importCard } from '../lib/cards'
import { fetchCollection, type CardIdentifier, type ScryfallCard } from '../lib/scryfall'
import {
  fetchMoxfieldDeck,
  parseMoxfieldUrl,
  parseTextDecklist,
  type ParsedDeck,
  type ParsedEntry,
} from '../lib/decklist'
import { requireUserId } from '../security/tokens'
import { isMember, sharedGroupIds, FORBIDDEN_GROUP } from '../lib/membership'

// Never include the raw user relation (it carries passwordHash) — select only
// what the UI shows.
const deckInclude = {
  owner: true,
  user: { select: { id: true, username: true } },
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

// Resolve parsed entries to cards in our DB via one bulk Scryfall lookup.
async function resolveEntries(entries: ParsedEntry[]) {
  const identifiers: CardIdentifier[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const key = e.scryfallId ?? `name:${e.name?.toLowerCase()}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    identifiers.push(e.scryfallId ? { id: e.scryfallId } : { name: e.name! })
  }
  const { cards, notFound } = await fetchCollection(identifiers)

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
  const cardSelect = { id: true, scryfallId: true, colorIdentity: true } as const
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

  const lookup = (e: ParsedEntry) => {
    const sc = e.scryfallId
      ? byKey.get(e.scryfallId)
      : byKey.get(e.name?.toLowerCase() ?? '')
    return sc ? { scryfall: sc, db: stored.get(sc.scryfallId)! } : null
  }
  return { lookup, notFound }
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
  // Import a personal deck from a Moxfield link or a pasted decklist.
  .post(
    '/import',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)

      let parsed: ParsedDeck
      if (body.url) {
        const publicId = parseMoxfieldUrl(body.url)
        if (!publicId) {
          set.status = 400
          return {
            error: 'invalid_url',
            error_description: 'That does not look like a Moxfield deck link',
          }
        }
        try {
          parsed = await fetchMoxfieldDeck(publicId)
        } catch (e) {
          set.status = 502
          return {
            error: 'moxfield_failed',
            error_description: `Could not fetch the deck from Moxfield (${
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
          error_description: 'Provide a Moxfield link or paste a decklist',
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

      // Commander (+ optional partner) drive the deck's color identity.
      const commanderCards = parsed.commanders
        .map(lookup)
        .filter((c): c is NonNullable<typeof c> => c !== null)
      const commander = commanderCards[0] ?? null
      const partner = commanderCards[1] ?? null
      const colorIdentity = Array.from(
        new Set(commanderCards.flatMap((c) => c.db.colorIdentity)),
      )

      // Aggregate main deck rows by card (a list may repeat basics).
      const quantities = new Map<string, number>()
      for (const entry of parsed.mainboard) {
        const hit = lookup(entry)
        if (!hit) continue
        quantities.set(hit.db.id, (quantities.get(hit.db.id) ?? 0) + entry.quantity)
      }
      // Commanders are part of the 100 — keep them in the list too.
      for (const c of commanderCards) {
        if (!quantities.has(c.db.id)) quantities.set(c.db.id, 1)
      }

      const deck = await prisma.deck.create({
        data: {
          name: body.name?.trim() || parsed.name || 'Imported deck',
          userId,
          commanderId: commander?.db.id,
          partnerId: partner?.db.id,
          colorIdentity,
          moxfieldUrl: body.url?.trim() || undefined,
          cards: {
            create: [...quantities.entries()].map(([cardId, quantity]) => ({
              cardId,
              quantity,
            })),
          },
        },
        include: deckInclude,
      })
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
  .delete('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const deck = await prisma.deck.findUnique({
      where: { id: params.id },
      include: { owner: true },
    })
    if (!deck || !(await canAccessDeck(userId, deck))) {
      set.status = 404
      return NOT_FOUND
    }
    return prisma.deck.delete({ where: { id: params.id } })
  })
