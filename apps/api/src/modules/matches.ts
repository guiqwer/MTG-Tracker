import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { importCard } from '../lib/cards'
import { requireUserId } from '../security/tokens'
import { isMember, FORBIDDEN_GROUP } from '../lib/membership'
import { ensureDeckTagged } from '../lib/card-tags'
import { matchLiveStream, publishMatchUpdate } from '../lib/live'

const participantInclude = {
  player: true,
  deck: { include: { commander: true } },
} as const

const NOT_FOUND = { error: 'not_found', error_description: 'Match not found' } as const

// Loads a match's groupId and checks the caller belongs to it.
async function canAccessMatch(userId: string, matchId: string): Promise<boolean> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { groupId: true },
  })
  return !!match?.groupId && (await isMember(userId, match.groupId))
}

export const matches = new Elysia({ prefix: '/matches' })
  .get(
    '/',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      return prisma.match.findMany({
        where: { groupId: query.groupId },
        orderBy: { playedAt: 'desc' },
        include: {
          participants: { include: participantInclude, orderBy: { seatOrder: 'asc' } },
          _count: { select: { events: true } },
        },
      })
    },
    { query: t.Object({ groupId: t.String() }) },
  )
  .get('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    if (!(await canAccessMatch(userId, params.id))) {
      set.status = 404
      return NOT_FOUND
    }
    return prisma.match.findUnique({
      where: { id: params.id },
      include: {
        participants: { include: participantInclude, orderBy: { seatOrder: 'asc' } },
        events: {
          orderBy: { sequence: 'asc' },
          include: {
            actor: { include: { player: true } },
            target: { include: { player: true } },
            card: true,
            targetCard: true,
          },
        },
        bestCard: true,
      },
    })
  })
  // Live view: a server-sent-events stream that pings whenever this match
  // changes. Auth via ?token= because EventSource can't send headers (the
  // global guard skips this path — see security/guard.ts).
  .get(
    '/:id/live',
    async ({ params, query, set }) => {
      let userId: string
      try {
        userId = await requireUserId(`Bearer ${query.token ?? ''}`)
      } catch {
        set.status = 401
        return { error: 'invalid_token', error_description: 'Invalid or missing token' }
      }
      if (!(await canAccessMatch(userId, params.id))) {
        set.status = 404
        return NOT_FOUND
      }
      return matchLiveStream(params.id)
    },
    { query: t.Object({ token: t.Optional(t.String()) }) },
  )
  .post(
    '/',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, body.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      // Every seat's player must belong to the same group as the match.
      const playerIds = body.participants.map((p) => p.playerId)
      const inGroup = await prisma.player.count({
        where: { id: { in: playerIds }, groupId: body.groupId },
      })
      if (inGroup !== new Set(playerIds).size) {
        set.status = 400
        return {
          error: 'invalid_participants',
          error_description: 'All participants must be players of this group',
        }
      }
      // Warm event-card suggestions for every seat's deck while the game
      // starts — by the first logged play the tags are already in the DB.
      for (const deckId of new Set(body.participants.map((p) => p.deckId))) {
        void ensureDeckTagged(deckId)
      }
      return prisma.match.create({
        data: {
          groupId: body.groupId,
          // Started at the table: no podium yet, events flow in as the game runs.
          status: body.inProgress ? 'IN_PROGRESS' : 'FINISHED',
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
      })
    },
    {
      body: t.Object({
        groupId: t.String(),
        inProgress: t.Optional(t.Boolean()),
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
  // Edit a match after the fact — metadata and/or the podium (placements).
  .patch(
    '/:id',
    async ({ headers, params, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await canAccessMatch(userId, params.id))) {
        set.status = 404
        return NOT_FOUND
      }
      if (body.placements?.length) {
        const valid = await prisma.matchParticipant.count({
          where: {
            matchId: params.id,
            id: { in: body.placements.map((p) => p.participantId) },
          },
        })
        if (valid !== new Set(body.placements.map((p) => p.participantId)).size) {
          set.status = 400
          return {
            error: 'invalid_participants',
            error_description: 'Placements must reference seats of this match',
          }
        }
      }
      await prisma.$transaction([
        prisma.match.update({
          where: { id: params.id },
          data: {
            status: (body.status || undefined) as never,
            playedAt: body.playedAt ? new Date(body.playedAt) : undefined,
            durationMins: body.durationMins,
            turns: body.turns,
            winCondition: (body.winCondition || undefined) as never,
            endReason: (body.endReason || undefined) as never,
            notes: body.notes,
          },
        }),
        ...(body.placements ?? []).map((p) =>
          prisma.matchParticipant.update({
            where: { id: p.participantId },
            data: { placement: p.placement, isWinner: p.placement === 1 },
          }),
        ),
      ])
      publishMatchUpdate(params.id)
      return prisma.match.findUnique({
        where: { id: params.id },
        include: {
          participants: { include: participantInclude, orderBy: { seatOrder: 'asc' } },
        },
      })
    },
    {
      body: t.Object({
        status: t.Optional(t.Union([t.Literal('IN_PROGRESS'), t.Literal('FINISHED')])),
        playedAt: t.Optional(t.String()),
        durationMins: t.Optional(t.Number()),
        turns: t.Optional(t.Number()),
        winCondition: t.Optional(t.String()),
        endReason: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        placements: t.Optional(
          t.Array(
            t.Object({
              participantId: t.String(),
              placement: t.Number({ minimum: 1, maximum: 12 }),
            }),
          ),
        ),
      }),
    },
  )
  // Append an event to the match timeline. Sequence is auto-assigned; an
  // optional card is imported from Scryfall on the fly.
  .post(
    '/:id/events',
    async ({ headers, params, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await canAccessMatch(userId, params.id))) {
        set.status = 404
        return NOT_FOUND
      }
      // A response must chain to an event of this same match (the stack).
      if (body.respondsToId) {
        const parent = await prisma.matchEvent.findUnique({
          where: { id: body.respondsToId },
          select: { matchId: true },
        })
        if (parent?.matchId !== params.id) {
          set.status = 400
          return {
            error: 'invalid_response',
            error_description: 'respondsToId must reference an event of this match',
          }
        }
      }
      const last = await prisma.matchEvent.findFirst({
        where: { matchId: params.id },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      })
      const [card, targetCard] = await Promise.all([
        body.cardScryfallId ? importCard(body.cardScryfallId) : null,
        body.targetCardScryfallId ? importCard(body.targetCardScryfallId) : null,
      ])
      const event = await prisma.matchEvent.create({
        data: {
          matchId: params.id,
          sequence: last ? last.sequence + 1 : 1,
          turn: body.turn,
          type: body.type as never,
          actorId: body.actorId || undefined,
          targetId: body.targetId || undefined,
          cardId: card?.id,
          targetCardId: targetCard?.id,
          note: body.note || undefined,
          respondsToId: body.respondsToId || undefined,
        },
        include: {
          actor: { include: { player: true } },
          target: { include: { player: true } },
          card: true,
          targetCard: true,
        },
      })
      publishMatchUpdate(params.id)
      return event
    },
    {
      body: t.Object({
        turn: t.Optional(t.Number()),
        type: t.String(),
        actorId: t.Optional(t.String()),
        targetId: t.Optional(t.String()),
        cardScryfallId: t.Optional(t.String()),
        targetCardScryfallId: t.Optional(t.String()),
        note: t.Optional(t.String()),
        respondsToId: t.Optional(t.String()),
      }),
    },
  )
  .delete('/:id/events/:eventId', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    if (!(await canAccessMatch(userId, params.id))) {
      set.status = 404
      return NOT_FOUND
    }
    const deleted = await prisma.matchEvent.delete({ where: { id: params.eventId } })
    publishMatchUpdate(params.id)
    return deleted
  })
  .delete('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    if (!(await canAccessMatch(userId, params.id))) {
      set.status = 404
      return NOT_FOUND
    }
    const deleted = await prisma.match.delete({ where: { id: params.id } })
    publishMatchUpdate(params.id) // viewers refetch, get a 404 and bail out
    return deleted
  })
