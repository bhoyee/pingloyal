'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, isToday, differenceInCalendarDays } from 'date-fns';
import { api, type TenantMe } from '@/lib/api';

type DateRangePreset = 'today' | 'last7' | 'month' | 'custom';

interface TransactionLogRow {
  id: string;
  amount: string;
  pointsEarned: number;
  source: string;
  createdAt: string;
  customer: { id: string; fullName: string } | null;
  categoryName: string | null;
  cashierName: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  voidedAt: string | null;
}

interface TransactionListResponse {
  data: TransactionLogRow[];
  total: number;
  page: number;
  limit: number;
  totalAmount: string;
  totalPoints: number;
}

interface CashierOption {
  id: string;
  fullName: string;
  isActive: boolean;
}

interface Profile {
  role: string;
}

const PAGE_SIZE = 50;

const SOURCE_BADGES: Record<string, { label: string; classes: string }> = {
  cashier_app: { label: 'PWA', classes: 'bg-slate-100 text-slate-600' },
  webhook: { label: 'Webhook', classes: 'bg-blue-100 text-blue-700' },
  api_pull: { label: 'API', classes: 'bg-blue-100 text-blue-700' },
  file_import: { label: 'API', classes: 'bg-blue-100 text-blue-700' },
};

// ── Tenant-timezone-aware date helpers ──────────────────────────────────────
// No date-fns-tz dependency exists in this repo. Offset is derived by
// formatting the same instant as both UTC and the target timezone via
// Intl, then diffing the two readings.

function offsetMsAt(date: Date, timezone: string): number {
  const utcReading = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const tzReading = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getTime();
  return tzReading - utcReading;
}

function zonedMidnight(ymd: string, timezone: string): Date {
  const naive = new Date(`${ymd}T00:00:00.000Z`);
  return new Date(naive.getTime() - offsetMsAt(naive, timezone));
}

function zonedEndOfDay(ymd: string, timezone: string): Date {
  const naive = new Date(`${ymd}T23:59:59.999Z`);
  return new Date(naive.getTime() - offsetMsAt(naive, timezone));
}

function todayYmd(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function firstOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function computeRange(
  preset: DateRangePreset,
  timezone: string,
  customStart: string,
  customEnd: string,
): { startDate: Date; endDate: Date } {
  const today = todayYmd(timezone);
  if (preset === 'last7') {
    return { startDate: zonedMidnight(shiftYmd(today, -6), timezone), endDate: new Date() };
  }
  if (preset === 'month') {
    return { startDate: zonedMidnight(firstOfMonthYmd(today), timezone), endDate: new Date() };
  }
  if (preset === 'custom') {
    return {
      startDate: zonedMidnight(customStart || today, timezone),
      endDate: customEnd ? zonedEndOfDay(customEnd, timezone) : new Date(),
    };
  }
  return { startDate: zonedMidnight(today, timezone), endDate: new Date() };
}

function formatRowTime(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return `Today ${format(date, 'HH:mm')}`;
  const daysAgo = differenceInCalendarDays(new Date(), date);
  if (daysAgo < 7) return formatDistanceToNow(date, { addSuffix: true });
  return format(date, 'EEE d MMM HH:mm');
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [preset, setPreset] = useState<DateRangePreset>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [jumpPage, setJumpPage] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const voidingRef = useRef(false);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.replace('/login');
      return;
    }
    setMounted(true);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [preset, customStart, customEnd, cashierId]);

  const { data: profile } = useQuery<Profile>({
    queryKey: ['auth-me'],
    queryFn: () => api.get<Profile>('/api/v1/auth/me'),
    enabled: mounted,
  });

  useEffect(() => {
    if (profile && profile.role !== 'owner' && profile.role !== 'manager') {
      router.replace('/dashboard');
    }
  }, [profile, router]);

  const allowed = !profile || profile.role === 'owner' || profile.role === 'manager';

  const { data: tenant } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
    enabled: mounted,
  });

  const { data: cashiers } = useQuery<CashierOption[]>({
    queryKey: ['users-cashiers'],
    queryFn: () => api.get<CashierOption[]>('/api/v1/users/cashiers'),
    enabled: mounted,
  });
  const activeCashiers = (cashiers ?? []).filter((c) => c.isActive);

  const timezone = tenant?.timezone ?? 'Africa/Lagos';
  const isLiveView = preset === 'today';

  const { data, isLoading, isFetching } = useQuery<TransactionListResponse>({
    queryKey: ['transactions', preset, customStart, customEnd, cashierId, search, page, timezone],
    queryFn: () => {
      const { startDate, endDate } = computeRange(preset, timezone, customStart, customEnd);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      if (cashierId) params.set('cashierId', cashierId);
      if (search) params.set('search', search);
      return api.get<TransactionListResponse>(`/api/v1/transactions?${params.toString()}`);
    },
    enabled: mounted && !!tenant,
    refetchInterval: isLiveView ? 30_000 : false,
    placeholderData: (prev) => prev,
  });

  function handleExportCsv() {
    const { startDate, endDate } = computeRange(preset, timezone, customStart, customEnd);
    const params = new URLSearchParams({
      page: '1',
      limit: '10000',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    if (cashierId) params.set('cashierId', cashierId);
    if (search) params.set('search', search);
    void api
      .get<TransactionListResponse>(`/api/v1/transactions?${params.toString()}`)
      .then(({ data: rows }) => {
        const header = 'Date,Customer,Amount,Points,Cashier,Source\n';
        const csvRows = rows.map((tx) =>
          [
            new Date(tx.createdAt).toISOString(),
            `"${(tx.customer?.fullName ?? '').replace(/"/g, '""')}"`,
            tx.amount,
            tx.pointsEarned,
            `"${(tx.cashierName ?? '').replace(/"/g, '""')}"`,
            tx.source,
          ].join(','),
        );
        const csv = header + csvRows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transactions.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  function handleJumpToPage(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(jumpPage, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n);
    }
    setJumpPage('');
  }

  const handleVoid = useCallback(async (tx: TransactionLogRow) => {
    if (voidingRef.current) return;
    const customerName = tx.customer?.fullName ?? 'this customer';
    const confirmed = window.confirm(
      `Void this transaction?\n\n` +
      `Customer: ${customerName}\n` +
      `Amount: ₦${Number(tx.amount).toLocaleString()}\n` +
      `Points: +${tx.pointsEarned}\n\n` +
      `This will deduct ${tx.pointsEarned} pts from the customer's balance (balance may go negative). This cannot be undone.`
    );
    if (!confirmed) return;
    voidingRef.current = true;
    setVoidingId(tx.id);
    try {
      await api.post(`/api/v1/transactions/${tx.id}/void`, {});
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch {
      window.alert('Failed to void transaction. Please try again.');
    } finally {
      voidingRef.current = false;
      setVoidingId(null);
    }
  }, [queryClient]);

  if (!allowed) {
    return null;
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalAmount = Number(data?.totalAmount ?? 0);
  const totalPoints = data?.totalPoints ?? 0;
  const avgPerTransaction = total > 0 ? totalAmount / total : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isConnectedMode = tenant?.mode === 'connected';

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">Transactions</h1>
            <span
              data-testid="live-indicator"
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                isLiveView ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isLiveView ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              {isLiveView ? 'Live' : 'Historical'}
            </span>
            {isFetching && !isLoading && (
              <span className="text-xs text-slate-400">Refreshing…</span>
            )}
          </div>

          <button
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            className="self-start rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 sm:self-auto"
          >
            Export CSV
          </button>
        </div>

        {/* Filter bar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            data-testid="date-range-select"
            value={preset}
            onChange={(e) => setPreset(e.target.value as DateRangePreset)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
          >
            <option value="today">Today</option>
            <option value="last7">Last 7 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </select>

          {preset === 'custom' && (
            <>
              <input
                type="date"
                data-testid="custom-start-date"
                max={today}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]"
              />
              <span className="text-sm text-slate-400">→</span>
              <input
                type="date"
                data-testid="custom-end-date"
                max={today}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#0F1E35] focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]"
              />
            </>
          )}

          <select
            data-testid="cashier-select"
            value={cashierId}
            onChange={(e) => setCashierId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
          >
            <option value="">All cashiers</option>
            {activeCashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </select>

          <input
            type="text"
            data-testid="customer-search-input"
            placeholder="Search by customer name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 sm:w-64"
          />
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
        {/* Summary bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Transactions</p>
            <p data-testid="summary-count" className="mt-1 text-xl font-bold text-slate-900">
              {total.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Total Spend</p>
            <p data-testid="summary-spend" className="mt-1 text-xl font-bold text-slate-900">
              ₦{totalAmount.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Points Issued</p>
            <p data-testid="summary-points" className="mt-1 text-xl font-bold text-emerald-600">
              {totalPoints.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Avg / Transaction</p>
            <p data-testid="summary-avg" className="mt-1 text-xl font-bold text-slate-900">
              ₦{Math.round(avgPerTransaction).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date/Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Points</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Cashier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    {preset === 'today' ? (
                      <div data-testid="empty-state-today" className="space-y-2">
                        <p className="text-sm text-slate-400">No transactions logged today yet</p>
                        {isConnectedMode ? (
                          <p className="text-xs text-slate-400">
                            Transactions will appear here as purchases sync in
                          </p>
                        ) : (
                          <a
                            href="/cashier"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                          >
                            Open Cashier App
                          </a>
                        )}
                      </div>
                    ) : (
                      <div data-testid="empty-state-range" className="space-y-2">
                        <p className="text-sm text-slate-400">No transactions found for this range</p>
                        <button
                          onClick={() => setPreset('today')}
                          className="inline-block rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
                        >
                          View Today
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((tx) => {
                  const badge = SOURCE_BADGES[tx.source] ?? { label: tx.source, classes: 'bg-slate-100 text-slate-600' };
                  const isVoided = !!tx.voidedAt;
                  const isFlaggedOpen = tx.isFlagged && !isVoided;
                  const rowClass = isFlaggedOpen
                    ? 'bg-red-50 border-l-4 border-l-red-400'
                    : isVoided
                    ? 'bg-slate-50 opacity-60'
                    : 'hover:bg-slate-50 transition-colors';
                  const canVoid = !isVoided && profile?.role === 'owner' || profile?.role === 'manager';
                  return (
                    <tr key={tx.id} data-testid="tx-row" className={rowClass}>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div>{formatRowTime(tx.createdAt)}</div>
                        {isFlaggedOpen && (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            ⚠ Flagged
                          </span>
                        )}
                        {isVoided && (
                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            Voided
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tx.customer ? (
                          <button
                            onClick={() => router.push(`/customers/${tx.customer!.id}`)}
                            className={`cursor-pointer font-medium hover:underline ${isFlaggedOpen ? 'text-red-700' : 'text-[#0F1E35]'}`}
                          >
                            {tx.customer.fullName}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right ${isFlaggedOpen ? 'font-semibold text-red-700' : 'text-slate-700'}`}>
                        ₦{Number(tx.amount).toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${isFlaggedOpen ? 'text-red-600' : isVoided ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                        +{tx.pointsEarned}
                        {isFlaggedOpen && tx.flagReason && (
                          <span className="ml-1 text-[10px] font-normal text-red-400" title={tx.flagReason}>ⓘ</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {tx.cashierName ? tx.cashierName.split(' ')[0] : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {tx.customer && (
                            <button
                              onClick={() => router.push(`/customers/${tx.customer!.id}?tab=transactions`)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-400"
                            >
                              View
                            </button>
                          )}
                          {canVoid && !isVoided && (
                            <button
                              onClick={() => void handleVoid(tx)}
                              disabled={voidingId === tx.id}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-400 hover:bg-red-100 disabled:opacity-50"
                            >
                              {voidingId === tx.id ? 'Voiding…' : 'Void'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {!isLoading && rows.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span data-testid="pagination-summary">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:border-emerald-300 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:border-emerald-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                  <form onSubmit={handleJumpToPage} className="flex items-center gap-1">
                    <input
                      type="number"
                      data-testid="jump-to-page-input"
                      min={1}
                      max={totalPages}
                      value={jumpPage}
                      onChange={(e) => setJumpPage(e.target.value)}
                      placeholder="Go to…"
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-slate-700"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:border-emerald-300"
                    >
                      Go
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
