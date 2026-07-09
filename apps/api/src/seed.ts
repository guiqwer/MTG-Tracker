import { prisma } from './lib/prisma'
import { importCardByName } from './lib/cards'
import { hashPassword } from './security/passwords'

async function main() {
  // Demo login account (idempotent) — username: demo · password: password12
  const demo = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      email: 'demo@mtg.local',
      passwordHash: await hashPassword('password12'),
      dateOfBirth: new Date('1995-05-05'),
    },
  })

  // Demo group (idempotent via its fixed invite code) with demo as its owner —
  // share code "DEMOPOD" to test joining from a second account.
  const demoGroup = await prisma.group.upsert({
    where: { inviteCode: 'DEMOPOD' },
    update: {},
    create: { name: 'Demo Pod', inviteCode: 'DEMOPOD' },
  })
  await prisma.groupMembership.upsert({
    where: { groupId_userId: { groupId: demoGroup.id, userId: demo.id } },
    update: {},
    create: { groupId: demoGroup.id, userId: demo.id, role: 'OWNER' },
  })

  // Backfill: attach any pre-group rows to the demo group so nothing vanishes
  // from the UI after the group-scoping migration.
  await prisma.player.updateMany({
    where: { groupId: null },
    data: { groupId: demoGroup.id },
  })
  await prisma.match.updateMany({
    where: { groupId: null },
    data: { groupId: demoGroup.id },
  })

  const roster = [
    { name: 'Alex', color: '#7c3aed' },
    { name: 'Sam', color: '#0ea5e9' },
    { name: 'Jordan', color: '#f59e0b' },
    { name: 'Casey', color: '#ef4444' },
  ]

  const players = []
  for (const r of roster) {
    players.push(
      await prisma.player.upsert({
        where: { groupId_name: { groupId: demoGroup.id, name: r.name } },
        update: {},
        create: { name: r.name, avatarColor: r.color, groupId: demoGroup.id },
      }),
    )
  }

  // Seed decks + a sample match only once.
  if ((await prisma.deck.count()) > 0) {
    console.log('Seed: decks already present — skipping deck/match seed.')
    return
  }

  const specs = [
    { commander: "Atraxa, Praetors' Voice", deck: 'Superfriends', archetype: 'Superfriends', power: 8, owner: 0 },
    { commander: 'Krenko, Mob Boss', deck: 'Goblin Aggro', archetype: 'Aggro', power: 6, owner: 1 },
    { commander: 'Muldrotha, the Gravetide', deck: 'Value Engine', archetype: 'Midrange', power: 7, owner: 2 },
    { commander: 'Edgar Markov', deck: 'Vampires', archetype: 'Aggro', power: 7, owner: 3 },
  ]

  const decks = []
  for (const s of specs) {
    let commander = null
    try {
      commander = await importCardByName(s.commander)
    } catch {
      console.warn(`Seed: could not fetch commander "${s.commander}" (offline?)`)
    }
    decks.push(
      await prisma.deck.create({
        data: {
          name: s.deck,
          ownerId: players[s.owner].id,
          archetype: s.archetype,
          powerLevel: s.power,
          commanderId: commander?.id,
          colorIdentity: commander?.colorIdentity ?? [],
        },
      }),
    )
  }

  const match = await prisma.match.create({
    data: {
      groupId: demoGroup.id,
      durationMins: 75,
      turns: 11,
      winCondition: 'COMBO',
      endReason: 'NATURAL',
      participants: {
        create: [
          { playerId: players[0].id, deckId: decks[0].id, seatOrder: 1, placement: 3 },
          { playerId: players[1].id, deckId: decks[1].id, seatOrder: 2, placement: 4 },
          { playerId: players[2].id, deckId: decks[2].id, seatOrder: 3, placement: 1, isWinner: true },
          { playerId: players[3].id, deckId: decks[3].id, seatOrder: 4, placement: 2 },
        ],
      },
    },
    include: { participants: { orderBy: { seatOrder: 'asc' } } },
  })

  // Seat order: [Alex, Sam, Jordan (winner), Casey]
  const [alex, sam, jordan, casey] = match.participants
  const timeline = [
    { turn: 2, type: 'RAMP', actorId: jordan.id, note: 'ramped with Sol Ring' },
    { turn: 3, type: 'TUTOR', actorId: jordan.id, note: 'tutored the combo piece' },
    { turn: 4, type: 'REMOVAL', actorId: casey.id, targetId: alex.id },
    { turn: 5, type: 'BOARDWIPE', actorId: sam.id, note: 'wiped the board' },
    { turn: 7, type: 'COMMANDER_DIED', actorId: alex.id },
    { turn: 10, type: 'COMBO', actorId: jordan.id, note: 'infinite Muldrotha loop' },
    { turn: 11, type: 'WIN', actorId: jordan.id },
  ] as const
  await prisma.matchEvent.createMany({
    data: timeline.map((e, i) => ({ matchId: match.id, sequence: i + 1, ...e })),
  })

  console.log(
    `Seed complete: ${players.length} players, ${decks.length} decks, 1 match, ${timeline.length} events.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
