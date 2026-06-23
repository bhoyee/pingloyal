'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, isToday, format } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Gift,
  Megaphone,
  RotateCcw,
  Search,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WalletBalance {
  balance: number;
  ratePerMessage: number;
  estimatedMessagesLeft: number;
  thisMonthSpend: number;
  thisMonthMessageCount: number;
  isLow: boolean;
  isEmpty: boolean;
  breakdown?: Record<string, { count: number; amount: number }>;
}

interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

interface WalletTransactionsResult {
  transactions: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_BADGES: Record<string, { label: string; cls: string; activeCls: string }> = {
  topup:                  { label: 'Top-up',   cls: 'bg-green-100 text-green-700', activeCls: 'bg-green-600 text-white' },
  debit_birthday:         { label: 'Birthday', cls: 'bg-blue-100 text-blue-700',   activeCls: 'bg-blue-600 text-white' },
  debit_lapsed:           { label: 'Win-back', cls: 'bg-red-100 text-red-700',     activeCls: 'bg-red-600 text-white' },
  debit_campaign:         { label: 'Campaign', cls: 'bg-amber-100 text-amber-700', activeCls: 'bg-amber-600 text-white' },
  debit_utility_overage:  { label: 'Overage',  cls: 'bg-slate-100 text-slate-600', activeCls: 'bg-slate-600 text-white' },
  refund:                 { label: 'Refund',   cls: 'bg-green-100 text-green-700', activeCls: 'bg-green-600 text-white' },
};

function formatTxDate(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Today ${format(d, 'HH:mm')}`;
  return formatDistanceToNow(d, { addSuffix: true });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function TypeBadge({ type }: { type: string }) {
  const badge = TYPE_BADGES[type] ?? { label: type, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
      data-testid={`badge-${type}`}
    >
      {badge.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const LIMIT = 20;

export default function WalletPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const debouncedSearch = useDebounce(search, 400);

  const hasActiveFilters = Boolean(
    search || typeFilter || startDate || endDate || minAmount || maxAmount,
  );

  function clearFilters() {
    setSearch('');
    setTypeFilter(null);
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
  }

  // Any filter change should jump back to page 1 — staying on page 4 of a
  // now-much-smaller filtered result set would just show an empty table.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, startDate, endDate, minAmount, maxAmount]);

  const txQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (typeFilter) params.set('type', typeFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (minAmount) params.set('minAmount', minAmount);
    if (maxAmount) params.set('maxAmount', maxAmount);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    return params.toString();
  }, [page, typeFilter, startDate, endDate, minAmount, maxAmount, debouncedSearch]);

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: () => api.get<WalletBalance>('/api/v1/billing/wallet/balance'),
    staleTime: 30_000,
  });

  const { data: txResult, isLoading: txLoading } = useQuery<WalletTransactionsResult>({
    queryKey: ['wallet-transactions', txQuery],
    queryFn: () =>
      api.get<WalletTransactionsResult>(`/api/v1/billing/wallet/transactions?${txQuery}`),
  });

  const balanceColour = wallet?.isEmpty
    ? 'text-red-500'
    : wallet?.isLow
      ? 'text-amber-500'
      : 'text-green-400';

  function handleExportCsv() {
    const params = new URLSearchParams(txQuery);
    params.set('page', '1');
    params.set('limit', '10000');
    void api
      .get<WalletTransactionsResult>(`/api/v1/billing/wallet/transactions?${params.toString()}`)
      .then(({ transactions }) => {
        const header = 'Date,Type,Description,Amount,Balance After\n';
        const rows = transactions.map((t) =>
          [
            new Date(t.createdAt).toISOString(),
            t.type,
            `"${t.description.replace(/"/g, '""')}"`,
            t.amount,
            t.balanceAfter,
          ].join(','),
        );
        const csv = header + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wallet-transactions.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const totalPages = txResult ? Math.ceil(txResult.total / LIMIT) : 1;

  const stats = [
    {
      key: 'spend',
      label: 'Spent This Month',
      value: `₦${(wallet?.thisMonthSpend ?? 0).toLocaleString()}`,
      sub: `${wallet?.thisMonthMessageCount ?? 0} Marketing messages`,
      icon: WalletIcon,
      valueCls: 'text-slate-900',
      iconCls: 'bg-slate-100 text-slate-600',
    },
    {
      key: 'birthday',
      label: 'Birthday Messages',
      value: wallet?.breakdown?.debit_birthday?.count ?? 0,
      sub: `₦${(wallet?.breakdown?.debit_birthday?.amount ?? 0).toLocaleString()} this month`,
      icon: Gift,
      valueCls: 'text-green-600',
      iconCls: 'bg-blue-100 text-blue-600',
    },
    {
      key: 'lapsed',
      label: 'Lapsed Win-backs',
      value: wallet?.breakdown?.debit_lapsed?.count ?? 0,
      sub: `₦${(wallet?.breakdown?.debit_lapsed?.amount ?? 0).toLocaleString()} this month`,
      icon: RotateCcw,
      valueCls: 'text-green-600',
      iconCls: 'bg-red-100 text-red-600',
    },
    {
      key: 'campaign',
      label: 'Campaign Sends',
      value: wallet?.breakdown?.debit_campaign?.count ?? 0,
      sub: `₦${(wallet?.breakdown?.debit_campaign?.amount ?? 0).toLocaleString()} this month`,
      icon: Megaphone,
      valueCls: 'text-green-600',
      iconCls: 'bg-amber-100 text-amber-600',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Marketing Wallet</h1>
      </div>

      <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-6">

        {/* ── Balance Hero ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-[#0F1E35] p-5 text-white shadow-lg sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Marketing Wallet Balance
              </p>
              {walletLoading ? (
                <div className="mt-2 h-10 w-40 animate-pulse rounded bg-slate-700" />
              ) : (
                <p
                  className={`mt-1 text-4xl font-bold sm:text-5xl ${balanceColour}`}
                  data-testid="wallet-balance"
                >
                  ₦{(wallet?.balance ?? 0).toLocaleString()}
                </p>
              )}
              {wallet && !walletLoading && (
                <p className="mt-2 text-sm text-slate-400">
                  ≈ {wallet.estimatedMessagesLeft} Marketing messages remaining at your
                  ₦{wallet.ratePerMessage}/msg rate
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/billing/wallet/topup')}
              className="self-start shrink-0 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-600 sm:self-auto"
              data-testid="topup-btn"
            >
              + Top Up
            </button>
          </div>
        </div>

        {/* ── Low balance warning ──────────────────────────────────────────── */}
        {wallet?.isLow && !wallet.isEmpty && (
          <div
            className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="low-balance-warning"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800">
                <span className="font-bold">Low balance alert:</span> When your wallet drops
                below ₦3,000, Marketing messages will pause automatically. Top up to keep
                Birthday and win-back messages firing.
              </p>
            </div>
            <button
              onClick={() => router.push('/billing/wallet/topup')}
              className="self-start shrink-0 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 sm:self-auto"
            >
              Top Up →
            </button>
          </div>
        )}

        {/* ── Empty warning ────────────────────────────────────────────────── */}
        {wallet?.isEmpty && (
          <div
            className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="empty-balance-warning"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm text-red-800">
                <span className="font-bold">Wallet empty:</span> Marketing messages are
                paused. Birthday messages, lapsed win-backs, and campaign broadcasts will not
                send until you top up.
              </p>
            </div>
            <button
              onClick={() => router.push('/billing/wallet/topup')}
              className="self-start shrink-0 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 sm:self-auto"
            >
              Top Up Now →
            </button>
          </div>
        )}

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ key, label, value, sub, icon: Icon, valueCls, iconCls }) => (
            <div
              key={key}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {label}
                </p>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${iconCls}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className={`mt-2 text-2xl font-bold sm:text-3xl ${valueCls}`}>{value}</p>
              <p className="mt-1 text-xs text-slate-400">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── How wallet works ─────────────────────────────────────────────── */}
        <div className="rounded-xl bg-green-50 p-5">
          <h3 className="mb-3 text-sm font-bold text-green-800">How the Marketing Wallet Works</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '💳', title: 'Load any amount', body: '₦1,000 minimum, no maximum, via Paystack' },
              { icon: '⚡', title: 'Credits instantly', body: 'Balance updates the moment payment confirms' },
              { icon: '📤', title: 'Auto-deducted', body: `₦${wallet?.ratePerMessage ?? 130} per Marketing message sent` },
              { icon: '🔔', title: 'Low balance alert', body: 'WhatsApp alert when balance drops below ₦3,000' },
            ].map((step, i) => (
              <div key={i} className="rounded-lg bg-white p-3 shadow-sm">
                <p className="text-2xl">{step.icon}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{step.title}</p>
                <p className="text-xs text-slate-500">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Transaction history ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Transaction History</h2>
            <button
              onClick={handleExportCsv}
              className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
              data-testid="export-csv"
            >
              ⬇ Export CSV
            </button>
          </div>

          {/* Search + filters */}
          <div className="space-y-3 border-b border-slate-100 px-5 py-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:flex-wrap">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search description…"
                  data-testid="tx-search"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="tx-start-date"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="tx-end-date"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  placeholder="Min ₦"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  data-testid="tx-min-amount"
                  className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
                />
                <span className="text-xs text-slate-400">–</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Max ₦"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  data-testid="tx-max-amount"
                  className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  data-testid="clear-filters"
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTypeFilter(null)}
                data-testid="filter-chip-all"
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  typeFilter === null
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {Object.entries(TYPE_BADGES).map(([key, badge]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter((cur) => (cur === key ? null : key))}
                  data-testid={`filter-chip-${key}`}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    typeFilter === key ? badge.activeCls : `${badge.cls} hover:opacity-75`
                  }`}
                >
                  {badge.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="tx-table">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : txResult?.transactions.length === 0
                    ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 text-center text-sm text-slate-400"
                          >
                            {hasActiveFilters
                              ? 'No transactions match your filters.'
                              : 'No transactions yet — top up to get started.'}
                          </td>
                        </tr>
                      )
                    : txResult?.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatTxDate(tx.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <TypeBadge type={tx.type} />
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {tx.description.slice(0, 50)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
                              tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {tx.amount >= 0 ? '+' : ''}₦{Math.abs(tx.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                            ₦{Number(tx.balanceAfter).toLocaleString()}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {txResult && totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {txResult.total} transactions
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                  data-testid="prev-page"
                >
                  ← Previous
                </button>
                <span className="px-2 py-1.5 text-xs text-slate-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                  data-testid="next-page"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
