import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRound, Mail, Settings as SettingsIcon } from 'lucide-react'
import { api } from '@/lib/eden'
import { useMe } from '@/lib/me'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function readError(err: unknown, fallback: string): string {
  return (
    (err as { value?: { error_description?: string } })?.value?.error_description ?? fallback
  )
}

export function SettingsPage() {
  const qc = useQueryClient()
  const me = useMe()

  const [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changeEmail = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.auth.email.patch({
        email: email.trim(),
        currentPassword: emailPassword,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Email updated')
      setEmail('')
      setEmailPassword('')
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (err) => toast.error(readError(err, 'Could not update email')),
  })

  const changePassword = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.auth.password.patch({
        currentPassword,
        newPassword,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err) => toast.error(readError(err, 'Could not update password')),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" subtitle="Manage your account." icon={SettingsIcon} />

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" /> Email
          </CardTitle>
          <CardDescription>Current: {me.data?.email ?? '…'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim() && emailPassword) changeEmail.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="new-email">New email</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email-password">Current password</Label>
              <Input
                id="email-password"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              disabled={changeEmail.isPending || !email.trim() || !emailPassword}
            >
              {changeEmail.isPending ? 'Saving…' : 'Update email'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Password
          </CardTitle>
          <CardDescription>Use at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (newPassword.length < 8) {
                toast.error('New password must be at least 8 characters')
                return
              }
              if (newPassword !== confirmPassword) {
                toast.error('Passwords do not match')
                return
              }
              if (!currentPassword) return
              changePassword.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              disabled={
                changePassword.isPending ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
            >
              {changePassword.isPending ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
