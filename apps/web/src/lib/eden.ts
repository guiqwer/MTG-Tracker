import { treaty } from '@elysiajs/eden'
import type { App } from '@mtg/api'

const url = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// End-to-end typed client: every route/param/body is inferred from the Elysia app.
export const api = treaty<App>(url)
