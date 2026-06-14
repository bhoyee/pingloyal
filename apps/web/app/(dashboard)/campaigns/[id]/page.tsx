'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { api, type Campaign, type CampaignStats as CampaignStatsType, type CampaignLogRow, type Category, type TenantMe, type TierConfig } from '@/lib/api';
import { describeAudience } from '@/lib/audience';
import { StatusBadge } from '@/components/campaigns/StatusBadge';
import { CampaignStats } from '@/components/campaigns/CampaignStats';
import { Button } from '@/components/ui/button';

const LOG_STATUS_COLOURS: Record<string, string> = {
  queued:    'bg-slate-100 text-slate-600',
  sent:      'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-600',
};

type LogFilter = 'all' | 'delivered' | 'failed';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function formatTime(value: string | null): string {
  if (!value) return '—';
  return format(new Date(value), 'h:mm:ss a');
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStatsType | null>(null);
  const [logs, setLogs] = useState<CampaignLogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState<number>(25);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lapsedDays, setLapsedDays] = useState(60);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStats() {
    try {
      const s = await api.get<CampaignStatsType>(`/api/v1/campaigns/${id}/stats`);
      setStats(s);
      return s;
    } catch {
      return null;
    }
  }

  async function fetchLogs(page: number, filter: LogFilter, pageSize: number) {
    try {
      const statusParam = filter === 'all' ? '' : `&status=${filter}`;
      const result = await api.get<{ data: CampaignLogRow[]; total: number }>(
        `/api/v1/campaigns/${id}/logs?page=${page}&limit=${pageSize}${statusParam}`,
      );
      setLogs(result.data);
      setLogsTotal(result.total);
    } catch {
      // ignore
    }
  }

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<Campaign>(`/api/v1/campaigns/${id}`).then(setCampaign).catch(() => null),
      fetchStats(),
      fetchLogs(1, 'all', logsPageSize),
    ]).finally(() => setLoading(false));

    void api.get<TierConfig[]>('/api/v1/tenants/tier-config').then(setTiers).catch(() => null);
    void api.get<Category[]>('/api/v1/tenants/categories').then(setCategories).catch(() => null);
    void api.get<TenantMe>('/api/v1/tenants/me').then((t) => setLapsedDays(t.lapsedDays)).catch(() => null);
  }, [id]);

  function changeLogFilter(filter: LogFilter) {
    setLogFilter(filter);
    setLogsPage(1);
    void fetchLogs(1, filter, logsPageSize);
  }

  function changeLogsPageSize(size: number) {
    setLogsPageSize(size);
    setLogsPage(1);
    void fetchLogs(1, logFilter, size);
  }

  // Auto-refresh when sending
  useEffect(() => {
    if (stats?.status !== 'sending') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(async () => {
      const updated = await fetchStats();
      if (updated?.status === 'sent' || updated?.status === 'cancelled') {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stats?.status, id]);

  async function cancelCampaign() {
    if (!confirm('Cancel this scheduled campaign?')) return;
    setCancelling(true);
    try {
      await api.post(`/api/v1/campaigns/${id}/cancel`, {});
      setToast('Campaign cancelled');
      const updated = await api.get<Campaign>(`/api/v1/campaigns/${id}`);
      setCampaign(updated);
    } catch {
      setToast('Failed to cancel campaign');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  if (!campaign || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Campaign not found</p>
      </div>
    );
  }

  const filterTabs: { key: LogFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.totalRecipients },
    { key: 'delivered', label: 'Delivered', count: stats.deliveredCount },
    { key: 'failed', label: 'Failed', count: stats.failedCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/campaigns')}
              className="cursor-pointer flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold text-slate-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          {campaign.status === 'scheduled' && (
            <Button
              variant="destructive"
              size="sm"
              loading={cancelling}
              onClick={() => void cancelCampaign()}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        {/* Stats */}
        <CampaignStats
          totalRecipients={stats.totalRecipients}
          deliveredCount={stats.deliveredCount}
          failedCount={stats.failedCount}
          deliveryRate={stats.deliveryRate}
          sentAt={stats.sentAt}
        />

        {/* Campaign message & audience target */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="animate-fade-in-up rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm transition-shadow duration-300 [animation-delay:100ms] hover:shadow-md">
            <p className="text-sm font-bold text-slate-900">Campaign Message</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{campaign.messageBody}</p>
          </div>
          <div className="animate-fade-in-up rounded-xl border border-sky-100 bg-sky-50 p-4 shadow-sm transition-shadow duration-300 [animation-delay:150ms] hover:shadow-md">
            <p className="text-sm font-bold text-slate-900">Audience Target</p>
            <p className="mt-2 text-sm text-slate-700">
              {describeAudience(campaign, tiers, categories, lapsedDays)}
            </p>
          </div>
        </div>

        {/* Recipient log table */}
        <div className="animate-fade-in-up rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 [animation-delay:200ms] hover:shadow-md">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="mb-1 text-sm font-bold text-slate-900">Recipients</h2>
            <p className="mb-3 text-xs text-slate-400">
              Everyone this campaign was sent to, and their delivery status.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center gap-1">
              {filterTabs.map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => changeLogFilter(key)}
                  className={`cursor-pointer flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                    logFilter === key
                      ? 'border-[#0F1E35] bg-[#0F1E35] text-white shadow-sm'
                      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      logFilter === key
                        ? 'bg-white/15 text-white ring-1 ring-white/25'
                        : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Rows per page
              <select
                value={logsPageSize}
                onChange={(e) => changeLogsPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No recipients yet
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">WA Message ID</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Sent At</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Delivered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3 font-medium text-slate-900">{log.customerName}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${LOG_STATUS_COLOURS[log.status] ?? 'bg-slate-100 text-slate-500'}`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">
                        {log.waMessageId ? `${log.waMessageId.slice(0, 12)}…` : '–'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatTime(log.sentAt)}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatTime(log.deliveredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* Pagination */}
              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  Page {logsPage} · {logsTotal} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsPage === 1}
                    onClick={() => {
                      const p = logsPage - 1;
                      setLogsPage(p);
                      void fetchLogs(p, logFilter, logsPageSize);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsPage * logsPageSize >= logsTotal}
                    onClick={() => {
                      const p = logsPage + 1;
                      setLogsPage(p);
                      void fetchLogs(p, logFilter, logsPageSize);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
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
