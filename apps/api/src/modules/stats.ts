import { Elysia } from 'elysia'
import { prisma } from '../lib/prisma'

const isWin = (p: { isWinner: boolean; placement: number | null }) =>
  p.isWinner || p.placement === 1

export const stats = new Elysia({ prefix: '/stats' })
  .get('/overview', async () => {
    const [players, decks, matches, events, agg] = await Promise.all([
      prisma.player.count(),
      prisma.deck.count(),
      prisma.match.count(),
      prisma.matchEvent.count(),
      prisma.match.aggregate({ _avg: { durationMins: true, turns: true } }),
    ])
    return {
      players,
      decks,
      matches,
      events,
      avgDurationMins: agg._avg.durationMins,
      avgTurns: agg._avg.turns,
    }
  })
  .get('/players', async () => {
    const players = await prisma.player.findMany({
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
  })
  .get('/decks', async () => {
    const decks = await prisma.deck.findMany({
      include: { owner: true, commander: true, participations: true },
    })
    return decks
      .map((d) => {
        const games = d.participations.length
        const wins = d.participations.filter(isWin).length
        return {
          id: d.id,
          name: d.name,
          owner: d.owner.name,
          commander: d.commander?.name ?? null,
          colorIdentity: d.colorIdentity,
          games,
          wins,
          winrate: games ? wins / games : 0,
        }
      })
      .sort((a, b) => b.winrate - a.winrate || b.games - a.games)
  })
