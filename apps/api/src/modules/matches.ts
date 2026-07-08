import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { importCard } from '../lib/cards'

const participantInclude = {
  player: true,
  deck: { include: { commander: true } },
} as const

export const matches = new Elysia({ prefix: '/matches' })
  .get('/', () =>
    prisma.match.findMany({
      orderBy: { playedAt: 'desc' },
      include: {
        participants: { include: participantInclude, orderBy: { seatOrder: 'asc' } },
        _count: { select: { events: true } },
      },
    }),
  )
  .get('/:id', ({ params }) =>
    prisma.match.findUnique({
      where: { id: params.id },
      include: {
        participants: { include: participantInclude, orderBy: { seatOrder: 'asc' } },
        events: {
          orderBy: { sequence: 'asc' },
          include: {
            actor: { include: { player: true } },
            target: { include: { player: true } },
            card: true,
          },
        },
        bestCard: true,
      },
    }),
  )
  .post(
    '/',
    ({ body }) =>
      prisma.match.create({
        data: {
          playedAt: body.playedAt ? new Date(body.playedAt) : undefined,
          durationMins: body.durationMins,
          turns: body.turns,
          winCondition: body.winCondition as never,
          endReason: body.endReason as never,
          notes: body.notes,
          participants: {
            create: body.participants.map((p) => ({
              playerId: p.playerId,
              deckId: p.deckId,
              seatOrder: p.seatOrder,
              placement: p.placement,
              isWinner: p.isWinner ?? p.placement === 1,
              eliminatedTurn: p.eliminatedTurn,
            })),
          },
        },
        include: { participants: { include: participantInclude } },
      }),
    {
      body: t.Object({
        playedAt: t.Optional(t.String()),
        durationMins: t.Optional(t.Number()),
        turns: t.Optional(t.Number()),
        winCondition: t.Optional(t.String()),
        endReason: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        participants: t.Array(
          t.Object({
            playerId: t.String(),
            deckId: t.String(),
            seatOrder: t.Optional(t.Number()),
            placement: t.Optional(t.Number()),
            isWinner: t.Optional(t.Boolean()),
            eliminatedTurn: t.Optional(t.Number()),
          }),
          { minItems: 1 },
        ),
      }),
    },
  )
  // Append an event to the match timeline. Sequence is auto-assigned; an
  // optional card is imported from Scryfall on the fly.
  .post(
    '/:id/events',
    async ({ params, body }) => {
      const last = await prisma.matchEvent.findFirst({
        where: { matchId: params.id },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      })
      const card = body.cardScryfallId ? await importCard(body.cardScryfallId) : null
      return prisma.matchEvent.create({
        data: {
          matchId: params.id,
          sequence: last ? last.sequence + 1 : 1,
          turn: body.turn,
          type: body.type as never,
          actorId: body.actorId || undefined,
          targetId: body.targetId || undefined,
          cardId: card?.id,
          note: body.note || undefined,
        },
        include: {
          actor: { include: { player: true } },
          target: { include: { player: true } },
          card: true,
        },
      })
    },
    {
      body: t.Object({
        turn: t.Optional(t.Number()),
        type: t.String(),
        actorId: t.Optional(t.String()),
        targetId: t.Optional(t.String()),
        cardScryfallId: t.Optional(t.String()),
        note: t.Optional(t.String()),
      }),
    },
  )
  .delete('/:id/events/:eventId', ({ params }) =>
    prisma.matchEvent.delete({ where: { id: params.eventId } }),
  )
  .delete('/:id', ({ params }) => prisma.match.delete({ where: { id: params.id } }))
