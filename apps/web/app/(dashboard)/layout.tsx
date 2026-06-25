'use client';
import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { api, type TenantMe } from '@/lib/api';
import { Sidebar } from '@/components/layout/Sidebar';
import { Spinner } from '@/components/ui/spinner';
import { ProductTour } from '@/components/tour/ProductTour';

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
      <a href="/support" className="mt-3 text-sm text-slate-400 hover:underline">
        Need help? Contact support
      </a>
    </div>
  );
}

function CancelledOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-8 text-center"
      data-testid="cancelled-overlay"
    >
      <p className="mb-2 text-5xl">⏸️</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">
        Trial Cancelled
      </h1>
      <p className="mt-3 max-w-md text-slate-600">
        Your trial was cancelled before it converted. Subscribe to reactivate
        and restore access to your loyalty programme.
      </p>
      <a
        href="/billing"
        className="mt-6 rounded-xl bg-[#0F1E35] px-6 py-3 font-semibold text-white hover:bg-[#1a3050]"
        data-testid="cancelled-subscribe-link"
      >
        Subscribe to Reactivate →
      </a>
      <a href="/support" className="mt-3 text-sm text-slate-400 hover:underline">
        Need help? Contact support
      </a>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-400 sm:px-6">
      Powered by{' '}
      <a
        href="https://salisu.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-slate-500 hover:underline"
      >
        Bhoyee · salisu.dev
      </a>
    </footer>
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
  const pathname = usePathname();
  // Support must stay reachable mid-onboarding and while billing blocks
  // access — that's exactly when a tenant is most likely to need it.
  const onSupportRoute = pathname.startsWith('/support');
  const onOnboardingRoute = pathname.startsWith('/onboarding') || onSupportRoute;
  const [menuOpen, setMenuOpen] = useState(false);

  // Shared with Sidebar's and the dashboard page's ['tenant-me'] queries so
  // they dedupe into a single request instead of each firing their own.
  const { data: tenant, isLoading: tenantLoading } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
  });

  const { data: billing } = useQuery<BillingStatus>({
    queryKey: ['billing-status'],
    queryFn: () => api.get<BillingStatus>('/api/v1/billing/status'),
  });

  // Statuses that block dashboard access entirely — the onboarding redirect
  // below must never override these with a "go finish onboarding" bounce.
  const isBlockedByBilling =
    billing?.status === 'suspended' || billing?.status === 'cancelled';

  useEffect(() => {
    // Onboarding is complete once the QR code has been generated. Skip this
    // on the onboarding route itself — otherwise every reload there would
    // immediately redirect back to itself, causing an infinite reload loop.
    // Also skip it while billing blocks access entirely (suspended/cancelled).
    if (
      tenant &&
      !tenant.qrCodeUrl &&
      !onOnboardingRoute &&
      !isBlockedByBilling
    ) {
      window.location.replace('/onboarding');
    }
  }, [tenant, onOnboardingRoute, isBlockedByBilling]);

  // Show a spinner instead of a blank screen while we check onboarding
  // status. If the tenant fetch errors (e.g. auth), tenantLoading becomes
  // false and we fall through to render the shell so the page underneath
  // can redirect to /login itself.
  if (
    tenantLoading ||
    (tenant && !tenant.qrCodeUrl && !onOnboardingRoute && !isBlockedByBilling)
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!onSupportRoute && billing?.status === 'cancelled') {
    return <CancelledOverlay />;
  }

  if (!onSupportRoute && billing?.status === 'suspended') {
    return <SuspendedOverlay />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Suspense fallback={null}>
        <ProductTour />
      </Suspense>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <MobileTopBar onOpenMenu={() => setMenuOpen(true)} />
        {billing?.status === 'past_due' && <PastDueBanner />}
        <div className="flex-1">{children}</div>
        <Footer />
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
