import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { requireUserId } from '../security/tokens'
import { isMember, FORBIDDEN_GROUP } from '../lib/membership'

export const players = new Elysia({ prefix: '/players' })
  // Players of a group — caller must be a member of that group.
  .get(
    '/',
    async ({ headers, query, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, query.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      return prisma.player.findMany({
        where: { groupId: query.groupId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { decks: true, participations: true } } },
      })
    },
    { query: t.Object({ groupId: t.String() }) },
  )
  .get('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const player = await prisma.player.findUnique({
      where: { id: params.id },
      include: { decks: { include: { commander: true } } },
    })
    if (!player?.groupId || !(await isMember(userId, player.groupId))) {
      set.status = 404
      return { error: 'not_found', error_description: 'Player not found' }
    }
    return player
  })
  .post(
    '/',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      if (!(await isMember(userId, body.groupId))) {
        set.status = 403
        return FORBIDDEN_GROUP
      }
      return prisma.player.create({
        data: { name: body.name, avatarColor: body.avatarColor, groupId: body.groupId },
      })
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60 }),
        avatarColor: t.Optional(t.String()),
        groupId: t.String(),
      }),
    },
  )
  .delete('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const player = await prisma.player.findUnique({ where: { id: params.id } })
    if (!player?.groupId || !(await isMember(userId, player.groupId))) {
      set.status = 404
      return { error: 'not_found', error_description: 'Player not found' }
    }
    return prisma.player.delete({ where: { id: params.id } })
  })
