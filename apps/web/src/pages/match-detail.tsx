import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  BookOpen,
  ChevronLeft,
  CornerDownRight,
  Crown,
  Flame,
  Infinity as InfinityIcon,
  Minus,
  Plus,
  Reply,
  Search,
  Flag,
  Pencil,
  Skull,
  Sparkles,
  Sprout,
  Swords,
  Trash2,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/eden'
import { getToken } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { CardHover } from '@/components/card-hover'

const EVENT_META: Record<string, { label: string; icon: LucideIcon; tint: string }> = {
  REMOVAL: { label: 'Removal', icon: Zap, tint: 'text-red-400' },
  COUNTER: { label: 'Counter', icon: Ban, tint: 'text-blue-400' },
  TUTOR: { label: 'Tutor', icon: Search, tint: 'text-purple-400' },
  BOARDWIPE: { label: 'Board Wipe', icon: Flame, tint: 'text-orange-400' },
  RAMP: { label: 'Ramp', icon: Sprout, tint: 'text-emerald-400' },
  DRAW: { label: 'Card Draw', icon: BookOpen, tint: 'text-cyan-400' },
  COMMANDER_CAST: { label: 'Commander Cast', icon: Crown, tint: 'text-amber-400' },
  COMMANDER_DIED: { label: 'Commander Died', icon: Skull, tint: 'text-zinc-400' },
  COMBO: { label: 'Combo', icon: Sparkles, tint: 'text-pink-400' },
  INFINITE: { label: 'Infinite Combo', icon: InfinityIcon, tint: 'text-violet-400' },
  ELIMINATION: { label: 'Elimination', icon: Swords, tint: 'text-red-500' },
  WIN: { label: 'Win', icon: Trophy, tint: 'text-gold' },
}
const EVENT_TYPES = Object.keys(EVENT_META)

const WINCON_LABEL: Record<string, string> = {
  COMMANDER_DAMAGE: 'Commander Damage',
  COMBAT_DAMAGE: 'Combat Damage',
  COMBO: 'Combo',
  INFINITE: 'Infinite Combo',
  MILL: 'Mill',
  POISON_INFECT: 'Poison / Infect',
  ALT_WIN_CON: 'Alt Win-Con',
  LAST_STANDING: 'Last Standing',
  CONCESSION: 'Concession',
  OTHER: 'Other',
}

const selectCls =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

const chipCls = (active: boolean) =>
  cn(
    'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
    active
      ? 'border-primary bg-primary/15 font-medium text-foreground'
      : 'border-border/70 bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
  )

interface CardPick {
  scryfallId: string
  name: string
  artCropUrl: string | null
  imageUrl: string | null
}

function PickedCard({ card, onClear }: { card: CardPick; onClear: () => void }) {
  return (
    <CardHover
      as="div"
      image={card.imageUrl}
      name={card.name}
      className="flex items-center gap-2 rounded-md border p-2"
    >
      {card.artCropUrl && (
        <img src={card.artCropUrl} alt="" className="h-8 w-12 rounded object-cover" />
      )}
      <span className="flex-1 truncate text-sm">{card.name}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </CardHover>
  )
}

// Searchable picker over a deck's card list — a native select with 100 options
// is unusable on touch, so this filters as you type. Short lists (a narrowed
// tag match) render immediately; long ones wait for a query.
function CardCombobox({
  cards,
  placeholder,
  onPick,
}: {
  cards: TaggedCard[]
  placeholder: string
  onPick: (c: TaggedCard) => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    const list = query ? cards.filter((c) => c.name.toLowerCase().includes(query)) : cards
    return list.slice(0, 30)
  }, [query, cards])
  const showList = query !== '' || cards.length <= 30
  return (
    <div className="overflow-hidden rounded-md border">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="rounded-none border-0 focus-visible:ring-0"
      />
      {showList && (
        <ul className="max-h-44 overflow-y-auto border-t">
          {filtered.map((c) => (
            <li key={c.scryfallId}>
              <button
                type="button"
                className="w-full truncate px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                onClick={() => {
                  onPick(c)
                  setQ('')
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2.5 py-2 text-xs text-muted-foreground">No cards match.</li>
          )}
        </ul>
      )}
    </div>
  )
}

// Event types that map to a Scryfall Tagger oracle tag — for these the card
// field offers a select of matching cards from the actor's deck.
const EVENT_TAG: Record<string, string> = {
  REMOVAL: 'removal',
  COUNTER: 'counterspell',
  TUTOR: 'tutor',
  BOARDWIPE: 'boardwipe',
  RAMP: 'ramp',
  DRAW: 'draw',
}

interface TaggedCard {
  scryfallId: string
  name: string
  manaCost: string | null
  typeLine: string | null
  artCropUrl: string | null
  imageUrl: string | null
  oracleTags: string[]
}

// Tags are computed once server-side and cached forever client-side, so this
// costs one request per deck per session at most.
async function fetchDeckTags(deckId: string): Promise<TaggedCard[]> {
  const { data, error } = await api.decks({ id: deckId })['card-tags'].get()
  if (error) throw error
  return (data && 'error' in data ? [] : data) as unknown as TaggedCard[]
}

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const matchId = id!
  const qc = useQueryClient()
  const navigate = useNavigate()

  const match = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const { data, error } = await api.matches({ id: matchId }).get()
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })

  // Live view: while the match runs, an SSE stream pings on every change made
  // by anyone at the table and we refetch — no F5 needed. EventSource
  // reconnects on its own, and the server's greeting message doubles as a
  // catch-up refetch after any disconnect.
  const matchStatus = match.data?.status
  useEffect(() => {
    if (matchStatus !== 'IN_PROGRESS') return
    const token = getToken()
    if (!token) return
    const es = new EventSource(
      `/api/matches/${matchId}/live?token=${encodeURIComponent(token)}`,
    )
    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ['match', matchId] })
      qc.invalidateQueries({ queryKey: ['matches'] })
    }
    return () => es.close()
  }, [matchStatus, matchId, qc])

  const [type, setType] = useState('REMOVAL')
  const [actorId, setActorId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [turn, setTurn] = useState('')
  const [note, setNote] = useState('')
  const [card, setCard] = useState<CardPick | null>(null)
  const [targetCard, setTargetCard] = useState<CardPick | null>(null)
  // Mobile: the add-event panel lives in a bottom sheet opened by a FAB.
  const [sheetOpen, setSheetOpen] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['match', matchId] })
    qc.invalidateQueries({ queryKey: ['matches'] })
    qc.invalidateQueries({ queryKey: ['overview'] })
  }

  const addEvent = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.matches({ id: matchId }).events.post({
        type,
        actorId: actorId || undefined,
        targetId: targetId || undefined,
        turn: turn ? Number(turn) : undefined,
        cardScryfallId: card?.scryfallId,
        targetCardScryfallId: targetCard?.scryfallId,
        note: note || undefined,
        respondsToId: respondTo?.id,
      })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
    onSuccess: () => {
      toast.success('Event added to timeline')
      setNote('')
      setCard(null)
      setTargetCard(null)
      setRespondTo(null)
      invalidate()
    },
    onError: () => toast.error('Could not add the event'),
  })

  const delEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await api.matches({ id: matchId }).events({ eventId }).delete()
      if (error) throw error
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('Could not remove event'),
  })

  // Deleting is undoable: the event hides instantly, the server delete only
  // fires after the undo window closes (or on unmount, so nothing is lost).
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const deleteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const scheduleDelete = (eventId: string) => {
    setHiddenIds((prev) => new Set(prev).add(eventId))
    const timer = setTimeout(() => {
      deleteTimers.current.delete(eventId)
      delEvent.mutate(eventId)
    }, 5000)
    deleteTimers.current.set(eventId, timer)
    toast('Event removed', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(timer)
          deleteTimers.current.delete(eventId)
          setHiddenIds((prev) => {
            const next = new Set(prev)
            next.delete(eventId)
            return next
          })
        },
      },
    })
  }
  useEffect(() => {
    const timers = deleteTimers.current
    return () => {
      // Flush pending deletes when leaving the page — the user already saw
      // the "removed" toast, so the delete must stick.
      for (const [eventId, timer] of timers) {
        clearTimeout(timer)
        api.matches({ id: matchId }).events({ eventId }).delete()
      }
      timers.clear()
    }
  }, [matchId])

  const delMatch = useMutation({
    mutationFn: async () => {
      const { error } = await api.matches({ id: matchId }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Match removed')
      invalidate()
      navigate('/app/matches')
    },
  })

  // Post-hoc editing: metadata + podium placements. In finish mode the same
  // panel closes an in-progress match (sets status FINISHED).
  const [editOpen, setEditOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [eDuration, setEDuration] = useState('')
  const [eTurns, setETurns] = useState('')
  const [eWincon, setEWincon] = useState('')
  const [eEndReason, setEEndReason] = useState('')
  const [ePlacements, setEPlacements] = useState<Record<string, string>>({})

  const m = match.data
  const participants = m?.participants ?? []
  const events = m?.events ?? []
  // Events pending an undoable delete stay out of every derived view.
  const visibleEvents = useMemo(
    () => events.filter((e) => !hiddenIds.has(e.id)),
    [events, hiddenIds],
  )

  // Prefill the turn with the latest logged one — logging several plays in
  // the same turn is the common case, and an empty field means ungrouped
  // events in the timeline.
  useEffect(() => {
    if (turn !== '') return
    const last = [...events].reverse().find((e) => e.turn != null)
    if (last?.turn != null) setTurn(String(last.turn))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  // Briefly highlight events that just arrived (own submits and SSE pushes
  // from the rest of the table alike) so live updates are noticeable.
  const knownIds = useRef<Set<string>>(new Set())
  const [flashId, setFlashId] = useState<string | null>(null)
  useEffect(() => {
    const fresh = events.filter((e) => !knownIds.current.has(e.id))
    if (knownIds.current.size > 0 && fresh.length > 0) {
      setFlashId(fresh[fresh.length - 1].id)
      const timer = setTimeout(() => setFlashId(null), 1600)
      knownIds.current = new Set(events.map((e) => e.id))
      return () => clearTimeout(timer)
    }
    knownIds.current = new Set(events.map((e) => e.id))
  }, [events])

  // Deck-aware card suggestions: when the event type has an oracle tag and an
  // actor is picked, offer that player's matching cards instead of raw search.
  const actor = participants.find((p) => p.id === actorId)
  const actorDeckId = actor?.deck?.id
  const eventTag = EVENT_TAG[type]
  const deckTags = useQuery({
    queryKey: ['deck-card-tags', actorDeckId],
    enabled: !!actorDeckId,
    staleTime: Infinity,
    queryFn: () => fetchDeckTags(actorDeckId!),
  })
  // Tagged types narrow the select to matching cards; untagged types (or a
  // tag with zero hits in this deck) fall back to the full list.
  const suggestions = useMemo(() => {
    if (!deckTags.data) return []
    if (!eventTag) return deckTags.data
    const tagged = deckTags.data.filter((c) => c.oracleTags.includes(eventTag))
    return tagged.length ? tagged : deckTags.data
  }, [eventTag, deckTags.data])
  const narrowed =
    !!eventTag && suggestions.length > 0 && suggestions.length < (deckTags.data?.length ?? 0)
  const commanderPick =
    (type === 'COMMANDER_CAST' || type === 'COMMANDER_DIED') && actor?.deck?.commander
      ? actor.deck.commander
      : null

  // The targeted card comes from the *target* player's deck (their commander
  // is the most common target, so it gets a quick-pick button).
  const target = participants.find((p) => p.id === targetId)
  const targetDeckId = target?.deck?.id
  const targetTags = useQuery({
    queryKey: ['deck-card-tags', targetDeckId],
    enabled: !!targetDeckId,
    staleTime: Infinity,
    queryFn: () => fetchDeckTags(targetDeckId!),
  })
  const targetCommander = target?.deck?.commander ?? null

  // The stack: events chained via respondsToId render as nested responses.
  const [respondTo, setRespondTo] = useState<{ id: string; label: string } | null>(null)
  const eventTree = useMemo(() => {
    const ids = new Set(visibleEvents.map((e) => e.id))
    const byParent = new Map<string, typeof visibleEvents>()
    const roots: typeof visibleEvents = []
    for (const ev of visibleEvents) {
      if (ev.respondsToId && ids.has(ev.respondsToId)) {
        const list = byParent.get(ev.respondsToId) ?? []
        list.push(ev)
        byParent.set(ev.respondsToId, list)
      } else {
        roots.push(ev)
      }
    }
    return { roots, byParent }
  }, [visibleEvents])
  // An event fizzles when an (itself uncountered) COUNTER responds to it —
  // responses always come later in sequence, so one reverse pass suffices.
  const fizzled = useMemo(() => {
    const out = new Set<string>()
    for (let i = visibleEvents.length - 1; i >= 0; i--) {
      const ev = visibleEvents[i]
      const kids = eventTree.byParent.get(ev.id) ?? []
      if (kids.some((k) => k.type === 'COUNTER' && !out.has(k.id))) out.add(ev.id)
    }
    return out
  }, [visibleEvents, eventTree])

  const startResponse = (ev: (typeof events)[number]) => {
    const what = ev.card?.name ?? EVENT_META[ev.type]?.label ?? ev.type
    const who = ev.actor ? ` by ${ev.actor.player.name}` : ''
    setRespondTo({ id: ev.id, label: `${what}${who}` })
    setSheetOpen(true)
    setType('COUNTER')
    if (ev.actorId) setTargetId(ev.actorId)
    setCard(null)
    // A response targets the parent's spell — prefill it as the targeted card.
    setTargetCard(
      ev.card
        ? {
            scryfallId: ev.card.scryfallId,
            name: ev.card.name,
            artCropUrl: ev.card.artCropUrl,
            imageUrl: ev.card.imageUrl,
          }
        : null,
    )
  }

  // ── Narrative timeline ────────────────────────────────────────────────
  // Events read as sentences ("Alice removed Atraxa with Swords to
  // Plowshares") instead of disconnected type/actor/card fields.
  const who = (p: { player: { name: string } }) => (
    <span className="inline-flex items-center gap-1 align-baseline font-semibold text-foreground">
      <Avatar name={p.player.name} color={null} size={15} />
      {p.player.name}
    </span>
  )
  // The dotted underline doubles as the affordance for the hover/tap card
  // preview; a countered spell gets struck through instead.
  const namedCard = (c: { name: string; imageUrl: string | null }, struck = false) => (
    <CardHover
      image={c.imageUrl}
      name={c.name}
      className={cn(
        'font-semibold',
        struck
          ? 'text-muted-foreground line-through'
          : 'text-foreground underline decoration-primary/50 decoration-dotted underline-offset-2',
      )}
    >
      {c.name}
    </CardHover>
  )

  const eventSentence = (ev: (typeof events)[number]): ReactNode => {
    const countered = fizzled.has(ev.id)
    const A = ev.actor ? who(ev.actor) : 'Someone'
    const T = ev.target ? who(ev.target) : null
    const C = ev.card ? namedCard(ev.card, countered) : null
    const TC = ev.targetCard ? namedCard(ev.targetCard) : null
    const withCard = C ? <> with {C}</> : null
    switch (ev.type) {
      case 'REMOVAL':
        return <>{A} removed {TC ?? (T ? <>one of {T}'s permanents</> : 'a permanent')}{withCard}</>
      case 'COUNTER':
        return <>{A} countered {TC ?? (T ? <>{T}'s spell</> : 'a spell')}{withCard}</>
      case 'BOARDWIPE':
        return <>{A} wiped the board{withCard}{TC && <>, taking down {TC}</>}</>
      case 'TUTOR':
        return <>{A} tutored{TC && <> for {TC}</>}{withCard}{T && <> against {T}</>}</>
      case 'RAMP':
        return <>{A} ramped{withCard}</>
      case 'DRAW':
        return <>{A} drew cards{withCard}</>
      case 'COMMANDER_CAST':
        return <>{A} cast {C ?? 'their commander'}</>
      case 'COMMANDER_DIED':
        return <>{A} lost {C ?? 'their commander'}{T && <> to {T}</>}</>
      case 'COMBO':
        return <>{A} comboed off{withCard}{T && <> against {T}</>}</>
      case 'INFINITE':
        return <>{A} went infinite{withCard}{T && <> against {T}</>}</>
      case 'ELIMINATION':
        return <>{A} eliminated {T ?? 'a player'}{withCard}</>
      case 'WIN':
        return <>{A} won the game{withCard}</>
      default:
        return (
          <>
            {A} — {EVENT_META[ev.type]?.label ?? ev.type}
            {withCard}
            {T && <> vs {T}</>}
            {TC && <> on {TC}</>}
          </>
        )
    }
  }

  const renderEvent = (ev: (typeof events)[number], depth = 0): ReactNode => {
    const meta = EVENT_META[ev.type] ?? {
      label: ev.type,
      icon: Zap,
      tint: 'text-muted-foreground',
    }
    const Icon = meta.icon
    const kids = eventTree.byParent.get(ev.id) ?? []
    const countered = fizzled.has(ev.id)
    const time = new Date(ev.createdAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return (
      <li key={ev.id}>
        <div
          className={cn(
            'group flex items-start gap-3 rounded-lg p-2 transition-colors duration-700 hover:bg-muted/50',
            flashId === ev.id && 'bg-primary/10 duration-0',
          )}
        >
          <div
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted',
              meta.tint,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm leading-relaxed', countered && 'text-muted-foreground')}>
              {eventSentence(ev)}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>{time}</span>
              {countered && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  Countered
                </Badge>
              )}
              {depth > 0 && ev.turn != null && <span>Turn {ev.turn}</span>}
              {ev.note && <span className="italic">“{ev.note}”</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 transition-opacity sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => startResponse(ev)}
              title="Respond (add to the stack)"
              aria-label={`Respond to ${meta.label}`}
            >
              <Reply className="h-3.5 w-3.5 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 transition-opacity sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => scheduleDelete(ev.id)}
              title="Remove event"
              aria-label={`Remove ${meta.label} event`}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
        {kids.length > 0 && (
          <ol className="ml-5 mt-1 space-y-1 border-l-2 border-border/70 pl-4">
            {kids.map((k) => renderEvent(k, depth + 1))}
          </ol>
        )}
      </li>
    )
  }

  // While a table is live, warm every seat's deck tags so the select is
  // instant on first use (server dedupes + caches, so this is cheap).
  useEffect(() => {
    if (!m || m.status !== 'IN_PROGRESS') return
    for (const p of m.participants) {
      const deckId = p.deck?.id
      if (deckId) {
        qc.prefetchQuery({
          queryKey: ['deck-card-tags', deckId],
          queryFn: () => fetchDeckTags(deckId),
          staleTime: Infinity,
        })
      }
    }
  }, [m, qc])

  const openEdit = (finish = false) => {
    if (!m) return
    setFinishing(finish)
    const elapsed = Math.max(1, Math.round((Date.now() - new Date(m.playedAt).getTime()) / 60_000))
    setEDuration(m.durationMins ? String(m.durationMins) : finish ? String(elapsed) : '')
    setETurns(m.turns ? String(m.turns) : '')
    setEWincon(m.winCondition ?? '')
    setEEndReason(m.endReason ?? '')
    setEPlacements(
      Object.fromEntries(
        participants.map((p) => [p.id, p.placement ? String(p.placement) : '']),
      ),
    )
    setEditOpen(true)
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      const placements = Object.entries(ePlacements)
        .filter(([, v]) => v.trim())
        .map(([participantId, v]) => ({ participantId, placement: Number(v) }))
      const { data, error } = await api.matches({ id: matchId }).patch({
        status: finishing ? 'FINISHED' : undefined,
        durationMins: eDuration ? Number(eDuration) : undefined,
        turns: eTurns ? Number(eTurns) : undefined,
        winCondition: eWincon || undefined,
        endReason: eEndReason || undefined,
        placements: placements.length ? placements : undefined,
      })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
    onSuccess: () => {
      toast.success(finishing ? 'Match finished — podium locked in' : 'Match updated')
      setEditOpen(false)
      setFinishing(false)
      invalidate()
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: () => toast.error('Could not update the match'),
  })

  const isLive = m?.status === 'IN_PROGRESS'
  // The table clock ticks on its own; past ~12h the match was clearly left
  // open, so the badge stops pretending the game is that long.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isLive) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [isLive])
  const elapsedMins = m ? Math.max(0, Math.round((now - new Date(m.playedAt).getTime()) / 60_000)) : 0
  const elapsedLabel =
    elapsedMins < 60
      ? `${elapsedMins} min`
      : elapsedMins < 720
        ? `${Math.floor(elapsedMins / 60)}h${elapsedMins % 60 ? ` ${elapsedMins % 60}min` : ''}`
        : null

  // Shared between the desktop side panel and the mobile bottom sheet — a
  // plain JSX value (not a component) so inputs keep focus across re-renders.
  const addEventForm = (
    <div className="space-y-3">
      {respondTo && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            Responding to <span className="font-medium">{respondTo.label}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => {
              setRespondTo(null)
              setTargetCard(null)
            }}
            title="Cancel response"
            aria-label="Cancel response"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label>What happened</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {EVENT_TYPES.map((t) => {
            const meta = EVENT_META[t]
            const Icon = meta.icon
            return (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors',
                  type === t
                    ? 'border-primary bg-primary/10'
                    : 'border-border/60 bg-muted/30 hover:bg-accent',
                )}
              >
                <Icon className={cn('h-4 w-4', meta.tint)} />
                <span className="text-center text-[11px] leading-tight">{meta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>
          Who did it <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {participants.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={actorId === p.id}
              onClick={() => {
                setActorId(actorId === p.id ? '' : p.id)
                setCard(null)
              }}
              className={chipCls(actorId === p.id)}
            >
              <Avatar name={p.player.name} color={null} size={16} />
              <span className="max-w-24 truncate">{p.player.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Against (optional)</Label>
        <div className="flex flex-wrap gap-1.5">
          {participants.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={targetId === p.id}
              onClick={() => {
                setTargetId(targetId === p.id ? '' : p.id)
                setTargetCard(null)
              }}
              className={chipCls(targetId === p.id)}
            >
              <Avatar name={p.player.name} color={null} size={16} />
              <span className="max-w-24 truncate">{p.player.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Card played (optional)</Label>
        {card ? (
          <PickedCard card={card} onClear={() => setCard(null)} />
        ) : (
          <div className="space-y-2">
            {commanderPick && (
              <CardHover as="div" image={commanderPick.imageUrl} name={commanderPick.name}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() =>
                    setCard({
                      scryfallId: commanderPick.scryfallId,
                      name: commanderPick.name,
                      artCropUrl: commanderPick.artCropUrl,
                      imageUrl: commanderPick.imageUrl,
                    })
                  }
                >
                  <Crown className="h-3.5 w-3.5 text-amber-400" />
                  <span className="truncate">{commanderPick.name}</span>
                </Button>
              </CardHover>
            )}
            {!actorId ? (
              <p className="text-xs text-muted-foreground">
                Pick an actor to choose a card from their deck.
              </p>
            ) : deckTags.isLoading ? (
              <p className="text-xs text-muted-foreground">
                Scanning {actor?.player.name}'s deck…
              </p>
            ) : suggestions.length > 0 ? (
              <CardCombobox
                cards={suggestions}
                placeholder={
                  narrowed
                    ? `${EVENT_META[type].label} in ${actor?.player.name}'s deck (${suggestions.length})…`
                    : `Search ${actor?.player.name}'s deck (${suggestions.length} cards)…`
                }
                onPick={(c) =>
                  setCard({
                    scryfallId: c.scryfallId,
                    name: c.name,
                    artCropUrl: c.artCropUrl,
                    imageUrl: c.imageUrl,
                  })
                }
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                No card list available for this deck.
              </p>
            )}
          </div>
        )}
      </div>

      {targetId && (
        <div className="grid gap-1.5">
          <Label>Targeted card (optional)</Label>
          {targetCard ? (
            <PickedCard card={targetCard} onClear={() => setTargetCard(null)} />
          ) : (
            <div className="space-y-2">
              {targetCommander && (
                <CardHover as="div" image={targetCommander.imageUrl} name={targetCommander.name}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() =>
                      setTargetCard({
                        scryfallId: targetCommander.scryfallId,
                        name: targetCommander.name,
                        artCropUrl: targetCommander.artCropUrl,
                        imageUrl: targetCommander.imageUrl,
                      })
                    }
                  >
                    <Crown className="h-3.5 w-3.5 text-amber-400" />
                    <span className="truncate">{targetCommander.name}</span>
                  </Button>
                </CardHover>
              )}
              {targetTags.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Scanning {target?.player.name}'s deck…
                </p>
              ) : (targetTags.data?.length ?? 0) > 0 ? (
                <CardCombobox
                  cards={targetTags.data!}
                  placeholder={`Search ${target?.player.name}'s deck (${targetTags.data!.length} cards)…`}
                  onPick={(c) =>
                    setTargetCard({
                      scryfallId: c.scryfallId,
                      name: c.name,
                      artCropUrl: c.artCropUrl,
                      imageUrl: c.imageUrl,
                    })
                  }
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  No card list available for this deck.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-3">
        <div className="grid gap-1.5">
          <Label>Turn</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Previous turn"
              onClick={() => setTurn((v) => String(Math.max(1, (Number(v) || 2) - 1)))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              min={1}
              value={turn}
              onChange={(e) => setTurn(e.target.value)}
              placeholder="1"
              className="w-14 text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Next turn"
              onClick={() => setTurn((v) => String((Number(v) || 0) + 1))}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Note (optional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. during their upkeep"
          />
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => addEvent.mutate()}
        disabled={addEvent.isPending || !actorId}
      >
        <Plus /> {addEvent.isPending ? 'Adding…' : 'Add to timeline'}
      </Button>
      {!actorId && (
        <p className="text-center text-xs text-muted-foreground">
          Pick who did it to log the event.
        </p>
      )}
    </div>
  )

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <Link
        to="/app/matches"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Matches
      </Link>

      {match.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : !m ? (
        <p className="py-12 text-center text-muted-foreground">Match not found.</p>
      ) : (
        <>
          <PageHeader
            title={new Date(m.playedAt).toLocaleDateString('en-US', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
            subtitle={isLive ? "Table is open — log the plays as they happen." : "Timeline and podium of the match."}
            icon={Swords}
          >
            {isLive ? (
              <Badge variant="success" className="gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Live{elapsedLabel && ` · ${elapsedLabel}`}
              </Badge>
            ) : (
              m.winCondition && (
                <Badge variant="gold">{WINCON_LABEL[m.winCondition] ?? m.winCondition}</Badge>
              )
            )}
            {isLive ? (
              <Button size="sm" onClick={() => (editOpen ? setEditOpen(false) : openEdit(true))}>
                <Flag /> {editOpen ? 'Close' : 'Finish match'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (editOpen ? setEditOpen(false) : openEdit())}
              >
                <Pencil /> {editOpen ? 'Close' : 'Edit'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => delMatch.mutate()}>
              <Trash2 /> Delete
            </Button>
          </PageHeader>

          <p className="text-sm text-muted-foreground">
            {[
              m.durationMins ? `${m.durationMins} min` : null,
              m.turns ? `${m.turns} turns` : null,
              `${events.length} ${events.length === 1 ? 'event' : 'events'}`,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </p>

          {editOpen && (
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="grid gap-1.5">
                    <Label>Duration (min)</Label>
                    <Input
                      type="number"
                      value={eDuration}
                      onChange={(e) => setEDuration(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Turns</Label>
                    <Input type="number" value={eTurns} onChange={(e) => setETurns(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Win condition</Label>
                    <select
                      value={eWincon}
                      onChange={(e) => setEWincon(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {Object.keys(WINCON_LABEL).map((w) => (
                        <option key={w} value={w}>
                          {WINCON_LABEL[w]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>End reason</Label>
                    <select
                      value={eEndReason}
                      onChange={(e) => setEEndReason(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {['NATURAL', 'TIME_CALLED', 'CONCESSION', 'DRAW'].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {participants.map((p) => (
                    <div key={p.id} className="grid gap-1.5">
                      <Label className="truncate">{p.player.name} — place</Label>
                      <Input
                        type="number"
                        min={1}
                        value={ePlacements[p.id] ?? ''}
                        onChange={(e) =>
                          setEPlacements((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
                  {saveEdit.isPending
                    ? 'Saving…'
                    : finishing
                      ? 'Finish match'
                      : 'Save changes'}
                </Button>
                {finishing && (
                  <p className="text-xs text-muted-foreground">
                    Set each seat's finish position — 1 marks the winner. Duration was prefilled
                    from the table clock.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Podium */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[...participants]
              .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
              .map((p) => {
                const won = p.isWinner || p.placement === 1
                const suffix =
                  p.placement === 1 ? 'st' : p.placement === 2 ? 'nd' : p.placement === 3 ? 'rd' : 'th'
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-2.5',
                      won ? 'border-gold/50 bg-gold/10' : 'bg-muted/50',
                    )}
                  >
                    <Avatar name={p.player.name} color={null} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-sm font-semibold">
                        {won && <Trophy className="h-3.5 w-3.5 text-gold" />}
                        {p.placement ? `${p.placement}${suffix} ` : ''}
                        {p.player.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{p.deck.name}</div>
                    </div>
                  </div>
                )
              })}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Timeline */}
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <h2 className="mb-3 text-base font-semibold">Timeline</h2>
                {events.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
                    No events yet. Log the first play with Add event.
                  </p>
                ) : (
                  <ol className="space-y-1">
                    {eventTree.roots.map((ev, i) => {
                      const prev = eventTree.roots[i - 1]
                      const showTurn = ev.turn != null && ev.turn !== prev?.turn
                      return (
                        <Fragment key={ev.id}>
                          {showTurn && (
                            <li className="flex items-center gap-2 pt-3 first:pt-0">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Turn {ev.turn}
                              </span>
                              <span className="h-px flex-1 bg-border/70" />
                            </li>
                          )}
                          {renderEvent(ev)}
                        </Fragment>
                      )
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            {/* Add event — side panel on desktop, bottom sheet behind a FAB on mobile */}
            <Card className="hidden h-fit lg:sticky lg:top-8 lg:block">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-base font-semibold">Add event</h2>
                {addEventForm}
              </CardContent>
            </Card>
          </div>

          {createPortal(
            <div className="lg:hidden">
              {sheetOpen ? (
                <div className="fixed inset-0 z-50">
                  <div
                    className="absolute inset-0 bg-black/60"
                    onClick={() => setSheetOpen(false)}
                    aria-hidden
                  />
                  <div
                    role="dialog"
                    aria-label="Add event"
                    className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t bg-card p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold">Add event</h2>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => setSheetOpen(false)}
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {addEventForm}
                  </div>
                </div>
              ) : (
                <Button
                  className="fixed bottom-5 right-5 z-40 h-12 rounded-full px-5 shadow-lg"
                  onClick={() => setSheetOpen(true)}
                >
                  <Plus /> Add event
                </Button>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  )
}
