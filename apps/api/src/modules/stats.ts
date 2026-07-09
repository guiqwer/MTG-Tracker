import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { requireUserId } from '../security/tokens'
import { isMember, FORBIDDEN_GROUP } from '../lib/membership'

const isWin = (p: { isWinner: boolean; placement: number | null }) =>
  p.isWinner || p.placement === 1

// Every stats endpoint is scoped to one group (the "table" the caller is at).
const groupQuery = { query: t.Object({ groupId: t.String() }) }

export const stats = new Elysia({ prefix: '/stats' })
  .get(
    '/overview',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      const groupId = query.groupId
      const [players, decks, matches, events, agg] = await Promise.all([
        prisma.player.count({ where: { groupId } }),
        prisma.deck.count({ where: { owner: { groupId } } }),
        prisma.match.count({ where: { groupId } }),
        prisma.matchEvent.count({ where: { match: { groupId } } }),
        prisma.match.aggregate({
          where: { groupId },
          _avg: { durationMins: true, turns: true },
        }),
      ])
      return {
        players,
        decks,
        matches,
        events,
        avgDurationMins: agg._avg.durationMins,
        avgTurns: agg._avg.turns,
      }
    },
    groupQuery,
  )
  .get(
    '/players',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      const players = await prisma.player.findMany({
        where: { groupId: query.groupId },
        include: { participations: true },
      })
      return players
        .map((p) => {
          const games = p.participations.length
          const wins = p.participations.filter(isWin).length
          return {
            id: p.id,
            name: p.name,
            avatarColor: p.avatarColor,
            games,
            wins,
            winrate: games ? wins / games : 0,
          }
        })
        .sort((a, b) => b.winrate - a.winrate || b.games - a.games)
    },
    groupQuery,
  )
  .get(
    '/decks',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      // Group decks + personal (account) decks that have played in this group.
      const decks = await prisma.deck.findMany({
        where: {
          OR: [
            { owner: { groupId: query.groupId } },
            { participations: { some: { match: { groupId: query.groupId } } } },
          ],
        },
        include: {
          owner: true,
          user: { select: { username: true } },
          commander: true,
          participations: { include: { match: { select: { groupId: true } } } },
        },
      })
      return decks
        .map((d) => {
          // Winrate counts only games played at THIS table.
          const parts = d.participations.filter((p) => p.match.groupId === query.groupId)
          const games = parts.length
          const wins = parts.filter(isWin).length
          return {
            id: d.id,
            name: d.name,
            owner: d.owner?.name ?? d.user?.username ?? '—',
            commander: d.commander?.name ?? null,
            colorIdentity: d.colorIdentity,
            games,
            wins,
            winrate: games ? wins / games : 0,
          }
        })
        .sort((a, b) => b.winrate - a.winrate || b.games - a.games)
    },
    groupQuery,
  )
