'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicPost, ApiError } from '@/lib/api';

function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const devCode = params.get('devCode');

  const [code, setCode] = useState(devCode ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeInputRef.current?.focus();
  }, []);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');

    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await publicPost('/api/v1/auth/reset-password', {
        email,
        code: code.trim(),
        newPassword,
      });
      router.replace('/login?reset=success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setSuccessMsg('');
    try {
      await publicPost('/api/v1/auth/forgot-password', { email });
      setSuccessMsg('A new code has been sent to your email');
    } catch {
      setError('Could not resend — please wait a moment and try again');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0A1628]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v2"
                stroke="#0DC56A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0A1628]">Reset your password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter the 6-digit code sent to
            {email ? (
              <span className="block font-medium text-slate-700">{email}</span>
            ) : (
              ' your email address'
            )}
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="space-y-4">
            {devCode && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-700">Dev mode</p>
                <p className="text-sm text-amber-800">
                  Email not configured — your code is: <span className="font-mono font-bold">{devCode}</span>
                </p>
              </div>
            )}

            <div>
              <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-700">
                Reset code
              </label>
              <input
                id="code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
                placeholder="000000"
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center font-mono text-2xl tracking-widest text-slate-900 placeholder:text-slate-300 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-slate-700">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-slate-700">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            {successMsg && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                {successMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg bg-[#0DC56A] py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#0ab55e] disabled:opacity-50"
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Didn&apos;t receive it?{' '}
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resending}
                className="font-medium text-[#0A1628] hover:underline disabled:opacity-50"
              >
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </p>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Wrong account?{' '}
          <a href="/forgot-password" className="font-medium text-[#0A1628] hover:underline">
            Start over
          </a>
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><ResetPasswordPage /></Suspense>;
}
