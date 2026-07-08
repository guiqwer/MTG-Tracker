import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { players } from './modules/players'
import { cards } from './modules/cards'
import { decks } from './modules/decks'
import { matches } from './modules/matches'
import { stats } from './modules/stats'

export const app = new Elysia()
  .use(cors())
  .get('/', () => ({ name: 'Magic Match Tracker API', status: 'ok' }))
  .get('/health', () => ({ status: 'ok', time: new Date().toISOString() }))
  .use(players)
  .use(cards)
  .use(decks)
  .use(matches)
  .use(stats)
  .listen({ port: Number(process.env.PORT ?? 3000), hostname: '0.0.0.0' })

console.log(
  `🚀 Magic Match Tracker API running on http://localhost:${app.server?.port}`,
)

// Exported for Eden Treaty end-to-end types on the web app.
export type App = typeof app
