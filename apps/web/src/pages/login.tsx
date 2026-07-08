import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/lib/eden'
import { setToken } from '@/lib/auth'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await api.auth.login.post({ identifier, password })
      if (error || !data?.token) throw error ?? new Error('no token')
      setToken(data.token)
      navigate('/app')
    } catch {
      toast.error('Invalid username/email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your playgroup."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-1.5">
          <Label htmlFor="identifier">Username or email</Label>
          <Input
            id="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="demo"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !identifier || !password}>
          {loading ? 'Signing in…' : 'Log in'}
        </Button>
      </form>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Try the demo — <span className="font-medium">demo</span> /{' '}
        <span className="font-medium">password12</span>
      </p>
    </AuthShell>
  )
}
