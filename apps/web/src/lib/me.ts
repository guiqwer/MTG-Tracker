import { useQuery } from '@tanstack/react-query'
import { api } from './eden'

// The signed-in account (from /auth/me). Used by the user menu and settings.
// Cached generously — identity rarely changes within a session.
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await api.auth.me.get()
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000,
  })
}
