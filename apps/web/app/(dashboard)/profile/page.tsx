'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface ChangeEmailResponse {
  message: string;
  devCode?: string;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  fullName: z.string().min(2, 'Name is too short').max(255),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;

const emailSchema = z.object({
  newEmail: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Your password is required'),
});
type EmailFormValues = z.infer<typeof emailSchema>;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '' },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { newEmail: '', password: '' },
  });

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    api
      .get<Profile>('/api/v1/auth/me')
      .then((p) => {
        setProfile(p);
        profileForm.reset({ fullName: p.fullName });
      })
      .catch(() => null)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSaveProfile(values: ProfileFormValues) {
    try {
      const updated = await api.patch<Profile>('/api/v1/auth/me', values);
      setProfile(updated);
      showToast('Profile updated');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to update profile');
    }
  }

  async function onChangePassword(values: PasswordFormValues) {
    try {
      await api.post('/api/v1/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password changed successfully');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to change password');
    }
  }

  async function onChangeEmail(values: EmailFormValues) {
    try {
      const res = await api.post<ChangeEmailResponse>('/api/v1/auth/change-email', values);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      const params = new URLSearchParams({ email: values.newEmail });
      if (res.devCode) params.set('devCode', res.devCode);
      router.push(`/verify-email?${params.toString()}`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to change email');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-bold text-slate-900">Profile</h1>
          <p className="text-sm text-slate-500">
            Manage your account details, email, and password.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {/* ── Account details ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>Information about your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Role</p>
                <p className="text-sm font-medium capitalize text-slate-900">{profile?.role}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Email status
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {profile?.emailVerified ? (
                    <span className="text-[#0DC56A]">Verified</span>
                  ) : (
                    <span className="text-amber-600">Unverified</span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Member since
                </p>
                <p className="text-sm font-medium text-slate-900">{formatDate(profile?.createdAt ?? null)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Last login
                </p>
                <p className="text-sm font-medium text-slate-900">{formatDate(profile?.lastLoginAt ?? null)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Personal info ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Your name as it appears across PingLoyal.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  {...profileForm.register('fullName')}
                  error={!!profileForm.formState.errors.fullName}
                />
                {profileForm.formState.errors.fullName && (
                  <p className="text-xs text-red-600">
                    {profileForm.formState.errors.fullName.message}
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={profileForm.handleSubmit(onSaveProfile)}
                loading={profileForm.formState.isSubmitting}
              >
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Change email ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Email Address</CardTitle>
            <CardDescription>
              Current email: <span className="font-medium text-slate-700">{profile?.email}</span>.
              Changing your email requires re-verification — you&apos;ll be signed out and asked
              to verify the new address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="newEmail">New email address</Label>
                <Input
                  id="newEmail"
                  type="email"
                  {...emailForm.register('newEmail')}
                  error={!!emailForm.formState.errors.newEmail}
                />
                {emailForm.formState.errors.newEmail && (
                  <p className="text-xs text-red-600">
                    {emailForm.formState.errors.newEmail.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emailPassword">Current password</Label>
                <Input
                  id="emailPassword"
                  type="password"
                  autoComplete="current-password"
                  {...emailForm.register('password')}
                  error={!!emailForm.formState.errors.password}
                />
                {emailForm.formState.errors.password && (
                  <p className="text-xs text-red-600">
                    {emailForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={emailForm.handleSubmit(onChangeEmail)}
                loading={emailForm.formState.isSubmitting}
              >
                Change email
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Change password ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Update the password used to sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...passwordForm.register('currentPassword')}
                  error={!!passwordForm.formState.errors.currentPassword}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-red-600">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('newPassword')}
                  error={!!passwordForm.formState.errors.newPassword}
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-red-600">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('confirmPassword')}
                  error={!!passwordForm.formState.errors.confirmPassword}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-red-600">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={passwordForm.handleSubmit(onChangePassword)}
                loading={passwordForm.formState.isSubmitting}
              >
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 mx-auto max-w-sm rounded-xl bg-gray-800 px-4 py-3 text-center text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
