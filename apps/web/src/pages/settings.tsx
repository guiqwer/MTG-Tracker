import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CircleUserRound, KeyRound, Mail, Settings as SettingsIcon } from 'lucide-react'
import { api } from '@/lib/eden'
import { cn } from '@/lib/utils'
import { useMe } from '@/lib/me'
import { Avatar } from '@/components/ui/avatar'
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

const SWATCHES = [
  '#7c3aed', '#2563eb', '#0ea5e9', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
]

const selectCls =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function SettingsPage() {
  const qc = useQueryClient()
  const me = useMe()

  // Profile customization — initialized from /me once it loads.
  const [avatarColor, setAvatarColor] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [featuredDeckId, setFeaturedDeckId] = useState('')
  useEffect(() => {
    if (me.data) {
      setAvatarColor(me.data.avatarColor ?? null)
      setBio(me.data.bio ?? '')
      setFeaturedDeckId(me.data.featuredDeckId ?? '')
    }
  }, [me.data])

  // Candidate featured decks come from the caller's own profile.
  const myProfile = useQuery({
    queryKey: ['profile', me.data?.username],
    enabled: !!me.data?.username,
    queryFn: async () => {
      const { data, error } = await api.profiles({ username: me.data!.username }).get()
      if (error) throw error
      return data && 'error' in data
        ? null
        : (data as unknown as { decks: { id: string; name: string }[] })
    },
  })

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.auth.profile.patch({
        avatarColor,
        bio: bio.trim() || null,
        featuredDeckId: featuredDeckId || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Profile updated')
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['players'] })
    },
    onError: (err) => toast.error(readError(err, 'Could not update the profile')),
  })

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

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleUserRound className="h-4 w-4 text-primary" /> Profile
          </CardTitle>
          <CardDescription>How you appear to people who share a group with you.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              saveProfile.mutate()
            }}
          >
            <div className="grid gap-1.5">
              <Label>Avatar color</Label>
              <div className="flex items-center gap-3">
                <Avatar name={me.data?.username ?? '?'} color={avatarColor} size={38} />
                <div className="flex items-center gap-1.5">
                  {SWATCHES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAvatarColor(avatarColor === s ? null : s)}
                      title={s}
                      className={cn(
                        'h-7 w-7 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-card transition',
                        avatarColor === s ? 'ring-ring' : 'ring-transparent hover:ring-border',
                      )}
                      style={{ background: s }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bio">Bio</Label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                maxLength={240}
                placeholder="Mono-red enjoyer. Sol Ring turn one, every game."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="featured">Signature deck</Label>
              <select
                id="featured"
                value={featuredDeckId}
                onChange={(e) => setFeaturedDeckId(e.target.value)}
                className={selectCls}
              >
                <option value="">None</option>
                {myProfile.data?.decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Its commander art becomes your profile banner.
              </p>
            </div>
            <Button type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
