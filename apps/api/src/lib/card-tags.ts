import { prisma } from './prisma'
import { filterByOracleTag } from './scryfall'

// EventType -> Scryfall Tagger oracle tag. Types without a curated tag
// (COMBO, INFINITE, …) are absent on purpose — they fall back to free search.
export const EVENT_TAGS: Record<string, string> = {
  REMOVAL: 'removal',
  COUNTER: 'counterspell',
  TUTOR: 'tutor',
  BOARDWIPE: 'boardwipe',
  RAMP: 'ramp',
  DRAW: 'draw',
}
const ALL_TAGS = [...new Set(Object.values(EVENT_TAGS))]

// Cards are tagged once globally (taggedAt) and shared across decks, so the
// Scryfall cost of a deck full of staples quickly amortizes to zero. Dedupe
// concurrent requests for the same deck so a 4-player table opening the same
// match doesn't multiply the work.
const inflight = new Map<string, Promise<void>>()

export function ensureDeckTagged(deckId: string): Promise<void> {
  const running = inflight.get(deckId)
  if (running) return running
  const p = tagDeckCards(deckId).finally(() => inflight.delete(deckId))
  inflight.set(deckId, p)
  return p
}

async function tagDeckCards(deckId: string) {
  const untagged = await prisma.card.findMany({
    where: { taggedAt: null, deckCards: { some: { deckId } } },
    select: { id: true, name: true },
  })
  if (!untagged.length) return

  try {
    const tagsByCard = new Map<string, string[]>(untagged.map((c) => [c.id, []]))
    for (const tag of ALL_TAGS) {
      const hits = await filterByOracleTag(
        tag,
        untagged.map((c) => c.name),
      )
      for (const c of untagged) {
        if (hits.has(c.name.toLowerCase())) tagsByCard.get(c.id)!.push(tag)
      }
    }

    // Group by identical tag sets → a handful of updateMany calls instead of
    // one update per card.
    const groups = new Map<string, { tags: string[]; ids: string[] }>()
    for (const [cardId, tags] of tagsByCard) {
      const key = tags.join(',')
      const g = groups.get(key) ?? { tags, ids: [] }
      g.ids.push(cardId)
      groups.set(key, g)
    }
    const now = new Date()
    await prisma.$transaction(
      [...groups.values()].map((g) =>
        prisma.card.updateMany({
          where: { id: { in: g.ids } },
          data: { oracleTags: g.tags, taggedAt: now },
        }),
      ),
    )
  } catch (e) {
    // Scryfall hiccup: persist nothing so the next request retries cleanly.
    console.error(`card tagging failed for deck ${deckId}:`, e)
  }
}
