'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { api, ApiError, type TenantMe } from '@/lib/api';
import { CustomerOverview } from './CustomerOverview';
import { CustomerTransactions } from './CustomerTransactions';
import { CustomerRedemptions } from './CustomerRedemptions';

export interface CustomerDetail {
  id: string;
  fullName: string;
  phoneE164: string;
  pointsBalance: number;
  lifetimePoints: number;
  totalSpend: number;
  purchaseCount: number;
  lastPurchaseAt: string | null;
  waOptedIn: boolean;
  createdAt: string;
  tier: { tierLabel: string } | null;
}

export interface CustomerTransactionRow {
  id: string;
  amount: string;
  pointsEarned: number;
  source: string;
  createdAt: string;
  categoryName: string | null;
  cashierName: string | null;
}

export interface RedemptionRow {
  id: string;
  customerId: string;
  redeemedAt: string;
  pointsRedeemed: number;
  rewardsCount: number;
  value: number;
  balanceAfter: number;
  cashierName: string | null;
}

export interface TriggerLogSummary {
  id: string;
  triggerType: string;
  createdAt: string;
}

type Tab = 'overview' | 'transactions' | 'redemptions';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'redemptions', label: 'Redemptions' },
];

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

function tierAvatarColor(tierLabel: string | null): string {
  const l = tierLabel?.toLowerCase() ?? '';
  if (l.includes('vip')) return '#F59E0B';
  if (l.includes('mid')) return '#6B7280';
  if (l.includes('standard')) return '#0A1628';
  return '#9CA3AF';
}

function tierBadge(tierLabel: string | null): { icon: string; classes: string; label: string } {
  if (!tierLabel) return { icon: '', classes: 'bg-gray-100 text-gray-500', label: 'No tier' };
  const l = tierLabel.toLowerCase();
  if (l.includes('vip')) return { icon: '👑', classes: 'bg-amber-100 text-amber-700', label: tierLabel };
  if (l.includes('standard')) return { icon: '🌱', classes: 'bg-emerald-100 text-emerald-700', label: tierLabel };
  return { icon: '⭐', classes: 'bg-sky-100 text-sky-700', label: tierLabel };
}

function isTab(value: string | null): value is Tab {
  return TABS.some((t) => t.key === value);
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<CustomerTransactionRow[]>([]);
  const [totalPointsRedeemed, setTotalPointsRedeemed] = useState(0);
  const [latestMessage, setLatestMessage] = useState<TriggerLogSummary | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'overview');

  function selectTab(key: Tab) {
    setTab(key);
    router.replace(key === 'overview' ? `/customers/${id}` : `/customers/${id}?tab=${key}`, {
      scroll: false,
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const c = await api.get<CustomerDetail>(`/api/v1/customers/${id}`);
        if (cancelled) return;
        setCustomer(c);

        // Each of these is independently non-critical — a transient failure
        // (e.g. dev-mode rate limiting) on one must not blank out the others.
        const [tenantRes, txRes, redRes, logRes, countRes] = await Promise.allSettled([
          api.get<TenantMe>('/api/v1/tenants/me'),
          api.get<{ data: CustomerTransactionRow[] }>(
            `/api/v1/customers/${id}/transactions?page=1&limit=3`,
          ),
          api.get<{ totalPointsRedeemed: number }>(
            `/api/v1/redemptions/stats?customerId=${id}`,
          ),
          api.get<TriggerLogSummary[]>(`/api/v1/trigger-logs?customerId=${id}&limit=1`),
          api.get<{ count: number }>(`/api/v1/trigger-logs/count?customerId=${id}`),
        ]);
        if (cancelled) return;

        if (tenantRes.status === 'fulfilled') setTenant(tenantRes.value);
        if (txRes.status === 'fulfilled') setRecentTransactions(txRes.value.data);
        if (redRes.status === 'fulfilled') setTotalPointsRedeemed(redRes.value.totalPointsRedeemed);
        if (logRes.status === 'fulfilled') setLatestMessage(logRes.value[0] ?? null);
        if (countRes.status === 'fulfilled') setMessageCount(countRes.value.count);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
        <p className="text-slate-500">Customer not found</p>
        <button
          onClick={() => router.push('/customers')}
          className="cursor-pointer rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3050]"
        >
          Back to customers
        </button>
      </div>
    );
  }

  const pointsThreshold = tenant?.pointsThreshold ?? 0;
  const rewardsAvailable = pointsThreshold > 0 ? Math.floor(customer.pointsBalance / pointsThreshold) : 0;
  const lapsedDays = tenant?.lapsedDays ?? 60;
  const isActive = !!customer.lastPurchaseAt &&
    Date.now() - new Date(customer.lastPurchaseAt).getTime() <= lapsedDays * 24 * 60 * 60 * 1000;
  const badge = tierBadge(customer.tier?.tierLabel ?? null);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <button
          data-testid="back-to-customers"
          onClick={() => router.push('/customers')}
          className="cursor-pointer flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          ← All Customers
        </button>
      </div>

      <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        {/* Identity card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                style={{ backgroundColor: tierAvatarColor(customer.tier?.tierLabel ?? null) }}
              >
                {getInitials(customer.fullName)}
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{customer.fullName}</p>
                <p className="text-sm text-slate-500 font-mono">{customer.phoneE164}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    Joined {formatDistanceToNow(new Date(customer.createdAt), { addSuffix: true })}
                  </span>
                  <span
                    data-testid="status-badge"
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <p data-testid="points-balance" className="text-2xl font-bold text-emerald-600">
                {customer.pointsBalance.toLocaleString()} <span className="text-sm font-medium text-emerald-500">pts</span>
              </p>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
                {badge.icon} {badge.label}
              </span>
              {rewardsAvailable > 0 && (
                <p data-testid="rewards-available-badge" className="text-sm font-semibold text-green-600">
                  🎁 {rewardsAvailable} reward{rewardsAvailable > 1 ? 's' : ''} available
                </p>
              )}
              {customer.waOptedIn ? (
                <p className="text-xs text-slate-500">
                  💬 Opted in
                  {latestMessage && ` · Last message ${formatDistanceToNow(new Date(latestMessage.createdAt), { addSuffix: true })}`}
                </p>
              ) : (
                <p className="text-xs font-medium text-amber-600">⚠️ Not opted in</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`tab-${key}`}
              onClick={() => selectTab(key)}
              className={`cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-[#0F1E35] text-[#0F1E35]'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <CustomerOverview
            customer={customer}
            tenant={tenant}
            recentTransactions={recentTransactions}
            totalPointsRedeemed={totalPointsRedeemed}
            rewardsAvailable={rewardsAvailable}
            latestMessage={latestMessage}
            messageCount={messageCount}
            onViewAllTransactions={() => selectTab('transactions')}
          />
        )}
        {tab === 'transactions' && <CustomerTransactions customerId={id} />}
        {tab === 'redemptions' && <CustomerRedemptions customerId={id} />}
      </div>
    </div>
  );
}
