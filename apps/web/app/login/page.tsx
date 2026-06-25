'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, publicPost, ApiError, type TenantMe } from '@/lib/api';
import { AuthSplitLayout, BrandMark } from '@/components/auth/AuthSplitLayout';

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const resetSuccess = searchParams.get('reset') === 'success';

  async function handleLogin(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await publicPost<LoginResponse>('/api/v1/auth/login', {
        email,
        password,
      });
      localStorage.setItem('access_token', res.accessToken);
      if (res.refreshToken) {
        localStorage.setItem('refresh_token', res.refreshToken);
      }
      // Check onboarding status up front so already-onboarded users go
      // straight to the dashboard instead of bouncing through /onboarding.
      const tenant = await api.get<TenantMe>('/tenants/me').catch(() => null);
      router.replace(tenant?.qrCodeUrl ? '/dashboard' : '/onboarding');
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        router.replace('/');
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        router.replace(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many login attempts. Please wait 15 minutes and try again.');
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect email or password.');
        return;
      }
      if (err instanceof ApiError && (err.status === 503 || err.status === 0)) {
        setError('Unable to reach the server right now. Please check your internet connection and try again.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout>
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 inline-flex lg:hidden" aria-label="PingLoyal home">
          <BrandMark />
        </Link>

        <h1 className="text-2xl font-bold text-[#0A1628]">Welcome back</h1>
        <p className="mt-1.5 text-sm text-slate-500">Sign in to your business dashboard</p>

        <form onSubmit={(e) => void handleLogin(e)} className="mt-8">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@yourbusiness.com"
                className="w-full rounded-lg border border-transparent bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#0A1628]/20 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Password
                </label>
                <a href="/forgot-password" className="text-xs font-semibold text-[#0DC56A] hover:underline">
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-transparent bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#0A1628]/20 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10"
              />
            </div>

            {resetSuccess && !error && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Password reset successfully — sign in with your new password
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0A1628] py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#16294a] disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            New business?{' '}
            <a href="/register" className="font-semibold text-[#0A1628] hover:underline">
              Create an account
            </a>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Cashier login?{' '}
          <a href="/cashier/login" className="underline hover:text-slate-600">
            Go to cashier app
          </a>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
