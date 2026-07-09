import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, Plus } from 'lucide-react'
import { api } from '@/lib/eden'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CreateGroupPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.groups.post({ name: name.trim() })
      if (error) throw error
      return data
    },
    onSuccess: (g) => {
      toast.success(`Group "${g?.name}" created`)
      qc.invalidateQueries({ queryKey: ['groups'] })
      if (g?.id) navigate(`/app/groups/${g.id}`)
    },
    onError: () => toast.error('Could not create the group'),
  })

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link
        to="/app/groups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Groups
      </Link>
      <PageHeader title="Create a group" subtitle="Start a playgroup and invite your pod." icon={Plus} />
      <Card>
        <CardContent className="p-6">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim().length >= 2) create.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tuesday Night Pod"
                maxLength={60}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;ll get a shareable invite code once it&apos;s created — send it to friends so
              they can join.
            </p>
            <Button type="submit" className="w-full" disabled={create.isPending || name.trim().length < 2}>
              {create.isPending ? 'Creating…' : 'Create group'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
