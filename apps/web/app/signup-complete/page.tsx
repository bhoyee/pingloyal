'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicGet, ApiError } from '@/lib/api';

interface SignupStatusResponse {
  status: 'awaiting_verification' | 'awaiting_payment' | 'expired' | 'completed';
  accessToken?: string;
  refreshToken?: string;
}

export default function SignupCompletePage() {
  const router = useRouter();
  const params = useSearchParams();
  const signupToken = params.get('token') ?? '';

  const [phase, setPhase] = useState<'polling' | 'expired' | 'error' | 'no-session'>(
    'polling',
  );

  useEffect(() => {
    if (!signupToken) {
      setPhase('error');
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 20 × 3s = 60s — webhook delivery can lag a few seconds
    let interval: ReturnType<typeof setInterval>;

    const check = async () => {
      try {
        const res = await publicGet<SignupStatusResponse>(
          `/api/v1/signup/${signupToken}/status`,
        );
        if (res.status === 'completed' && res.accessToken) {
          clearInterval(interval);
          localStorage.setItem('access_token', res.accessToken);
          if (res.refreshToken) {
            localStorage.setItem('refresh_token', res.refreshToken);
          }
          router.replace('/onboarding');
          return;
        }
        if (res.status === 'expired') {
          clearInterval(interval);
          setPhase('expired');
          return;
        }
      } catch (err) {
        // A 403 means the signup_session cookie is missing or doesn't match
        // this token — e.g. the page was opened in a different browser/tab
        // than the one used to register, or cookies were cleared. Polling
        // again will never succeed in that case, so stop immediately
        // instead of burning the full 60s timeout on a doomed retry loop.
        if (err instanceof ApiError && err.status === 403) {
          clearInterval(interval);
          setPhase('no-session');
          return;
        }
        // otherwise a transient network hiccup — keep polling until MAX_ATTEMPTS
      }
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
        setPhase('error');
      }
    };

    void check();
    interval = setInterval(() => void check(), 3000);
    return () => clearInterval(interval);
  }, [signupToken, router]);

  if (phase === 'no-session') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="text-xl font-bold text-slate-900">
          We can&apos;t verify this signup in this browser
        </h1>
        <p className="max-w-sm text-sm text-slate-600">
          This link only works in the same browser tab you used to register —
          for security, we don&apos;t trust the link alone. If you completed
          payment, your account may already be active.
        </p>
        <a
          href="/login"
          className="mt-2 rounded-xl bg-[#0F1E35] px-6 py-3 font-semibold text-white hover:bg-[#1a3050]"
        >
          Try logging in →
        </a>
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-4xl">⏳</p>
        <h1 className="text-xl font-bold text-slate-900">
          This signup session has expired
        </h1>
        <p className="max-w-sm text-sm text-slate-600">
          If you already completed this signup, your account is likely
          active — try logging in. Otherwise, if you were charged, your card
          will be automatically refunded and you can start over.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/login"
            className="rounded-xl bg-[#0F1E35] px-6 py-3 font-semibold text-white hover:bg-[#1a3050]"
          >
            Try logging in →
          </a>
          <a
            href="/register"
            className="rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Start over →
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-4xl">⚠️</p>
        <h1 className="text-xl font-bold text-slate-900">
          Still confirming your payment
        </h1>
        <p className="max-w-sm text-sm text-slate-600">
          This is taking longer than usual. If you completed payment, your
          account will activate shortly — try refreshing this page in a
          minute.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 rounded-xl bg-[#0F1E35] px-6 py-3 font-semibold text-white hover:bg-[#1a3050]"
        >
          Refresh →
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      <p className="text-slate-600">Confirming your payment…</p>
    </div>
  );
}
