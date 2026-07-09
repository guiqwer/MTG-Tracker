import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BadgeCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { useActiveGroup } from '@/lib/group'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'

const SWATCHES = [
  '#7c3aed', '#2563eb', '#0ea5e9', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

interface PlayerRow {
  id: string
  name: string
  avatarColor: string | null
  user: { id: string; username: string } | null
  _count: { decks: number; participations: number }
}

function PlayerCard({
  player,
  onDelete,
}: {
  player: PlayerRow
  onDelete?: (id: string) => void
}) {
  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-3.5">
        <Avatar name={player.name} color={player.avatarColor} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{player.name}</span>
            {player.user && (
              <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                <BadgeCheck className="h-3 w-3" /> member
              </Badge>
            )}
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {player._count.decks} {player._count.decks === 1 ? 'deck' : 'decks'} ·{' '}
            {player._count.participations}{' '}
            {player._count.participations === 1 ? 'match' : 'matches'}
          </div>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            onClick={() => onDelete(player.id)}
            title="Remove guest"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function PlayersPage() {
  const qc = useQueryClient()
  // RequireGroup guarantees an active group when this page renders.
  const { activeGroup } = useActiveGroup()
  const groupId = activeGroup!.id
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])

  const players = useQuery({
    queryKey: ['players', groupId],
    queryFn: async (): Promise<PlayerRow[] | null> => {
      const { data, error } = await api.players.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : (data as unknown as PlayerRow[])
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.players.post({ name, avatarColor: color, groupId })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
    onSuccess: (d) => {
      toast.success(`Guest "${d?.name}" added`)
      setName('')
      qc.invalidateQueries({ queryKey: ['players'] })
    },
    onError: () => toast.error('Could not add the guest (name already taken?)'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.players({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Guest removed')
      qc.invalidateQueries({ queryKey: ['players'] })
    },
    onError: (err) => {
      const msg =
        (err as { value?: { error_description?: string } })?.value?.error_description ??
        'Could not remove the player'
      toast.error(msg)
    },
  })

  const list = players.data ?? []
  const members = list.filter((p) => p.user)
  const guests = list.filter((p) => !p.user)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Players"
        subtitle="Group members get a seat automatically — add guests for friends without an account."
        icon={Users}
      />

      {players.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Members — everyone who joined this group with an account */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </h2>
            {members.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((p) => (
                  <PlayerCard key={p.id} player={p} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No members yet — share the group invite code so friends join with their own
                account.
              </p>
            )}
          </section>

          {/* Guests — tracked at the table, no account needed */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Guests
            </h2>
            <Card>
              <CardContent className="p-4">
                <form
                  className="flex flex-wrap items-end gap-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (name.trim()) create.mutate()
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Guest name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="w-56"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Color</Label>
                    <div className="flex items-center gap-1.5">
                      {SWATCHES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setColor(s)}
                          title={s}
                          className={cn(
                            'h-7 w-7 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-card transition',
                            color === s ? 'ring-ring' : 'ring-transparent hover:ring-border',
                          )}
                          style={{ background: s }}
                        />
                      ))}
                    </div>
                  </div>
                  <Button type="submit" disabled={create.isPending || !name.trim()}>
                    <UserPlus /> Add guest
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">
                  Guests play at the table and count in the stats, but don&apos;t log in.
                </p>
              </CardContent>
            </Card>

            {guests.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {guests.map((p) => (
                  <PlayerCard key={p.id} player={p} onDelete={(id) => remove.mutate(id)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No guests"
                description="Everyone at your table has an account — nice! Add a guest here if someone joins a game without one."
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
