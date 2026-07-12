import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, Download, Layers, Link2, Search, X } from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { useActiveGroup } from '@/lib/group'
import { useMe } from '@/lib/me'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { DeckCard } from '@/components/deck-card'
import { Avatar } from '@/components/ui/avatar'

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const

const selectCls =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function DecksPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // RequireGroup guarantees an active group when this page renders.
  const { activeGroup } = useActiveGroup()
  const groupId = activeGroup!.id
  const me = useMe()

  // Import form (personal decks — portable to any playgroup). Importing is the
  // ONLY way to add a deck: lists live on deck sites, matches live here.
  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'url' | 'text'>('url')
  const [importUrl, setImportUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
  const [importCommander, setImportCommander] = useState('')

  const decks = useQuery({
    queryKey: ['decks', groupId],
    queryFn: async () => {
      const { data, error } = await api.decks.get({ query: { groupId } })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
  })

  // Client-side filters — the group list is already fully loaded.
  const [search, setSearch] = useState('')
  const [colorFilter, setColorFilter] = useState<string[]>([])
  const [playerFilter, setPlayerFilter] = useState('')
  const hasFilters = !!search.trim() || colorFilter.length > 0 || !!playerFilter

  type GroupDeck = NonNullable<NonNullable<typeof decks.data>>[number]
  const deckMatches = (d: GroupDeck) => {
    const q = search.trim().toLowerCase()
    if (q && !`${d.name} ${d.commander?.name ?? ''}`.toLowerCase().includes(q)) return false
    if (colorFilter.length && !colorFilter.every((c) => d.colorIdentity.includes(c))) return false
    return true
  }

  // One section per person at the table. A member's group player and their
  // personal (account) decks collapse into the same section via userId; guests
  // key by their player row.
  const sectionKeyOf = (d: GroupDeck) =>
    d.user?.id ?? d.owner?.userId ?? (d.owner ? `guest:${d.owner.id}` : 'unowned')
  const sections = (() => {
    const map = new Map<
      string,
      { key: string; name: string; avatarColor: string | null; isMe: boolean; decks: GroupDeck[] }
    >()
    for (const d of decks.data ?? []) {
      if (d.retiredAt) continue
      const key = sectionKeyOf(d)
      let s = map.get(key)
      if (!s) {
        s = {
          key,
          name: d.owner?.name ?? d.user?.username ?? 'No owner',
          avatarColor: d.owner?.avatarColor ?? d.user?.avatarColor ?? null,
          isMe: (d.user?.id ?? d.owner?.userId) === me.data?.id,
          decks: [],
        }
        map.set(key, s)
      }
      s.decks.push(d)
    }
    return [...map.values()].sort(
      (a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name),
    )
  })()

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
      qc.invalidateQueries({ queryKey: ['decks'] })
      if (d?.deck?.id) navigate(`/app/decks/${d.deck.id}`)
    },
    onError: (err) => {
      const msg =
        (err as { value?: { error_description?: string } })?.value?.error_description ??
        'Could not import the deck'
      toast.error(msg)
    },
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
    onError: (err) =>
      toast.error(
        (err as { value?: { error_description?: string } })?.value?.error_description ??
          'Could not remove deck',
      ),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Decks" subtitle="Commanders imported from Scryfall." icon={Layers}>
        <Button
          onClick={() => setImportOpen((v) => !v)}
          variant={importOpen ? 'secondary' : 'default'}
        >
          {importOpen ? <X /> : <Download />} {importOpen ? 'Close' : 'Import deck'}
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
                <Link2 /> From deck link
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
                <Label>Deck link</Label>
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://moxfield.com/decks/… (or Archidekt, LigaMagic, TappedOut, Aetherhub)"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Moxfield, Archidekt, LigaMagic, TappedOut and Aetherhub links import the
                  full list — commander included where the site marks it.
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

      {/* Filter bar — search, color identity and player, all client-side */}
      {(decks.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Deck or commander…"
              className="w-56 pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            {WUBRG.map((c) => (
              <button
                key={c}
                type="button"
                title={`Has ${c} in its identity`}
                onClick={() =>
                  setColorFilter((prev) =>
                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                  )
                }
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
                  colorFilter.includes(c)
                    ? 'border-primary bg-primary/15'
                    : 'border-input opacity-60 hover:bg-accent hover:opacity-100',
                )}
              >
                <i className={`ms ms-${c.toLowerCase()} ms-cost`} />
              </button>
            ))}
          </div>
          <select
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All players</option>
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
                {s.isMe ? ' (you)' : ''}
              </option>
            ))}
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setColorFilter([])
                setPlayerFilter('')
              }}
            >
              <X /> Clear
            </Button>
          )}
        </div>
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
          description="Import a deck from Moxfield, Archidekt, LigaMagic, TappedOut or Aetherhub — or paste the list as text."
          action={
            <Button onClick={() => setImportOpen(true)}>
              <Download /> Import deck
            </Button>
          }
        />
      ) : (
        (() => {
          // One section per player; filters apply inside each section and empty
          // sections disappear.
          const visible = sections
            .filter((s) => !playerFilter || s.key === playerFilter)
            .map((s) => ({ ...s, decks: s.decks.filter(deckMatches) }))
            .filter((s) => s.decks.length > 0)
          if (!visible.length) {
            return (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No decks match these filters.
              </p>
            )
          }
          return visible.map((s) => (
            <section key={s.key} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Avatar name={s.name} color={s.avatarColor} size={22} />
                {s.name}
                {s.isMe && ' (you)'}
                <span className="font-normal">
                  — {s.decks.length} {s.decks.length === 1 ? 'deck' : 'decks'}
                  {s.isMe ? ', yours in every playgroup' : ''}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {s.decks.map((d) => {
                  // Delete only what's yours — guest decks (no account behind
                  // the player) are manageable by anyone in the group.
                  const mine = d.user
                    ? d.user.id === me.data?.id
                    : !d.owner?.userId || d.owner.userId === me.data?.id
                  return (
                    <DeckCard
                      key={d.id}
                      deck={d}
                      onDelete={mine ? (id) => remove.mutate(id) : undefined}
                    />
                  )
                })}
              </div>
            </section>
          ))
        })()
      )}

      {/* Retired decks — history stays, they just left the active rotation */}
      {(() => {
        const retired = (decks.data ?? []).filter(
          (d) =>
            d.retiredAt &&
            deckMatches(d) &&
            (!playerFilter || sectionKeyOf(d) === playerFilter),
        )
        if (!retired.length) return null
        return (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Archive className="h-4 w-4" /> Retired
              <span className="font-normal">— out of the rotation, history kept</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {retired.map((d) => (
                <DeckCard key={d.id} deck={d} />
              ))}
            </div>
          </section>
        )
      })()}
    </div>
  )
}
