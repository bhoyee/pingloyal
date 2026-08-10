'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { api, ApiError, type Campaign, type CampaignStatus, type Category, type TenantMe, type TierConfig } from '@/lib/api';
import { describeAudience } from '@/lib/audience';
import { StatusBadge } from '@/components/campaigns/StatusBadge';
import { Button } from '@/components/ui/button';

const STATUSES: { key: CampaignStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sending', label: 'Sending' },
  { key: 'sent', label: 'Sent' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function formatDate(campaign: Campaign): string {
  const date =
    campaign.scheduledAt ??
    campaign.sentAt ??
    campaign.createdAt;
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '—';
  }
}

function deliveryRatePercent(c: Campaign): number | null {
  if (c.sentCount === 0) return null;
  return Math.round((c.deliveredCount / c.sentCount) * 100);
}

function CampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get('status') ?? 'all') as CampaignStatus | 'all';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lapsedDays, setLapsedDays] = useState(60);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    setLoading(true);
    void api
      .get<Campaign[]>('/api/v1/campaigns')
      .then((data) => setCampaigns(data))
      .catch(() => null)
      .finally(() => setLoading(false));

    void api.get<TierConfig[]>('/api/v1/tenants/tier-config').then(setTiers).catch(() => null);
    void api.get<Category[]>('/api/v1/tenants/categories').then(setCategories).catch(() => null);
    void api.get<TenantMe>('/api/v1/tenants/me').then((t) => setLapsedDays(t.lapsedDays)).catch(() => null);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const filtered = campaigns.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const countByStatus = (s: CampaignStatus | 'all') =>
    s === 'all' ? campaigns.length : campaigns.filter((c) => c.status === s).length;

  function setFilter(s: CampaignStatus | 'all') {
    const params = new URLSearchParams(searchParams.toString());
    if (s === 'all') params.delete('status');
    else params.set('status', s);
    router.push(`/campaigns?${params.toString()}`);
  }

  function requestDelete(e: React.MouseEvent, campaign: Campaign) {
    e.stopPropagation();
    setDeleteReason('');
    setDeleteTarget(campaign);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/campaigns/${deleteTarget.id}`, {
        reason: deleteReason.trim() || undefined,
      });
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Campaign deleted');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to delete campaign', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-emerald-50/40">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-slate-900">Campaigns</h1>
            <span className="text-xs text-slate-400">WhatsApp broadcast engine</span>
          </div>
          <Button className="self-start sm:self-auto" onClick={() => router.push('/campaigns/new')}>
            + New Campaign
          </Button>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
        {/* Status filter tabs */}
        <div
          className="flex flex-wrap gap-1 overflow-x-auto"
          data-testid="status-filter-tabs"
        >
          {STATUSES.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`filter-tab-${key}`}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F1E35] focus-visible:ring-offset-2 ${
                statusFilter === key
                  ? 'border-[#0F1E35] bg-[#0F1E35] text-white shadow-sm hover:bg-[#1a3050]'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 hover:shadow-sm'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  statusFilter === key
                    ? 'bg-white/15 text-white ring-1 ring-white/25'
                    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                }`}
              >
                {countByStatus(key)}
              </span>
            </button>
          ))}
        </div>

        {/* Search + rows per page */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by campaign name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:w-80"
          />
          <label className="flex items-center gap-1.5 self-start text-sm text-slate-600 sm:self-auto sm:ml-auto">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg
              className="mb-4 h-16 w-16 text-slate-300"
              fill="none"
              viewBox="0 0 64 64"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 16h48M8 32h32M8 48h20M44 40l8 8m0-8l-8 8"
              />
            </svg>
            <p className="text-lg font-semibold text-slate-700">
              {search || statusFilter !== 'all' ? 'No campaigns match your filters' : 'No campaigns yet'}
            </p>
            {!search && statusFilter === 'all' && (
              <>
                <p className="mt-1 text-sm text-slate-500">
                  Create your first campaign to send a WhatsApp message to your customers
                </p>
                <Button className="mt-6" onClick={() => router.push('/campaigns/new')}>
                  + Create Campaign
                </Button>
              </>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Campaign Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Recipients</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Delivery Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="cursor-pointer transition-colors hover:bg-emerald-50"
                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{campaign.name}</p>
                      <p className="text-xs text-slate-400">{describeAudience(campaign, tiers, categories, lapsedDays)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{campaign.totalRecipients}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const pct = deliveryRatePercent(campaign);
                        if (pct === null) {
                          return <span className="text-slate-400">—</span>;
                        }
                        return (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${
                                  pct >= 80
                                    ? 'bg-emerald-500'
                                    : pct >= 50
                                      ? 'bg-amber-500'
                                      : 'bg-red-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600">{pct}%</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(campaign)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {campaign.status === 'draft' && (
                          <button
                            className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-100 hover:text-blue-700 hover:shadow-sm"
                            onClick={() => router.push(`/campaigns/${campaign.id}/edit`)}
                          >
                            Edit
                          </button>
                        )}
                        {campaign.status === 'draft' && (
                          <button
                            className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 hover:shadow-sm"
                            onClick={(e) => requestDelete(e, campaign)}
                          >
                            Delete
                          </button>
                        )}
                        {campaign.status === 'sent' && (
                          <button
                            className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 hover:shadow-sm"
                            onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} campaigns
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
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Delete campaign?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete <span className="font-medium text-slate-900">&quot;{deleteTarget.name}&quot;</span>?
              This action cannot be undone.
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-500">
              Reason (optional)
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              placeholder="Why are you deleting this campaign?"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F1E35] focus:border-transparent"
            />
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => void confirmDelete()}
                loading={deleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-4 right-4 mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-[#0DC56A]' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><CampaignsPage /></Suspense>;
}
