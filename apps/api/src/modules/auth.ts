import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { hashPassword, verifyPassword } from '../security/passwords'
import { readBearerToken, signAccessToken, verifyAccessToken } from '../security/tokens'

function publicUser(u: {
  id: string
  username: string
  email: string
  dateOfBirth: Date
}) {
  return { id: u.id, username: u.username, email: u.email, dateOfBirth: u.dateOfBirth }
}

export const auth = new Elysia({ prefix: '/auth' })
  // Register a new account. The password is hashed (argon2id) before storage.
  .post(
    '/signup',
    async ({ body, set }) => {
      const email = body.email.trim().toLowerCase()
      const existing = await prisma.user.findFirst({
        where: { OR: [{ username: body.username }, { email }] },
      })
      if (existing) {
        set.status = 409
        return { error: 'user_exists', error_description: 'Username or email is already in use' }
      }
      const user = await prisma.user.create({
        data: {
          username: body.username,
          email,
          passwordHash: await hashPassword(body.password),
          dateOfBirth: new Date(body.dateOfBirth),
        },
      })
      return { token: await signAccessToken(user), user: publicUser(user) }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3, maxLength: 30 }),
        email: t.String({ minLength: 3, maxLength: 120 }),
        password: t.String({ minLength: 8, maxLength: 128 }),
        dateOfBirth: t.String({ minLength: 1 }),
      }),
    },
  )
  // Exchange credentials for an access token.
  .post(
    '/login',
    async ({ body, set }) => {
      const id = body.identifier.trim()
      const user = await prisma.user.findFirst({
        where: { OR: [{ username: id }, { email: id.toLowerCase() }] },
      })
      // Generic error (never reveals whether the account exists).
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        set.status = 401
        return {
          error: 'invalid_credentials',
          error_description: 'Invalid username/email or password',
        }
      }
      return { token: await signAccessToken(user), user: publicUser(user) }
    },
    { body: t.Object({ identifier: t.String(), password: t.String() }) },
  )
  // Current user — reached only with a valid token (the global guard enforces it).
  .get('/me', async ({ headers }) => {
    const claims = await verifyAccessToken(readBearerToken(headers.authorization) ?? '')
    const user = await prisma.user.findUnique({ where: { id: String(claims.sub) } })
    return user ? publicUser(user) : null
  })
