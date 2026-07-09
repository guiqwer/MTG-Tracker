import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { requireUserId } from '../security/tokens'
import { generateInviteCode } from '../lib/invite'
import { isUniqueViolation } from '../lib/prisma-errors'
import { ensureMemberPlayer } from '../lib/players'

// Owners are listed before members; ties break by join date.
const ROLE_RANK: Record<string, number> = { OWNER: 0, MEMBER: 1 }

export const groups = new Elysia({ prefix: '/groups' })
  // Groups the caller belongs to, newest first, with their role + member count.
  .get('/', async ({ headers }) => {
    const userId = await requireUserId(headers.authorization)
    const memberships = await prisma.groupMembership.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        group: { include: { _count: { select: { memberships: true } } } },
      },
    })
    return memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      inviteCode: m.group.inviteCode,
      role: m.role,
      memberCount: m.group._count.memberships,
      joinedAt: m.joinedAt,
    }))
  })
  // Create a group. The creator becomes its OWNER and a unique invite code is
  // minted (retrying on the astronomically unlikely code collision).
  .post(
    '/',
    async ({ headers, body }) => {
      const userId = await requireUserId(headers.authorization)
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const group = await prisma.group.create({
            data: {
              name: body.name.trim(),
              inviteCode: generateInviteCode(),
              memberships: { create: { userId, role: 'OWNER' } },
            },
          })
          // The creator immediately gets their seat at the table.
          await ensureMemberPlayer(group.id, userId)
          return group
        } catch (e) {
          if (isUniqueViolation(e) && attempt < 4) continue
          throw e
        }
      }
      throw new Error('Could not generate a unique invite code')
    },
    { body: t.Object({ name: t.String({ minLength: 2, maxLength: 60 }) }) },
  )
  // Join a group by its invite code.
  .post(
    '/join',
    async ({ headers, body, set }) => {
      const userId = await requireUserId(headers.authorization)
      const code = body.inviteCode.trim().toUpperCase()
      const group = await prisma.group.findUnique({ where: { inviteCode: code } })
      if (!group) {
        set.status = 404
        return {
          error: 'invalid_code',
          error_description: 'No group found for that invite code',
        }
      }
      const existing = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
      })
      if (existing) {
        set.status = 409
        return { error: 'already_member', error_description: 'You are already in this group' }
      }
      // The @@unique([groupId, userId]) is the real backstop: catch the race
      // where two concurrent joins both pass the check above.
      try {
        await prisma.groupMembership.create({
          data: { groupId: group.id, userId, role: 'MEMBER' },
        })
      } catch (e) {
        if (isUniqueViolation(e)) {
          set.status = 409
          return { error: 'already_member', error_description: 'You are already in this group' }
        }
        throw e
      }
      // New members get their seat at the table right away.
      await ensureMemberPlayer(group.id, userId)
      return { id: group.id, name: group.name, inviteCode: group.inviteCode }
    },
    { body: t.Object({ inviteCode: t.String({ minLength: 3, maxLength: 40 }) }) },
  )
  // Group detail with its members — visible only to members of that group.
  .get('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: params.id, userId } },
    })
    if (!membership) {
      set.status = 404
      return { error: 'not_found', error_description: 'Group not found' }
    }
    const group = await prisma.group.findUnique({
      where: { id: params.id },
      include: { memberships: { include: { user: true } } },
    })
    if (!group) {
      set.status = 404
      return { error: 'not_found', error_description: 'Group not found' }
    }
    const members = group.memberships
      .map((m) => ({
        userId: m.userId,
        username: m.user.username,
        role: m.role,
        joinedAt: m.joinedAt,
        isYou: m.userId === userId,
      }))
      .sort(
        (a, b) =>
          ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
          a.joinedAt.getTime() - b.joinedAt.getTime(),
      )
    return {
      id: group.id,
      name: group.name,
      inviteCode: group.inviteCode,
      myRole: membership.role,
      createdAt: group.createdAt,
      members,
    }
  })
  // Leave a group. When the last member leaves, the now-empty group is removed;
  // if the owner leaves while others remain, the longest-standing member is
  // promoted so a group is never left ownerless.
  .delete('/:id/leave', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: params.id, userId } },
    })
    if (!membership) {
      set.status = 404
      return { error: 'not_found', error_description: 'You are not a member of this group' }
    }
    await prisma.groupMembership.delete({ where: { id: membership.id } })

    const remaining = await prisma.groupMembership.findMany({
      where: { groupId: params.id },
      orderBy: { joinedAt: 'asc' },
    })
    if (remaining.length === 0) {
      // deleteMany is idempotent — safe when two last members leave at once.
      await prisma.group.deleteMany({ where: { id: params.id } })
    } else if (!remaining.some((m) => m.role === 'OWNER')) {
      await prisma.groupMembership.update({
        where: { id: remaining[0].id },
        data: { role: 'OWNER' },
      })
    }
    return { ok: true }
  })
  // Delete a group entirely — owners only. Cascades to all memberships.
  .delete('/:id', async ({ headers, params, set }) => {
    const userId = await requireUserId(headers.authorization)
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: params.id, userId } },
    })
    if (!membership || membership.role !== 'OWNER') {
      set.status = 403
      return { error: 'forbidden', error_description: 'Only the group owner can delete it' }
    }
    await prisma.group.delete({ where: { id: params.id } })
    return { ok: true }
  })
