import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, CircleUserRound, LogOut, Settings, Users, Plus, LogIn } from 'lucide-react'
import { clearToken } from '@/lib/auth'
import { queryClient } from '@/lib/query'
import { useMe } from '@/lib/me'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const items = [
  { to: '/app/groups', label: 'My groups', icon: Users },
  { to: '/app/groups/new', label: 'Create group', icon: Plus },
  { to: '/app/groups/join', label: 'Join group', icon: LogIn },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

// Account dropdown in the top nav — the "user tab". Hand-rolled (the project
// has no Radix), with click-outside + Escape to close.
export function UserMenu() {
  const navigate = useNavigate()
  const me = useMe()
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

  const username = me.data?.username ?? 'Account'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 text-sm font-medium transition-colors hover:bg-accent"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={username} color={me.data?.avatarColor ?? null} size={30} />
        <span className="hidden max-w-[9rem] truncate sm:inline">{username}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border/70 px-3 py-3">
            <div className="truncate text-sm font-semibold">{username}</div>
            {me.data?.email && (
              <div className="truncate text-xs text-muted-foreground">{me.data.email}</div>
            )}
          </div>
          <div className="p-1.5">
            {me.data?.username && (
              <Link
                to={`/app/profile/${me.data.username}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CircleUserRound className="h-4 w-4 shrink-0" />
                My profile
              </Link>
            )}
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-border/70 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                clearToken()
                // Drop all cached data so the next account starts clean.
                queryClient.clear()
                navigate('/login')
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
