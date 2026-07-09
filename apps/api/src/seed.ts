import { prisma } from './lib/prisma'
import { ensureMemberPlayer } from './lib/players'

// The app no longer ships demo data. This script removes the mock content
// earlier versions seeded and backfills invariants — idempotent, runs on boot.
async function main() {
  // Matches must go first: participants reference players/decks without a
  // cascade. Deleting a match cascades its participants and events; the group
  // delete then cascades memberships, players and their decks. Card rows are a
  // global Scryfall cache and stay.
  const demoGroup = await prisma.group.findUnique({ where: { inviteCode: 'DEMOPOD' } })
  if (demoGroup && demoGroup.name === 'Demo Pod') {
    await prisma.match.deleteMany({ where: { groupId: demoGroup.id } })
    await prisma.group.delete({ where: { id: demoGroup.id } })
    console.log('Cleanup: removed the legacy "Demo Pod" demo group.')
  }

  // Deleting the user cascades its memberships and personal decks — but seats
  // that used those decks must be released first.
  const demoUser = await prisma.user.findFirst({
    where: { username: 'demo', email: 'demo@mtg.local' },
  })
  if (demoUser) {
    await prisma.matchParticipant.deleteMany({ where: { deck: { userId: demoUser.id } } })
    await prisma.user.delete({ where: { id: demoUser.id } })
    console.log('Cleanup: removed the legacy demo account.')
  }

  // Backfill: every group member has a linked player ("member = player").
  const memberships = await prisma.groupMembership.findMany({
    select: { groupId: true, userId: true },
  })
  let created = 0
  for (const m of memberships) {
    const existing = await prisma.player.findUnique({
      where: { groupId_userId: { groupId: m.groupId, userId: m.userId } },
    })
    if (!existing && (await ensureMemberPlayer(m.groupId, m.userId))) created++
  }
  if (created > 0) console.log(`Backfill: created ${created} member player(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
