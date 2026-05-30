'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { api, type Campaign, type CampaignStatus } from '@/lib/api';
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

export default function CampaignsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get('status') ?? 'all') as CampaignStatus | 'all';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .get<Campaign[]>('/api/v1/campaigns')
      .then((data) => setCampaigns(data))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    statusFilter === 'all'
      ? campaigns
      : campaigns.filter((c) => c.status === statusFilter);

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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Campaigns</h1>
          <Button onClick={() => router.push('/campaigns/new')}>
            + New Campaign
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Status filter tabs */}
        <div
          className="mb-6 flex gap-1 overflow-x-auto"
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
            <p className="text-lg font-semibold text-slate-700">No campaigns yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first campaign to send a WhatsApp message to your customers
            </p>
            <Button className="mt-6" onClick={() => router.push('/campaigns/new')}>
              + Create Campaign
            </Button>
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Recipients</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Delivery Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{campaign.name}</td>
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
                            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                            onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          >
                            Edit
                          </button>
                        )}
                        {campaign.status === 'draft' && (
                          <button
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
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
          </div>
        )}
      </div>
    </div>
  );
}
