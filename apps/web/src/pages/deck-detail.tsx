import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  Layers,
  RefreshCw,
  Trash2,
  User,
} from 'lucide-react'
import { api } from '@/lib/eden'
import { useMe } from '@/lib/me'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { ColorIdentity, ManaCost } from '@/components/mana'

interface CardRow {
  id: string
  quantity: number
  cardId: string
  card: {
    id: string
    name: string
    typeLine: string | null
    manaCost: string | null
    cmc: number
    imageUrl: string | null
    priceUsd: number | null
  }
}

// Plain-text list in the format Moxfield/Arena accept — for copy and export.
function buildDecklist(d: {
  commander: { name: string } | null
  commanderId: string | null
  partnerId: string | null
  cards: CardRow[]
}): string {
  const commanders = d.cards.filter(
    (r) => r.cardId === d.commanderId || r.cardId === d.partnerId,
  )
  const main = d.cards.filter(
    (r) => r.cardId !== d.commanderId && r.cardId !== d.partnerId,
  )
  const lines: string[] = []
  if (commanders.length) {
    lines.push('Commander')
    for (const r of commanders) lines.push(`1 ${r.card.name}`)
    lines.push('')
  }
  lines.push('Deck')
  for (const r of main) lines.push(`${r.quantity} ${r.card.name}`)
  return lines.join('\n')
}

interface DeckDetail {
  id: string
  name: string
  colorIdentity: string[]
  archetype: string | null
  powerLevel: number | null
  bracket: number | null
  moxfieldUrl: string | null
  commanderId: string | null
  partnerId: string | null
  commander: { name: string; artCropUrl: string | null } | null
  owner: { name: string; avatarColor: string | null } | null
  user: { id: string; username: string } | null
  _count: { participations: number; cards: number }
  cards: CardRow[]
}

// Moxfield-style type buckets, in their display order.
const TYPE_ORDER = [
  'Commander',
  'Planeswalkers',
  'Creatures',
  'Sorceries',
  'Instants',
  'Artifacts',
  'Enchantments',
  'Battles',
  'Lands',
  'Other',
]

function bucketOf(typeLine: string | null): string {
  const front = (typeLine ?? '').split(' // ')[0]
  if (front.includes('Land')) return 'Lands'
  if (front.includes('Creature')) return 'Creatures'
  if (front.includes('Planeswalker')) return 'Planeswalkers'
  if (front.includes('Sorcery')) return 'Sorceries'
  if (front.includes('Instant')) return 'Instants'
  if (front.includes('Artifact')) return 'Artifacts'
  if (front.includes('Enchantment')) return 'Enchantments'
  if (front.includes('Battle')) return 'Battles'
  return 'Other'
}

// Hover preview dimensions (standard card ratio 488x680 at 240px wide).
const PREVIEW_W = 240
const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488)

function CardLine({ row }: { row: CardRow }) {
  const ref = useRef<HTMLLIElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Scrolling doesn't fire mouseleave, so a preview could linger with stale
  // coordinates — dismiss it on any scroll while visible.
  useEffect(() => {
    if (!pos) return
    const hide = () => setPos(null)
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', hide, { capture: true })
  }, [pos])

  // Moxfield-style preview: fixed-position beside the row, clamped to the
  // viewport — never clipped at the page bottom and never shifts the layout.
  const show = () => {
    if (!row.card.imageUrl || !ref.current) return
    if (!window.matchMedia('(hover: hover)').matches) return // skip touch
    const r = ref.current.getBoundingClientRect()
    let left = r.right + 10
    if (left + PREVIEW_W > window.innerWidth - 8) left = r.left - PREVIEW_W - 10
    if (left < 8) left = 8
    const top = Math.max(
      8,
      Math.min(r.top + r.height / 2 - PREVIEW_H / 2, window.innerHeight - PREVIEW_H - 8),
    )
    setPos({ top, left })
  }

  return (
    <li ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent">
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {row.quantity}
        </span>
        <span className="min-w-0 flex-1 truncate">{row.card.name}</span>
        <ManaCost cost={row.card.manaCost} className="shrink-0 text-[0.6rem]" />
      </div>
      {pos &&
        row.card.imageUrl &&
        // Portal to <body>: position:fixed must not be re-anchored by any
        // transformed ancestor (e.g. the page-enter animation wrapper).
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ top: pos.top, left: pos.left, width: PREVIEW_W, height: PREVIEW_H }}
          >
            <img
              src={row.card.imageUrl}
              alt={row.card.name}
              width={PREVIEW_W}
              height={PREVIEW_H}
              className="h-full w-full rounded-xl shadow-2xl"
              loading="lazy"
            />
          </div>,
          document.body,
        )}
    </li>
  )
}

export function DeckDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useMe()

  const deck = useQuery({
    queryKey: ['deck', id],
    queryFn: async (): Promise<DeckDetail | null> => {
      const { data, error } = await api.decks({ id }).get()
      if (error) throw error
      return data && 'error' in data ? null : (data as unknown as DeckDetail)
    },
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.decks({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Deck removed')
      qc.invalidateQueries({ queryKey: ['decks'] })
      qc.invalidateQueries({ queryKey: ['my-decks'] })
      navigate('/app/decks')
    },
    onError: () => toast.error('Could not remove the deck'),
  })

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.decks({ id }).sync.post()
      if (error) throw error
      return data && 'error' in data ? null : data
    },
    onSuccess: (r) => {
      toast.success(
        r?.notFound?.length
          ? `Synced — ${r.notFound.length} card(s) not found`
          : 'Deck synced with Moxfield',
      )
      qc.invalidateQueries({ queryKey: ['deck', id] })
      qc.invalidateQueries({ queryKey: ['my-decks'] })
    },
    onError: (err) => {
      const msg =
        (err as { value?: { error_description?: string } })?.value?.error_description ??
        'Could not sync the deck'
      toast.error(msg)
    },
  })

  const d = deck.data

  const copyList = async () => {
    if (!d) return
    try {
      await navigator.clipboard.writeText(buildDecklist(d))
      toast.success('Decklist copied')
    } catch {
      toast.error('Could not copy — try the download instead')
    }
  }

  const downloadList = () => {
    if (!d) return
    const blob = new Blob([buildDecklist(d)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${d.name.replace(/[^\w-]+/g, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Commander(s) get their own bucket at the top, like Moxfield.
  const buckets = new Map<string, CardRow[]>()
  let total = 0
  for (const row of d?.cards ?? []) {
    const isCommander = row.cardId === d?.commanderId || row.cardId === d?.partnerId
    const key = isCommander ? 'Commander' : bucketOf(row.card.typeLine)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(row)
    total += row.quantity
  }
  for (const rows of buckets.values()) {
    rows.sort((a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name))
  }

  // Price = sum of known card prices (marked approximate if some are missing).
  let priceTotal = 0
  let pricedRows = 0
  for (const row of d?.cards ?? []) {
    if (row.card.priceUsd != null) {
      priceTotal += row.card.priceUsd * row.quantity
      pricedRows++
    }
  }
  const priceLabel =
    pricedRows === 0
      ? null
      : `${pricedRows < (d?.cards.length ?? 0) ? '~' : ''}$${priceTotal.toFixed(2)}`

  // Mana curve (lands excluded, 7+ bucketed together, weighted by quantity).
  const curve = Array.from({ length: 8 }, () => 0)
  for (const row of d?.cards ?? []) {
    if ((row.card.typeLine ?? '').split(' // ')[0].includes('Land')) continue
    curve[Math.min(Math.max(Math.round(row.card.cmc), 0), 7)] += row.quantity
  }
  const maxCurve = Math.max(...curve, 1)
  const hasCurve = curve.some((n) => n > 0)

  const isOwner = !!d?.user && d.user.id === me.data?.id

  const art = d?.commander?.artCropUrl

  return (
    <div className="space-y-6">
      <Link
        to="/app/decks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Decks
      </Link>

      {deck.isLoading ? (
        <>
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </>
      ) : !d ? (
        <p className="text-sm text-muted-foreground">Deck not found.</p>
      ) : (
        <>
          {/* Header banner */}
          <div className="relative overflow-hidden rounded-xl border bg-card">
            <div className="relative h-40 sm:h-48">
              {art ? (
                <img src={art} alt="" className="h-full w-full object-cover object-center" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-card">
                  <ColorIdentity colors={d.colorIdentity} className="text-4xl opacity-40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
            </div>
            <div className="relative -mt-14 px-5 pb-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 text-lg drop-shadow">
                    <ColorIdentity colors={d.colorIdentity} />
                  </div>
                  <h1 className="truncate text-2xl font-bold tracking-tight">{d.name}</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {d.commander?.name ?? 'No commander'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {d.cards.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={copyList} title="Copy decklist">
                        <Copy /> Copy list
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadList}
                        title="Download .txt"
                      >
                        <Download />
                      </Button>
                    </>
                  )}
                  {d.moxfieldUrl && isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sync.mutate()}
                      disabled={sync.isPending}
                      title="Re-import from Moxfield"
                    >
                      <RefreshCw className={cn(sync.isPending && 'animate-spin')} />
                      {sync.isPending ? 'Syncing…' : 'Sync'}
                    </Button>
                  )}
                  {d.moxfieldUrl && (
                    <a href={d.moxfieldUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">
                        <ExternalLink /> Moxfield
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`Delete "${d.name}"?`)) remove.mutate()
                    }}
                    disabled={remove.isPending}
                  >
                    <Trash2 /> Delete
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  <Layers className="h-3 w-3" /> {total} cards
                </Badge>
                {priceLabel && (
                  <Badge variant="gold" title="Scryfall market prices (USD)">
                    {priceLabel}
                  </Badge>
                )}
                {d.archetype && <Badge variant="outline">{d.archetype}</Badge>}
                {d.powerLevel != null && <Badge variant="outline">PL {d.powerLevel}</Badge>}
                {d.bracket != null && <Badge variant="warning">Bracket {d.bracket}</Badge>}
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {d.owner?.name ?? d.user?.username ?? '—'}
                </span>
                <span className="tabular-nums">
                  · {d._count.participations}{' '}
                  {d._count.participations === 1 ? 'game' : 'games'} played
                </span>
              </div>
            </div>
          </div>

          {/* Deck shape: mana curve + type distribution */}
          {d.cards.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-3 text-sm font-semibold">Mana curve</h2>
                  {hasCurve ? (
                    <div className="flex h-24 items-end gap-1.5">
                      {curve.map((n, cmc) => (
                        <div key={cmc} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {n > 0 ? n : ''}
                          </span>
                          <div
                            className={cn(
                              'w-full rounded-t-md',
                              n > 0 ? 'bg-primary/70' : 'bg-muted',
                            )}
                            style={{ height: `${Math.max((n / maxCurve) * 64, 3)}px` }}
                          />
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {cmc === 7 ? '7+' : cmc}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">No data</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-3 text-sm font-semibold">Card types</h2>
                  {TYPE_ORDER.filter((k) => k !== 'Commander' && buckets.has(k)).map((key) => {
                    const n = buckets.get(key)!.reduce((s, r) => s + r.quantity, 0)
                    const maxType = Math.max(
                      ...TYPE_ORDER.filter((k) => k !== 'Commander' && buckets.has(k)).map(
                        (k) => buckets.get(k)!.reduce((s, r) => s + r.quantity, 0),
                      ),
                      1,
                    )
                    return (
                      <div key={key} className="flex items-center gap-2 py-0.5 text-sm">
                        <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                          {key}
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max((n / maxType) * 100, 4)}%` }}
                          />
                        </span>
                        <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                          {n}
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Card list grouped by type */}
          {d.cards.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                This deck has no imported card list. Decks imported from a Moxfield link or a
                pasted decklist show their full 100 cards here.
              </CardContent>
            </Card>
          ) : (
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
              {TYPE_ORDER.filter((k) => buckets.has(k)).map((key) => {
                const rows = buckets.get(key)!
                const count = rows.reduce((n, r) => n + r.quantity, 0)
                return (
                  <section key={key} className="mb-4 break-inside-avoid">
                    <Card>
                      <CardContent className="p-3">
                        <h2 className="mb-1.5 flex items-baseline justify-between px-2 text-sm font-semibold">
                          {key}
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            {count}
                          </span>
                        </h2>
                        <ul>
                          {rows.map((row) => (
                            <CardLine key={row.id} row={row} />
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
