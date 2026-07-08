import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

// The signing secret MUST come from the environment in production. A dev
// fallback keeps local runs working, but tokens signed with it are insecure.
const secretValue = process.env.JWT_SECRET
if (!secretValue) {
  console.warn(
    '⚠️  JWT_SECRET is not set — using an insecure development secret. Set JWT_SECRET in production!',
  )
}
const secret = new TextEncoder().encode(
  secretValue ?? 'dev-insecure-secret-change-me',
)

// OAuth-style token metadata.
const ISSUER = process.env.JWT_ISSUER ?? 'magic-match-tracker'
const AUDIENCE = process.env.JWT_AUDIENCE ?? 'magic-match-tracker-api'
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

export interface AuthClaims extends JWTPayload {
  sub: string
  username: string
}

// Issue a signed JWT access token with the standard claims (sub/iss/aud/iat/exp).
export async function signAccessToken(user: {
  id: string
  username: string
}): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret)
}

// Verify signature, algorithm, expiry (current UTC), issuer and audience.
export async function verifyAccessToken(token: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  })
  return payload as AuthClaims
}

export function readBearerToken(header?: string): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && value ? value : null
}
