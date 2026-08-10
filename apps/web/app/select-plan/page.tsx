'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicGet, ApiError } from '@/lib/api';

interface SignupPlan {
  planId: string;
  planTier: string;
  amount: number;
  amountDisplay: string;
  utilityIncluded: number;
  marketingRate: number;
  marketingRateDisplay: string;
}

interface PlansResponse {
  currency: string;
  plans: SignupPlan[];
}

const PLAN_COPY: Record<string, { tagline: string; popular: boolean }> = {
  starter: { tagline: 'For solo retailers & kiosks', popular: false },
  growth: { tagline: 'For growing retail stores', popular: true },
  connect: { tagline: 'For multi-location & existing POS', popular: false },
};

export default function SelectPlanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const signupToken = params.get('token') ?? '';

  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!signupToken) {
      setError('Missing signup session — please start over');
      setLoading(false);
      return;
    }
    publicGet<PlansResponse>(`/api/v1/signup/${signupToken}/plans`)
      .then(setData)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load plans — please start over',
        );
      })
      .finally(() => setLoading(false));
  }, [signupToken]);

  function handleSelect(planTier: string) {
    const next = new URLSearchParams({ token: signupToken, plan: planTier });
    router.push(`/connect-card?${next.toString()}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="text-sm text-red-600">{error || 'Something went wrong'}</p>
        <a href="/register" className="text-sm font-medium text-[#0A1628] hover:underline">
          Start over →
        </a>
      </div>
    );
  }

  const currencySymbol = data.currency === 'GBP' ? '£' : '₦';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold text-[#0A1628]">Choose your plan</h1>
          <p className="mt-2 text-sm text-slate-500">
            14-day free trial on any plan. You won&apos;t be charged until day 14.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {data.plans.map((plan) => {
            const copy = PLAN_COPY[plan.planTier] ?? { tagline: '', popular: false };
            return (
              <div
                key={plan.planId}
                className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm ${
                  copy.popular ? 'border-[#0DC56A] shadow-lg shadow-[#0DC56A]/10' : 'border-slate-200'
                }`}
              >
                {copy.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[#0DC56A] px-4 py-1 text-xs font-bold text-white shadow-md">
                      Most popular
                    </span>
                  </div>
                )}

                <p className="text-sm font-semibold capitalize text-slate-500">
                  {plan.planTier}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#0A1628]">
                    {plan.amountDisplay}
                  </span>
                  <span className="text-sm text-slate-500">/month</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{copy.tagline}</p>

                <div className="mt-5 space-y-1.5 rounded-xl bg-slate-50 p-4 text-xs font-medium text-slate-700">
                  <p>{plan.utilityIncluded.toLocaleString()} utility messages/month</p>
                  <p>
                    {plan.marketingRateDisplay} per marketing message
                  </p>
                </div>

                <button
                  onClick={() => handleSelect(plan.planTier)}
                  className={`mt-6 w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
                    copy.popular
                      ? 'bg-[#0DC56A] text-white shadow-md hover:bg-[#0ab55e]'
                      : 'border border-[#0A1628] text-[#0A1628] hover:bg-[#0A1628] hover:text-white'
                  }`}
                >
                  Select {plan.planTier} →
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Prices shown in {currencySymbol === '£' ? 'GBP' : 'NGN'}.
        </p>
      </div>
    </div>
  );
}
