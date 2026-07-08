import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, Layers, Swords, Activity, ArrowRight } from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ColorIdentity } from '@/components/mana'
import { WinrateBar } from '@/components/winrate-bar'

const MEDAL = [
  'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-gold/20 dark:text-gold dark:ring-gold/30',
  'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-zinc-300/15 dark:text-zinc-300 dark:ring-zinc-300/25',
  'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-amber-600/20 dark:text-amber-500 dark:ring-amber-600/30',
]

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

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      const { data, error } = await api.stats.overview.get()
      if (error) throw error
      return data
    },
  })
  const playerStats = useQuery({
    queryKey: ['stats', 'players'],
    queryFn: async () => {
      const { data, error } = await api.stats.players.get()
      if (error) throw error
      return data
    },
  })
  const deckStats = useQuery({
    queryKey: ['stats', 'decks'],
    queryFn: async () => {
      const { data, error } = await api.stats.decks.get()
      if (error) throw error
      return data
    },
  })

  const o = overview.data
  const stats = [
    { label: 'Matches', value: o?.matches, icon: Swords, chip: 'bg-primary/10 text-primary' },
    { label: 'Players', value: o?.players, icon: Users, chip: 'bg-emerald-500/10 text-emerald-600' },
    { label: 'Decks', value: o?.decks, icon: Layers, chip: 'bg-amber-500/10 text-amber-600' },
    { label: 'Events', value: o?.events, icon: Activity, chip: 'bg-sky-500/10 text-sky-600' },
  ]
  const avgLine = [
    o?.avgDurationMins ? `${Math.round(o.avgDurationMins)} min` : null,
    o?.avgTurns ? `${Math.round(o.avgTurns)} turns` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-medium text-primary">Your playgroup</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1>
        {avgLine.length > 0 && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Averaging {avgLine.join(' and ')} per game.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', s.chip)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-4xl font-bold tracking-tight tabular-nums">
                {s.value ?? '—'}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

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
    </div>
  )
}
