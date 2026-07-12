import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Users,
  Layers,
  Swords,
  Activity,
  ArrowRight,
  Crosshair,
  Bomb,
  Shield,
  BookOpen,
  Sprout,
  Zap,
  Target,
  Skull,
  CalendarDays,
} from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { useActiveGroup } from '@/lib/group'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ColorIdentity } from '@/components/mana'
import { WinrateBar } from '@/components/winrate-bar'

const MEDAL = [
  'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-gold/20 dark:text-gold dark:ring-gold/30',
  'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-zinc-300/15 dark:text-zinc-300 dark:ring-zinc-300/25',
  'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-amber-600/20 dark:text-amber-500 dark:ring-amber-600/30',
]

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

const PERSONALITY_ICON: Record<string, typeof Crosshair> = {
  removal: Crosshair,
  boardwipe: Bomb,
  counter: Shield,
  tutor: BookOpen,
  ramp: Sprout,
  draw: Layers,
  combo: Zap,
  target: Target,
}

const PERSONALITY_CHIP: Record<string, string> = {
  removal: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  boardwipe: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  counter: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  tutor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  ramp: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  draw: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  combo: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  target: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

const MANA_BAR: Record<string, string> = {
  W: 'bg-amber-200',
  U: 'bg-sky-400',
  B: 'bg-zinc-500',
  R: 'bg-red-400',
  G: 'bg-emerald-500',
}

interface Insights {
  personalities: {
    key: string
    title: string
    desc: string
    player: string
    avatarColor: string | null
    userId: string | null
    count: number
  }[]
  winConditions: { condition: string; count: number }[]
  colors: { color: string; wins: number }[]
  podium: {
    id: string
    name: string
    avatarColor: string | null
    userId: string | null
    games: number
    wins: number
    top2: number
    avgPlacement: number | null
    firstBlood: number
  }[]
  monthly: { month: string; matches: number }[]
  topCards: { id: string; name: string; manaCost: string | null; plays: number }[]
  recent: {
    id: string
    playedAt: string
    winCondition: string | null
    turns: number | null
    durationMins: number | null
    players: number
    winner: {
      name: string
      avatarColor: string | null
      userId: string | null
      deck: string
      commander: string | null
    } | null
  }[]
}

function Rank({ i }: { i: number }) {
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ring-1',
        i < 3 ? MEDAL[i] : 'bg-muted text-muted-foreground ring-transparent',
      )}
    >
      {i + 1}
    </span>
  )
}

function RowsSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
          <Skeleton className="h-1.5 w-20" />
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  )
}

// Simple horizontal distribution bar (pure CSS, no chart lib).
function BarRow({
  label,
  value,
  max,
  suffix,
  barClass = 'bg-primary/70',
}: {
  label: React.ReactNode
  value: number
  max: number
  suffix?: string
  barClass?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full transition-all', barClass)}
          style={{ width: `${max > 0 ? Math.max((value / max) * 100, 4) : 0}%` }}
        />
      </span>
      <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  )
}

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function DashboardPage() {
  // RequireGroup guarantees an active group when this page renders.
  const { activeGroup } = useActiveGroup()
  const groupId = activeGroup!.id

  const overview = useQuery({
    queryKey: ['overview', groupId],
    queryFn: async () => {
      const { data, error } = await api.stats.overview.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })
  const playerStats = useQuery({
    queryKey: ['stats', 'players', groupId],
    queryFn: async () => {
      const { data, error } = await api.stats.players.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })
  const deckStats = useQuery({
    queryKey: ['stats', 'decks', groupId],
    queryFn: async () => {
      const { data, error } = await api.stats.decks.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })
  const insights = useQuery({
    queryKey: ['stats', 'insights', groupId],
    queryFn: async (): Promise<Insights | null> => {
      const { data, error } = await api.stats.insights.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : (data as unknown as Insights)
    },
  })

  const o = overview.data
  const counters = [
    { label: 'Matches', value: o?.matches, icon: Swords, chip: 'bg-primary/10 text-primary' },
    { label: 'Players', value: o?.players, icon: Users, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { label: 'Decks', value: o?.decks, icon: Layers, chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    { label: 'Events', value: o?.events, icon: Activity, chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  ]
  const avgLine = [
    o?.avgDurationMins ? `${Math.round(o.avgDurationMins)} min` : null,
    o?.avgTurns ? `${Math.round(o.avgTurns)} turns` : null,
  ].filter(Boolean)

  const ins = insights.data
  const maxWincon = Math.max(...(ins?.winConditions.map((w) => w.count) ?? [0]), 1)
  const maxColor = Math.max(...(ins?.colors.map((c) => c.wins) ?? [0]), 1)
  const maxMonthly = Math.max(...(ins?.monthly.map((m) => m.matches) ?? [0]), 1)
  const anyFirstBlood = (ins?.podium ?? []).some((p) => p.firstBlood > 0)

  return (
    <div className="space-y-8">
      {/* Hero + compact counters strip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">{activeGroup!.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1>
          {avgLine.length > 0 && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Averaging {avgLine.join(' and ')} per game.
            </p>
          )}
        </div>
        <Card>
          <CardContent className="grid w-full grid-cols-2 gap-x-6 gap-y-3 px-5 py-3.5 sm:flex sm:w-auto sm:items-center sm:gap-5 sm:py-3">
            {counters.map((s, i) => (
              <div key={s.label} className={cn('flex items-center gap-2.5', i > 0 && 'sm:border-l sm:border-border/60 sm:pl-5')}>
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', s.chip)}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-bold leading-none tabular-nums">{s.value ?? '—'}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Table personalities */}
      {(ins?.personalities.length ?? 0) > 0 && (
        <section className="space-y-3">
          <SectionTitle>Table personalities</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ins!.personalities.map((p) => {
              const Icon = PERSONALITY_ICON[p.key] ?? Activity
              return (
                <Card key={p.key} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', PERSONALITY_CHIP[p.key])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold leading-tight">{p.title}</div>
                        <div className="truncate text-[10.5px] text-muted-foreground">{p.desc}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Avatar name={p.player} color={p.avatarColor} size={24} />
                      {p.userId ? (
                        <Link
                          to={`/app/profile/${p.userId}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {p.player}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.player}</span>
                      )}
                      <Badge variant="secondary" className="tabular-nums">
                        {p.count}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Table meta */}
      <section className="space-y-3">
        <SectionTitle>Table meta</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-semibold">How games end</h3>
              {ins?.winConditions.length ? (
                ins.winConditions.map((w) => (
                  <BarRow
                    key={w.condition}
                    label={WINCON_LABEL[w.condition] ?? w.condition}
                    value={w.count}
                    max={maxWincon}
                  />
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Winning colors</h3>
              {ins?.colors.length ? (
                ins.colors.map((c) => (
                  <BarRow
                    key={c.color}
                    label={<span className="inline-flex items-center gap-1.5"><i className={`ms ms-${c.color.toLowerCase()} ms-cost text-[0.7rem]`} />{c.color}</span>}
                    value={c.wins}
                    max={maxColor}
                    barClass={MANA_BAR[c.color]}
                  />
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Most played cards</h3>
              {ins?.topCards.length ? (
                ins.topCards.slice(0, 6).map((c) => (
                  <BarRow
                    key={c.id}
                    label={c.name}
                    value={c.plays}
                    max={Math.max(...ins.topCards.map((x) => x.plays), 1)}
                  />
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No data yet</p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cards logged on match timelines, basics excluded.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Rankings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-semibold">Top players</h2>
              <Link
                to="/app/players"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {playerStats.isLoading ? (
              <RowsSkeleton />
            ) : playerStats.data?.length ? (
              <div className="space-y-1">
                {playerStats.data.slice(0, 5).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 py-1.5">
                    <Rank i={i} />
                    <Avatar name={p.name} color={p.avatarColor} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {p.wins}W / {p.games} {p.games === 1 ? 'game' : 'games'}
                      </div>
                    </div>
                    <WinrateBar value={p.winrate} games={p.games} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-semibold">Top decks</h2>
              <Link
                to="/app/decks"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {deckStats.isLoading ? (
              <RowsSkeleton />
            ) : deckStats.data?.length ? (
              <div className="space-y-1">
                {deckStats.data.slice(0, 5).map((d, i) => (
                  <div key={d.id} className="flex items-center gap-3 py-1.5">
                    <Rank i={i} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {d.commander ?? '—'}
                      </div>
                    </div>
                    <ColorIdentity colors={d.colorIdentity} className="text-sm" />
                    <WinrateBar value={d.winrate} games={d.games} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Podium & timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Podium &amp; eliminations</h2>
            {ins?.podium.length ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-0 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="flex-1">Player</span>
                  <span className="w-14 text-right">Avg pos</span>
                  <span className="w-12 text-right">Top 2</span>
                  <span className="w-12 text-right">Wins</span>
                  {anyFirstBlood && <span className="w-14 text-right">1st out</span>}
                </div>
                {ins.podium.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Avatar name={p.name} color={p.avatarColor} size={26} />
                      <span className="min-w-0">
                        {p.userId ? (
                          <Link
                            to={`/app/profile/${p.userId}`}
                            className="block truncate font-medium hover:text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                        ) : (
                          <span className="block truncate font-medium">{p.name}</span>
                        )}
                        <span className="block text-[11px] tabular-nums text-muted-foreground">
                          {p.games} {p.games === 1 ? 'game' : 'games'}
                        </span>
                      </span>
                    </span>
                    <span className="w-14 text-right font-semibold tabular-nums">
                      {p.avgPlacement != null ? p.avgPlacement.toFixed(1) : '—'}
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {p.games ? Math.round((p.top2 / p.games) * 100) : 0}%
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">{p.wins}</span>
                    {anyFirstBlood && (
                      <span className="flex w-14 items-center justify-end gap-1 text-right tabular-nums text-muted-foreground">
                        {p.firstBlood > 0 && <Skull className="h-3 w-3 text-rose-500" />}
                        {p.firstBlood}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Activity
            </h2>
            {/* Matches per month — tiny CSS bar chart */}
            <div className="flex h-20 items-end gap-2">
              {(ins?.monthly ?? []).map((m) => {
                const [, mm] = m.month.split('-')
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {m.matches > 0 ? m.matches : ''}
                    </span>
                    <div
                      className={cn(
                        'w-full rounded-t-md',
                        m.matches > 0 ? 'bg-primary/70' : 'bg-muted',
                      )}
                      style={{ height: `${Math.max((m.matches / maxMonthly) * 56, 4)}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {MONTH_LABEL[Number(mm) - 1]}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Recent matches feed */}
            <div className="mt-5 space-y-1 border-t border-border/60 pt-4">
              {ins?.recent.length ? (
                ins.recent.map((m) => (
                  <Link
                    key={m.id}
                    to={`/app/matches/${m.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
                  >
                    {m.winner ? (
                      <Avatar name={m.winner.name} color={m.winner.avatarColor} size={26} />
                    ) : (
                      <div className="h-[26px] w-[26px] rounded-full bg-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        <span className="font-medium">{m.winner?.name ?? 'No winner'}</span>
                        {m.winner && (
                          <span className="text-muted-foreground"> won with {m.winner.deck}</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {new Date(m.playedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        {' · '}
                        {m.players} players
                        {m.turns ? ` · ${m.turns} turns` : ''}
                      </span>
                    </span>
                    {m.winCondition && (
                      <Badge variant="outline" className="shrink-0">
                        {WINCON_LABEL[m.winCondition] ?? m.winCondition}
                      </Badge>
                    )}
                  </Link>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No matches logged yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
