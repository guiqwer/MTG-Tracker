import { Link } from 'react-router-dom'
import { Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { ColorIdentity } from '@/components/mana'

export interface DeckCardData {
  id: string
  name: string
  colorIdentity: string[]
  powerLevel: number | null
  bracket: number | null
  archetype: string | null
  commander: { name: string; artCropUrl: string | null } | null
  // Group decks are owned by a Player; imported personal decks by a User.
  owner: { name: string; avatarColor: string | null } | null
  user?: { username: string } | null
  _count: { participations: number }
  cardCount?: number // total cards (sum of quantities), set by the list endpoints
}

export function DeckCard({
  deck,
  onDelete,
}: {
  deck: DeckCardData
  onDelete?: (id: string) => void
}) {
  const art = deck.commander?.artCropUrl
  const games = deck._count.participations
  const cardCount = deck.cardCount ?? 0
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <Link to={`/app/decks/${deck.id}`} className="block">
        <div className="relative h-32 overflow-hidden">
          {art ? (
            <img
              src={art}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-card">
              <ColorIdentity colors={deck.colorIdentity} className="text-2xl opacity-40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          <div className="absolute left-2.5 top-2.5 flex gap-1.5">
            {deck.powerLevel != null && (
              <Badge className="border-transparent bg-black/55 text-white backdrop-blur">
                PL {deck.powerLevel}
              </Badge>
            )}
            {deck.bracket != null && (
              <Badge variant="warning" className="backdrop-blur">
                B{deck.bracket}
              </Badge>
            )}
            {cardCount > 0 && (
              <Badge className="border-transparent bg-black/55 text-white backdrop-blur">
                {cardCount} cards
              </Badge>
            )}
          </div>
          <div className="absolute right-2.5 top-2.5 text-lg drop-shadow-md">
            <ColorIdentity colors={deck.colorIdentity} />
          </div>
        </div>
      </Link>
      <div className="p-3.5 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/app/decks/${deck.id}`} className="hover:text-primary">
              <h3 className="truncate font-semibold leading-tight">{deck.name}</h3>
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {deck.commander?.name ?? 'No commander'}
            </p>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => onDelete(deck.id)}
              title="Remove deck"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
        {deck.archetype && (
          <Badge variant="outline" className="mt-2">
            {deck.archetype}
          </Badge>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {deck.owner ? (
              <>
                <Avatar name={deck.owner.name} color={deck.owner.avatarColor} size={20} />
                <span className="truncate">{deck.owner.name}</span>
              </>
            ) : (
              <>
                <User className="h-3.5 w-3.5" />
                <span className="truncate">{deck.user?.username ?? 'Personal deck'}</span>
              </>
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            {games} {games === 1 ? 'game' : 'games'}
          </span>
        </div>
      </div>
    </div>
  )
}
