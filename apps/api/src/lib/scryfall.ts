// Thin Scryfall client. Scryfall asks for a descriptive User-Agent + Accept
// header and light rate limiting — fine for our low-volume commander lookups.
const BASE = 'https://api.scryfall.com'

const HEADERS = {
  'User-Agent': 'MagicMatchTracker/0.1',
  Accept: 'application/json',
}

export interface ScryfallCard {
  scryfallId: string
  oracleId: string | null
  name: string
  imageUrl: string | null
  artCropUrl: string | null
  typeLine: string | null
  manaCost: string | null
  cmc: number
  colorIdentity: string[]
  oracleText: string | null
  priceUsd: number | null
}

function normalize(c: any): ScryfallCard {
  const faces = c.card_faces as any[] | undefined
  const images = c.image_uris ?? faces?.[0]?.image_uris ?? {}
  const oracleText =
    c.oracle_text ??
    (faces ? faces.map((f) => f.oracle_text).filter(Boolean).join('\n//\n') : null)
  const price = parseFloat(c.prices?.usd ?? c.prices?.usd_foil ?? '')
  return {
    scryfallId: c.id,
    oracleId: c.oracle_id ?? null,
    name: c.name,
    imageUrl: images.normal ?? images.large ?? null,
    artCropUrl: images.art_crop ?? null,
    typeLine: c.type_line ?? faces?.[0]?.type_line ?? null,
    manaCost: c.mana_cost ?? faces?.[0]?.mana_cost ?? null,
    cmc: typeof c.cmc === 'number' ? c.cmc : 0,
    colorIdentity: c.color_identity ?? [],
    oracleText: oracleText ?? null,
    priceUsd: Number.isFinite(price) ? price : null,
  }
}

// Search cards by name, ordered by popularity. `commandersOnly` adds the
// `is:commander` filter (used by the deck commander picker).
export async function searchCards(
  query: string,
  opts: { commandersOnly?: boolean } = {},
): Promise<ScryfallCard[]> {
  if (!query.trim()) return []
  const q = opts.commandersOnly ? `${query} is:commander` : query
  const url = `${BASE}/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=edhrec`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return []
  const data = (await res.json()) as any
  return (data.data ?? []).slice(0, 20).map(normalize)
}

export const searchCommanders = (query: string) =>
  searchCards(query, { commandersOnly: true })

export async function fetchCardById(scryfallId: string): Promise<ScryfallCard> {
  const res = await fetch(`${BASE}/cards/${scryfallId}`, { headers: HEADERS })
  if (!res.ok) throw new Error(`Scryfall card ${scryfallId} not found (${res.status})`)
  return normalize(await res.json())
}

export async function fetchCardByName(name: string): Promise<ScryfallCard | null> {
  const res = await fetch(`${BASE}/cards/named?exact=${encodeURIComponent(name)}`, {
    headers: HEADERS,
  })
  if (!res.ok) return null
  return normalize(await res.json())
}

// Which of `names` carry a given Scryfall Tagger oracle tag (otag:removal…).
// Names are OR-ed into batched search queries (~40 per request, staying under
// Scryfall's query length cap), so a 100-card deck costs ~3 requests per tag.
// Returns matched names lowercased. 404 = no matches; other failures throw so
// callers don't persist a false "no tags" result.
export async function filterByOracleTag(
  tag: string,
  names: string[],
): Promise<Set<string>> {
  const matched = new Set<string>()
  const batches: string[][] = []
  let batch: string[] = []
  let len = 0
  for (const name of names) {
    const term = `!"${name.replaceAll('"', '')}"`
    if (batch.length && len + term.length + 4 > 800) {
      batches.push(batch)
      batch = []
      len = 0
    }
    batch.push(term)
    len += term.length + 4
  }
  if (batch.length) batches.push(batch)

  for (const terms of batches) {
    const q = `otag:${tag} (${terms.join(' or ')})`
    const res = await fetch(
      `${BASE}/cards/search?q=${encodeURIComponent(q)}&unique=cards`,
      { headers: HEADERS },
    )
    if (res.status === 404) continue // none of this batch has the tag
    if (!res.ok) throw new Error(`Scryfall otag search failed (${res.status})`)
    const data = (await res.json()) as any
    for (const c of data.data ?? []) matched.add((c.name as string).toLowerCase())
    await new Promise((r) => setTimeout(r, 100)) // polite rate limit
  }
  return matched
}

export type CardIdentifier = { id: string } | { name: string }

// Bulk lookup via /cards/collection — up to 75 identifiers per request, so a
// full 100-card Commander list costs just 2 calls instead of 100.
export async function fetchCollection(
  identifiers: CardIdentifier[],
): Promise<{ cards: ScryfallCard[]; notFound: string[] }> {
  const cards: ScryfallCard[] = []
  const notFound: string[] = []
  for (let i = 0; i < identifiers.length; i += 75) {
    const chunk = identifiers.slice(i, i + 75)
    const res = await fetch(`${BASE}/cards/collection`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk }),
    })
    if (!res.ok) throw new Error(`Scryfall collection lookup failed (${res.status})`)
    const data = (await res.json()) as any
    cards.push(...(data.data ?? []).map(normalize))
    notFound.push(
      ...(data.not_found ?? []).map((n: any) => n.name ?? n.id ?? 'unknown'),
    )
  }
  return { cards, notFound }
}
