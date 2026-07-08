import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2, UserPlus, Users } from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'

const SWATCHES = [
  '#7c3aed', '#2563eb', '#0ea5e9', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

export function PlayersPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])

  const players = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await api.players.get()
      if (error) throw error
      return data
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.players.post({ name, avatarColor: color })
      if (error) throw error
      return data
    },
    onSuccess: (d) => {
      toast.success(`Player "${d?.name}" added`)
      setName('')
      qc.invalidateQueries({ queryKey: ['players'] })
    },
    onError: () => toast.error('Could not add player (name already taken?)'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.players({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Player removed')
      qc.invalidateQueries({ queryKey: ['players'] })
    },
    onError: () => toast.error('Could not remove player'),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Players" subtitle="Who sits at the table." icon={Users} />

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
              <Label htmlFor="name">Name</Label>
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
              <UserPlus /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {players.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] rounded-xl" />
          ))}
        </div>
      ) : !players.data?.length ? (
        <EmptyState
          icon={Users}
          title="No players yet"
          description="Add your playgroup members to start logging decks and matches."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.data.map((p) => (
            <Card key={p.id} className="group">
              <CardContent className="flex items-center gap-3 p-3.5">
                <Avatar name={p.name} color={p.avatarColor} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {p._count.decks} {p._count.decks === 1 ? 'deck' : 'decks'} ·{' '}
                    {p._count.participations}{' '}
                    {p._count.participations === 1 ? 'match' : 'matches'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => remove.mutate(p.id)}
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
