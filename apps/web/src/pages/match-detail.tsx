import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRight,
  Ban,
  BookOpen,
  ChevronLeft,
  Clock,
  CornerDownRight,
  Crown,
  Flame,
  Hash,
  Infinity as InfinityIcon,
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

interface CardPick {
  scryfallId: string
  name: string
  artCropUrl: string | null
  imageUrl: string | null
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
    onSuccess: () => {
      toast.success('Event removed')
      invalidate()
    },
    onError: () => toast.error('Could not remove event'),
  })

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

  // The stack: events chained via respondsToId render as nested responses.
  const [respondTo, setRespondTo] = useState<{ id: string; label: string } | null>(null)
  const eventTree = useMemo(() => {
    const ids = new Set(events.map((e) => e.id))
    const byParent = new Map<string, typeof events>()
    const roots: typeof events = []
    for (const ev of events) {
      if (ev.respondsToId && ids.has(ev.respondsToId)) {
        const list = byParent.get(ev.respondsToId) ?? []
        list.push(ev)
        byParent.set(ev.respondsToId, list)
      } else {
        roots.push(ev)
      }
    }
    return { roots, byParent }
  }, [events])
  // An event fizzles when an (itself uncountered) COUNTER responds to it —
  // responses always come later in sequence, so one reverse pass suffices.
  const fizzled = useMemo(() => {
    const out = new Set<string>()
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      const kids = eventTree.byParent.get(ev.id) ?? []
      if (kids.some((k) => k.type === 'COUNTER' && !out.has(k.id))) out.add(ev.id)
    }
    return out
  }, [events, eventTree])

  const startResponse = (ev: (typeof events)[number]) => {
    const what = ev.card?.name ?? EVENT_META[ev.type]?.label ?? ev.type
    const who = ev.actor ? ` by ${ev.actor.player.name}` : ''
    setRespondTo({ id: ev.id, label: `${what}${who}` })
    setType('COUNTER')
    if (ev.actorId) setTargetId(ev.actorId)
    setCard(null)
  }

  const renderEvent = (ev: (typeof events)[number]): ReactNode => {
    const meta = EVENT_META[ev.type] ?? {
      label: ev.type,
      icon: Zap,
      tint: 'text-muted-foreground',
    }
    const Icon = meta.icon
    const kids = eventTree.byParent.get(ev.id) ?? []
    const countered = fizzled.has(ev.id)
    return (
      <li key={ev.id}>
        <div
          className={cn(
            'group flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-2.5',
            countered && 'opacity-75',
          )}
        >
          <div
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted',
              meta.tint,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-semibold', countered && 'line-through')}>
                {meta.label}
              </span>
              {countered && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  Countered
                </Badge>
              )}
              {ev.turn != null && <Badge variant="outline">Turn {ev.turn}</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              {ev.actor && (
                <span className="font-medium text-foreground/80">{ev.actor.player.name}</span>
              )}
              {ev.target && (
                <>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground/80">{ev.target.player.name}</span>
                </>
              )}
              {ev.card && (
                <CardHover
                  image={ev.card.imageUrl}
                  name={ev.card.name}
                  className={cn(countered && 'line-through')}
                >
                  · {ev.card.name}
                </CardHover>
              )}
            </div>
            {ev.note && <p className="mt-1 text-xs text-muted-foreground">{ev.note}</p>}
          </div>
          {ev.card?.artCropUrl && (
            <CardHover as="div" image={ev.card.imageUrl} name={ev.card.name} className="shrink-0">
              <img src={ev.card.artCropUrl} alt="" className="block h-9 w-14 rounded object-cover" />
            </CardHover>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            onClick={() => startResponse(ev)}
            title="Respond (add to the stack)"
          >
            <Reply className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            onClick={() => delEvent.mutate(ev.id)}
            title="Remove event"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        {kids.length > 0 && (
          <ol className="ml-4 mt-2 space-y-2 border-l-2 border-border/70 pl-3">
            {kids.map((k) => renderEvent(k))}
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
  const elapsed = m ? Math.max(0, Math.round((Date.now() - new Date(m.playedAt).getTime()) / 60_000)) : 0

  return (
    <div className="space-y-6">
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
                Live · {elapsed} min
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
                        {p.placement ? `${p.placement}${suffix}` : '—'} {p.player.name}
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
                    No events yet. Use the panel on the right to log the first one.
                  </p>
                ) : (
                  <ol className="space-y-2">{eventTree.roots.map((ev) => renderEvent(ev))}</ol>
                )}
              </CardContent>
            </Card>

            {/* Add event */}
            <Card className="h-fit lg:sticky lg:top-8">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-base font-semibold">Add event</h2>

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
                      onClick={() => setRespondTo(null)}
                      title="Cancel response"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label>Type</Label>
                  <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {EVENT_META[t].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Actor</Label>
                    <select
                      value={actorId}
                      onChange={(e) => setActorId(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.player.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Target</Label>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.player.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label>Turn (optional)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={turn}
                    onChange={(e) => setTurn(e.target.value)}
                    placeholder="e.g. 6"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label>Card (optional)</Label>
                  {card ? (
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCard(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </CardHover>
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
                        <select
                          className={cn(selectCls, 'w-full')}
                          value=""
                          onChange={(e) => {
                            const c = suggestions.find((s) => s.scryfallId === e.target.value)
                            if (c)
                              setCard({
                                scryfallId: c.scryfallId,
                                name: c.name,
                                artCropUrl: c.artCropUrl,
                                imageUrl: c.imageUrl,
                              })
                          }}
                        >
                          <option value="" disabled>
                            {narrowed
                              ? `${EVENT_META[type].label} in ${actor?.player.name}'s deck (${suggestions.length})…`
                              : `${actor?.player.name}'s deck (${suggestions.length} cards)…`}
                          </option>
                          {suggestions.map((c) => (
                            <option key={c.scryfallId} value={c.scryfallId}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No card list available for this deck.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label>Note (optional)</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. during their upkeep"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => addEvent.mutate()}
                  disabled={addEvent.isPending}
                >
                  <Plus /> Add to timeline
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
