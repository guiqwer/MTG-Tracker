import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { players } from './modules/players'
import { cards } from './modules/cards'
import { decks } from './modules/decks'
import { matches } from './modules/matches'
import { stats } from './modules/stats'
import { auth } from './modules/auth'
import { checkAuth } from './security/guard'

export const app = new Elysia()
  .use(cors())
  // Global auth gate: every route needs a valid JWT except the public
  // auth/health endpoints (see checkAuth). Returning a body short-circuits.
  .onBeforeHandle({ as: 'global' }, async ({ request, path, headers, set }) => {
    const denied = await checkAuth(request.method, path, headers.authorization)
    if (denied) {
      set.status = denied.status
      set.headers['www-authenticate'] = denied.wwwAuthenticate
      return denied.body
    }
  })
  .get('/', () => ({ name: 'Magic Match Tracker API', status: 'ok' }))
  .get('/health', () => ({ status: 'ok', time: new Date().toISOString() }))
  .use(auth)
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
