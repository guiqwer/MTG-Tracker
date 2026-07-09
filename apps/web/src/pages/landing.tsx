import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { LogoMark } from '@/components/logo'
import { currentAccent, ACCENT_IMAGE } from '@/lib/accent'

const FEATURES = [
  {
    icon: Search,
    chip: 'bg-primary/10 text-primary',
    title: 'Decks from Scryfall',
    desc: "Search a commander — its art, color identity and details fill in automatically.",
  },
  {
    icon: Trophy,
    chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    title: 'Multiplayer podium',
    desc: 'Not just a winner: full 1st–4th placement per seat, the way Commander actually plays.',
  },
  {
    icon: Activity,
    chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    title: 'Event timeline',
    desc: 'Removals, tutors, board wipes, combos — log every beat with actor, target and card.',
  },
  {
    icon: BarChart3,
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    title: 'Stats & rankings',
    desc: 'Winrates, matchups and averages for players and decks, at a glance.',
  },
]

const STEPS = [
  { n: 1, title: 'Add your playgroup', desc: 'Create players and build their decks straight from Scryfall.' },
  { n: 2, title: 'Log a match', desc: 'Set the seats, the podium and how the game was won.' },
  { n: 3, title: 'Read the table', desc: 'Rankings, timelines and stats update instantly.' },
]

function PublicNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <LogoMark />
          </div>
          <span className="text-[15px] font-bold tracking-tight">
            Magic Match <span className="font-medium text-muted-foreground">Tracker</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Sign up</Button>
          </Link>
        </div>
      </div>
    </header>
  )
}

const MINI_DECKS: Array<[string, string[], string]> = [
  ['Value Engine', ['U', 'B', 'G'], '62%'],
  ['Superfriends', ['W', 'U', 'B', 'G'], '48%'],
  ['Vampires', ['W', 'B', 'R'], '40%'],
]

function HeroPreview() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-primary/30 to-transparent blur-2xl" />
      <div className="relative rotate-1 rounded-2xl border bg-card p-4 shadow-xl shadow-primary/10">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Matches', '128'],
            ['Events', '640'],
            ['Avg', '42m'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-background p-3">
              <div className="text-xl font-bold tabular-nums">{value}</div>
              <div className="text-[11px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border bg-background p-3">
          <div className="mb-2 text-xs font-semibold">Top decks</div>
          {MINI_DECKS.map(([name, colors, wr]) => (
            <div key={name} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="flex-1 truncate">{name}</span>
              <span className="inline-flex gap-0.5">
                {colors.map((c) => (
                  <i key={c} className={`ms ms-${c.toLowerCase()} ms-cost text-[0.7rem]`} />
                ))}
              </span>
              <span className="w-10 text-right text-xs font-semibold text-primary">{wr}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  const backdrop = ACCENT_IMAGE[currentAccent()]
  return (
    <div className="min-h-dvh">
      <PublicNav />

      <div className="relative overflow-hidden">
        {/* accent art backdrop — a subtle complement to the current color */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px]"
        >
          <img
            src={backdrop}
            alt=""
            className="h-full w-full object-cover opacity-[0.30] dark:opacity-[0.22]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/55 to-background" />
        </div>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Commander / EDH
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Track your Commander pod, game after game.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Log matches, build decks straight from Scryfall, capture the whole timeline, and see
            who really runs the table.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup">
              <Button size="lg">Get started free</Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">
                Log in <ArrowRight />
              </Button>
            </Link>
          </div>
        </div>
        <HeroPreview />
      </section>

      {/* Features */}
      <section className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 lg:py-20">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold tracking-tight">Everything your playgroup needs</h2>
            <p className="mt-3 text-muted-foreground">
              Purpose-built for Commander — not a generic score sheet.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', f.chip)}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 lg:py-20">
        <h2 className="max-w-xl text-3xl font-bold tracking-tight">Up and running in minutes</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="border-y border-primary/15 bg-primary/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-8">
          <h2 className="max-w-lg text-3xl font-bold tracking-tight">
            Ready to settle who&apos;s the best in your pod?
          </h2>
          <Link to="/signup">
            <Button size="lg">
              Sign up free <ArrowRight />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
              <LogoMark />
            </div>
            Magic Match Tracker
          </div>
          <p className="text-xs">
            Unofficial fan project — not affiliated with Wizards of the Coast.
          </p>
        </div>
      </footer>
      </div>
    </div>
  )
}
