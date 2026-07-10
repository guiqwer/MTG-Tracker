import { Elysia } from 'elysia'
import { prisma } from '../lib/prisma'
import { requireUserId } from '../security/tokens'
import { sharedGroupIds } from '../lib/membership'

const NOT_FOUND = { error: 'not_found', error_description: 'Profile not found' } as const

const isWin = (p: { isWinner: boolean; placement: number | null }) =>
  p.isWinner || p.placement === 1

// Personality titles, mirroring the dashboard's "table personalities".
const TITLES: Record<string, { title: string; desc: string }> = {
  REMOVAL: { title: 'The Assassin', desc: 'removals' },
  BOARDWIPE: { title: 'The Destroyer', desc: 'board wipes' },
  COUNTER: { title: 'The Police', desc: 'counterspells' },
  TUTOR: { title: 'The Librarian', desc: 'tutors' },
  RAMP: { title: 'The Farmer', desc: 'ramp' },
  DRAW: { title: 'The Engine', desc: 'card draw' },
  COMBO: { title: 'The Combo Player', desc: 'combos' },
}

const safeDeck = {
  owner: true,
  user: { select: { id: true, username: true } },
  commander: true,
  partner: true,
  _count: { select: { participations: true, cards: true } },
} as const

export const profiles = new Elysia({ prefix: '/profiles' })
  // A member's profile, addressed by opaque user id (no usernames in URLs).
  // Visible to themselves and to anyone sharing a group; every number
  // aggregates ONLY the groups viewer and profile have in common.
  .get('/:id', async ({ headers, params, set }) => {
    const viewerId = await requireUserId(headers.authorization)
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: { featuredDeck: { include: safeDeck } },
    })
    if (!user) {
      set.status = 404
      return NOT_FOUND
    }
    const self = user.id === viewerId

    // Scope: own profile shows all my groups; someone else's shows shared only.
    let scope: string[]
    if (self) {
      const mine = await prisma.groupMembership.findMany({
        where: { userId: viewerId },
        select: { groupId: true },
      })
      scope = mine.map((m) => m.groupId)
    } else {
      scope = await sharedGroupIds(viewerId, user.id)
      if (scope.length === 0) {
        // No common table — don't even reveal the profile exists.
        set.status = 404
        return NOT_FOUND
      }
    }

    const sharedGroups = await prisma.group.findMany({
      where: { id: { in: scope } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    // The person's seats (linked players) at those tables.
    const players = await prisma.player.findMany({
      where: { userId: user.id, groupId: { in: scope } },
      select: { id: true },
    })
    const playerIds = players.map((p) => p.id)

    // Everything they played in scope.
    const parts = await prisma.matchParticipant.findMany({
      where: {
        playerId: { in: playerIds },
        match: { groupId: { in: scope }, status: 'FINISHED' },
      },
      include: {
        match: { select: { id: true, playedAt: true, groupId: true, winCondition: true } },
        deck: { include: { commander: true } },
      },
      orderBy: { match: { playedAt: 'desc' } },
    })

    const games = parts.length
    const wins = parts.filter(isWin).length
    const placements = parts.filter((p) => p.placement != null).map((p) => p.placement!)
    const stats = {
      games,
      wins,
      winrate: games ? wins / games : 0,
      avgPlacement: placements.length
        ? placements.reduce((a, b) => a + b, 0) / placements.length
        : null,
    }

    // Color pie: colors of the decks they actually played, weighted by games.
    const colorPie = new Map<string, number>()
    for (const p of parts) {
      for (const c of p.deck.colorIdentity) colorPie.set(c, (colorPie.get(c) ?? 0) + 1)
    }

    // Favorite commander: the one they sleeved the most.
    const byCommander = new Map<string, { name: string; artCropUrl: string | null; games: number }>()
    for (const p of parts) {
      const cmd = p.deck.commander
      if (!cmd) continue
      const cur = byCommander.get(cmd.id) ?? {
        name: cmd.name,
        artCropUrl: cmd.artCropUrl,
        games: 0,
      }
      cur.games++
      byCommander.set(cmd.id, cur)
    }
    const favoriteCommander =
      [...byCommander.values()].sort((a, b) => b.games - a.games)[0] ?? null

    // Personality titles from the event log (acting + being targeted) —
    // filtered in the database, not in memory.
    const events = playerIds.length
      ? await prisma.matchEvent.findMany({
          where: {
            match: { groupId: { in: scope }, status: 'FINISHED' },
            OR: [
              { actor: { playerId: { in: playerIds } } },
              { target: { playerId: { in: playerIds } } },
            ],
          },
          select: {
            type: true,
            actor: { select: { playerId: true } },
            target: { select: { playerId: true } },
            actorId: true,
            targetId: true,
          },
        })
      : []
    const idSet = new Set(playerIds)
    const typeCounts = new Map<string, number>()
    let targeted = 0
    for (const e of events) {
      if (e.actor && idSet.has(e.actor.playerId)) {
        typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
      }
      if (e.target && idSet.has(e.target.playerId) && e.actorId !== e.targetId) targeted++
    }
    const titles = Object.entries(TITLES)
      .map(([type, meta]) => ({ ...meta, key: type.toLowerCase(), count: typeCounts.get(type) ?? 0 }))
      .concat([{ title: 'The Archenemy', desc: 'times targeted', key: 'target', count: targeted }])
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)

    // Their decks: personal imports + table decks of their seats.
    const decks = await prisma.deck.findMany({
      where: { OR: [{ userId: user.id }, { ownerId: { in: playerIds } }] },
      include: safeDeck,
      orderBy: { createdAt: 'desc' },
    })
    const cardSums = await prisma.deckCard.groupBy({
      by: ['deckId'],
      where: { deckId: { in: decks.map((d) => d.id) } },
      _sum: { quantity: true },
    })
    const totals = new Map(cardSums.map((s) => [s.deckId, s._sum.quantity ?? 0]))
    const decksOut = decks.map((d) => ({ ...d, cardCount: totals.get(d.id) ?? 0 }))

    // Head-to-head: matches where the viewer sat at the same table.
    let headToHead = null
    if (!self && games > 0) {
      const viewerPlayers = await prisma.player.findMany({
        where: { userId: viewerId, groupId: { in: scope } },
        select: { id: true },
      })
      const matchIds = parts.map((p) => p.match.id)
      const viewerParts = await prisma.matchParticipant.findMany({
        where: { playerId: { in: viewerPlayers.map((p) => p.id) }, matchId: { in: matchIds } },
        include: { match: { select: { id: true, playedAt: true } } },
      })
      const mine = new Map(viewerParts.map((p) => [p.matchId, p]))
      const together = parts.filter((p) => mine.has(p.match.id))
      if (together.length > 0) {
        const theirWins = together.filter(isWin).length
        const myWins = together.filter((p) => {
          const v = mine.get(p.match.id)!
          return isWin(v)
        }).length
        const last = together[0] // parts are ordered by playedAt desc
        headToHead = {
          games: together.length,
          viewerWins: myWins,
          profileWins: theirWins,
          lastMatch: { id: last.match.id, playedAt: last.match.playedAt },
        }
      }
    }

    const recent = parts.slice(0, 5).map((p) => ({
      id: p.match.id,
      playedAt: p.match.playedAt,
      placement: p.placement,
      won: isWin(p),
      deck: p.deck.name,
      commander: p.deck.commander?.name ?? null,
    }))

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
        bio: user.bio,
        createdAt: user.createdAt,
      },
      self,
      sharedGroups,
      featuredDeck: user.featuredDeck
        ? { ...user.featuredDeck, cardCount: totals.get(user.featuredDeck.id) ?? 0 }
        : null,
      stats,
      colorPie: ['W', 'U', 'B', 'R', 'G']
        .map((color) => ({ color, games: colorPie.get(color) ?? 0 }))
        .filter((c) => c.games > 0),
      favoriteCommander,
      titles,
      decks: decksOut,
      headToHead,
      recent,
    }
  })
