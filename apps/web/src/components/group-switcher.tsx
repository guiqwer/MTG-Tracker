import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronsUpDown, Plus, Users } from 'lucide-react'
import { useActiveGroup } from '@/lib/group'
import { cn } from '@/lib/utils'

// Picks which playgroup ("table") the app is showing. Sits in the top nav.
export function GroupSwitcher() {
  const { groups, loading, activeGroup, setActiveGroup } = useActiveGroup()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (loading) return null
  if (!activeGroup) {
    return (
      <Link
        to="/app/groups"
        className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Users className="h-4 w-4" />
        <span className="hidden sm:inline">Join a group</span>
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[11rem] items-center gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch group"
      >
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="hidden truncate sm:inline">{activeGroup.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="px-3 pb-1 pt-2.5 text-xs font-semibold text-muted-foreground">
            Your groups
          </div>
          <div className="p-1.5 pt-0">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="option"
                aria-selected={g.id === activeGroup.id}
                onClick={() => {
                  setActiveGroup(g.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-accent',
                  g.id === activeGroup.id ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="text-xs text-muted-foreground">{g.memberCount}</span>
                {g.id === activeGroup.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
          <div className="border-t border-border/70 p-1.5">
            <Link
              to="/app/groups"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Manage groups
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
