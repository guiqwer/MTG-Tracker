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
}

function normalize(c: any): ScryfallCard {
  const faces = c.card_faces as any[] | undefined
  const images = c.image_uris ?? faces?.[0]?.image_uris ?? {}
  const oracleText =
    c.oracle_text ??
    (faces ? faces.map((f) => f.oracle_text).filter(Boolean).join('\n//\n') : null)
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
