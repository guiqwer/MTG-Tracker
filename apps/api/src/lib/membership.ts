import { prisma } from './prisma'

// Group-scoping guard for the data modules: is this user a member of the group?
export async function isMember(userId: string, groupId: string): Promise<boolean> {
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  return membership !== null
}

// Standard error body returned when the caller isn't in the requested group.
export const FORBIDDEN_GROUP = {
  error: 'forbidden',
  error_description: 'You are not a member of this group',
} as const

// The groups two users share — profiles (and everything on them) are visible
// only across this boundary, and stats aggregate only these groups.
export async function sharedGroupIds(userA: string, userB: string): Promise<string[]> {
  const [a, b] = await Promise.all([
    prisma.groupMembership.findMany({ where: { userId: userA }, select: { groupId: true } }),
    prisma.groupMembership.findMany({ where: { userId: userB }, select: { groupId: true } }),
  ])
  const bSet = new Set(b.map((m) => m.groupId))
  return a.map((m) => m.groupId).filter((g) => bSet.has(g))
}
