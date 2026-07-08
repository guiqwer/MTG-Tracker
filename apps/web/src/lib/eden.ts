import { treaty } from '@elysiajs/eden'
import type { App } from '@mtg/api'

const configured = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// A relative base (e.g. "/api" behind the nginx proxy in production) is resolved
// against the current origin so Eden always receives an absolute URL.
const url =
  configured.startsWith('/') && typeof window !== 'undefined'
    ? `${window.location.origin}${configured}`
    : configured

// End-to-end typed client: every route/param/body is inferred from the Elysia app.
export const api = treaty<App>(url)
