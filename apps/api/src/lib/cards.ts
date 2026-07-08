import { prisma } from './prisma'
import { fetchCardById, fetchCardByName, type ScryfallCard } from './scryfall'

export async function upsertCard(data: ScryfallCard) {
  return prisma.card.upsert({
    where: { scryfallId: data.scryfallId },
    create: data,
    update: data,
  })
}

// Import a card by Scryfall id, reusing the local copy if we already have it.
export async function importCard(scryfallId: string) {
  const existing = await prisma.card.findUnique({ where: { scryfallId } })
  if (existing) return existing
  return upsertCard(await fetchCardById(scryfallId))
}

export async function importCardByName(name: string) {
  const data = await fetchCardByName(name)
  if (!data) return null
  return upsertCard(data)
}
