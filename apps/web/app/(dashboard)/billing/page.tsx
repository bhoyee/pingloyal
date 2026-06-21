'use client';
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

interface BillingStatus {
  status: string;
  planTier: string;
  currency: string;
  amount: number;
  currentPeriodEnd: string | null;
  daysRemaining: number | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  utilityIncluded: number;
  utilityUsedThisPeriod: number;
  utilityRemainingThisPeriod: number;
  utilityOverageRate: number;
  marketingWalletBalance: number;
  marketingRate: number;
  paystackManageUrl: string | null;
  stripeManageUrl: string | null;
}

interface SubscribeResponse {
  authorizationUrl?: string;
  checkoutUrl?: string;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  trialing: { label: 'Free trial', className: 'bg-blue-100 text-blue-800' },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-800' },
  past_due: { label: 'Payment failed', className: 'bg-amber-100 text-amber-800' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600' },
};

export default function BillingPage() {
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: status, isLoading } = useQuery<BillingStatus>({
    queryKey: ['billing-status'],
    queryFn: () => api.get<BillingStatus>('/api/v1/billing/status'),
  });

  const startCheckout = useCallback(async () => {
    if (!status) return;
    setActionLoading(true);
    setError('');
    try {
      const planId = `${status.planTier}_${status.currency.toLowerCase()}`;
      const res = await api.post<SubscribeResponse>('/api/v1/billing/subscribe', {
        planId,
      });
      const url = res.authorizationUrl ?? res.checkoutUrl;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not start checkout. Please try again.',
      );
      setActionLoading(false);
    }
  }, [status]);

  async function handleCancelTrial() {
    setActionLoading(true);
    setError('');
    try {
      await api.post('/api/v1/billing/cancel-trial', {});
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not cancel trial. Please try again.',
      );
      setActionLoading(false);
    }
  }

  if (isLoading || !status) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  const badge = STATUS_BADGES[status.status] ?? {
    label: status.status,
    className: 'bg-slate-100 text-slate-600',
  };
  const currencySymbol = status.currency === 'GBP' ? '£' : '₦';
  const manageUrl = status.paystackManageUrl ?? status.stripeManageUrl;
  const canCancelTrial = status.status === 'trialing';
  const needsReactivation =
    status.status === 'suspended' || status.status === 'cancelled' || status.status === 'past_due';

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">
          View your subscription plan, manage payment methods, and see your billing status.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Current plan
            </p>
            <p className="mt-1 text-lg font-bold capitalize text-slate-900">
              {status.planTier}
            </p>
            <p className="text-sm text-slate-500">
              {currencySymbol}
              {status.amount.toLocaleString()}/month
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        {status.status === 'trialing' && status.trialDaysRemaining !== null && (
          <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
            Your trial ends in {status.trialDaysRemaining}{' '}
            {status.trialDaysRemaining === 1 ? 'day' : 'days'}. You&apos;ll be charged{' '}
            {currencySymbol}
            {status.amount.toLocaleString()} automatically unless you cancel first.
          </p>
        )}

        {status.status === 'past_due' && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Your last payment failed. Update your payment method to avoid suspension.
          </p>
        )}

        {status.status === 'suspended' && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            Your account is suspended due to non-payment. Subscribe to restore access.
          </p>
        )}

        {status.status === 'cancelled' && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            Your trial was cancelled before it converted. Subscribe any time to reactivate.
          </p>
        )}

        {status.currentPeriodEnd && status.daysRemaining !== null && (
          <p className="mt-3 text-xs text-slate-400">
            Current period ends in {status.daysRemaining}{' '}
            {status.daysRemaining === 1 ? 'day' : 'days'}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {needsReactivation && (
            <button
              onClick={() => void startCheckout()}
              disabled={actionLoading}
              className="rounded-xl bg-[#0DC56A] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#0ab55e] disabled:opacity-50"
            >
              {actionLoading ? 'Redirecting…' : 'Subscribe to reactivate →'}
            </button>
          )}
          {canCancelTrial && (
            <button
              onClick={() => void handleCancelTrial()}
              disabled={actionLoading}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel trial
            </button>
          )}
          {manageUrl && (
            <a
              href={manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Manage payment method ↗
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            WhatsApp utility messages
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {status.utilityUsedThisPeriod.toLocaleString()} / {status.utilityIncluded.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">
            {status.utilityRemainingThisPeriod.toLocaleString()} remaining this period · overage{' '}
            {currencySymbol}
            {status.utilityOverageRate}/msg
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Marketing wallet
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {currencySymbol}
            {status.marketingWalletBalance.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">
            {currencySymbol}
            {status.marketingRate}/message ·{' '}
            <a href="/billing/wallet" className="font-medium text-[#0A1628] hover:underline">
              Top up →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
