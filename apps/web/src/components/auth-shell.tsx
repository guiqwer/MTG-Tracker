import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { LogoMark } from '@/components/logo'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <LogoMark />
          </div>
          <span className="text-lg font-bold tracking-tight">
            Magic Match <span className="font-medium text-muted-foreground">Tracker</span>
          </span>
        </div>
        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-5">{children}</div>
            <div className="mt-5 border-t border-border/60 pt-4 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
