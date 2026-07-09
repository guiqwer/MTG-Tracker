import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { hashPassword, verifyPassword } from '../security/passwords'
import { requireUserId, signAccessToken } from '../security/tokens'
import { isUniqueViolation } from '../lib/prisma-errors'

function publicUser(u: {
  id: string
  username: string
  email: string
  dateOfBirth: Date
  avatarColor?: string | null
  bio?: string | null
  featuredDeckId?: string | null
}) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    dateOfBirth: u.dateOfBirth,
    avatarColor: u.avatarColor ?? null,
    bio: u.bio ?? null,
    featuredDeckId: u.featuredDeckId ?? null,
  }
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
    const userId = await requireUserId(headers.authorization)
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return user ? publicUser(user) : null
  })
  // Change email — re-authenticated with the current password (sensitive change).
  .patch(
    '/email',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        set.status = 401
        return { error: 'invalid_credentials', error_description: 'Current password is incorrect' }
      }
      const email = body.email.trim().toLowerCase()
      const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } })
      if (taken) {
        set.status = 409
        return { error: 'email_taken', error_description: 'That email is already in use' }
      }
      // The email @unique constraint is the real backstop against a concurrent
      // change racing to the same address.
      try {
        const updated = await prisma.user.update({ where: { id: userId }, data: { email } })
        return publicUser(updated)
      } catch (e) {
        if (isUniqueViolation(e)) {
          set.status = 409
          return { error: 'email_taken', error_description: 'That email is already in use' }
        }
        throw e
      }
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 120 }),
        currentPassword: t.String({ minLength: 1 }),
      }),
    },
  )
  // Profile customization: avatar color, short bio and the featured deck.
  .patch(
    '/profile',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      // The featured deck must be one of the caller's own (personal import or
      // a deck owned by one of their linked players).
      if (body.featuredDeckId) {
        const deck = await prisma.deck.findUnique({
          where: { id: body.featuredDeckId },
          include: { owner: { select: { userId: true } } },
        })
        if (!deck || (deck.userId !== userId && deck.owner?.userId !== userId)) {
          set.status = 400
          return { error: 'invalid_deck', error_description: 'Pick one of your own decks' }
        }
      }
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          avatarColor: body.avatarColor === undefined ? undefined : body.avatarColor,
          bio: body.bio === undefined ? undefined : body.bio?.trim() || null,
          featuredDeckId:
            body.featuredDeckId === undefined ? undefined : body.featuredDeckId,
        },
      })
      return publicUser(updated)
    },
    {
      body: t.Object({
        avatarColor: t.Optional(t.Union([t.String({ maxLength: 20 }), t.Null()])),
        bio: t.Optional(t.Union([t.String({ maxLength: 240 }), t.Null()])),
        featuredDeckId: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  // Change password — requires the current password, then re-hashes (argon2id).
  .patch(
    '/password',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        set.status = 401
        return { error: 'invalid_credentials', error_description: 'Current password is incorrect' }
      }
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(body.newPassword) },
      })
      return { ok: true }
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 8, maxLength: 128 }),
      }),
    },
  )
