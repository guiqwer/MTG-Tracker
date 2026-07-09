import { currentAccent, type MtgColor } from '@/lib/accent'
import { cn } from '@/lib/utils'

// Mana-font symbol per accent color: sun, water drop, skull, fire, tree.
const SYMBOL: Record<MtgColor, string> = {
  white: 'w',
  blue: 'u',
  black: 'b',
  red: 'r',
  green: 'g',
}

// The brand mark follows the accent of the visit — white shows the sun, black
// the skull, and so on, instead of always the blue drop.
export function LogoMark({ className }: { className?: string }) {
  return <i className={cn(`ms ms-${SYMBOL[currentAccent()]}`, className)} />
}
