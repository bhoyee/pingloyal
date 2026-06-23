'use client';
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  MessageSquare,
  Wallet as WalletIcon,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

// ── Types ──────────────────────────────────────────────────────────────────────

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
  marketingMessagesThisMonth: number;
  marketingSpendThisMonth: number;
  botRepliesThisMonth: number;
  paystackManageUrl: string | null;
  stripeManageUrl: string | null;
}

interface BillingPlan {
  planId: string;
  planTier: string;
  amount: number;
  amountDisplay: string;
  utilityIncluded: number;
  marketingRate: number;
  marketingRateDisplay: string;
  isCurrent: boolean;
}

interface PlansResponse {
  currency: string;
  plans: BillingPlan[];
}

interface SubscribeResponse {
  authorizationUrl?: string;
  checkoutUrl?: string;
}

interface ChangePlanResponse {
  message: string;
}

// ── Plan marketing copy (purely presentational — billing numbers come from
// the API so they can never drift out of sync with what's actually charged) ──

const PLAN_COPY: Record<
  string,
  { caption: string; captionCls: string; name: string; description: string; features: string[] }
> = {
  starter: {
    caption: 'STARTER',
    captionCls: 'text-slate-500',
    name: 'Solo Store',
    description: 'For a single store doing up to 300 purchases per month.',
    features: [
      'Unlimited customers',
      'All 5 automated triggers',
      'Cashier app (PWA)',
      'QR customer registration',
      'Campaign broadcast builder',
      'VIP tier segmentation',
      'Category targeting',
      'CSV customer import',
      'Self-service WhatsApp bot',
      'Integration connector',
      'Full dashboard & analytics',
      'Unlimited bot replies (free)',
    ],
  },
  growth: {
    caption: 'GROWTH',
    captionCls: 'text-slate-500',
    name: 'Growing Chain',
    description: 'For stores doing up to 800 purchases per month.',
    features: [
      'Unlimited customers',
      'All 5 automated triggers',
      'Cashier app (PWA)',
      'QR customer registration',
      'Campaign broadcast builder',
      'VIP tier segmentation',
      'Category targeting',
      'CSV customer import',
      'Self-service WhatsApp bot',
      'Integration connector',
      'Full dashboard & analytics',
      'Unlimited bot replies (free)',
      'Priority email support',
    ],
  },
  connect: {
    caption: 'CONNECT',
    captionCls: 'text-amber-600',
    name: 'Existing System',
    description: 'For stores doing 800+ purchases using their own loyalty system.',
    features: [
      'Unlimited customers',
      'All 5 automated triggers',
      'Cashier app (PWA)',
      'QR customer registration',
      'Campaign broadcast builder',
      'VIP tier segmentation',
      'Category targeting',
      'CSV customer import',
      'Self-service WhatsApp bot',
      'Integration connector',
      'Webhook + API pull',
      'Full dashboard & analytics',
      'Unlimited bot replies (free)',
      'Dedicated onboarding support',
    ],
  },
};

// Tier rank, not price, decides upgrade vs downgrade — Connect is "higher"
// than Growth regardless of any amount value, including stale/string-typed
// numeric data coming back from the DB.
const TIER_ORDER = ['starter', 'growth', 'connect'];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  trialing: { label: 'Free trial', className: 'bg-blue-100 text-blue-800' },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-800' },
  past_due: { label: 'Payment failed', className: 'bg-amber-100 text-amber-800' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600' },
};

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const { data: status, isLoading } = useQuery<BillingStatus>({
    queryKey: ['billing-status'],
    queryFn: () => api.get<BillingStatus>('/api/v1/billing/status'),
  });

  const { data: plansData } = useQuery<PlansResponse>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get<PlansResponse>('/api/v1/billing/plans'),
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['billing-status'] });
    void queryClient.invalidateQueries({ queryKey: ['billing-plans'] });
  }

  const startCheckout = useCallback(
    async (planId: string) => {
      setActionLoading(true);
      setPendingPlan(planId);
      setError('');
      try {
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
        setPendingPlan(null);
      }
    },
    [],
  );

  async function handleChangePlan(planTier: string) {
    setActionLoading(true);
    setPendingPlan(planTier);
    setError('');
    try {
      const res = await api.post<ChangePlanResponse>('/api/v1/billing/change-plan', {
        planTier,
      });
      setToast(res.message);
      refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not change plan. Please try again.',
      );
    } finally {
      setActionLoading(false);
      setPendingPlan(null);
    }
  }

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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
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
  const canChangePlan = status.status === 'trialing' || status.status === 'active';
  const utilityPercent = Math.min(
    100,
    Math.round((status.utilityUsedThisPeriod / Math.max(1, status.utilityIncluded)) * 100),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F1E35]/5 text-[#0F1E35]">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Billing</h1>
            <p className="text-sm text-slate-500">
              Manage your subscription plan, payment method, and usage.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</p>
        )}

        {/* ── Current plan & status ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
              <Button
                onClick={() => void startCheckout(`${status.planTier}_${status.currency.toLowerCase()}`)}
                loading={actionLoading}
                className="bg-[#0DC56A] hover:bg-[#0ab55e]"
              >
                Subscribe to reactivate →
              </Button>
            )}
            {canCancelTrial && (
              <Button
                variant="outline"
                onClick={() => void handleCancelTrial()}
                disabled={actionLoading}
              >
                Cancel trial
              </Button>
            )}
            {manageUrl && (
              <a
                href={manageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Manage payment method ↗
              </a>
            )}
          </div>
        </div>

        {/* ── This month's usage ── */}
        <div>
          <h2 className="text-base font-semibold text-slate-900">This Month&apos;s Usage</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Tracks your WhatsApp utility messages, marketing wallet spend, and bot replies for the current billing period.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Utility messages
                </p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 transition-transform duration-200 group-hover:scale-110">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {status.utilityUsedThisPeriod.toLocaleString()}
                <span className="text-base font-medium text-slate-400">
                  {' '}
                  / {status.utilityIncluded.toLocaleString()}
                </span>
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${utilityPercent >= 100 ? 'bg-red-500' : utilityPercent >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${utilityPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {status.utilityRemainingThisPeriod.toLocaleString()} remaining · overage{' '}
                {currencySymbol}
                {status.utilityOverageRate}/msg
              </p>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Marketing wallet
                </p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 transition-transform duration-200 group-hover:scale-110">
                  <WalletIcon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {status.marketingMessagesThisMonth.toLocaleString()}
                <span className="text-base font-medium text-slate-400"> sent</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {currencySymbol}
                {status.marketingSpendThisMonth.toLocaleString()} spent this month
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Balance: {currencySymbol}
                  {status.marketingWalletBalance.toLocaleString()}
                </p>
                <a
                  href="/billing/wallet"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500 hover:text-white"
                >
                  Top up
                  <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Bot replies
                </p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-600 transition-transform duration-200 group-hover:scale-110">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {status.botRepliesThisMonth.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Customers asking &quot;balance?&quot; via WhatsApp
              </p>
              <p className="mt-2 text-xs font-medium text-green-600">
                Unlimited &amp; free on every plan
              </p>
            </div>
          </div>
        </div>

        {/* ── Plans ── */}
        <div>
          <h2 className="text-base font-semibold text-slate-900">Plans</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {needsReactivation
              ? 'Pick a plan to reactivate your subscription.'
              : 'Upgrade or downgrade any time — changes apply immediately and the new price takes effect on your next billing date.'}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {(plansData?.plans ?? []).map((plan) => {
              const copy = PLAN_COPY[plan.planTier] ?? {
                caption: plan.planTier.toUpperCase(),
                captionCls: 'text-slate-500',
                name: plan.planTier,
                description: '',
                features: [],
              };
              const popular = plan.planTier === 'growth';
              const isPending = pendingPlan === plan.planTier || pendingPlan === plan.planId;
              const isUpgrade =
                TIER_ORDER.indexOf(plan.planTier) > TIER_ORDER.indexOf(status.planTier);

              return (
                <div
                  key={plan.planId}
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 ${
                    popular
                      ? 'border-[#0DC56A] shadow-lg shadow-[#0DC56A]/10 hover:shadow-xl hover:shadow-[#0DC56A]/20'
                      : 'border-slate-200 hover:border-[#0F1E35]/30 hover:shadow-lg'
                  }`}
                >
                  {popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-[#0DC56A] px-4 py-1 text-xs font-bold text-white shadow-md">
                        Most popular
                      </span>
                    </div>
                  )}

                  <p className={`text-xs font-bold tracking-wide ${copy.captionCls}`}>
                    {copy.caption}
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{copy.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{copy.description}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900">
                      {plan.amountDisplay}
                    </span>
                    <span className="text-sm text-slate-500">/month · billed monthly</span>
                  </div>

                  <div className="mt-4 rounded-lg bg-green-50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-green-800">
                      {plan.utilityIncluded.toLocaleString()} Utility messages included
                    </p>
                    <p className="text-xs text-green-700">
                      Purchase confirmations, welcome, reward alerts, nudges
                    </p>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      All features included:
                    </p>
                    <ul className="mt-3 space-y-2">
                      {copy.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0DC56A]" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    🔔 Marketing messages from wallet at {plan.marketingRateDisplay}
                  </div>

                  <div className="mt-5">
                    {plan.isCurrent && !needsReactivation ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-center text-sm font-semibold text-slate-500">
                        Current Plan
                      </div>
                    ) : (
                      <Button
                        loading={isPending}
                        disabled={actionLoading && !isPending}
                        onClick={() =>
                          void (needsReactivation
                            ? startCheckout(plan.planId)
                            : handleChangePlan(plan.planTier))
                        }
                        className={`w-full ${
                          popular
                            ? 'bg-[#0DC56A] hover:bg-[#0ab55e]'
                            : 'border border-[#0F1E35] bg-white text-[#0F1E35] hover:bg-[#0F1E35] hover:text-white'
                        }`}
                      >
                        {needsReactivation
                          ? `Select ${copy.name}`
                          : canChangePlan
                            ? isUpgrade
                              ? `Upgrade to ${plan.planTier} →`
                              : `Downgrade to ${plan.planTier}`
                            : `Select ${copy.name}`}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 mx-auto max-w-sm rounded-xl bg-gray-800 px-4 py-3 text-center text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
