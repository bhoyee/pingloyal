'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { api, type TenantMe } from '@/lib/api';
import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomersThisMonth: number;
  pointsIssuedThisMonth: number;
  pointsRedeemedThisMonth: number;
  campaignsSentThisMonth: number;
  avgDeliveryRate: number;
  messagesSentThisMonth: number;
  walletBalance: number;
  walletSpentThisMonth: number;
  marketingMessagesThisMonth: number;
  walletIsLow: boolean;
  walletIsEmpty: boolean;
  waIsConnected: boolean;
  waVerificationStatus: string;
}

interface TopSpender {
  id: string;
  fullName: string;
  pointsBalance: number;
  totalSpend: number;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  tierLabel: string | null;
}

interface TriggerLogEntry {
  id: string;
  triggerType: string;
  customerName: string | null;
  status: string;
  skipReason: string | null;
  createdAt: string;
}

// ── Trigger icons ─────────────────────────────────────────────────────────────

const TRIGGER_ICONS: Record<string, string> = {
  welcome: '👋',
  purchase_confirmation: '🛍️',
  threshold_nudge: '🔥',
  reward_unlocked: '🎊',
  birthday: '🎂',
  lapsed_winback: '👻',
  campaign_message: '📣',
  balance_bot_reply: '🤖',
  wallet_low_balance: '⚠️',
  wallet_zero: '🔴',
};

const STATUS_COLOURS: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-slate-100 text-slate-500',
  failed: 'bg-red-100 text-red-600',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="animate-pulse rounded-xl border border-slate-200 bg-white p-5"
      data-testid="skeleton-card"
    >
      <div className="mb-3 h-8 w-8 rounded-full bg-slate-200" />
      <div className="mb-1 h-7 w-24 rounded bg-slate-200" />
      <div className="h-4 w-32 rounded bg-slate-100" />
    </div>
  );
}

// ── Ring chart ────────────────────────────────────────────────────────────────

function RingChart({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const colour =
    pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';

  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth="6"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  icon,
  value,
  label,
  sub,
  onClick,
  ring,
}: {
  icon: string;
  value: string | number;
  label: string;
  sub?: string;
  onClick?: () => void;
  ring?: number;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${onClick ? 'cursor-pointer hover:border-[#0F1E35]' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {ring !== undefined && <RingChart pct={ring} />}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function AlertBanner({
  icon,
  text,
  buttonLabel,
  href,
  bg,
  border,
}: {
  icon: string;
  text: string;
  buttonLabel: string;
  href: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border ${border} ${bg} px-4 py-3`}
      data-testid="alert-banner"
    >
      <p className="text-sm font-medium text-slate-800">
        {icon} {text}
      </p>
      <a
        href={href}
        className="ml-4 shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
      >
        {buttonLabel}
      </a>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Get tenantId from auth token on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    // Decode JWT to get tenantId (payload is base64url)
    try {
      const payload = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as { tenantId?: string };
      setTenantId(payload.tenantId ?? null);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const {
    data: summary,
    isLoading: summaryLoading,
  } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', tenantId],
    queryFn: () => api.get<DashboardSummary>('/api/v1/dashboard/summary'),
    enabled: !!tenantId,
    refetchInterval: 300_000,
    staleTime: 60_000,
  });

  const { data: topSpenders, isLoading: spendersLoading } = useQuery<
    TopSpender[]
  >({
    queryKey: ['dashboard-top-spenders', tenantId],
    queryFn: () => api.get<TopSpender[]>('/api/v1/dashboard/top-spenders'),
    enabled: !!tenantId,
    refetchInterval: 300_000,
  });

  const { data: triggerLogs } = useQuery<TriggerLogEntry[]>({
    queryKey: ['trigger-logs', tenantId],
    queryFn: () => api.get<TriggerLogEntry[]>('/api/v1/trigger-logs'),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  // ── Alert banner selection ───────────────────────────────────────────────

  let banner: React.ReactNode = null;
  if (summary?.walletIsEmpty) {
    banner = (
      <AlertBanner
        icon="🔴"
        text="Marketing Wallet is empty — Birthday messages, win-backs, and campaigns are paused."
        buttonLabel="Top Up Wallet →"
        href="/billing/wallet/topup"
        bg="bg-red-50"
        border="border-red-200"
        data-testid="wallet-empty-banner"
      />
    );
  } else if (summary?.walletIsLow) {
    banner = (
      <AlertBanner
        icon="⚠️"
        text={`Marketing Wallet is running low (₦${summary.walletBalance.toLocaleString()}). Top up to keep automations running.`}
        buttonLabel="Top Up →"
        href="/billing/wallet/topup"
        bg="bg-amber-50"
        border="border-amber-200"
        data-testid="wallet-low-banner"
      />
    );
  } else if (summary && !summary.waIsConnected) {
    banner = (
      <AlertBanner
        icon="💬"
        text="WhatsApp is not connected. Connect to start sending automated messages to your customers."
        buttonLabel="Connect WhatsApp →"
        href="/onboarding"
        bg="bg-blue-50"
        border="border-blue-200"
        data-testid="wa-banner"
      />
    );
  }

  const activePercent =
    summary && summary.totalCustomers > 0
      ? Math.round((summary.activeCustomers / summary.totalCustomers) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {/* Alert banner */}
        {banner}

        {/* Metric cards grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summaryLoading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          ) : summary ? (
            <>
              <MetricCard
                icon="👥"
                value={summary.totalCustomers}
                label="Total Customers"
                sub={
                  summary.newCustomersThisMonth > 0
                    ? `+${summary.newCustomersThisMonth} this month`
                    : 'This month'
                }
              />
              <MetricCard
                icon="🟢"
                value={summary.activeCustomers}
                label="Active Customers"
                sub={`${activePercent}% of total`}
              />
              <MetricCard
                icon="⚫"
                value={summary.inactiveCustomers}
                label="Lapsed Customers"
                sub="Click to view →"
                onClick={() => router.push('/customers?status=inactive')}
              />
              <MetricCard
                icon="⭐"
                value={summary.pointsIssuedThisMonth.toLocaleString()}
                label="Points Issued"
                sub="This month"
              />
              <MetricCard
                icon="🎁"
                value={summary.pointsRedeemedThisMonth.toLocaleString()}
                label="Points Redeemed"
                sub="This month"
              />
              <MetricCard
                icon="💬"
                value={summary.messagesSentThisMonth.toLocaleString()}
                label="WA Messages Sent"
                sub="This month"
              />
              <MetricCard
                icon="📣"
                value={summary.campaignsSentThisMonth}
                label="Campaigns Sent"
                sub="This month"
              />
              <MetricCard
                icon=""
                value={`${summary.avgDeliveryRate}%`}
                label="Avg Delivery Rate"
                sub="Across all campaigns"
                ring={summary.avgDeliveryRate}
              />
              <div
                className={`rounded-xl border p-5 shadow-sm ${
                  summary.walletIsEmpty
                    ? 'border-red-200 bg-red-50'
                    : summary.walletIsLow
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-white'
                }`}
                data-testid="wallet-metric-card"
              >
                <p className="mb-1 text-2xl">👛</p>
                <p
                  className={`text-2xl font-bold ${
                    summary.walletIsEmpty
                      ? 'text-red-600'
                      : summary.walletIsLow
                        ? 'text-amber-600'
                        : 'text-green-600'
                  }`}
                  data-testid="wallet-metric-balance"
                >
                  ₦{summary.walletBalance.toLocaleString()}
                </p>
                <p className="text-sm text-slate-500">Marketing Wallet</p>
                <a
                  href="/billing/wallet/topup"
                  className="mt-2 inline-block text-xs font-semibold text-[#0F1E35] hover:underline"
                >
                  + Top Up →
                </a>
              </div>
            </>
          ) : null}
        </div>

        {/* Wallet summary */}
        {summary && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Marketing Wallet
              </p>
              <p
                className={`text-3xl font-bold ${summary.walletIsEmpty ? 'text-red-600' : 'text-green-600'}`}
              >
                ₦{summary.walletBalance.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {summary.marketingMessagesThisMonth} marketing messages this month
                · ₦{summary.walletSpentThisMonth.toLocaleString()} spent
              </p>
            </div>
            <a
              href="/billing/wallet/topup"
              className="rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a3050]"
            >
              + Top Up
            </a>
          </div>
        )}

        {/* Top spenders */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">
              Top Customers by Spend
            </h2>
          </div>
          {spendersLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded bg-slate-200"
                  data-testid="skeleton-row"
                />
              ))}
            </div>
          ) : !topSpenders?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No transactions recorded yet
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="top-spenders-table">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Rank</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Tier</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Spend</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Visits</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Last Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSpenders.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 text-slate-500">
                      {i === 0 ? '👑' : `#${i + 1}`}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {s.fullName}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      ⭐ {s.pointsBalance.toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      {s.tierLabel ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {s.tierLabel}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      ₦{s.totalSpend.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {s.purchaseCount}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {s.lastPurchaseAt
                        ? formatDistanceToNow(new Date(s.lastPurchaseAt), {
                            addSuffix: true,
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Trigger activity feed */}
        {triggerLogs && triggerLogs.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">
                Recent Automations
              </h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {triggerLogs.map((log) => (
                <li key={log.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xl">
                    {TRIGGER_ICONS[log.triggerType] ?? '📩'}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">
                      {log.customerName ?? 'Unknown customer'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {log.triggerType.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[log.status] ?? 'bg-slate-100 text-slate-500'}`}
                  >
                    {log.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDistanceToNow(new Date(log.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
