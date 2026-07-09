import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft, ExternalLink, Layers, Trash2, User } from 'lucide-react'
import { api } from '@/lib/eden'
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
  }
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

  const d = deck.data

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
                <div className="flex items-center gap-2">
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
