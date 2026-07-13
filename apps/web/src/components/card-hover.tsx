import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Full-card hover preview (Moxfield-style), shared by the deck view and the
// match screens. Fixed-position beside the hovered element, clamped to the
// viewport — never clipped at the page bottom and never shifts the layout.
// Standard card ratio 488x680 at 240px wide.
const PREVIEW_W = 240
const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488)

export function CardHover({
  image,
  name,
  as: Tag = 'span',
  className,
  children,
}: {
  image: string | null | undefined
  name: string
  as?: 'span' | 'div' | 'li'
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Scrolling doesn't fire mouseleave, so a preview could linger with stale
  // coordinates — dismiss it on any scroll while visible.
  useEffect(() => {
    if (!pos) return
    const hide = () => setPos(null)
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', hide, { capture: true })
  }, [pos])

  const show = () => {
    if (!image || !ref.current) return
    if (!window.matchMedia('(hover: hover)').matches) return // skip touch
    const r = ref.current.getBoundingClientRect()
    let left = r.right + 10
    if (left + PREVIEW_W > window.innerWidth - 8) left = r.left - PREVIEW_W - 10
    if (left < 8) left = 8
    const top = Math.max(
      8,
      Math.min(r.top + r.height / 2 - PREVIEW_H / 2, window.innerHeight - PREVIEW_H - 8),
    )
    setPos({ top, left })
  }

  return (
    <Tag
      ref={ref as never}
      className={className}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        image &&
        // Portal to <body>: position:fixed must not be re-anchored by any
        // transformed ancestor (e.g. the page-enter animation wrapper).
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ top: pos.top, left: pos.left, width: PREVIEW_W, height: PREVIEW_H }}
          >
            <img
              src={image}
              alt={name}
              width={PREVIEW_W}
              height={PREVIEW_H}
              className="h-full w-full rounded-xl shadow-2xl"
              loading="lazy"
            />
          </div>,
          document.body,
        )}
    </Tag>
  )
}
