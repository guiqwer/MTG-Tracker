import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Layers, Plus, Search, X } from 'lucide-react'
import { api } from '@/lib/eden'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { DeckCard } from '@/components/deck-card'
import { ColorIdentity } from '@/components/mana'

interface CommanderPick {
  scryfallId: string
  name: string
  artCropUrl: string | null
  colorIdentity: string[]
}

const selectCls =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function DecksPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [archetype, setArchetype] = useState('')
  const [powerLevel, setPowerLevel] = useState('')
  const [query, setQuery] = useState('')
  const [commander, setCommander] = useState<CommanderPick | null>(null)

  const players = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await api.players.get()
      if (error) throw error
      return data
    },
  })
  const decks = useQuery({
    queryKey: ['decks'],
    queryFn: async () => {
      const { data, error } = await api.decks.get()
      if (error) throw error
      return data
    },
  })
  const search = useQuery({
    queryKey: ['cards', 'search', query],
    enabled: query.trim().length >= 3 && !commander,
    queryFn: async () => {
      const { data, error } = await api.cards.search.get({
        query: { q: query, commanders: 'true' },
      })
      if (error) throw error
      return data
    },
  })

  const reset = () => {
    setName('')
    setOwnerId('')
    setArchetype('')
    setPowerLevel('')
    setCommander(null)
    setQuery('')
  }

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.decks.post({
        name,
        ownerId,
        commanderScryfallId: commander?.scryfallId,
        archetype: archetype || undefined,
        powerLevel: powerLevel ? Number(powerLevel) : undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: (d) => {
      toast.success(`Deck "${d?.name}" created`)
      reset()
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['decks'] })
    },
    onError: () => toast.error('Could not create the deck'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.decks({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Deck removed')
      qc.invalidateQueries({ queryKey: ['decks'] })
    },
    onError: () => toast.error('Could not remove deck'),
  })

  const canSubmit = name.trim() && ownerId

  return (
    <div className="space-y-6">
      <PageHeader title="Decks" subtitle="Commanders imported from Scryfall." icon={Layers}>
        <Button onClick={() => setOpen((v) => !v)} variant={open ? 'secondary' : 'default'}>
          {open ? <X /> : <Plus />} {open ? 'Close' : 'New deck'}
        </Button>
      </PageHeader>

      {open && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Deck name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Superfriends"
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Owner</Label>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select…</option>
                  {players.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Archetype</Label>
                <Input
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value)}
                  placeholder="Aggro, Combo, Control…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Power level (1–10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={powerLevel}
                  onChange={(e) => setPowerLevel(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Commander</Label>
              {commander ? (
                <div className="flex items-center gap-3 rounded-md border p-2">
                  {commander.artCropUrl && (
                    <img
                      src={commander.artCropUrl}
                      alt=""
                      className="h-10 w-16 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{commander.name}</div>
                    <ColorIdentity colors={commander.colorIdentity} />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCommander(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search commander (min. 3 letters)…"
                    className="pl-8"
                  />
                  {search.data && search.data.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-xl">
                      {search.data.map((c) => (
                        <button
                          key={c.scryfallId}
                          type="button"
                          onClick={() =>
                            setCommander({
                              scryfallId: c.scryfallId,
                              name: c.name,
                              artCropUrl: c.artCropUrl,
                              colorIdentity: c.colorIdentity,
                            })
                          }
                          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                        >
                          {c.artCropUrl && (
                            <img
                              src={c.artCropUrl}
                              alt=""
                              className="h-8 w-12 rounded object-cover"
                            />
                          )}
                          <span className="flex-1 text-sm">{c.name}</span>
                          <ColorIdentity colors={c.colorIdentity} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
              <Plus /> Create deck
            </Button>
          </CardContent>
        </Card>
      )}

      {decks.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !decks.data?.length ? (
        <EmptyState
          icon={Layers}
          title="No decks yet"
          description="Create a deck and search its commander straight from Scryfall — color identity is filled in automatically."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> New deck
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.data.map((d) => (
            <DeckCard key={d.id} deck={d} onDelete={(id) => remove.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
