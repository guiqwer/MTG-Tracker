import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { importCard } from '../lib/cards'

const deckInclude = {
  owner: true,
  commander: true,
  partner: true,
  _count: { select: { participations: true } },
} as const

export const decks = new Elysia({ prefix: '/decks' })
  .get('/', () =>
    prisma.deck.findMany({ orderBy: { createdAt: 'desc' }, include: deckInclude }),
  )
  .get('/:id', ({ params }) =>
    prisma.deck.findUnique({ where: { id: params.id }, include: deckInclude }),
  )
  .post(
    '/',
    async ({ body }) => {
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
  .delete('/:id', ({ params }) => prisma.deck.delete({ where: { id: params.id } }))
