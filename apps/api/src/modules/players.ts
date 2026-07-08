import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'

export const players = new Elysia({ prefix: '/players' })
  .get('/', () =>
    prisma.player.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { decks: true, participations: true } } },
    }),
  )
  .get('/:id', ({ params }) =>
    prisma.player.findUnique({
      where: { id: params.id },
      include: { decks: { include: { commander: true } } },
    }),
  )
  .post('/', ({ body }) => prisma.player.create({ data: body }), {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 60 }),
      avatarColor: t.Optional(t.String()),
    }),
  })
  .delete('/:id', ({ params }) => prisma.player.delete({ where: { id: params.id } }))
