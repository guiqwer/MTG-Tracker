import { prisma } from './prisma'
import { isUniqueViolation } from './prisma-errors'

// Every group member automatically gets a seat at the table: a Player row
// linked to their account, named after their username. Idempotent — called on
// group create, on join, and by the boot backfill.
export async function ensureMemberPlayer(groupId: string, userId: string) {
  const existing = await prisma.player.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (existing) return existing

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  // Player names are unique per group; if a guest already took the username,
  // suffix it ("alex (2)").
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = attempt === 0 ? user.username : `${user.username} (${attempt + 1})`
    try {
      return await prisma.player.create({ data: { name, groupId, userId } })
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Either the name is taken (retry with a suffix) or a concurrent call
        // already created the linked player (return it).
        const winner = await prisma.player.findUnique({
          where: { groupId_userId: { groupId, userId } },
        })
        if (winner) return winner
        continue
      }
      throw e
    }
  }
  return null
}
