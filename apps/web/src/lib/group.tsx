import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './eden'

// The "active group" — every data page (dashboard/players/decks/matches) shows
// only this group's table. Persisted per browser so it survives reloads.
const KEY = 'mtg_group'

export interface GroupSummary {
  id: string
  name: string
  inviteCode: string
  role: 'OWNER' | 'MEMBER'
  memberCount: number
}

interface GroupContextValue {
  groups: GroupSummary[]
  loading: boolean
  activeGroup: GroupSummary | null
  setActiveGroup: (id: string) => void
}

const GroupContext = createContext<GroupContextValue | null>(null)

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await api.groups.get()
      if (error) throw error
      return data as unknown as GroupSummary[]
    },
  })
}

export function GroupProvider({ children }: { children: ReactNode }) {
  const groups = useGroups()
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  })

  const list = groups.data ?? []
  // Fall back to the first group when the stored one is gone (left/deleted).
  const activeGroup = list.find((g) => g.id === activeId) ?? list[0] ?? null

  useEffect(() => {
    try {
      if (activeGroup) localStorage.setItem(KEY, activeGroup.id)
      else if (groups.data) localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, [activeGroup, groups.data])

  return (
    <GroupContext.Provider
      value={{
        groups: list,
        loading: groups.isLoading,
        activeGroup,
        setActiveGroup: setActiveId,
      }}
    >
      {children}
    </GroupContext.Provider>
  )
}

export function useActiveGroup(): GroupContextValue {
  const ctx = useContext(GroupContext)
  if (!ctx) throw new Error('useActiveGroup must be used within a GroupProvider')
  return ctx
}
