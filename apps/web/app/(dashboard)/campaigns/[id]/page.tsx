'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { api, type Campaign, type CampaignStats as CampaignStatsType, type CampaignLogRow } from '@/lib/api';
import { StatusBadge } from '@/components/campaigns/StatusBadge';
import { CampaignStats } from '@/components/campaigns/CampaignStats';
import { Button } from '@/components/ui/button';

function maskName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

const LOG_STATUS_COLOURS: Record<string, string> = {
  queued:    'bg-slate-100 text-slate-600',
  sent:      'bg-green-100 text-green-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-600',
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStatsType | null>(null);
  const [logs, setLogs] = useState<CampaignLogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  async function fetchLogs(page: number) {
    try {
      const result = await api.get<{ data: CampaignLogRow[]; total: number }>(
        `/api/v1/campaigns/${id}/logs?page=${page}&limit=50`,
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
      fetchLogs(1),
    ]).finally(() => setLoading(false));
  }, [id]);

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

  async function duplicateCampaign() {
    if (!campaign) return;
    try {
      const newCampaign = await api.post<{ id: string }>('/api/v1/campaigns', {
        name: `${campaign.name} (copy)`,
        messageBody: campaign.messageBody,
        segmentRules: campaign.segmentRules,
      });
      router.push(`/campaigns/${newCampaign.id}`);
    } catch {
      setToast('Failed to duplicate campaign');
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button
                onClick={() => router.push('/campaigns')}
                className="mb-2 text-sm text-slate-500 hover:text-slate-700"
              >
                ← Campaigns
              </button>
              <h1 className="text-xl font-bold text-slate-900">{campaign.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <StatusBadge status={campaign.status} />
                <span className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void duplicateCampaign()}>
                Duplicate
              </Button>
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
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        {/* Stats */}
        <CampaignStats
          totalRecipients={stats.totalRecipients}
          sentCount={stats.sentCount}
          deliveredCount={stats.deliveredCount}
          failedCount={stats.failedCount}
          deliveryRate={stats.deliveryRate}
        />

        {/* Recipient log table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">
              Recipients{' '}
              <span className="font-normal text-slate-400">({logsTotal})</span>
            </h2>
          </div>
          {logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No recipients yet
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Sent At</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log, i) => (
                    <tr key={i}>
                      <td className="px-5 py-3 text-slate-700">{maskName(log.customerName)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${LOG_STATUS_COLOURS[log.status] ?? 'bg-slate-100 text-slate-500'}`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {log.sentAt
                          ? formatDistanceToNow(new Date(log.sentAt), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-red-400">
                        {log.errorMessage ? log.errorMessage.slice(0, 50) : ''}
                      </td>
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
                      void fetchLogs(p);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsPage * 50 >= logsTotal}
                    onClick={() => {
                      const p = logsPage + 1;
                      setLogsPage(p);
                      void fetchLogs(p);
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
