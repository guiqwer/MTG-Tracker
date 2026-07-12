import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { queryClient } from './lib/query'
import { isAuthenticated } from './lib/auth'
import { useTheme } from './lib/theme'
import { Layout } from './components/layout'
import { RequireGroup } from './components/require-group'
import { LandingPage } from './pages/landing'
import { LoginPage } from './pages/login'
import { SignupPage } from './pages/signup'
import { DashboardPage } from './pages/dashboard'
import { PlayersPage } from './pages/players'
import { DecksPage } from './pages/decks'
import { MatchesPage } from './pages/matches'
import { MatchDetailPage } from './pages/match-detail'
import { DeckDetailPage } from './pages/deck-detail'
import { GroupsPage } from './pages/groups'
import { CreateGroupPage } from './pages/group-new'
import { JoinGroupPage } from './pages/group-join'
import { GroupDetailPage } from './pages/group-detail'
import { SettingsPage } from './pages/settings'
import { ProfilePage } from './pages/profile'
import { IdeasPage } from './pages/ideas'

// Gate the app behind a valid session; otherwise send to login.
function RequireAuth() {
  return isAuthenticated() ? <Layout /> : <Navigate to="/login" replace />
}

// The mirror gate: landing/login/signup make no sense with a session — send
// returning users straight into the app instead of asking them to log in again.
function PublicOnly({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <Navigate to="/app" replace /> : children
}

export function App() {
  const theme = useTheme()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public — with a session they bounce straight to /app */}
          <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />

          {/* App (requires login) */}
          <Route path="/app" element={<RequireAuth />}>
            <Route index element={<RequireGroup><DashboardPage /></RequireGroup>} />
            <Route path="players" element={<RequireGroup><PlayersPage /></RequireGroup>} />
            <Route path="decks" element={<RequireGroup><DecksPage /></RequireGroup>} />
            {/* Personal decks are account-level, so the detail view doesn't need a group */}
            <Route path="decks/:id" element={<DeckDetailPage />} />
            <Route path="matches" element={<RequireGroup><MatchesPage /></RequireGroup>} />
            <Route path="matches/:id" element={<RequireGroup><MatchDetailPage /></RequireGroup>} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/new" element={<CreateGroupPage />} />
            <Route path="groups/join" element={<JoinGroupPage />} />
            <Route path="groups/:id" element={<GroupDetailPage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile/:id" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster
          theme={theme}
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ style: { borderRadius: '0.6rem' } }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
