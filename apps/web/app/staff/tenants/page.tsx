'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi, ApiError } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

interface TenantRow {
  id: string;
  businessName: string;
  slug: string;
  planTier: string;
  subscriptionStatus: string;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  userCount: number;
}

interface TenantsResponse {
  data: TenantRow[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trialing: 'bg-blue-50 text-blue-700 border-blue-200',
  past_due: 'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const PLAN_STYLE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  growth: 'bg-purple-50 text-purple-700',
  connect: 'bg-orange-50 text-orange-700',
};

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; tenant: TenantRow }
  | { type: 'delete'; tenant: TenantRow }
  | { type: 'created'; businessName: string; ownerEmail: string; tempPassword: string };

export default function TenantsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  const queryKey = ['staff-tenants', search, status, page];
  const { data, isLoading } = useQuery<TenantsResponse>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      return staffApi.get<TenantsResponse>(`/staff/tenants?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: { businessName: string; ownerEmail: string; ownerFullName: string; planTier: string }) =>
      staffApi.post<{ businessName: string; ownerEmail: string; temporaryPassword: string }>('/staff/tenants', body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['staff-tenants'] });
      void qc.invalidateQueries({ queryKey: ['staff-stats'] });
      setModal({ type: 'created', businessName: res.businessName, ownerEmail: res.ownerEmail, tempPassword: res.temporaryPassword });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { businessName?: string; planTier?: string; subscriptionStatus?: string } }) =>
      staffApi.patch(`/staff/tenants/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-tenants'] });
      void qc.invalidateQueries({ queryKey: ['staff-stats'] });
      setModal({ type: 'none' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.delete(`/staff/tenants/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-tenants'] });
      void qc.invalidateQueries({ queryKey: ['staff-stats'] });
      setModal({ type: 'none' });
    },
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.total} tenant${data.total !== 1 ? 's' : ''} total` : 'Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ type: 'create' })}
          className="rounded-xl bg-[#0DC56A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0aad5b] transition-colors"
        >
          + New Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="mt-5 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or slug…"
          className="flex-1 max-w-xs rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past due</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
        ) : !data || data.data.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No tenants found.</p>
        ) : (
          <>
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Business</span>
              <span>Plan</span>
              <span>Status</span>
              <span>Users</span>
              <span>Actions</span>
            </div>
            {data.data.map((t, idx) => (
              <div
                key={t.id}
                className={`grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-3 sm:gap-4 items-center px-5 py-4 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.businessName}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{t.ownerEmail ?? '—'} · /{t.slug}</p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Created {new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className={`rounded-lg px-2.5 py-1 text-xs font-medium w-fit ${PLAN_STYLE[t.planTier] ?? PLAN_STYLE['starter']}`}>
                  {t.planTier}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit ${STATUS_STYLE[t.subscriptionStatus] ?? STATUS_STYLE['cancelled']}`}>
                  {t.subscriptionStatus.replace('_', ' ')}
                </span>
                <span className="text-sm text-slate-500 text-center">{t.userCount}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'edit', tenant: t })}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal({ type: 'delete', tenant: t })}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {totalPages}</span>
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

      {/* Create Modal */}
      {modal.type === 'create' && (
        <CreateModal
          onClose={() => setModal({ type: 'none' })}
          onSubmit={(body) => createMutation.mutate(body)}
          isLoading={createMutation.isPending}
          error={createMutation.error instanceof ApiError ? createMutation.error.message : null}
        />
      )}

      {/* Edit Modal */}
      {modal.type === 'edit' && (
        <EditModal
          tenant={modal.tenant}
          onClose={() => setModal({ type: 'none' })}
          onSubmit={(body) => editMutation.mutate({ id: modal.type === 'edit' ? modal.tenant.id : '', body })}
          isLoading={editMutation.isPending}
          error={editMutation.error instanceof ApiError ? editMutation.error.message : null}
        />
      )}

      {/* Delete Confirm */}
      {modal.type === 'delete' && (
        <ConfirmModal
          title="Delete tenant?"
          message={`This will block "${modal.tenant.businessName}" from logging in. This action can be reversed by support.`}
          confirmLabel="Delete"
          danger
          onClose={() => setModal({ type: 'none' })}
          onConfirm={() => deleteMutation.mutate(modal.type === 'delete' ? modal.tenant.id : '')}
          isLoading={deleteMutation.isPending}
        />
      )}

      {/* Created — show temp password */}
      {modal.type === 'created' && (
        <CreatedModal
          businessName={modal.businessName}
          ownerEmail={modal.ownerEmail}
          tempPassword={modal.tempPassword}
          onClose={() => setModal({ type: 'none' })}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">{children}</div>
    </div>
  );
}

function CreateModal({
  onClose, onSubmit, isLoading, error,
}: {
  onClose: () => void;
  onSubmit: (body: { businessName: string; ownerEmail: string; ownerFullName: string; planTier: string }) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [businessName, setBusinessName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [planTier, setPlanTier] = useState('starter');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ businessName, ownerEmail, ownerFullName, planTier });
  }

  return (
    <Overlay>
      <form onSubmit={handleSubmit}>
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-bold text-slate-900">New Tenant</h2>
          <p className="text-sm text-slate-500 mt-0.5">A temporary password will be generated for the owner.</p>
        </div>
        <div className="px-6 space-y-4">
          <Field label="Business Name">
            <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
              className={INPUT} placeholder="Mama's Store" />
          </Field>
          <Field label="Owner Full Name">
            <input required value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)}
              className={INPUT} placeholder="Amara Okafor" />
          </Field>
          <Field label="Owner Email">
            <input required type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
              className={INPUT} placeholder="amara@store.com" />
          </Field>
          <Field label="Plan">
            <select value={planTier} onChange={(e) => setPlanTier(e.target.value)} className={INPUT}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="connect">Connect</option>
            </select>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 py-5">
          <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={isLoading} className={PRIMARY_BTN}>
            {isLoading ? 'Creating…' : 'Create Tenant'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function EditModal({
  tenant, onClose, onSubmit, isLoading, error,
}: {
  tenant: TenantRow;
  onClose: () => void;
  onSubmit: (body: { businessName?: string; planTier?: string; subscriptionStatus?: string }) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [businessName, setBusinessName] = useState(tenant.businessName);
  const [planTier, setPlanTier] = useState(tenant.planTier);
  const [subscriptionStatus, setSubscriptionStatus] = useState(tenant.subscriptionStatus);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ businessName, planTier, subscriptionStatus });
  }

  return (
    <Overlay>
      <form onSubmit={handleSubmit}>
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-bold text-slate-900">Edit Tenant</h2>
          <p className="text-sm text-slate-500 mt-0.5 font-mono">{tenant.slug}</p>
        </div>
        <div className="px-6 space-y-4">
          <Field label="Business Name">
            <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Plan">
            <select value={planTier} onChange={(e) => setPlanTier(e.target.value)} className={INPUT}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="connect">Connect</option>
            </select>
          </Field>
          <Field label="Subscription Status">
            <select value={subscriptionStatus} onChange={(e) => setSubscriptionStatus(e.target.value)} className={INPUT}>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 py-5">
          <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={isLoading} className={PRIMARY_BTN}>
            {isLoading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function ConfirmModal({
  title, message, confirmLabel, danger, onClose, onConfirm, isLoading,
}: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onClose: () => void; onConfirm: () => void; isLoading: boolean;
}) {
  return (
    <Overlay>
      <div className="px-6 pt-6 pb-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
      </div>
      <div className="flex gap-3 px-6 py-5">
        <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#0DC56A] hover:bg-[#0aad5b]'}`}
        >
          {isLoading ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

function CreatedModal({
  businessName, ownerEmail, tempPassword, onClose,
}: {
  businessName: string; ownerEmail: string; tempPassword: string; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyPassword() {
    void navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Overlay>
      <div className="px-6 pt-6 pb-4">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-900">Tenant Created</h2>
        <p className="mt-1 text-sm text-slate-500">
          <strong>{businessName}</strong> is ready. Share these credentials with the owner — the password is shown once only.
        </p>
        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Owner Email</span>
            <p className="mt-1 font-mono text-slate-800">{ownerEmail}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Temporary Password</span>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-slate-800 flex-1">{tempPassword}</p>
              <button type="button" onClick={copyPassword} className="shrink-0 text-xs font-medium text-[#0DC56A] hover:underline">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">
        <button type="button" onClick={onClose} className={PRIMARY_BTN}>Done</button>
      </div>
    </Overlay>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const INPUT = 'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40';
const CANCEL_BTN = 'flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors';
const PRIMARY_BTN = 'flex-1 rounded-xl bg-[#0DC56A] py-2.5 text-sm font-semibold text-white hover:bg-[#0aad5b] transition-colors disabled:opacity-50';
