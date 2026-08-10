'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicPost, ApiError } from '@/lib/api';

interface VerifyResponse {
  verified: true;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const signupToken = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const devCode = params.get('devCode');

  const [code, setCode] = useState(devCode ?? '');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleVerify(e: { preventDefault(): void }) {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await publicPost<VerifyResponse>('/api/v1/signup/verify-email', {
        signupToken,
        code: code.trim(),
      });
      router.replace(`/select-plan?token=${encodeURIComponent(signupToken)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setSuccessMsg('');
    try {
      await publicPost('/api/v1/signup/resend-code', { signupToken });
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                stroke="#0DC56A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0A1628]">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We sent a 6-digit code to
            {email ? (
              <span className="block font-medium text-slate-700">{email}</span>
            ) : (
              ' your email address'
            )}
          </p>
        </div>

        <form
          onSubmit={(e) => void handleVerify(e)}
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
              <label
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Verification code
              </label>
              <input
                id="code"
                ref={inputRef}
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
              {loading ? 'Verifying…' : 'Verify email'}
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
          <a href="/register" className="font-medium text-[#0A1628] hover:underline">
            Start over
          </a>
        </p>
      </div>
    </div>
  );
}
