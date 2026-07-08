import { treaty } from '@elysiajs/eden'
import type { App } from '@mtg/api'
import { getToken } from './auth'

const configured = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// A relative base (e.g. "/api" behind the nginx proxy in production) is resolved
// against the current origin so Eden always receives an absolute URL.
const url =
  configured.startsWith('/') && typeof window !== 'undefined'
    ? `${window.location.origin}${configured}`
    : configured

// End-to-end typed client. The bearer access token is attached to every request.
export const api = treaty<App>(url, {
  headers() {
    const token = getToken()
    return token ? { authorization: `Bearer ${token}` } : {}
  },
})
