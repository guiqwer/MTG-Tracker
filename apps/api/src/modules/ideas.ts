import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { requireUserId } from '../security/tokens'
import { isUniqueViolation } from '../lib/prisma-errors'

const NOT_FOUND = { error: 'not_found', error_description: 'Idea not found' } as const

// App-wide idea board: not group-scoped — any signed-in user posts and votes.
const ideaInclude = (userId: string) =>
  ({
    user: { select: { id: true, username: true, avatarColor: true } },
    _count: { select: { votes: true } },
    // Just the caller's vote, to render the toggled state.
    votes: { where: { userId }, select: { id: true } },
  }) as const

function shape(idea: {
  votes: { id: string }[]
  _count: { votes: number }
  [k: string]: unknown
}) {
  const { votes, ...rest } = idea
  return { ...rest, voted: votes.length > 0 }
}

export const ideas = new Elysia({ prefix: '/ideas' })
  .get('/', async ({ headers }) => {
    const userId = await requireUserId(headers.authorization)
    const list = await prisma.idea.findMany({
      include: ideaInclude(userId),
      orderBy: [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }],
    })
    return list.map(shape)
  })
  .post(
    '/',
    async ({ headers, body }) => {
      const userId = await requireUserId(headers.authorization)
      const idea = await prisma.idea.create({
        data: { title: body.title.trim(), body: body.body?.trim() || undefined, userId },
        include: ideaInclude(userId),
      })
      return shape(idea)
    },
    {
      body: t.Object({
        title: t.String({ minLength: 3, maxLength: 120 }),
        body: t.Optional(t.String({ maxLength: 2000 })),
      }),
    },
  )
  // Toggle the caller's upvote.
  .post('/:id/vote', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const idea = await prisma.idea.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!idea) {
      set.status = 404
      return NOT_FOUND
    }
    const deleted = await prisma.ideaVote.deleteMany({ where: { ideaId: params.id, userId } })
    if (deleted.count === 0) {
      try {
        await prisma.ideaVote.create({ data: { ideaId: params.id, userId } })
      } catch (e) {
        // Double-click race: the vote already exists — that's the desired state.
        if (!isUniqueViolation(e)) throw e
      }
    }
    return { voted: deleted.count === 0 }
  })
  // Authors can withdraw their own ideas.
  .delete('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const idea = await prisma.idea.findUnique({
      where: { id: params.id },
      select: { userId: true },
    })
    if (!idea) {
      set.status = 404
      return NOT_FOUND
    }
    if (idea.userId !== userId) {
      set.status = 403
      return { error: 'forbidden', error_description: 'Only the author can delete an idea' }
    }
    return prisma.idea.delete({ where: { id: params.id } })
  })
