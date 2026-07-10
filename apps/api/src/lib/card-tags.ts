import { prisma } from './prisma'
import { filterByOracleTag } from './scryfall'

// EventType -> Scryfall Tagger oracle tag. Types without a curated tag
// (COMBO, INFINITE, …) are absent on purpose — they fall back to the full deck.
export const EVENT_TAGS: Record<string, string> = {
  REMOVAL: 'removal',
  COUNTER: 'counterspell',
  TUTOR: 'tutor',
  BOARDWIPE: 'boardwipe',
  RAMP: 'ramp',
  DRAW: 'draw',
}
const ALL_TAGS = [...new Set(Object.values(EVENT_TAGS))]

// Run fn over items with a small concurrency pool (order preserved).
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

// Tag a batch of cards: one lane per oracle tag, 2 lanes at a time — a cold
// 100-card deck resolves in ~4s instead of ~20s fully sequential, while
// staying under Scryfall's rate guidance (429s are also retried with backoff
// inside filterByOracleTag). Throws on persistent failure so callers persist
// nothing and the next attempt retries cleanly.
async function tagCards(untagged: { id: string; name: string }[]) {
  if (!untagged.length) return
  const names = untagged.map((c) => c.name)
  const results = await pool(ALL_TAGS, 2, async (tag) => ({
    tag,
    hits: await filterByOracleTag(tag, names),
  }))

  const tagsByCard = new Map<string, string[]>(untagged.map((c) => [c.id, []]))
  for (const { tag, hits } of results) {
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
}

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
  try {
    await tagCards(untagged)
  } catch (e) {
    // Scryfall hiccup: persist nothing so the next request retries cleanly.
    console.error(`card tagging failed for deck ${deckId}:`, e)
  }
}

// Boot-time sweep: tag every card imported before the tagging feature (or
// whose tagging previously failed), in gentle chunks, so nobody ever waits on
// a cold deck at the table. Fired in the background after the server starts.
export async function backfillCardTags() {
  let failures = 0
  for (;;) {
    const chunk = await prisma.card.findMany({
      where: { taggedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
      take: 150,
    })
    if (!chunk.length) return
    try {
      await tagCards(chunk)
      failures = 0
      console.log(`▶ oracle-tag backfill: tagged ${chunk.length} cards`)
      if (chunk.length < 150) return
      await new Promise((r) => setTimeout(r, 1000))
    } catch (e) {
      // Transient throttling: cool off and try again; give up after 3 strikes
      // (the next boot or a deck request picks it back up).
      if (++failures >= 3) {
        console.error('card tag backfill gave up after 3 failures:', e)
        return
      }
      console.warn(`card tag backfill hiccup (${failures}/3), retrying in 60s`)
      await new Promise((r) => setTimeout(r, 60_000))
    }
  }
}
