'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi, ApiError } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/ui/select';
import { TEMPLATE_REQUEST_STATUS_BADGES } from '@/components/staff/badges';

type TemplateRequestStatus = 'pending' | 'in_progress' | 'completed';

interface TemplateRequestRow {
  id: string;
  tenantId: string;
  name: string;
  useCase: string;
  status: TemplateRequestStatus;
  createdAt: string;
}

const TABS: Array<{ key: TemplateRequestStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_OPTIONS: TemplateRequestStatus[] = ['pending', 'in_progress', 'completed'];

export default function StaffTemplateRequestsPage() {
  const [tab, setTab] = useState<TemplateRequestStatus | 'all'>('pending');
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery<TemplateRequestRow[]>({
    queryKey: ['staff-template-requests', tab],
    queryFn: () =>
      staffApi.get<TemplateRequestRow[]>(
        tab === 'all' ? '/staff/template-requests' : `/staff/template-requests?status=${tab}`,
      ),
  });

  async function handleStatusChange(id: string, status: TemplateRequestStatus) {
    try {
      await staffApi.patch(`/staff/template-requests/${id}/status`, { status });
      void queryClient.invalidateQueries({ queryKey: ['staff-template-requests'] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update status');
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Template Requests</h1>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-[#0F1E35] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : !requests || requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No template requests here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {requests.map((r, idx) => {
            const badge = TEMPLATE_REQUEST_STATUS_BADGES[r.status];
            return (
              <div
                key={r.id}
                className={`flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{r.name}</p>
                  <p className="mt-1 max-w-xl text-sm text-slate-500">{r.useCase}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start">
                  {badge && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                  <Select
                    value={r.status}
                    onChange={(e) =>
                      void handleStatusChange(r.id, e.target.value as TemplateRequestStatus)
                    }
                    className="h-8 w-auto py-1 text-xs"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
