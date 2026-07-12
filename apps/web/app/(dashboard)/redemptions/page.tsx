'use client';
import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type DatePreset = 'today' | 'last7' | 'thisMonth' | 'allTime' | 'custom';
type SortField = 'redeemedAt' | 'pointsRedeemed' | 'value';
type SortOrder = 'ASC' | 'DESC';

interface RedemptionRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  redeemedAt: string;
  pointsRedeemed: number;
  rewardsCount: number;
  value: number;
  balanceAfter: number;
  cashierName: string | null;
}

interface RedemptionListResult {
  data: RedemptionRow[];
  total: number;
  page: number;
  limit: number;
}

interface RedemptionStats {
  totalRedemptions: number;
  totalPointsRedeemed: number;
  totalValue: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000).toLocaleString()}k`;
  return `₦${n.toLocaleString()}`;
}

function getDateRange(
  preset: DatePreset,
  custom: { start: string; end: string },
): { startDate?: string; endDate?: string } {
  const today = new Date();
  if (preset === 'today') {
    const d = format(today, 'yyyy-MM-dd');
    return { startDate: d, endDate: d };
  }
  if (preset === 'last7') {
    return {
      startDate: format(subDays(today, 6), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    };
  }
  if (preset === 'thisMonth') {
    return {
      startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'custom') {
    return { startDate: custom.start, endDate: custom.end };
  }
  return {}; // allTime — no date filter
}

function buildUrl(params: {
  startDate?: string;
  endDate?: string;
  search: string;
  page: number;
  sortBy: SortField;
  sortOrder: SortOrder;
}) {
  const q = new URLSearchParams();
  if (params.startDate) q.set('startDate', params.startDate);
  if (params.endDate) q.set('endDate', params.endDate);
  if (params.search) q.set('search', params.search);
  q.set('page', String(params.page));
  q.set('limit', String(PAGE_SIZE));
  q.set('sortBy', params.sortBy);
  q.set('sortOrder', params.sortOrder);
  return `/api/v1/redemptions?${q.toString()}`;
}

function buildStatsUrl(params: { startDate?: string; endDate?: string }) {
  const q = new URLSearchParams();
  if (params.startDate) q.set('startDate', params.startDate);
  if (params.endDate) q.set('endDate', params.endDate);
  return `/api/v1/redemptions/stats?${q.toString()}`;
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ field, sortBy, sortOrder }: { field: SortField; sortBy: SortField; sortOrder: SortOrder }) {
  if (sortBy !== field) return <span className="ml-1 text-slate-300">↕</span>;
  return <span className="ml-1 text-[#0DC56A]">{sortOrder === 'DESC' ? '↓' : '↑'}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RedemptionsPage() {
  const [preset, setPreset] = useState<DatePreset>('last7');
  const [custom, setCustom] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>('redeemedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');

  // Debounce search input
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const { startDate, endDate } = getDateRange(preset, custom);

  const listUrl = buildUrl({ startDate, endDate, search: debouncedSearch, page, sortBy, sortOrder });
  const statsUrl = buildStatsUrl({ startDate, endDate });

  const { data, isLoading, isError } = useQuery<RedemptionListResult>({
    queryKey: ['redemptions-list', listUrl],
    queryFn: () => api.get<RedemptionListResult>(listUrl),
    retry: false,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<RedemptionStats>({
    queryKey: ['redemptions-stats', statsUrl],
    queryFn: () => api.get<RedemptionStats>(statsUrl),
    retry: false,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  // When preset or search changes, reset to page 1
  function changePreset(p: DatePreset) {
    setPreset(p);
    setPage(1);
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'DESC' ? 'ASC' : 'DESC'));
    } else {
      setSortBy(field);
      setSortOrder('DESC');
    }
    setPage(1);
  }

  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'last7', label: 'Last 7 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'allTime', label: 'All time' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Redemptions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Full history of loyalty rewards redeemed by your customers.
        </p>
      </div>

      {/* ── Summary stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Redemptions
          </p>
          {statsLoading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-slate-200" />
          ) : (
            <p className="mt-2 text-2xl font-bold text-slate-900 animate-fade-in-up">
              {stats ? fmt(stats.totalRedemptions) : '—'}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Points Redeemed
          </p>
          {statsLoading ? (
            <div className="mt-3 h-8 w-28 animate-pulse rounded-lg bg-slate-200" />
          ) : (
            <p className="mt-2 text-2xl font-bold text-slate-900 animate-fade-in-up">
              {stats ? fmt(stats.totalPointsRedeemed) : '—'}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Value Given Out
          </p>
          {statsLoading ? (
            <div className="mt-3 h-8 w-20 animate-pulse rounded-lg bg-slate-200" />
          ) : (
            <p className="mt-2 text-2xl font-bold text-[#0a9f54] animate-fade-in-up">
              {stats ? fmtCurrency(stats.totalValue) : '—'}
            </p>
          )}
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date presets */}
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => changePreset(p.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  preset === p.key
                    ? 'bg-[#0DC56A] text-white'
                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date pickers */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Start date"
                value={custom.start}
                max={custom.end}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, start: e.target.value }));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
              />
              <span className="text-sm text-slate-400">to</span>
              <input
                type="date"
                aria-label="End date"
                value={custom.end}
                min={custom.start}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, end: e.target.value }));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
              />
            </div>
          )}

          {/* Search */}
          <div className="relative ml-auto">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search customer name or phone…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-72 rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-400" role="status">
            <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading redemptions…
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-6 text-center text-sm text-red-500">
            Failed to load redemptions. Please try again.
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-slate-500">No redemptions found</p>
                <p className="mt-1 text-xs text-slate-400">
                  {debouncedSearch
                    ? 'Try a different search term or clear the filter.'
                    : 'No rewards were redeemed in this period.'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-5 pb-3 pt-4">
                          <button
                            onClick={() => toggleSort('redeemedAt')}
                            className="flex items-center hover:text-slate-700"
                          >
                            Date / Time <SortIcon field="redeemedAt" sortBy={sortBy} sortOrder={sortOrder} />
                          </button>
                        </th>
                        <th className="px-5 pb-3 pt-4">Customer</th>
                        <th className="px-5 pb-3 pt-4">Phone</th>
                        <th className="px-5 pb-3 pt-4 text-right">
                          <button
                            onClick={() => toggleSort('pointsRedeemed')}
                            className="ml-auto flex items-center hover:text-slate-700"
                          >
                            Points <SortIcon field="pointsRedeemed" sortBy={sortBy} sortOrder={sortOrder} />
                          </button>
                        </th>
                        <th className="px-5 pb-3 pt-4 text-right">
                          <button
                            onClick={() => toggleSort('value')}
                            className="ml-auto flex items-center hover:text-slate-700"
                          >
                            Value <SortIcon field="value" sortBy={sortBy} sortOrder={sortOrder} />
                          </button>
                        </th>
                        <th className="px-5 pb-3 pt-4 text-right">Rewards</th>
                        <th className="px-5 pb-3 pt-4 text-right">Balance After</th>
                        <th className="px-5 pb-3 pt-4">Cashier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.data.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3.5 text-slate-500">
                            {new Date(row.redeemedAt).toLocaleString('en-NG', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-5 py-3.5">
                            <a
                              href={`/customers/${row.customerId}`}
                              className="font-medium text-slate-800 hover:text-[#0DC56A] hover:underline"
                            >
                              {row.customerName}
                            </a>
                          </td>
                          <td className="px-5 py-3.5 text-slate-500">{row.customerPhone}</td>
                          <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                            {fmt(row.pointsRedeemed)} pts
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold text-[#0a9f54]">
                            ₦{row.value.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-600">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              ×{row.rewardsCount}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-slate-500">
                            {fmt(row.balanceAfter)} pts
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {row.cashierName ?? <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Pagination ──────────────────────────────────────────── */}
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                  <span>
                    {data.total === 0
                      ? 'No results'
                      : `Showing ${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, data.total)} of ${fmt(data.total)} redemptions`}
                  </span>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                        aria-label="First page"
                      >
                        «
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                      >
                        ← Prev
                      </button>

                      {/* Page number buttons — show at most 5 around the current page */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(
                          (n) =>
                            n === 1 ||
                            n === totalPages ||
                            Math.abs(n - page) <= 2,
                        )
                        .reduce<(number | '…')[]>((acc, n, i, arr) => {
                          if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('…');
                          acc.push(n);
                          return acc;
                        }, [])
                        .map((item, i) =>
                          item === '…' ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-slate-300">
                              …
                            </span>
                          ) : (
                            <button
                              key={item}
                              onClick={() => setPage(item as number)}
                              className={`min-w-[28px] rounded px-2 py-1 font-medium ${
                                item === page
                                  ? 'bg-[#0DC56A] text-white'
                                  : 'hover:bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item}
                            </button>
                          ),
                        )}

                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Next →
                      </button>
                      <button
                        onClick={() => setPage(totalPages)}
                        disabled={page >= totalPages}
                        className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                        aria-label="Last page"
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
