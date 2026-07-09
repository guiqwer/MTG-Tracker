import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, LogIn } from 'lucide-react'
import { api } from '@/lib/eden'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function JoinGroupPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [code, setCode] = useState('')

  const join = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.groups.join.post({ inviteCode: code.trim() })
      if (error) throw error
      // Narrow off the error-body union to the joined-group shape.
      return data && 'id' in data ? data : null
    },
    onSuccess: (g) => {
      toast.success(g?.name ? `Joined "${g.name}"` : 'Joined the group')
      qc.invalidateQueries({ queryKey: ['groups'] })
      if (g?.id) navigate(`/app/groups/${g.id}`)
      else navigate('/app/groups')
    },
    onError: (err) => {
      const msg =
        (err as { value?: { error_description?: string } })?.value?.error_description ??
        'Could not join — check the invite code'
      toast.error(msg)
    },
  })

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        to="/app/groups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Groups
      </Link>
      <PageHeader title="Join a group" subtitle="Enter the invite code a friend shared." icon={LogIn} />
      <Card>
        <CardContent className="p-6">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) join.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="invite-code">Invite code</Label>
              <Input
                id="invite-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. DEMOPOD"
                autoComplete="off"
                autoCapitalize="characters"
                className="font-mono tracking-wider"
                maxLength={40}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={join.isPending || !code.trim()}>
              {join.isPending ? 'Joining…' : 'Join group'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
