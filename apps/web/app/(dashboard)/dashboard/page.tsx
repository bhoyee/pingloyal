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
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${onClick ? 'cursor-pointer hover:border-[#0F1E35]' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xl sm:text-2xl">{icon}</span>
        {ring !== undefined && <RingChart pct={ring} />}
      </div>
      <p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
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
      className={`flex flex-col gap-3 rounded-xl border ${border} ${bg} px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}
      data-testid="alert-banner"
    >
      <p className="text-sm font-medium text-slate-800">
        {icon} {text}
      </p>
      <a
        href={href}
        className="self-start shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:ml-4 sm:self-auto"
      >
        {buttonLabel}
      </a>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.replace('/login');
    } else {
      setMounted(true);
    }
  }, [router]);

  const { data: summary, isLoading: summaryLoading } =
    useQuery<DashboardSummary>({
      queryKey: ['dashboard-summary'],
      queryFn: () => api.get<DashboardSummary>('/api/v1/dashboard/summary'),
      enabled: mounted,
      refetchInterval: 60_000,
      staleTime: 0,
      refetchOnWindowFocus: true,
    });

  const { data: topSpenders, isLoading: spendersLoading } = useQuery<
    TopSpender[]
  >({
    queryKey: ['dashboard-top-spenders'],
    queryFn: () => api.get<TopSpender[]>('/api/v1/dashboard/top-spenders'),
    enabled: mounted,
    refetchInterval: 60_000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: triggerLogs } = useQuery<TriggerLogEntry[]>({
    queryKey: ['trigger-logs'],
    queryFn: () => api.get<TriggerLogEntry[]>('/api/v1/trigger-logs'),
    enabled: mounted,
    refetchInterval: 60_000,
  });

  // Default summary so metric cards always render (show 0s for fresh accounts)
  const s: DashboardSummary = summary ?? {
    totalCustomers: 0,
    activeCustomers: 0,
    inactiveCustomers: 0,
    newCustomersThisMonth: 0,
    pointsIssuedThisMonth: 0,
    pointsRedeemedThisMonth: 0,
    campaignsSentThisMonth: 0,
    avgDeliveryRate: 0,
    messagesSentThisMonth: 0,
    walletBalance: 0,
    walletSpentThisMonth: 0,
    marketingMessagesThisMonth: 0,
    walletIsLow: false,
    walletIsEmpty: false,
    waIsConnected: false,
    waVerificationStatus: 'unverified',
  };

  // ── Alert banner selection ───────────────────────────────────────────────

  let banner: React.ReactNode = null;
  if (!summaryLoading && s.walletIsEmpty) {
    banner = (
      <AlertBanner
        icon="🔴"
        text="Marketing Wallet is empty — Birthday messages, win-backs, and campaigns are paused."
        buttonLabel="Top Up Wallet →"
        href="/billing/wallet/topup"
        bg="bg-red-50"
        border="border-red-200"
      />
    );
  } else if (!summaryLoading && s.walletIsLow) {
    banner = (
      <AlertBanner
        icon="⚠️"
        text={`Marketing Wallet is running low (₦${s.walletBalance.toLocaleString()}). Top up to keep automations running.`}
        buttonLabel="Top Up →"
        href="/billing/wallet/topup"
        bg="bg-amber-50"
        border="border-amber-200"
      />
    );
  } else if (!summaryLoading && !s.waIsConnected) {
    banner = (
      <AlertBanner
        icon="💬"
        text="WhatsApp not connected. Connect your number to start sending automated loyalty messages."
        buttonLabel="Connect WhatsApp →"
        href="/settings/integrations"
        bg="bg-blue-50"
        border="border-blue-200"
      />
    );
  }

  const activePercent =
    s.totalCustomers > 0
      ? Math.round((s.activeCustomers / s.totalCustomers) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-xs text-slate-400 mt-0.5">Overview of your loyalty programme</p>
          </div>
          <a
            href="/campaigns/new"
            className="self-start rounded-lg bg-[#0A1628] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a3050] sm:self-auto"
          >
            + New Campaign
          </a>
        </div>
      </div>

      <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        {/* Alert banner */}
        {banner}

        {/* Metric cards grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {summaryLoading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                icon="👥"
                value={s.totalCustomers}
                label="Total Customers"
                sub={s.newCustomersThisMonth > 0 ? `+${s.newCustomersThisMonth} this month` : 'No new customers yet'}
              />
              <MetricCard
                icon="✅"
                value={s.activeCustomers}
                label="Active Customers"
                sub={s.totalCustomers > 0 ? `${activePercent}% of total` : 'Register your first customer'}
              />
              <MetricCard
                icon="😴"
                value={s.inactiveCustomers}
                label="Lapsed Customers"
                sub={s.inactiveCustomers > 0 ? 'Click to view →' : 'None lapsed yet'}
                onClick={s.inactiveCustomers > 0 ? () => router.push('/customers?status=inactive') : undefined}
              />
              <MetricCard
                icon="⭐"
                value={s.pointsIssuedThisMonth.toLocaleString()}
                label="Points Issued"
                sub="This month"
              />
              <MetricCard
                icon="🎁"
                value={s.pointsRedeemedThisMonth.toLocaleString()}
                label="Points Redeemed"
                sub="This month"
              />
              <MetricCard
                icon="💬"
                value={s.messagesSentThisMonth.toLocaleString()}
                label="WA Messages Sent"
                sub="This month"
              />
              <MetricCard
                icon="📣"
                value={s.campaignsSentThisMonth}
                label="Campaigns Sent"
                sub="This month"
              />
              <MetricCard
                icon="📈"
                value={s.avgDeliveryRate > 0 ? `${s.avgDeliveryRate}%` : '—'}
                label="Avg Delivery Rate"
                sub="Across all campaigns"
                ring={s.avgDeliveryRate > 0 ? s.avgDeliveryRate : undefined}
              />
            </>
          )}
        </div>

        {/* Wallet summary */}
        <div data-testid="wallet-metric-card" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-semibold text-slate-500">Marketing Wallet</p>
            <p data-testid="wallet-metric-balance" className={`text-2xl font-bold sm:text-3xl ${s.walletIsEmpty ? 'text-red-600' : s.walletIsLow ? 'text-amber-600' : 'text-green-600'}`}>
              ₦{s.walletBalance.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {s.marketingMessagesThisMonth} marketing messages · ₦{s.walletSpentThisMonth.toLocaleString()} spent this month
            </p>
          </div>
          <a
            href="/billing/wallet/topup"
            className="self-start rounded-lg bg-[#0A1628] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a3050] sm:self-auto"
          >
            + Top Up
          </a>
        </div>

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
            <div className="overflow-x-auto">
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
                {topSpenders.map((spender, i) => (
                  <tr key={spender.id}>
                    <td className="px-5 py-3 text-slate-500">
                      {i === 0 ? '👑' : `#${i + 1}`}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {spender.fullName}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      ⭐ {spender.pointsBalance.toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      {spender.tierLabel ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {spender.tierLabel}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      ₦{spender.totalSpend.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {spender.purchaseCount}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {spender.lastPurchaseAt
                        ? formatDistanceToNow(new Date(spender.lastPurchaseAt), {
                            addSuffix: true,
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
                <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 sm:flex-nowrap">
                  <span className="text-xl">
                    {TRIGGER_ICONS[log.triggerType] ?? '📩'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-700">
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
                  <span className="ml-auto text-xs text-slate-400 sm:ml-0">
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
