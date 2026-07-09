import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Layers, Link2, Plus, Search, User, X } from 'lucide-react'
import { api } from '@/lib/eden'
import { useActiveGroup } from '@/lib/group'
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
  const navigate = useNavigate()
  // RequireGroup guarantees an active group when this page renders.
  const { activeGroup } = useActiveGroup()
  const groupId = activeGroup!.id
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [archetype, setArchetype] = useState('')
  const [powerLevel, setPowerLevel] = useState('')
  const [query, setQuery] = useState('')
  const [commander, setCommander] = useState<CommanderPick | null>(null)

  // Import form (personal decks — portable to any playgroup).
  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'url' | 'text'>('url')
  const [importUrl, setImportUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
  const [importCommander, setImportCommander] = useState('')

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

  const myDecks = useQuery({
    queryKey: ['my-decks'],
    queryFn: async () => {
      const { data, error } = await api.decks.mine.get()
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

  const importDeck = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.decks.import.post({
        url: importMode === 'url' ? importUrl.trim() : undefined,
        text: importMode === 'text' ? importText : undefined,
        name: importName.trim() || undefined,
        commanderName: importCommander.trim() || undefined,
      })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
    onSuccess: (d) => {
      if (d?.notFound?.length) {
        toast.warning(`Imported, but ${d.notFound.length} card(s) not found: ${d.notFound.slice(0, 3).join(', ')}${d.notFound.length > 3 ? '…' : ''}`)
      } else {
        toast.success(`Deck "${d?.deck?.name}" imported`)
      }
      setImportUrl('')
      setImportText('')
      setImportName('')
      setImportCommander('')
      setImportOpen(false)
      qc.invalidateQueries({ queryKey: ['my-decks'] })
      if (d?.deck?.id) navigate(`/app/decks/${d.deck.id}`)
    },
    onError: (err) => {
      const msg =
        (err as { value?: { error_description?: string } })?.value?.error_description ??
        'Could not import the deck'
      toast.error(msg)
    },
  })

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
      return data && 'error' in data ? null : data
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
      qc.invalidateQueries({ queryKey: ['my-decks'] })
    },
    onError: () => toast.error('Could not remove deck'),
  })

  const canSubmit = name.trim() && ownerId

  return (
    <div className="space-y-6">
      <PageHeader title="Decks" subtitle="Commanders imported from Scryfall." icon={Layers}>
        <Button
          onClick={() => {
            setImportOpen((v) => !v)
            setOpen(false)
          }}
          variant={importOpen ? 'secondary' : 'outline'}
        >
          {importOpen ? <X /> : <Download />} {importOpen ? 'Close' : 'Import deck'}
        </Button>
        <Button
          onClick={() => {
            setOpen((v) => !v)
            setImportOpen(false)
          }}
          variant={open ? 'secondary' : 'default'}
        >
          {open ? <X /> : <Plus />} {open ? 'Close' : 'New deck'}
        </Button>
      </PageHeader>

      {importOpen && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={importMode === 'url' ? 'default' : 'outline'}
                onClick={() => setImportMode('url')}
              >
                <Link2 /> From Moxfield link
              </Button>
              <Button
                size="sm"
                variant={importMode === 'text' ? 'default' : 'outline'}
                onClick={() => setImportMode('text')}
              >
                Paste decklist
              </Button>
            </div>

            {importMode === 'url' ? (
              <div className="grid gap-1.5">
                <Label>Moxfield deck link</Label>
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://moxfield.com/decks/…"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The deck name, commander and all 100 cards come straight from Moxfield.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Deck name</Label>
                    <Input
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="e.g. Atraxa Superfriends"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Commander (optional if the list has a Commander section)</Label>
                    <Input
                      value={importCommander}
                      onChange={(e) => setImportCommander(e.target.value)}
                      placeholder="e.g. Atraxa, Praetors' Voice"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Decklist</Label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={10}
                    placeholder={'1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…'}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    One card per line ("1 Sol Ring"). Moxfield/Arena text exports work too.
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={() => importDeck.mutate()}
              disabled={
                importDeck.isPending ||
                (importMode === 'url' ? !importUrl.trim() : !importText.trim())
              }
            >
              <Download /> {importDeck.isPending ? 'Importing…' : 'Import deck'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Personal decks — tied to your account, usable in any playgroup */}
      {(myDecks.data?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <User className="h-4 w-4" /> My decks
            <span className="font-normal">— yours in every playgroup</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myDecks.data!.map((d) => (
              <DeckCard key={d.id} deck={d} onDelete={(id) => remove.mutate(id)} />
            ))}
          </div>
          <h2 className="pt-2 text-sm font-semibold text-muted-foreground">
            {activeGroup!.name} decks
          </h2>
        </section>
      )}

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
