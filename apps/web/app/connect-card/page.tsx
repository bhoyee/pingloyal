'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { publicGet, publicPost, ApiError } from '@/lib/api';

interface SignupPlan {
  planId: string;
  planTier: string;
  amount: number;
  amountDisplay: string;
}

interface PlansResponse {
  currency: string;
  plans: SignupPlan[];
}

interface StartTrialResponse {
  authorizationUrl?: string;
  checkoutUrl?: string;
}

export default function ConnectCardPage() {
  const params = useSearchParams();
  const signupToken = params.get('token') ?? '';
  const planTier = params.get('plan') ?? '';

  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!signupToken || !planTier) {
      setError('Missing signup session — please start over');
      setLoadingPlans(false);
      return;
    }
    publicGet<PlansResponse>(`/api/v1/signup/${signupToken}/plans`)
      .then(setPlansData)
      .catch(() => {
        setError('Could not load your plan — please start over');
      })
      .finally(() => setLoadingPlans(false));
  }, [signupToken, planTier]);

  async function handleConnect() {
    setLoading(true);
    setError('');
    try {
      const res = await publicPost<StartTrialResponse>(
        `/api/v1/signup/${signupToken}/start-trial`,
        { planTier },
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

  if (loadingPlans) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  if (error && !plansData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <a href="/register" className="text-sm font-medium text-[#0A1628] hover:underline">
          Start over →
        </a>
      </div>
    );
  }

  const plan = plansData?.plans.find((p) => p.planTier === planTier);
  const isNGN = plansData?.currency === 'NGN';
  const currencySymbol = isNGN ? '₦' : '£';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          Connect your card to start your 14-day trial
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Add a payment method to activate your{' '}
          <span className="font-medium capitalize text-slate-700">
            {plan?.planTier ?? planTier}
          </span>{' '}
          plan trial. Nothing is charged today — your card will be billed{' '}
          {currencySymbol}
          {(plan?.amount ?? 0).toLocaleString()} on day 14 unless you cancel
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
          onClick={() => void handleConnect()}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-[#0DC56A] py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#0ab55e] disabled:opacity-50"
        >
          {loading ? 'Redirecting…' : 'Add payment method →'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Secured by {isNGN ? 'Paystack' : 'Stripe'} · Cancel any time before
          day 14
        </p>
      </div>
    </div>
  );
}
