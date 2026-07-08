// The accent rotates through the five colors of Magic on each visit (see the
// inline script in index.html, which sets `data-mtg` on <html>).
export const MTG_COLORS = ['white', 'blue', 'black', 'red', 'green'] as const
export type MtgColor = (typeof MTG_COLORS)[number]

export function currentAccent(): MtgColor {
  const c = document.documentElement.getAttribute('data-mtg')
  return c && (MTG_COLORS as readonly string[]).includes(c) ? (c as MtgColor) : 'white'
}

// Backdrop art per color (served from apps/web/public/mtg/).
export const ACCENT_IMAGE: Record<MtgColor, string> = {
  white: '/mtg/white.avif',
  blue: '/mtg/blue.webp',
  black: '/mtg/black.webp',
  red: '/mtg/red.jpg',
  green: '/mtg/green.jpg',
}
