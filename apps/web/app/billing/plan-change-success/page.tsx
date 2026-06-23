'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface BillingStatus {
  pendingPlanTier: string | null;
  pendingPlanEffectiveAt: string | null;
}

export default function PlanChangeSuccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 10; // 10 × 3s = 30s

    const check = async () => {
      try {
        const s = await api.get<BillingStatus>('/api/v1/billing/status');
        setStatus(s);
        if (s.pendingPlanTier) return;
      } catch {
        // ignore
      }
      attempts++;
      if (attempts >= MAX_ATTEMPTS) setTimedOut(true);
    };

    void check();
    const interval = setInterval(() => { void check(); }, 3000);

    return () => clearInterval(interval);
  }, []);

  if (status?.pendingPlanTier) {
    const effectiveDate = status.pendingPlanEffectiveAt
      ? new Date(status.pendingPlanEffectiveAt).toLocaleDateString()
      : 'your next billing date';

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✅
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Payment confirmed!</h1>
          <p className="mt-2 text-slate-600">
            Your upgrade to{' '}
            <span className="font-semibold capitalize">{status.pendingPlanTier}</span> is
            scheduled to start on {effectiveDate}.
          </p>
          <button
            onClick={() => router.push('/billing')}
            className="mt-6 w-full rounded-xl bg-[#0F1E35] py-3 font-semibold text-white hover:bg-[#1a3050]"
          >
            Back to Billing →
          </button>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-4xl">⏳</p>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Payment received!</h1>
          <p className="mt-2 text-slate-600">
            Your plan change will be scheduled within a few minutes.
          </p>
          <button
            onClick={() => router.push('/billing')}
            className="mt-6 w-full rounded-xl bg-[#0F1E35] py-3 font-semibold text-white hover:bg-[#1a3050]"
          >
            Back to Billing →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
        <p className="text-slate-600">Processing your payment...</p>
      </div>
    </div>
  );
}
