import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, Plus, Users } from 'lucide-react'
import { useActiveGroup } from '@/lib/group'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'

// Data pages only make sense inside a group — gate them until the user has one.
export function RequireGroup({ children }: { children: ReactNode }) {
  const { loading, activeGroup } = useActiveGroup()

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!activeGroup) {
    return (
      <EmptyState
        icon={Users}
        title="You're not in a group yet"
        description="Everything here — players, decks, matches and stats — lives inside a group. Create one for your pod or join a friend's with an invite code."
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
    )
  }

  return <>{children}</>
}
