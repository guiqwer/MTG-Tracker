import { cn } from '@/lib/utils'

export function WinrateBar({ value, games }: { value: number; games: number }) {
  const pct = Math.round(value * 100)
  const color =
    games === 0
      ? 'bg-muted-foreground/30'
      : pct >= 40
        ? 'bg-success'
        : pct >= 20
          ? 'bg-warning'
          : 'bg-destructive'
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${games ? Math.max(pct, 4) : 0}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums">{pct}%</span>
    </div>
  )
}
