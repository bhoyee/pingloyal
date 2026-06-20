'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

interface BillingStatus {
  status: string;
  planTier: string;
  currency: string;
  amount: number;
}

interface StartTrialResponse {
  authorizationUrl?: string;
  checkoutUrl?: string;
}

export default function StartTrialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnedFromCheckout = searchParams.get('started') === 'success';

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    const s = await api.get<BillingStatus>('/api/v1/billing/status');
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    void fetchStatus().finally(() => setStatusLoading(false));
  }, [fetchStatus]);

  const startPolling = useCallback(() => {
    let attempts = 0;
    setPolling(true);
    const interval = setInterval(() => {
      attempts++;
      void fetchStatus().then((s) => {
        if (s.status === 'trialing') {
          clearInterval(interval);
          setPolling(false);
          router.push('/onboarding');
        }
        if (attempts >= 10) {
          clearInterval(interval);
          setPolling(false);
        }
      });
    }, 3000);
  }, [fetchStatus, router]);

  useEffect(() => {
    if (returnedFromCheckout) startPolling();
  }, [returnedFromCheckout, startPolling]);

  // Already past this step (e.g. browser back button) — route onward.
  useEffect(() => {
    if (!status) return;
    if (status.status === 'trialing' || status.status === 'active') {
      router.replace('/onboarding');
    } else if (
      status.status === 'suspended' ||
      status.status === 'cancelled'
    ) {
      router.replace('/billing');
    }
  }, [status, router]);

  async function handleStart() {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<StartTrialResponse>(
        '/api/v1/billing/start-trial',
        {},
      );
      const url = res.authorizationUrl ?? res.checkoutUrl;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not start your trial. Please try again.',
      );
      setLoading(false);
    }
  }

  const isNGN = status?.currency === 'NGN';
  const currencySymbol = isNGN ? '₦' : '£';

  if (statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  if (polling) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
          <p className="text-slate-600">Confirming your card details…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          Start your 7-day free trial
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Add a payment method to activate your{' '}
          <span className="font-medium capitalize text-slate-700">
            {status?.planTier ?? 'starter'}
          </span>{' '}
          plan trial. Nothing is charged today — your card will be billed
          {' '}
          {currencySymbol}
          {(status?.amount ?? 0).toLocaleString()} on day 7 unless you cancel
          first.
        </p>

        {isNGN && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            To verify your card, we charge a small refundable amount (₦50),
            which is automatically refunded within minutes.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          onClick={() => void handleStart()}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-[#0DC56A] py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#0ab55e] disabled:opacity-50"
        >
          {loading ? 'Redirecting…' : 'Add payment method →'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Secured by {isNGN ? 'Paystack' : 'Stripe'} · Cancel any time before
          day 7
        </p>
      </div>
    </div>
  );
}
