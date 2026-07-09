import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronLeft, Crown, DoorOpen, Trash2, Users } from 'lucide-react'
import { api } from '@/lib/eden'
import { PageHeader } from '@/components/page-header'
import { InviteCode } from '@/components/invite-code'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

// The shape the /groups/:id handler returns on success. Declared explicitly so
// the component works off a clean type rather than Eden's status-body union.
interface GroupDetail {
  id: string
  name: string
  inviteCode: string
  myRole: 'OWNER' | 'MEMBER'
  createdAt: string
  members: Array<{
    userId: string
    username: string
    role: 'OWNER' | 'MEMBER'
    joinedAt: string
    isYou: boolean
  }>
}

export function GroupDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const group = useQuery({
    queryKey: ['group', id],
    queryFn: async (): Promise<GroupDetail | null> => {
      const { data, error } = await api.groups({ id }).get()
      if (error) throw error
      // Narrow off the error-body union; the shape is the contract we defined.
      return data && 'members' in data ? (data as unknown as GroupDetail) : null
    },
  })

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await api.groups({ id }).leave.delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('You left the group')
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate('/app/groups')
    },
    onError: () => toast.error('Could not leave the group'),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.groups({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Group deleted')
      qc.invalidateQueries({ queryKey: ['groups'] })
      navigate('/app/groups')
    },
    onError: () => toast.error('Could not delete the group'),
  })

  const g = group.data ?? undefined
  const isOwner = g?.myRole === 'OWNER'

  return (
    <div className="space-y-6">
      <Link
        to="/app/groups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Groups
      </Link>

      {group.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !g ? (
        <p className="text-sm text-muted-foreground">Group not found.</p>
      ) : (
        <>
          <PageHeader
            title={g.name}
            subtitle={`${g.members.length} ${g.members.length === 1 ? 'member' : 'members'}`}
            icon={Users}
          >
            {isOwner ? (
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirm(`Delete "${g.name}"? This removes it for everyone.`)) remove.mutate()
                }}
                disabled={remove.isPending}
              >
                <Trash2 /> Delete
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm(`Leave "${g.name}"?`)) leave.mutate()
                }}
                disabled={leave.isPending}
              >
                <DoorOpen /> Leave
              </Button>
            )}
          </PageHeader>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-medium">Invite code</div>
                <p className="text-xs text-muted-foreground">Share this so others can join.</p>
              </div>
              <InviteCode code={g.inviteCode} className="text-sm" />
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">Members</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.members.map((m) => (
                <Card key={m.userId}>
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <Avatar name={m.username} color={null} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{m.username}</span>
                        {m.isYou && <span className="text-xs text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Joined{' '}
                        {new Date(m.joinedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                    {m.role === 'OWNER' ? (
                      <Badge variant="gold">
                        <Crown className="h-3 w-3" /> Owner
                      </Badge>
                    ) : (
                      <Badge variant="outline">Member</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
