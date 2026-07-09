import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { importCard } from '../lib/cards'
import { requireUserId } from '../security/tokens'
import { isMember, FORBIDDEN_GROUP } from '../lib/membership'

const deckInclude = {
  owner: true,
  commander: true,
  partner: true,
  _count: { select: { participations: true } },
} as const

// A deck's group is its owner's group — decks don't carry their own groupId.
export const decks = new Elysia({ prefix: '/decks' })
  .get(
    '/',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      return prisma.deck.findMany({
        where: { owner: { groupId: query.groupId } },
        orderBy: { createdAt: 'desc' },
        include: deckInclude,
      })
    },
    { query: t.Object({ groupId: t.String() }) },
  )
  .get('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const deck = await prisma.deck.findUnique({ where: { id: params.id }, include: deckInclude })
    if (!deck?.owner.groupId || !(await isMember(userId, deck.owner.groupId))) {
      set.status = 404
      return { error: 'not_found', error_description: 'Deck not found' }
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
    if (!deck?.owner.groupId || !(await isMember(userId, deck.owner.groupId))) {
      set.status = 404
      return { error: 'not_found', error_description: 'Deck not found' }
    }
    return prisma.deck.delete({ where: { id: params.id } })
  })
