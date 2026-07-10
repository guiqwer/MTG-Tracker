import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronUp, Lightbulb, Send, Trash2 } from 'lucide-react'
import { api } from '@/lib/eden'
import { useMe } from '@/lib/me'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar } from '@/components/ui/avatar'

interface Idea {
  id: string
  title: string
  body: string | null
  createdAt: string
  user: { id: string; username: string; avatarColor: string | null }
  _count: { votes: number }
  voted: boolean
}

export function IdeasPage() {
  const qc = useQueryClient()
  const me = useMe()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const ideas = useQuery({
    queryKey: ['ideas'],
    queryFn: async () => {
      const { data, error } = await api.ideas.get()
      if (error) throw error
      return (data && 'error' in data ? [] : data) as unknown as Idea[]
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.ideas.post({
        title: title.trim(),
        body: body.trim() || undefined,
      })
      if (error) throw error
      return data && 'error' in data ? null : data
    },
    onSuccess: () => {
      toast.success('Idea posted — thanks!')
      setTitle('')
      setBody('')
      qc.invalidateQueries({ queryKey: ['ideas'] })
    },
    onError: () => toast.error('Could not post the idea'),
  })

  const vote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.ideas({ id }).vote.post()
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ideas'] }),
    onError: () => toast.error('Could not register the vote'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.ideas({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Idea removed')
      qc.invalidateQueries({ queryKey: ['ideas'] })
    },
    onError: () => toast.error('Could not remove the idea'),
  })

  const list = ideas.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Idea board"
        subtitle="Suggest improvements and vote on what should come next."
        icon={Lightbulb}
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-1.5">
            <Label>Your idea</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Achievements for the playgroup"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Details (optional)</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What problem does it solve? How do you picture it working?"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={title.trim().length < 3 || create.isPending}
          >
            <Send /> Post idea
          </Button>
        </CardContent>
      </Card>

      {ideas.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No ideas yet"
          description="Be the first — every feature on this tracker started as somebody's idea."
        />
      ) : (
        <ol className="space-y-2">
          {list.map((idea) => (
            <li
              key={idea.id}
              className="group flex items-start gap-3 rounded-xl border bg-card p-3.5"
            >
              <button
                type="button"
                onClick={() => vote.mutate(idea.id)}
                className={cn(
                  'flex w-11 shrink-0 cursor-pointer flex-col items-center rounded-lg border py-1.5 transition-colors',
                  idea.voted
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                title={idea.voted ? 'Remove your vote' : 'Upvote'}
              >
                <ChevronUp className="h-4 w-4" />
                <span className="text-sm font-semibold">{idea._count.votes}</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{idea.title}</p>
                {idea.body && (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                    {idea.body}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Avatar name={idea.user.username} color={idea.user.avatarColor} size={16} />
                  <span>{idea.user.username}</span>
                  <span>
                    ·{' '}
                    {new Date(idea.createdAt).toLocaleDateString('en-US', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              {idea.user.id === me.data?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => remove.mutate(idea.id)}
                  title="Delete idea"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
