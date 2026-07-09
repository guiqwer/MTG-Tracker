import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// A click-to-copy invite code chip. Shared by the groups list + group detail.
export function InviteCode({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Invite code copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy — select it and copy manually')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy invite code"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs font-semibold tracking-wider transition-colors hover:border-primary/40 hover:bg-primary/5',
        className,
      )}
    >
      {code}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  )
}
