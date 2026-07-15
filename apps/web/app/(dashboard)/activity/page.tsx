'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, isToday } from 'date-fns';
import { api } from '@/lib/api';

interface ActivityLogEntry {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityLogResponse {
  data: ActivityLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  'transaction.created':    { label: 'Sale',              dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  'transaction.voided':     { label: 'Void',              dot: 'bg-red-500',     bg: 'bg-red-50',      text: 'text-red-700'     },
  'customer.registered':    { label: 'Registration',      dot: 'bg-blue-500',    bg: 'bg-blue-50',     text: 'text-blue-700'    },
  'redemption.created':     { label: 'Redemption',        dot: 'bg-violet-500',  bg: 'bg-violet-50',   text: 'text-violet-700'  },
  'cashier.created':        { label: 'Cashier Added',     dot: 'bg-slate-500',   bg: 'bg-slate-100',   text: 'text-slate-700'   },
  'cashier.activated':      { label: 'Cashier Activated', dot: 'bg-emerald-400', bg: 'bg-emerald-50',  text: 'text-emerald-600' },
  'cashier.deactivated':    { label: 'Cashier Disabled',  dot: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700'   },
  'cashier.password_reset': { label: 'Password Reset',    dot: 'bg-amber-400',   bg: 'bg-amber-50',    text: 'text-amber-700'   },
  'auth.login':             { label: 'Sign In',           dot: 'bg-teal-500',    bg: 'bg-teal-50',     text: 'text-teal-700'    },
  'auth.logout':            { label: 'Sign Out',          dot: 'bg-slate-400',   bg: 'bg-slate-100',   text: 'text-slate-600'   },
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  system: 'System',
};

const ALL_ACTIONS = Object.keys(ACTION_CONFIG);

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Today ${format(d, 'HH:mm')}`;
  return format(d, 'EEE d MMM, HH:mm');
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? { label: action, dot: 'bg-slate-400', bg: 'bg-slate-100', text: 'text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 50;

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function ActivityPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState('');
  const today = todayStr();

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.replace('/login');
      return;
    }
    setMounted(true);
  }, [router]);

  useEffect(() => {
    if (!mounted) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (actionFilter) params.set('action', actionFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    api
      .get<ActivityLogResponse>(`/api/v1/activity-logs?${params.toString()}`)
      .then((res) => {
        setEntries(res.data);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load activity logs');
        setEntries([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page, actionFilter, startDate, endDate, mounted]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, startDate, endDate]);

  const isFiltered = actionFilter !== '' || startDate !== today || endDate !== '';

  function clearFilters() {
    setActionFilter('');
    setStartDate(todayStr());
    setEndDate('');
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Activity Log</h1>
            <p className="text-sm text-slate-500">All actions taken within your account — last 90 days</p>
          </div>
          <span className="text-xs text-slate-400">
            {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20"
          >
            <option value="">All activity types</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_CONFIG[a].label}</option>
            ))}
          </select>

          <input
            type="date"
            max={today}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]"
          />
          <span className="text-sm text-slate-400">→</span>
          <input
            type="date"
            max={today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/20 [color-scheme:light]"
          />

          {isFiltered && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-0 divide-y divide-slate-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-3.5">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                  </div>
                  <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-red-500">{error}</p>
              <p className="mt-1 text-xs text-slate-400">Check that you are logged in and try refreshing the page.</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-400">No activity found for this date</p>
              {isFiltered && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm font-medium text-[#0F1E35] underline"
                >
                  Back to today
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1.5 px-4 py-3.5 transition-colors duration-150 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="shrink-0 sm:w-36">
                    <ActionBadge action={entry.action} />
                  </div>

                  <p className="flex-1 text-sm text-slate-800">{entry.description}</p>

                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <div className="flex flex-col items-end gap-0.5">
                      {entry.actorName ? (
                        <>
                          <span className="text-xs font-semibold text-slate-700">{entry.actorName}</span>
                          {entry.actorRole && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
                            </span>
                          )}
                        </>
                      ) : entry.actorRole ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
                          System
                        </span>
                      )}
                    </div>
                    <time
                      dateTime={entry.createdAt}
                      title={format(new Date(entry.createdAt), 'PPpp')}
                      className="shrink-0 text-xs text-slate-400"
                    >
                      {formatTime(entry.createdAt)}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer */}
          {!loading && entries.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <span className="text-xs text-slate-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-7 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:border-slate-400 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="px-2 text-xs text-slate-500">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-7 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:border-slate-400 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">
          Activity logs are automatically deleted after 90 days
        </p>
      </div>
    </div>
  );
}
