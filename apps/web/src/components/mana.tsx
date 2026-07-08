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
