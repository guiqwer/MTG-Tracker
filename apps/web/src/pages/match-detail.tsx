import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRight,
  Ban,
  BookOpen,
  ChevronLeft,
  Clock,
  Crown,
  Flame,
  Hash,
  Infinity as InfinityIcon,
  Plus,
  Search,
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
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'
import { ColorIdentity } from '@/components/mana'

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
      return data
    },
  })

  const [type, setType] = useState('REMOVAL')
  const [actorId, setActorId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [turn, setTurn] = useState('')
  const [note, setNote] = useState('')
  const [cardQuery, setCardQuery] = useState('')
  const [card, setCard] = useState<CardPick | null>(null)

  const cardSearch = useQuery({
    queryKey: ['cards', 'any', cardQuery],
    enabled: cardQuery.trim().length >= 3 && !card,
    queryFn: async () => {
      const { data, error } = await api.cards.search.get({ query: { q: cardQuery } })
      if (error) throw error
      return data
    },
  })

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
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Event added to timeline')
      setNote('')
      setCard(null)
      setCardQuery('')
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
      navigate('/matches')
    },
  })

  const m = match.data
  const participants = m?.participants ?? []
  const events = m?.events ?? []

  return (
    <div className="space-y-6">
      <Link
        to="/matches"
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
            subtitle="Timeline and podium of the match."
            icon={Swords}
          >
            {m.winCondition && (
              <Badge variant="gold">{WINCON_LABEL[m.winCondition] ?? m.winCondition}</Badge>
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
                  <ol className="space-y-2">
                    {events.map((ev) => {
                      const meta = EVENT_META[ev.type] ?? {
                        label: ev.type,
                        icon: Zap,
                        tint: 'text-muted-foreground',
                      }
                      const Icon = meta.icon
                      return (
                        <li
                          key={ev.id}
                          className="group flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-2.5"
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
                              <span className="text-sm font-semibold">{meta.label}</span>
                              {ev.turn != null && <Badge variant="outline">Turn {ev.turn}</Badge>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                              {ev.actor && (
                                <span className="font-medium text-foreground/80">
                                  {ev.actor.player.name}
                                </span>
                              )}
                              {ev.target && (
                                <>
                                  <ArrowRight className="h-3 w-3" />
                                  <span className="font-medium text-foreground/80">
                                    {ev.target.player.name}
                                  </span>
                                </>
                              )}
                              {ev.card && <span>· {ev.card.name}</span>}
                            </div>
                            {ev.note && (
                              <p className="mt-1 text-xs text-muted-foreground">{ev.note}</p>
                            )}
                          </div>
                          {ev.card?.artCropUrl && (
                            <img
                              src={ev.card.artCropUrl}
                              alt=""
                              className="h-9 w-14 rounded object-cover"
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => delEvent.mutate(ev.id)}
                            title="Remove event"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            {/* Add event */}
            <Card className="h-fit lg:sticky lg:top-8">
              <CardContent className="space-y-3 p-4">
                <h2 className="text-base font-semibold">Add event</h2>

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
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      {card.artCropUrl && (
                        <img src={card.artCropUrl} alt="" className="h-8 w-12 rounded object-cover" />
                      )}
                      <span className="flex-1 truncate text-sm">{card.name}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCard(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={cardQuery}
                        onChange={(e) => setCardQuery(e.target.value)}
                        placeholder="Search card…"
                        className="pl-8"
                      />
                      {cardSearch.data && cardSearch.data.length > 0 && (
                        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-xl">
                          {cardSearch.data.map((c) => (
                            <button
                              key={c.scryfallId}
                              type="button"
                              onClick={() =>
                                setCard({
                                  scryfallId: c.scryfallId,
                                  name: c.name,
                                  artCropUrl: c.artCropUrl,
                                })
                              }
                              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                            >
                              {c.artCropUrl && (
                                <img src={c.artCropUrl} alt="" className="h-7 w-11 rounded object-cover" />
                              )}
                              <span className="flex-1 truncate text-sm">{c.name}</span>
                              <ColorIdentity colors={c.colorIdentity} />
                            </button>
                          ))}
                        </div>
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
