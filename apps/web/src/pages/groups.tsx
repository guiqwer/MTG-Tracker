import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Crown, LogIn, Plus, Users } from 'lucide-react'
import { api } from '@/lib/eden'
import { PageHeader } from '@/components/page-header'
import { InviteCode } from '@/components/invite-code'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'

export function GroupsPage() {
  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await api.groups.get()
      if (error) throw error
      return data
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Your groups" subtitle="Playgroups you've created or joined." icon={Users}>
        <Link to="/app/groups/join">
          <Button variant="outline">
            <LogIn /> Join
          </Button>
        </Link>
        <Link to="/app/groups/new">
          <Button>
            <Plus /> Create
          </Button>
        </Link>
      </PageHeader>

      {groups.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-xl" />
          ))}
        </div>
      ) : !groups.data?.length ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a playgroup and share its invite code, or join one a friend set up."
          action={
            <div className="flex gap-2">
              <Link to="/app/groups/join">
                <Button variant="outline">
                  <LogIn /> Join a group
                </Button>
              </Link>
              <Link to="/app/groups/new">
                <Button>
                  <Plus /> Create a group
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.data.map((g) => (
            <Card key={g.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/app/groups/${g.id}`}
                        className="truncate font-semibold hover:text-primary hover:underline"
                      >
                        {g.name}
                      </Link>
                      {g.role === 'OWNER' && (
                        <Badge variant="gold">
                          <Crown className="h-3 w-3" /> Owner
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  <Link
                    to={`/app/groups/${g.id}`}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    title="Open group"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Invite</span>
                  <InviteCode code={g.inviteCode} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
