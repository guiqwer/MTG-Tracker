import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { queryClient } from './lib/query'
import { Layout } from './components/layout'
import { LandingPage } from './pages/landing'
import { LoginPage } from './pages/login'
import { SignupPage } from './pages/signup'
import { DashboardPage } from './pages/dashboard'
import { PlayersPage } from './pages/players'
import { DecksPage } from './pages/decks'
import { MatchesPage } from './pages/matches'
import { MatchDetailPage } from './pages/match-detail'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* App (top-nav layout) */}
          <Route path="/app" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="decks" element={<DecksPage />} />
            <Route path="matches" element={<MatchesPage />} />
            <Route path="matches/:id" element={<MatchDetailPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster
          theme="light"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ style: { borderRadius: '0.6rem' } }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
