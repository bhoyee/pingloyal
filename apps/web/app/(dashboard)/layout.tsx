'use client';
import { type ReactNode, useEffect, useState } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { api } from '@/lib/api';

interface BillingStatus {
  status: string;
  trialDaysRemaining: number | null;
  planTier: string;
}

function TrialBanner({ days }: { days: number }) {
  const urgent = days <= 3;
  return (
    <div
      className={`flex items-center justify-between border-b px-6 py-3 ${
        urgent
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-blue-200 bg-blue-50 text-blue-800'
      }`}
      data-testid="trial-banner"
    >
      <p className="text-sm font-medium">
        {urgent
          ? `⚠️ Trial ending soon: ${days} day${days === 1 ? '' : 's'} left! Subscribe now to avoid losing access.`
          : `⏳ Free trial: ${days} days remaining. Subscribe now to keep your automations running.`}
      </p>
      <a
        href="/billing"
        className="ml-4 shrink-0 rounded-lg bg-[#0F1E35] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a3050]"
        data-testid="trial-subscribe-link"
      >
        Subscribe Now →
      </a>
    </div>
  );
}

function PastDueBanner() {
  return (
    <div
      className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-3 text-amber-800"
      data-testid="past-due-banner"
    >
      <p className="text-sm font-medium">
        ⚠️ Payment failed. Your account will be suspended if payment is not
        updated. Please update your payment method.
      </p>
      <a
        href="/billing"
        className="ml-4 shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Update Payment →
      </a>
    </div>
  );
}

function SuspendedOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-8 text-center"
      data-testid="suspended-overlay"
    >
      <p className="mb-2 text-5xl">🔴</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">
        Account Suspended
      </h1>
      <p className="mt-3 max-w-md text-slate-600">
        Your account has been suspended. Subscribe to reactivate and restore
        access to your loyalty programme. Your customer data is safe and will
        be available when you reactivate.
      </p>
      <a
        href="/billing"
        className="mt-6 rounded-xl bg-[#0F1E35] px-6 py-3 font-semibold text-white hover:bg-[#1a3050]"
        data-testid="suspended-subscribe-link"
      >
        Subscribe to Reactivate →
      </a>
      <a
        href="mailto:support@pingloyal.com"
        className="mt-3 text-sm text-slate-400 hover:underline"
      >
        Need help? Contact support
      </a>
    </div>
  );
}

function DashboardContent({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  useEffect(() => {
    void api
      .get<BillingStatus>('/api/v1/billing/status')
      .then(setBilling)
      .catch(() => null);
  }, []);

  if (billing?.status === 'suspended') {
    return <SuspendedOverlay />;
  }

  return (
    <>
      {billing?.status === 'trialing' &&
        billing.trialDaysRemaining !== null && (
          <TrialBanner days={billing.trialDaysRemaining} />
        )}
      {billing?.status === 'past_due' && <PastDueBanner />}
      {children}
    </>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <DashboardContent>{children}</DashboardContent>
    </QueryProvider>
  );
}
