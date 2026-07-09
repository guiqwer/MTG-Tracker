import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarDays,
  ChevronLeft,
  Crown,
  Layers,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DeckCard, type DeckCardData } from '@/components/deck-card'
import { ColorIdentity } from '@/components/mana'

const MANA_BAR: Record<string, string> = {
  W: 'bg-amber-200',
  U: 'bg-sky-400',
  B: 'bg-zinc-500',
  R: 'bg-red-400',
  G: 'bg-emerald-500',
}

interface ProfileData {
  user: {
    id: string
    username: string
    avatarColor: string | null
    bio: string | null
    createdAt: string
  }
  self: boolean
  sharedGroups: { id: string; name: string }[]
  featuredDeck: (DeckCardData & { commander: { artCropUrl: string | null } | null }) | null
  stats: { games: number; wins: number; winrate: number; avgPlacement: number | null }
  colorPie: { color: string; games: number }[]
  favoriteCommander: { name: string; artCropUrl: string | null; games: number } | null
  titles: { key: string; title: string; desc: string; count: number }[]
  decks: DeckCardData[]
  headToHead: {
    games: number
    viewerWins: number
    profileWins: number
    lastMatch: { id: string; playedAt: string }
  } | null
  recent: {
    id: string
    playedAt: string
    placement: number | null
    won: boolean
    deck: string
    commander: string | null
  }[]
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

export function ProfilePage() {
  const { id = '' } = useParams()

  const profile = useQuery({
    queryKey: ['profile', id],
    queryFn: async (): Promise<ProfileData | null> => {
      const { data, error } = await api.profiles({ id }).get()
      if (error) throw error
      return data && 'error' in data ? null : (data as unknown as ProfileData)
    },
  })

  const p = profile.data
  const art = p?.featuredDeck?.commander?.artCropUrl
  const maxPie = Math.max(...(p?.colorPie.map((c) => c.games) ?? [0]), 1)

  return (
    <div className="space-y-6">
      <Link
        to="/app"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Dashboard
      </Link>

      {profile.isLoading ? (
        <>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </>
      ) : !p ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Profile not found — you can only see people who share a group with you.
        </p>
      ) : (
        <>
          {/* Header — banner uses the featured deck's commander art */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="relative h-32 sm:h-40">
              {art ? (
                <img src={art} alt="" className="h-full w-full object-cover object-center" />
              ) : (
                <div className="h-full w-full bg-gradient-to-r from-primary/25 via-primary/10 to-transparent" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
            </div>
            <div className="relative -mt-10 flex flex-wrap items-end justify-between gap-4 px-5 pb-5">
              <div className="flex items-end gap-4">
                <span className="rounded-full ring-4 ring-card">
                  <Avatar name={p.user.username} color={p.user.avatarColor} size={72} />
                </span>
                <div className="pb-1">
                  <h1 className="text-2xl font-bold tracking-tight">{p.user.username}</h1>
                  {p.user.bio && (
                    <p className="mt-0.5 max-w-md text-sm text-muted-foreground">{p.user.bio}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      since{' '}
                      {new Date(p.user.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {p.sharedGroups.map((g) => g.name).join(', ')}
                    </span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label="Games" value={String(p.stats.games)} />
                <StatBox label="Wins" value={String(p.stats.wins)} />
                <StatBox label="Winrate" value={`${Math.round(p.stats.winrate * 100)}%`} />
                <StatBox
                  label="Avg pos"
                  value={p.stats.avgPlacement != null ? p.stats.avgPlacement.toFixed(1) : '—'}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Head to head */}
            {p.headToHead && (
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Swords className="h-4 w-4 text-primary" /> You vs {p.user.username}
                  </h2>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold tabular-nums">
                        {p.headToHead.viewerWins}
                      </div>
                      <div className="text-[11px] text-muted-foreground">your wins</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.headToHead.games} {p.headToHead.games === 1 ? 'game' : 'games'} together
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold tabular-nums">
                        {p.headToHead.profileWins}
                      </div>
                      <div className="text-[11px] text-muted-foreground">their wins</div>
                    </div>
                  </div>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="bg-primary"
                      style={{
                        width: `${(p.headToHead.viewerWins / Math.max(p.headToHead.viewerWins + p.headToHead.profileWins, 1)) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-destructive/70"
                      style={{
                        width: `${(p.headToHead.profileWins / Math.max(p.headToHead.viewerWins + p.headToHead.profileWins, 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <Link
                    to={`/app/matches/${p.headToHead.lastMatch.id}`}
                    className="mt-3 block text-xs font-medium text-primary hover:underline"
                  >
                    Last game together →
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Identity: titles + favorite commander */}
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> Identity
                </h2>
                {p.favoriteCommander && (
                  <div className="mb-3 flex items-center gap-3 rounded-lg border p-2">
                    {p.favoriteCommander.artCropUrl && (
                      <img
                        src={p.favoriteCommander.artCropUrl}
                        alt=""
                        className="h-10 w-16 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Crown className="h-3 w-3" /> favorite commander
                      </div>
                      <div className="truncate text-sm font-medium">
                        {p.favoriteCommander.name}
                      </div>
                    </div>
                  </div>
                )}
                {p.titles.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.titles.slice(0, 4).map((t) => (
                      <Badge key={t.key} variant="secondary" title={`${t.count} ${t.desc}`}>
                        {t.title} · {t.count}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No titles yet — log match events to earn them.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Colors played */}
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-sm font-semibold">Colors played</h2>
                {p.colorPie.length ? (
                  p.colorPie.map((c) => (
                    <div key={c.color} className="flex items-center gap-2 py-1 text-sm">
                      <i className={`ms ms-${c.color.toLowerCase()} ms-cost shrink-0 text-[0.7rem]`} />
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn('block h-full rounded-full', MANA_BAR[c.color])}
                          style={{ width: `${Math.max((c.games / maxPie) * 100, 6)}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                        {c.games}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No games recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Decks */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers className="h-4 w-4" /> Decks
            </h2>
            {p.decks.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {p.decks.map((d) => (
                  <DeckCard key={d.id} deck={d} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No decks yet.</p>
            )}
          </section>

          {/* Recent matches */}
          {p.recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Swords className="h-4 w-4" /> Recent matches
              </h2>
              <Card>
                <CardContent className="p-2">
                  {p.recent.map((m) => (
                    <Link
                      key={m.id}
                      to={`/app/matches/${m.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
                    >
                      {m.won ? (
                        <Trophy className="h-4 w-4 shrink-0 text-gold" />
                      ) : (
                        <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                          {m.placement ?? '—'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {m.deck}
                          {m.commander && (
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              — {m.commander}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {new Date(m.playedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Featured deck highlight when there's no art in header but a deck is pinned */}
          {p.featuredDeck && (
            <p className="text-xs text-muted-foreground">
              <ColorIdentity colors={p.featuredDeck.colorIdentity} className="mr-1 text-sm align-middle" />
              Signature deck:{' '}
              <Link
                to={`/app/decks/${p.featuredDeck.id}`}
                className="font-medium text-primary hover:underline"
              >
                {p.featuredDeck.name}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}
