import { QueryClient, QueryCache } from '@tanstack/react-query'
import { clearToken } from './auth'

// If any query fails with 401 (token missing/expired), drop the token and send
// the user back to login.
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      if ((error as { status?: number })?.status === 401) {
        clearToken()
        if (
          typeof window !== 'undefined' &&
          window.location.pathname.startsWith('/app')
        ) {
          window.location.href = '/login'
        }
      }
    },
  }),
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
})
