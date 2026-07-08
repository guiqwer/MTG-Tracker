// Access token storage. The JWT bearer token lives in localStorage and is
// attached to every API call by the Eden client (see eden.ts).
const KEY = 'mtg_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function isAuthenticated(): boolean {
  return !!getToken()
}
