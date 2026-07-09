import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Swords, Trophy, X, Clock, Hash, ChevronRight } from 'lucide-react'
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
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

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

export function MatchesPage() {
  const qc = useQueryClient()
  // RequireGroup guarantees an active group when this page renders.
  const { activeGroup } = useActiveGroup()
  const groupId = activeGroup!.id
  const [open, setOpen] = useState(false)
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

  const create = useMutation({
    mutationFn: async () => {
      const participants = rows
        .filter((r) => r.playerId && r.deckId)
        .map((r, i) => ({
          playerId: r.playerId,
          deckId: r.deckId,
          seatOrder: i + 1,
          placement: r.placement ? Number(r.placement) : undefined,
        }))
      const { data, error } = await api.matches.post({
        groupId,
        durationMins: durationMins ? Number(durationMins) : undefined,
        turns: turns ? Number(turns) : undefined,
        winCondition: winCondition || undefined,
        endReason: endReason || undefined,
        participants,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Match logged')
      setRows(emptyRows())
      setDuration('')
      setTurns('')
      setWinCondition('')
      setEndReason('NATURAL')
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['stats', 'players'] })
      qc.invalidateQueries({ queryKey: ['stats', 'decks'] })
    },
    onError: () => toast.error('Could not log the match'),
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
      qc.invalidateQueries({ queryKey: ['stats', 'players'] })
      qc.invalidateQueries({ queryKey: ['stats', 'decks'] })
    },
    onError: () => toast.error('Could not remove match'),
  })

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const decksByOwner = (ownerId: string) =>
    decks.data?.filter((d) => d.ownerId === ownerId) ?? []
  const validRows = rows.filter((r) => r.playerId && r.deckId).length

  return (
    <div className="space-y-6">
      <PageHeader title="Matches" subtitle="History and podium of every game." icon={Swords}>
        <Button onClick={() => setOpen((v) => !v)} variant={open ? 'secondary' : 'default'}>
          {open ? <X /> : <Plus />} {open ? 'Close' : 'Log match'}
        </Button>
      </PageHeader>

      {open && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-16 text-xs text-muted-foreground">Seat {i + 1}</span>
                  <select
                    value={r.playerId}
                    onChange={(e) => setRow(i, { playerId: e.target.value, deckId: '' })}
                    className={cn(selectCls, 'min-w-[9rem]')}
                  >
                    <option value="">Player…</option>
                    {players.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.deckId}
                    onChange={(e) => setRow(i, { deckId: e.target.value })}
                    disabled={!r.playerId}
                    className={cn(selectCls, 'min-w-[10rem] disabled:opacity-50')}
                  >
                    <option value="">Deck…</option>
                    {decksByOwner(r.playerId).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                    {(myDecks.data?.length ?? 0) > 0 && (
                      <optgroup label="My decks (imported)">
                        {myDecks.data!.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Place"
                    value={r.placement}
                    onChange={(e) => setRow(i, { placement: e.target.value })}
                    className="w-24"
                  />
                  {rows.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows([...rows, { playerId: '', deckId: '', placement: '' }])}
                disabled={rows.length >= 6}
              >
                <Plus /> Add player
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label>Duration (min)</Label>
                <Input type="number" value={durationMins} onChange={(e) => setDuration(e.target.value)} />
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

            <Button disabled={create.isPending || validRows < 2} onClick={() => create.mutate()}>
              Save match
            </Button>
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
          title="No matches logged yet"
          description="Log your first match with the full podium (placement per seat) to feed the stats."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Log match
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {matches.data.map((m) => {
            const sorted = [...m.participants].sort(
              (a, b) => (a.placement ?? 99) - (b.placement ?? 99),
            )
            return (
              <Link key={m.id} to={`/app/matches/${m.id}`} className="block">
                <Card className="group transition-colors hover:border-primary/40">
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
                        {m._count.events ? <span>{m._count.events} events</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.winCondition && (
                          <Badge variant="gold">{WINCON_LABEL[m.winCondition] ?? m.winCondition}</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            remove.mutate(m.id)
                          }}
                          title="Remove match"
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {sorted.map((p) => {
                        const won = p.isWinner || p.placement === 1
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
                                <PlacementBadge place={p.placement} won={won} />
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
                    <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-primary/70 transition-colors group-hover:text-primary">
                      {m._count.events > 0
                        ? `${m._count.events} ${m._count.events === 1 ? 'event' : 'events'} · view timeline`
                        : 'Log events'}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
