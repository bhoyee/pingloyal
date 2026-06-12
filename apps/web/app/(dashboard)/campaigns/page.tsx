'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { api, type Campaign, type CampaignStatus, type Category, type TenantMe, type TierConfig } from '@/lib/api';
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

function deliveryRate(c: Campaign): string {
  if (c.sentCount === 0) return '—';
  return `${Math.round((c.deliveredCount / c.sentCount) * 100)}%`;
}

function describeAudience(
  campaign: Campaign,
  tiers: TierConfig[],
  categories: Category[],
  lapsedDays: number,
): string {
  const r = campaign.segmentRules;

  if (r.tierIds?.length) {
    const labels = r.tierIds.map((id) => tiers.find((t) => t.id === id)?.tierLabel ?? 'Tier');
    return `${labels.join(', ')} tier only`;
  }

  if (r.categoryIds?.length) {
    const labels = r.categoryIds.map((id) => categories.find((c) => c.id === id)?.name ?? 'category');
    return `Bought ${labels.join(', ').toLowerCase()} items`;
  }

  if (r.activityStatus === 'inactive') {
    return `Inactive ${lapsedDays}+ days`;
  }

  if (r.minPoints) {
    return `${r.minPoints}+ points`;
  }

  if (r.activityStatus === 'active') {
    return 'All active customers';
  }

  return 'All customers';
}

export default function CampaignsPage() {
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

  async function deleteCampaign(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Delete this campaign?')) return;
    await api.patch(`/api/v1/campaigns/${id}`, { status: 'cancelled' }).catch(() => null);
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
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
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-[#0F1E35] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  statusFilter === key
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500'
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
                    <td className="px-4 py-3 text-slate-600">{deliveryRate(campaign)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(campaign)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {campaign.status === 'draft' && (
                          <button
                            className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                            onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          >
                            Edit
                          </button>
                        )}
                        {campaign.status === 'draft' && (
                          <button
                            className="cursor-pointer rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-700 hover:shadow-sm"
                            onClick={(e) => void deleteCampaign(e, campaign.id)}
                          >
                            Delete
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
    </div>
  );
}
