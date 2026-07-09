// Parsers that turn "a deck somewhere else" into a normalized list we can
// import: Moxfield public decks (by URL) and plain-text decklists.

export interface ParsedEntry {
  quantity: number
  name?: string // text imports resolve by name
  scryfallId?: string // moxfield gives us scryfall ids directly
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
    const name = cleanName(m ? m[2] : line)
    if (!name) continue

    if (section === 'commander') commanders.push({ quantity, name })
    else mainboard.push({ quantity, name })
  }
  return { name: null, commanders, mainboard }
}

// ── Moxfield ─────────────────────────────────────────────────────────────────
export function parseMoxfieldUrl(url: string): string | null {
  const m = url.trim().match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function boardEntries(board: any): ParsedEntry[] {
  const cards = board?.cards ?? {}
  return Object.values(cards).map((e: any) => ({
    quantity: e.quantity ?? 1,
    scryfallId: e.card?.scryfall_id ?? undefined,
    name: e.card?.name ?? undefined,
  }))
}

// Public deck via Moxfield's API. If Moxfield blocks the request (they
// occasionally gate non-browser traffic), we throw a clear error so the UI can
// suggest pasting the list as text instead.
export async function fetchMoxfieldDeck(publicId: string): Promise<ParsedDeck> {
  const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${publicId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Moxfield returned ${res.status} — the deck may be private or blocked`)
  }
  const data = (await res.json()) as any
  const boards = data.boards ?? {}
  return {
    name: data.name ?? null,
    commanders: boardEntries(boards.commanders),
    mainboard: [...boardEntries(boards.mainboard), ...boardEntries(boards.companions)],
  }
}
