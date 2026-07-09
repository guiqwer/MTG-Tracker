import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Layers, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GroupProvider } from '@/lib/group'
import { LogoMark } from '@/components/logo'
import { GroupSwitcher } from '@/components/group-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'

const nav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/players', label: 'Players', icon: Users, end: false },
  { to: '/app/decks', label: 'Decks', icon: Layers, end: false },
  { to: '/app/matches', label: 'Matches', icon: Swords, end: false },
]

export function Layout() {
  const location = useLocation()
  return (
    <GroupProvider>
      <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-8">
          <Link to="/app" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <LogoMark />
            </div>
            <span className="hidden text-[15px] font-bold tracking-tight sm:block">
              Magic Match{' '}
              <span className="font-medium text-muted-foreground">Tracker</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors sm:px-3',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <GroupSwitcher />
            <UserMenu />
          </div>
        </div>
      </header>

      <main>
        <div
          key={location.pathname}
          className="page-enter mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10"
        >
          <Outlet />
        </div>
      </main>
      </div>
    </GroupProvider>
  )
}
