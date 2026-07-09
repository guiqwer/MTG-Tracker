import { cn } from '@/lib/utils'

// Authentic MTG mana symbols via the `mana-font` project. `ms-cost` renders the
// familiar circular colored pip used across Moxfield, EDHREC, etc.
const ORDER = ['W', 'U', 'B', 'R', 'G', 'C']

export function ColorIdentity({
  colors,
  className,
}: {
  colors: string[]
  className?: string
}) {
  if (!colors?.length) {
    return <i className={cn('ms ms-c ms-cost', className)} title="Colorless" />
  }
  const sorted = [...colors].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {sorted.map((c) => (
        <i key={c} className={`ms ms-${c.toLowerCase()} ms-cost`} title={c} />
      ))}
    </span>
  )
}

// Render a mana cost string like "{2}{U}{U}" as pips. Hybrid ({W/U} → ms-wu)
// and phyrexian ({G/P} → ms-gp) symbols map by dropping the slash.
export function ManaCost({ cost, className }: { cost: string | null; className?: string }) {
  const tokens = cost?.match(/\{[^}]+\}/g)
  if (!tokens?.length) return null
  return (
    <span className={cn('inline-flex items-center gap-[1px]', className)}>
      {tokens.map((t, i) => (
        <i
          key={i}
          className={`ms ms-${t.slice(1, -1).toLowerCase().replace(/\//g, '')} ms-cost`}
        />
      ))}
    </span>
  )
}
