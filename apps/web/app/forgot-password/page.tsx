'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { publicPost, ApiError } from '@/lib/api';

interface ForgotPasswordResponse {
  message: string;
  devCode?: string;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await publicPost<ForgotPasswordResponse>(
        '/api/v1/auth/forgot-password',
        { email },
      );
      const params = new URLSearchParams({ email });
      if (res.devCode) params.set('devCode', res.devCode);
      router.push(`/reset-password?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A1628]">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path
                  d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M7 11l2.5 2.5 5.5-5.5"
                  stroke="#0DC56A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-2xl font-bold text-[#0A1628]">PingLoyal</span>
          </div>
          <h1 className="text-xl font-bold text-[#0A1628]">Forgot your password?</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your account email and we&apos;ll send a reset code.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@yourbusiness.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0F1E35] py-2.5 text-sm font-semibold text-white hover:bg-[#1a3050] disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Remembered your password?{' '}
            <a href="/login" className="font-medium text-[#0F1E35] hover:underline">
              Back to sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
