import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  Hash,
  Play,
  Plus,
  Swords,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { useActiveGroup } from '@/lib/group'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ColorIdentity } from '@/components/mana'

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
const WIN_CONDITIONS = Object.keys(WINCON_LABEL)
const END_REASONS = ['NATURAL', 'TIME_CALLED', 'CONCESSION', 'DRAW']

const selectCls =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

interface Row {
  playerId: string
  deckId: string
  placement: string
}
const emptyRows = (): Row[] => [
  { playerId: '', deckId: '', placement: '' },
  { playerId: '', deckId: '', placement: '' },
]

function PlacementBadge({ place, won }: { place: number | null; won: boolean }) {
  if (won) {
    return (
      <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-gold/20 dark:text-gold">
        <Trophy className="h-3 w-3" />
        1st
      </span>
    )
  }
  const colors: Record<number, string> = {
    2: 'bg-slate-100 text-slate-600 dark:bg-zinc-300/15 dark:text-zinc-300',
    3: 'bg-orange-100 text-orange-700 dark:bg-amber-600/20 dark:text-amber-500',
  }
  const suffix = place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
        place ? (colors[place] ?? 'bg-muted text-muted-foreground') : 'bg-muted text-muted-foreground',
      )}
    >
      {place ? `${place}${suffix}` : '—'}
    </span>
  )
}

// Minutes since the match opened — shown on live cards.
function elapsedMins(playedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(playedAt).getTime()) / 60_000))
}

export function MatchesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // RequireGroup guarantees an active group when this page renders.
  const { activeGroup } = useActiveGroup()
  const groupId = activeGroup!.id
  // Two entry points: start a live match (podium later) or log a finished one.
  const [mode, setMode] = useState<null | 'start' | 'log'>(null)
  const [rows, setRows] = useState<Row[]>(emptyRows)
  const [durationMins, setDuration] = useState('')
  const [turns, setTurns] = useState('')
  const [winCondition, setWinCondition] = useState('')
  const [endReason, setEndReason] = useState('NATURAL')

  const players = useQuery({
    queryKey: ['players', groupId],
    queryFn: async () => {
      const { data, error } = await api.players.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })
  const decks = useQuery({
    queryKey: ['decks', groupId],
    queryFn: async () => {
      const { data, error } = await api.decks.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })
  const matches = useQuery({
    queryKey: ['matches', groupId],
    queryFn: async () => {
      const { data, error } = await api.matches.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })
  // Personal imported decks — you can bring yours to any table.
  const myDecks = useQuery({
    queryKey: ['my-decks'],
    queryFn: async () => {
      const { data, error } = await api.decks.mine.get()
      if (error) throw error
      return data
    },
  })

  const resetForm = () => {
    setRows(emptyRows())
    setDuration('')
    setTurns('')
    setWinCondition('')
    setEndReason('NATURAL')
    setMode(null)
  }

  const create = useMutation({
    mutationFn: async (kind: 'start' | 'log') => {
      const participants = rows
        .filter((r) => r.playerId && r.deckId)
        .map((r, i) => ({
          playerId: r.playerId,
          deckId: r.deckId,
          seatOrder: i + 1,
          placement: kind === 'log' && r.placement ? Number(r.placement) : undefined,
        }))
      const { data, error } = await api.matches.post({
        groupId,
        inProgress: kind === 'start',
        durationMins: kind === 'log' && durationMins ? Number(durationMins) : undefined,
        turns: kind === 'log' && turns ? Number(turns) : undefined,
        winCondition: kind === 'log' ? winCondition || undefined : undefined,
        endReason: kind === 'log' ? endReason || undefined : undefined,
        participants,
      })
      if (error) throw error
      return { kind, match: data && 'error' in data ? null : data }
    },
    onSuccess: ({ kind, match }) => {
      resetForm()
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      if (kind === 'start' && match?.id) {
        toast.success('Match started — log the plays as they happen')
        navigate(`/app/matches/${match.id}`)
      } else {
        toast.success('Match logged')
      }
    },
    onError: () => toast.error('Could not save the match'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.matches({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Match removed')
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: () => toast.error('Could not remove match'),
  })

  // CSV of every logged match (one row per seat) — built entirely client-side.
  const exportCsv = () => {
    if (!matches.data?.length) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [
      'date', 'status', 'durationMins', 'turns', 'winCondition', 'endReason',
      'player', 'deck', 'commander', 'placement', 'winner',
    ]
    const lines = [header.join(',')]
    for (const m of matches.data) {
      for (const pt of m.participants) {
        lines.push(
          [
            new Date(m.playedAt).toISOString().slice(0, 10),
            m.status,
            m.durationMins ?? '',
            m.turns ?? '',
            m.winCondition ?? '',
            m.endReason ?? '',
            esc(pt.player.name),
            esc(pt.deck.name),
            esc(pt.deck.commander?.name ?? ''),
            pt.placement ?? '',
            pt.isWinner || pt.placement === 1 ? 'yes' : '',
          ].join(','),
        )
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matches-${activeGroup!.name.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  // A seat can play the player's table decks plus the personal decks of the
  // account behind that seat (members bring their imports to any table).
  // Guests (no account) can't import, so they borrow: any active deck.
  const decksByOwner = (ownerId: string) => {
    const player = players.data?.find((p) => p.id === ownerId)
    const active = decks.data?.filter((d) => !d.retiredAt) ?? []
    if (player && !player.user) return active
    return active.filter(
      (d) =>
        d.ownerId === ownerId ||
        (!d.ownerId && player?.user && d.user?.id === player.user.id),
    )
  }
  const validRows = rows.filter((r) => r.playerId && r.deckId).length

  const live = (matches.data ?? []).filter((m) => m.status === 'IN_PROGRESS')
  const history = (matches.data ?? []).filter((m) => m.status !== 'IN_PROGRESS')

  const renderMatchCard = (m: NonNullable<typeof matches.data>[number], isLive: boolean) => {
    const sorted = [...m.participants].sort(
      (a, b) => (a.placement ?? 99) - (b.placement ?? 99),
    )
    return (
      <Link key={m.id} to={`/app/matches/${m.id}`} className="block">
        <Card
          className={cn(
            'group transition-colors hover:border-primary/40',
            isLive && 'border-success/40 bg-success/[0.03]',
          )}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {new Date(m.playedAt).toLocaleDateString('en-US', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                {isLive ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {elapsedMins(m.playedAt as unknown as string)} min in
                  </span>
                ) : (
                  <>
                    {m.durationMins ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {m.durationMins}min
                      </span>
                    ) : null}
                    {m.turns ? (
                      <span className="flex items-center gap-1">
                        <Hash className="h-3.5 w-3.5" />
                        {m.turns} turns
                      </span>
                    ) : null}
                  </>
                )}
                {m._count.events ? <span>{m._count.events} events</span> : null}
              </div>
              <div className="flex items-center gap-2">
                {isLive ? (
                  <Badge variant="success" className="gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    Live
                  </Badge>
                ) : (
                  m.winCondition && (
                    <Badge variant="gold">{WINCON_LABEL[m.winCondition] ?? m.winCondition}</Badge>
                  )
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    remove.mutate(m.id)
                  }}
                  title="Remove match"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {sorted.map((p) => {
                const won = !isLive && (p.isWinner || p.placement === 1)
                const art = p.deck.commander?.artCropUrl
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex gap-2.5 overflow-hidden rounded-lg border p-2.5',
                      won ? 'border-gold/50 bg-gold/10' : 'bg-muted/50',
                    )}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md">
                      {art ? (
                        <img src={art} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <ColorIdentity colors={[]} className="text-sm" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!isLive && <PlacementBadge place={p.placement} won={won} />}
                        <span className="truncate text-sm font-semibold">{p.player.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.deck.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground/70">
                        {p.deck.commander?.name ?? '—'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div
              className={cn(
                'mt-3 flex items-center justify-end gap-1 text-xs font-medium transition-colors',
                isLive
                  ? 'text-success group-hover:text-success'
                  : 'text-primary/70 group-hover:text-primary',
              )}
            >
              {isLive
                ? 'Open table · log plays & finish'
                : m._count.events > 0
                  ? `${m._count.events} ${m._count.events === 1 ? 'event' : 'events'} · view timeline`
                  : 'View match'}
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Matches" subtitle="History and podium of every game." icon={Swords}>
        {(matches.data?.length ?? 0) > 0 && (
          <Button variant="outline" onClick={exportCsv} title="Download CSV">
            <Download /> CSV
          </Button>
        )}
        <Button
          variant={mode === 'log' ? 'secondary' : 'outline'}
          onClick={() => setMode(mode === 'log' ? null : 'log')}
        >
          {mode === 'log' ? <X /> : <ClipboardList />} Log finished
        </Button>
        <Button
          variant={mode === 'start' ? 'secondary' : 'default'}
          onClick={() => setMode(mode === 'start' ? null : 'start')}
        >
          {mode === 'start' ? <X /> : <Play />} Start match
        </Button>
      </PageHeader>

      {mode && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div>
              <h2 className="font-semibold">
                {mode === 'start' ? 'Start a match' : 'Log a finished match'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {mode === 'start'
                  ? 'Pick who sits where — then log the plays as they happen and set the podium when it ends.'
                  : 'The game already ended: seats, podium and how it was won.'}
              </p>
            </div>

            {/* Seat builder */}
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((r, i) => (
                <div key={i} className="space-y-3 rounded-xl border bg-background/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                      Seat {i + 1}
                    </span>
                    {rows.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                        title="Remove seat"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Player</Label>
                    <select
                      value={r.playerId}
                      onChange={(e) => setRow(i, { playerId: e.target.value, deckId: '' })}
                      className={selectCls}
                    >
                      <option value="">Select player…</option>
                      {players.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Deck</Label>
                    <select
                      value={r.deckId}
                      onChange={(e) => setRow(i, { deckId: e.target.value })}
                      disabled={!r.playerId}
                      className={cn(selectCls, 'disabled:opacity-50')}
                    >
                      <option value="">Select deck…</option>
                      {decksByOwner(r.playerId).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                      {(() => {
                        const offered = new Set(decksByOwner(r.playerId).map((d) => d.id))
                        const extras =
                          myDecks.data?.filter((d) => !offered.has(d.id) && !d.retiredAt) ?? []
                        return extras.length > 0 ? (
                          <optgroup label="My decks (imported)">
                            {extras.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null
                      })()}
                    </select>
                  </div>
                  {mode === 'log' && (
                    <div className="grid gap-1.5">
                      <Label>Finish position</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="1 = winner"
                        value={r.placement}
                        onChange={(e) => setRow(i, { placement: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
              {rows.length < 6 && (
                <button
                  type="button"
                  onClick={() => setRows([...rows, { playerId: '', deckId: '', placement: '' }])}
                  className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Plus className="h-5 w-5" />
                  Add seat
                </button>
              )}
            </div>

            {/* Game details — only when logging a finished game */}
            {mode === 'log' && (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    value={durationMins}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Turns</Label>
                  <Input type="number" value={turns} onChange={(e) => setTurns(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Win condition</Label>
                  <select
                    value={winCondition}
                    onChange={(e) => setWinCondition(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">—</option>
                    {WIN_CONDITIONS.map((w) => (
                      <option key={w} value={w}>
                        {WINCON_LABEL[w]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>How it ended</Label>
                  <select
                    value={endReason}
                    onChange={(e) => setEndReason(e.target.value)}
                    className={selectCls}
                  >
                    {END_REASONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                disabled={create.isPending || validRows < 2}
                onClick={() => create.mutate(mode)}
              >
                {mode === 'start' ? (
                  <>
                    <Play /> {create.isPending ? 'Starting…' : 'Start match'}
                  </>
                ) : (
                  <>{create.isPending ? 'Saving…' : 'Save match'}</>
                )}
              </Button>
              {validRows < 2 && (
                <span className="text-xs text-muted-foreground">
                  Fill at least two seats (player + deck).
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {matches.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !matches.data?.length ? (
        <EmptyState
          icon={Swords}
          title="No matches yet"
          description="Start a match to track the plays live, or log one that already ended."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('log')}>
                <ClipboardList /> Log finished
              </Button>
              <Button onClick={() => setMode('start')}>
                <Play /> Start match
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {live.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                At the table now
              </h2>
              <div className="space-y-3">{live.map((m) => renderMatchCard(m, true))}</div>
            </section>
          )}
          {history.length > 0 && (
            <section className="space-y-3">
              {live.length > 0 && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  History
                </h2>
              )}
              <div className="space-y-3">{history.map((m) => renderMatchCard(m, false))}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
