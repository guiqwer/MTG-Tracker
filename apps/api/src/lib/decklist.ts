// Parsers that turn "a deck somewhere else" into a normalized list we can
// import: deck-site URLs (Moxfield, Archidekt, LigaMagic, TappedOut,
// Aetherhub) and plain-text decklists. Every provider costs exactly ONE
// request to the source site.

export interface ParsedEntry {
  quantity: number
  name?: string // text imports resolve by name
  scryfallId?: string // moxfield/archidekt give us scryfall ids directly
}

export interface ParsedDeck {
  name: string | null
  commanders: ParsedEntry[]
  mainboard: ParsedEntry[]
}

// ── Plain text ───────────────────────────────────────────────────────────────
// Accepts the common formats: "1 Sol Ring", "1x Sol Ring", bare names, Arena
// exports with set codes ("1 Sol Ring (C21) 263"), and section headers like
// "Commander:" / "Deck" / "Sideboard". Sideboard/maybeboard lines are ignored.
const SECTION = /^(commander|companion|deck|mainboard|main|sideboard|maybeboard|considering|tokens?)s?:?$/i
const LINE = /^(\d+)\s*x?\s+(.+)$/

function cleanName(raw: string): string {
  return raw
    .replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w-]*\s*$/, '') // "(C21) 263" suffix
    .replace(/\s*\*[A-Z]+\*\s*$/, '') // "*F*" foil marker
    .trim()
}

export function parseTextDecklist(text: string): ParsedDeck {
  const commanders: ParsedEntry[] = []
  const mainboard: ParsedEntry[] = []
  let section = 'deck'

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//') || line.startsWith('#')) continue

    const header = line.match(SECTION)
    if (header) {
      section = header[1].toLowerCase()
      continue
    }
    if (['sideboard', 'maybeboard', 'considering', 'token'].includes(section)) continue

    const m = line.match(LINE)
    const quantity = m ? Number(m[1]) : 1
    // TappedOut-style "*CMDR*" marker — must be read before cleanName strips it.
    const isCmdr = /\*CMDR\*/i.test(line)
    const name = cleanName(m ? m[2] : line)
    if (!name) continue

    if (section === 'commander' || isCmdr) commanders.push({ quantity, name })
    else mainboard.push({ quantity, name })
  }
  return { name: null, commanders, mainboard }
}

// ── Deck-site providers ──────────────────────────────────────────────────────
// Some sites gate non-browser traffic, so every request carries a browser UA.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: '*/*',
}

async function fetchSource(url: string, site: string): Promise<Response> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw new Error(`${site} returned ${res.status} — the deck may be private or blocked`)
  }
  return res
}

// ── Moxfield ─────────────────────────────────────────────────────────────────
function boardEntries(board: any): ParsedEntry[] {
  const cards = board?.cards ?? {}
  return Object.values(cards).map((e: any) => ({
    quantity: e.quantity ?? 1,
    scryfallId: e.card?.scryfall_id ?? undefined,
    name: e.card?.name ?? undefined,
  }))
}

async function fetchMoxfieldDeck(publicId: string): Promise<ParsedDeck> {
  const res = await fetchSource(
    `https://api2.moxfield.com/v3/decks/all/${publicId}`,
    'Moxfield',
  )
  const data = (await res.json()) as any
  const boards = data.boards ?? {}
  return {
    name: data.name ?? null,
    commanders: boardEntries(boards.commanders),
    mainboard: [...boardEntries(boards.mainboard), ...boardEntries(boards.companions)],
  }
}

// ── Archidekt ────────────────────────────────────────────────────────────────
// Public JSON API; cards carry a Scryfall uid so no name resolution is needed.
// Deck categories mark the premier (Commander) bucket and which categories are
// actually in the deck (Maybeboard/Sideboard have includedInDeck=false).
async function fetchArchidektDeck(id: string): Promise<ParsedDeck> {
  const res = await fetchSource(`https://archidekt.com/api/decks/${id}/`, 'Archidekt')
  const data = (await res.json()) as any
  const catInfo = new Map<string, { included: boolean; premier: boolean }>(
    (data.categories ?? []).map((c: any) => [
      c.name,
      { included: c.includedInDeck !== false, premier: c.isPremier === true },
    ]),
  )
  const commanders: ParsedEntry[] = []
  const mainboard: ParsedEntry[] = []
  for (const c of data.cards ?? []) {
    const cats: string[] = c.categories ?? []
    const infos = cats.map((n) => catInfo.get(n)).filter(Boolean) as {
      included: boolean
      premier: boolean
    }[]
    if (infos.some((i) => !i.included)) continue // maybeboard/sideboard
    const entry: ParsedEntry = {
      quantity: c.quantity ?? 1,
      scryfallId: c.card?.uid ?? undefined,
      name: c.card?.oracleCard?.name ?? undefined,
    }
    if (!entry.scryfallId && !entry.name) continue
    if (infos.some((i) => i.premier) || cats.includes('Commander')) commanders.push(entry)
    else mainboard.push(entry)
  }
  return { name: data.name ?? null, commanders, mainboard }
}

// ── LigaMagic ────────────────────────────────────────────────────────────────
// No API and the text export doesn't mark the commander, but the deck page
// groups cards under section headers ("Comandante", "Criaturas"…) and every
// card link carries the ENGLISH name (?card=The+Ur-Dragon) even when the page
// displays Portuguese — so one HTML fetch gives us everything.
async function fetchLigaMagicDeck(id: string): Promise<ParsedDeck> {
  const res = await fetchSource(
    `https://www.ligamagic.com.br/?view=dks/deck&id=${id}`,
    'LigaMagic',
  )
  const html = await res.text()
  const name =
    html
      .match(/<title>([^|<]+)/)?.[1]
      ?.replace(/\s*-\s*Deck Magic: The Gathering\s*$/i, '')
      .trim() || null
  // The list is repeated in several layouts; dk-val-1 is the plain table.
  const block = html.split(/id='dk-val-1-/)[1]?.split(/id='dk-val-/)[0] ?? html
  const commanders: ParsedEntry[] = []
  const mainboard: ParsedEntry[] = []
  for (const section of block.split(/deck-type[^>]*'>/).slice(1)) {
    const title = (section.match(/^([^<]+)/)?.[1] ?? '').trim().toLowerCase()
    if (/sideboard|maybeboard|cards total/.test(title)) continue
    const isCommander = /comandante|commander/.test(title)
    for (const row of section.matchAll(
      /deck-qty'>(\d+)[^<]*<\/div>[\s\S]*?card=([^"'&]+)/g,
    )) {
      let name: string
      try {
        name = decodeURIComponent(row[2].replace(/\+/g, ' ')).trim()
      } catch {
        continue
      }
      if (!name) continue
      const entry = { quantity: Number(row[1]) || 1, name }
      if (isCommander) commanders.push(entry)
      else mainboard.push(entry)
    }
  }
  if (!commanders.length && !mainboard.length) {
    throw new Error('could not read the deck page — it may be private')
  }
  return { name, commanders, mainboard }
}

// ── TappedOut ────────────────────────────────────────────────────────────────
// ?fmt=txt returns the plain list (commander not marked — the *CMDR* marker
// only appears in pasted exports, which parseTextDecklist already handles).
async function fetchTappedOutDeck(slug: string): Promise<ParsedDeck> {
  const res = await fetchSource(
    `https://tappedout.net/mtg-decks/${slug}/?fmt=txt`,
    'TappedOut',
  )
  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error('TappedOut did not return a decklist — the deck may be private')
  }
  return parseTextDecklist(text)
}

// ── Aetherhub ────────────────────────────────────────────────────────────────
// MTGO-format export: mainboard, blank line, then the sideboard block — which
// for Commander decks is the commander itself (1-2 cards).
async function fetchAetherhubDeck(id: string): Promise<ParsedDeck> {
  const res = await fetchSource(
    `https://aetherhub.com/Deck/MtgoDeckExport/${id}`,
    'Aetherhub',
  )
  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error('Aetherhub did not return a decklist — the deck may be private')
  }
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => parseTextDecklist(b).mainboard)
    .filter((b) => b.length > 0)
  const [main = [], ...rest] = blocks
  const commanders: ParsedEntry[] = []
  const mainboard = [...main]
  for (const b of rest) {
    // ≤2 singletons after a 60+ card main = the commander zone; anything
    // bigger is a real sideboard and gets dropped.
    if (b.length <= 2 && main.length >= 60) commanders.push(...b)
  }
  return { name: null, commanders, mainboard }
}

// ── Registry ─────────────────────────────────────────────────────────────────
export const SUPPORTED_DECK_SITES =
  'Moxfield, Archidekt, LigaMagic, TappedOut or Aetherhub'

interface Provider {
  name: string
  match: (url: string) => string | null
  fetch: (id: string) => Promise<ParsedDeck>
}

const blocked = (site: string) => (): Promise<ParsedDeck> => {
  throw new Error(
    `${site} blocks automated access — use "Export" on the site and paste the list as text`,
  )
}

const PROVIDERS: Provider[] = [
  {
    name: 'Moxfield',
    match: (u) => u.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/)?.[1] ?? null,
    fetch: fetchMoxfieldDeck,
  },
  {
    name: 'Archidekt',
    match: (u) => u.match(/archidekt\.com\/decks\/(\d+)/)?.[1] ?? null,
    fetch: fetchArchidektDeck,
  },
  {
    name: 'LigaMagic',
    match: (u) => (/ligamagic\.com/.test(u) ? (u.match(/[?&]id=(\d+)/)?.[1] ?? null) : null),
    fetch: fetchLigaMagicDeck,
  },
  {
    name: 'TappedOut',
    match: (u) => u.match(/tappedout\.net\/mtg-decks\/([A-Za-z0-9-]+)/)?.[1] ?? null,
    fetch: fetchTappedOutDeck,
  },
  {
    name: 'Aetherhub',
    match: (u) => u.match(/aetherhub\.com\/Deck\/[^?#\s]*?(\d+)(?:[/?#]|$)/i)?.[1] ?? null,
    fetch: fetchAetherhubDeck,
  },
  // Cloudflare-walled sites: recognize the link so the user gets a helpful
  // "paste it as text" message instead of a generic invalid-URL error.
  {
    name: 'Deckstats',
    match: (u) => (/deckstats\.net\//.test(u) ? 'blocked' : null),
    fetch: blocked('Deckstats'),
  },
  {
    name: 'MTGGoldfish',
    match: (u) => (/mtggoldfish\.com\//.test(u) ? 'blocked' : null),
    fetch: blocked('MTGGoldfish'),
  },
]

// Resolve a pasted URL to a one-shot fetcher, or null if no site matches.
export function findDeckSource(
  url: string,
): { site: string; fetch: () => Promise<ParsedDeck> } | null {
  const trimmed = url.trim()
  for (const p of PROVIDERS) {
    const id = p.match(trimmed)
    if (id) return { site: p.name, fetch: () => p.fetch(id) }
  }
  return null
}
