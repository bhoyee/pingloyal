'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi, ApiError } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

type Status = 'pending' | 'in_progress' | 'completed';

interface TemplateRequestRow {
  id: string;
  name: string;
  useCase: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  businessName: string;
}

interface ListResponse {
  data: TemplateRequestRow[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  pending:     { label: 'Pending',     className: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In Progress', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:   { label: 'Completed',   className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const TABS: Array<{ key: Status | 'all'; label: string }> = [
  { key: 'all',         label: 'All' },
  { key: 'pending',     label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
];

export default function StaffTemplateRequestsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status | 'all'>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['staff-template-requests', tab, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (tab !== 'all') params.set('status', tab);
      return staffApi.get<ListResponse>(`/staff/template-requests?${params}`);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      staffApi.patch(`/staff/template-requests/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-template-requests'] });
      void qc.invalidateQueries({ queryKey: ['staff-template-counts'] });
    },
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Template Requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Custom WhatsApp template requests submitted by tenants
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); setPage(1); setExpanded(null); }}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-[#0F1E35] text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-7 w-7" />
          </div>
        ) : !data || data.data.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No requests found.</p>
        ) : (
          data.data.map((req, idx) => {
            const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.pending;
            const isOpen = expanded === req.id;

            return (
              <div key={req.id} className={idx > 0 ? 'border-t border-slate-100' : ''}>
                {/* Row header */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : req.id)}
                  className="w-full flex items-start justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{req.name}</p>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{req.businessName}</span>
                      {' · '}
                      {new Date(req.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                    {!isOpen && (
                      <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">{req.useCase}</p>
                    )}
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 mt-0.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-5 space-y-4">
                    {/* Tenant info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Tenant</p>
                        <p className="text-slate-800 font-medium">{req.businessName}</p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{req.tenantId}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Submitted</p>
                        <p className="text-slate-800">
                          {new Date(req.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })}
                        </p>
                        {req.updatedAt !== req.createdAt && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            Updated {new Date(req.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Template name */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Template Name</p>
                      <p className="text-sm font-semibold text-slate-800">{req.name}</p>
                    </div>

                    {/* Use case */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Use Case / Description</p>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {req.useCase}
                      </div>
                    </div>

                    {/* Status update */}
                    <div className="flex items-center gap-3 pt-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Update Status:</p>
                      {(['pending', 'in_progress', 'completed'] as const).map((s) => {
                        const b = STATUS_BADGE[s];
                        const isActive = req.status === s;
                        const isLoading = statusMutation.isPending && statusMutation.variables?.id === req.id && statusMutation.variables?.status === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={isActive || statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: req.id, status: s })}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed ${
                              isActive
                                ? `${b.className} ring-2 ring-offset-1 ring-current opacity-100`
                                : `border-slate-200 text-slate-500 hover:${b.className} disabled:opacity-40`
                            }`}
                          >
                            {isLoading ? '…' : b.label}
                          </button>
                        );
                      })}
                      {statusMutation.error instanceof ApiError && statusMutation.variables?.id === req.id && (
                        <p className="text-xs text-red-600">{statusMutation.error.message}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {totalPages} · {data?.total ?? 0} total</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
