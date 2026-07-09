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
