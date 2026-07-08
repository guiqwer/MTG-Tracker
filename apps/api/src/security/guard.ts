import { readBearerToken, verifyAccessToken } from './tokens'

// Endpoints reachable without an access token.
const PUBLIC_PATHS = new Set(['/', '/health', '/auth/signup', '/auth/login'])

// RFC 6750 section 3.1 challenge returned for a missing/invalid/expired token.
const WWW_AUTHENTICATE =
  'Bearer, error="invalid_token", error_description="Missing, invalid or expired access token"'
const ERROR_DESCRIPTION = 'Missing, invalid or expired access token'

export interface AuthDenied {
  status: 401
  wwwAuthenticate: string
  body: { error: 'invalid_token'; error_description: string }
}

// Global gate: returns null when the request may proceed, or a 401 descriptor to
// short-circuit. Every route requires a valid JWT access token except the public
// auth/health endpoints and CORS preflight.
export async function checkAuth(
  method: string,
  path: string,
  authorization: string | undefined,
): Promise<AuthDenied | null> {
  if (method === 'OPTIONS') return null
  if (PUBLIC_PATHS.has(path)) return null

  const token = readBearerToken(authorization)
  if (!token) return deny('No bearer access token in the Authorization header')

  try {
    await verifyAccessToken(token)
    return null
  } catch (e) {
    return deny(e instanceof Error ? e.message : String(e))
  }
}

function deny(reason: string): AuthDenied {
  console.warn(
    `status: 401, code: invalid_token, message: ${ERROR_DESCRIPTION}, reason: ${reason}`,
  )
  return {
    status: 401,
    wwwAuthenticate: WWW_AUTHENTICATE,
    body: { error: 'invalid_token', error_description: ERROR_DESCRIPTION },
  }
}
