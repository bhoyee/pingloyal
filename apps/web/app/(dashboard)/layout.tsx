'use client';
import { type ReactNode, useEffect, useState } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { api, type TenantMe } from '@/lib/api';
import { Sidebar } from '@/components/layout/Sidebar';

interface BillingStatus {
  status: string;
  trialDaysRemaining: number | null;
  planTier: string;
}

function PastDueBanner() {
  return (
    <div
      className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      data-testid="past-due-banner"
    >
      <p className="text-sm font-medium">
        ⚠️ Payment failed. Your account will be suspended if payment is not
        updated. Please update your payment method.
      </p>
      <a
        href="/billing"
        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 sm:ml-4"
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

function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="text-sm font-bold text-[#0A1628]">PingLoyal</span>
    </div>
  );
}

function DashboardContent({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void api
      .get<TenantMe>('/api/v1/tenants/me')
      .then((t) => {
        // Onboarding is complete once the QR code has been generated
        if (!t.qrCodeUrl) {
          window.location.replace('/onboarding');
        } else {
          setOnboardingChecked(true);
        }
      })
      .catch(() => setOnboardingChecked(true)); // Let the page handle auth errors

    void api
      .get<BillingStatus>('/api/v1/billing/status')
      .then(setBilling)
      .catch(() => null);
  }, []);

  if (!onboardingChecked) return null;

  if (billing?.status === 'suspended') {
    return <SuspendedOverlay />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <MobileTopBar onOpenMenu={() => setMenuOpen(true)} />
        {billing?.status === 'past_due' && <PastDueBanner />}
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <DashboardContent>{children}</DashboardContent>
    </QueryProvider>
  );
}
