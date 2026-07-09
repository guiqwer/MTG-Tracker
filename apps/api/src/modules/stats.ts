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
        include: {
          participations: true,
          user: { select: { username: true, avatarColor: true } },
        },
      })
      return players
        .map((p) => {
          const games = p.participations.length
          const wins = p.participations.filter(isWin).length
          return {
            id: p.id,
            name: p.name,
            avatarColor: p.user?.avatarColor ?? p.avatarColor,
            username: p.user?.username ?? null,
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
  // The fun stats: table personalities, meta breakdown, podium and timeline.
  .get(
    '/insights',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      const groupId = query.groupId

      const [events, matches] = await Promise.all([
        prisma.matchEvent.findMany({
          where: { match: { groupId } },
          include: {
            actor: {
              include: {
                player: { include: { user: { select: { username: true, avatarColor: true } } } },
              },
            },
            target: {
              include: {
                player: { include: { user: { select: { username: true, avatarColor: true } } } },
              },
            },
          },
        }),
        prisma.match.findMany({
          where: { groupId },
          orderBy: { playedAt: 'desc' },
          include: {
            participants: {
              include: {
                player: { include: { user: { select: { username: true, avatarColor: true } } } },
                deck: { include: { commander: true } },
              },
            },
          },
        }),
      ])

      // ── Table personalities — who does each thing the most ──────────────
      type PlayerRef = {
        id: string
        name: string
        avatarColor: string | null
        user?: { username: string; avatarColor: string | null } | null
      }
      const tally = (
        rows: { player: PlayerRef | null; weight?: number }[],
      ): { player: PlayerRef; count: number } | null => {
        const counts = new Map<string, { player: PlayerRef; count: number }>()
        for (const r of rows) {
          if (!r.player) continue
          const cur = counts.get(r.player.id) ?? { player: r.player, count: 0 }
          cur.count += r.weight ?? 1
          counts.set(r.player.id, cur)
        }
        const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]
        return top && top.count > 0 ? top : null
      }
      const byType = (type: string) =>
        tally(
          events
            .filter((e) => e.type === type)
            .map((e) => ({ player: e.actor?.player ?? null })),
        )
      const personalities = [
        { key: 'removal', title: 'The Assassin', desc: 'most removals', top: byType('REMOVAL') },
        { key: 'boardwipe', title: 'The Destroyer', desc: 'most board wipes', top: byType('BOARDWIPE') },
        { key: 'counter', title: 'The Police', desc: 'most counterspells', top: byType('COUNTER') },
        { key: 'tutor', title: 'The Librarian', desc: 'most tutors', top: byType('TUTOR') },
        { key: 'ramp', title: 'The Farmer', desc: 'most ramp', top: byType('RAMP') },
        { key: 'draw', title: 'The Engine', desc: 'most card draw', top: byType('DRAW') },
        { key: 'combo', title: 'The Combo Player', desc: 'most combos', top: byType('COMBO') },
        {
          key: 'target',
          title: 'The Archenemy',
          desc: 'most targeted by others',
          top: tally(
            events
              .filter((e) => e.target && e.actorId !== e.targetId)
              .map((e) => ({ player: e.target?.player ?? null })),
          ),
        },
      ]
        .filter((p) => p.top !== null)
        .map((p) => ({
          key: p.key,
          title: p.title,
          desc: p.desc,
          player: p.top!.player.name,
          avatarColor: p.top!.player.user?.avatarColor ?? p.top!.player.avatarColor,
          username: p.top!.player.user?.username ?? null,
          count: p.top!.count,
        }))

      // ── Meta: win conditions, seat winrate, winning colors ──────────────
      const winConditions = new Map<string, number>()
      for (const m of matches) {
        if (m.winCondition) {
          winConditions.set(m.winCondition, (winConditions.get(m.winCondition) ?? 0) + 1)
        }
      }

      const seats = [1, 2, 3, 4].map((seat) => {
        const parts = matches.flatMap((m) =>
          m.participants.filter((p) => p.seatOrder === seat),
        )
        const wins = parts.filter(isWin).length
        return { seat, games: parts.length, wins, winrate: parts.length ? wins / parts.length : 0 }
      })

      const colorWins = new Map<string, number>()
      for (const m of matches) {
        const winner = m.participants.find(isWin)
        for (const c of winner?.deck.colorIdentity ?? []) {
          colorWins.set(c, (colorWins.get(c) ?? 0) + 1)
        }
      }

      // ── Podium & eliminations ────────────────────────────────────────────
      const byPlayer = new Map<
        string,
        {
          player: PlayerRef
          games: number
          wins: number
          top2: number
          placements: number[]
          firstBlood: number
        }
      >()
      for (const m of matches) {
        // First blood = the earliest recorded elimination of the match.
        const eliminated = m.participants
          .filter((p) => p.eliminatedTurn != null)
          .sort((a, b) => a.eliminatedTurn! - b.eliminatedTurn!)
        const firstBloodId = eliminated[0]?.playerId
        for (const p of m.participants) {
          const cur = byPlayer.get(p.playerId) ?? {
            player: p.player,
            games: 0,
            wins: 0,
            top2: 0,
            placements: [],
            firstBlood: 0,
          }
          cur.games += 1
          if (isWin(p)) cur.wins += 1
          if (p.placement != null) {
            cur.placements.push(p.placement)
            if (p.placement <= 2) cur.top2 += 1
          }
          if (p.playerId === firstBloodId) cur.firstBlood += 1
          byPlayer.set(p.playerId, cur)
        }
      }
      const podium = [...byPlayer.values()]
        .map((s) => ({
          id: s.player.id,
          name: s.player.name,
          avatarColor: s.player.user?.avatarColor ?? s.player.avatarColor,
          username: s.player.user?.username ?? null,
          games: s.games,
          wins: s.wins,
          top2: s.top2,
          avgPlacement: s.placements.length
            ? s.placements.reduce((a, b) => a + b, 0) / s.placements.length
            : null,
          firstBlood: s.firstBlood,
        }))
        .sort((a, b) => (a.avgPlacement ?? 99) - (b.avgPlacement ?? 99))

      // ── Timeline: matches per month (last 6) + recent matches ────────────
      const monthly: { month: string; matches: number }[] = []
      const now = new Date()
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthly.push({
          month: key,
          matches: matches.filter((m) => {
            const p = m.playedAt
            return p.getFullYear() === d.getFullYear() && p.getMonth() === d.getMonth()
          }).length,
        })
      }

      const recent = matches.slice(0, 5).map((m) => {
        const winner = m.participants.find(isWin)
        return {
          id: m.id,
          playedAt: m.playedAt,
          winCondition: m.winCondition,
          turns: m.turns,
          durationMins: m.durationMins,
          players: m.participants.length,
          winner: winner
            ? {
                name: winner.player.name,
                avatarColor: winner.player.user?.avatarColor ?? winner.player.avatarColor,
                username: winner.player.user?.username ?? null,
                deck: winner.deck.name,
                commander: winner.deck.commander?.name ?? null,
              }
            : null,
        }
      })

      return {
        personalities,
        winConditions: [...winConditions.entries()]
          .map(([condition, count]) => ({ condition, count }))
          .sort((a, b) => b.count - a.count),
        seats,
        colors: ['W', 'U', 'B', 'R', 'G']
          .map((color) => ({ color, wins: colorWins.get(color) ?? 0 }))
          .filter((c) => c.wins > 0),
        podium,
        monthly,
        recent,
      }
    },
    groupQuery,
  )
