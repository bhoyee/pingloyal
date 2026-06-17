'use client';

import { useState, useEffect, useCallback } from 'react';
import { Monitor, Copy, Check, Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';

interface CashierUser {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface CreateForm {
  fullName: string;
  email: string;
  password: string;
}

interface EditForm {
  fullName: string;
  email: string;
  isActive: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function CashierAppPage() {
  const [cashiers, setCashiers] = useState<CashierUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [cashierUrl, setCashierUrl] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ fullName: '', email: '', password: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<CashierUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ fullName: '', email: '', isActive: true });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CashierUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadCashiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CashierUser[]>('/api/v1/users/cashiers');
      setCashiers(data);
    } catch {
      setError('Failed to load cashier accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCashiers();
  }, [loadCashiers]);

  useEffect(() => {
    api
      .get<{ slug: string }>('/api/v1/tenants/me')
      .then((t) => {
        setCashierUrl(`${window.location.origin}/cashier/login?t=${t.slug}`);
      })
      .catch(() => {
        setCashierUrl(`${window.location.origin}/cashier/login`);
      });
  }, []);

  async function handleCopy() {
    if (!cashierUrl) return;
    try {
      await navigator.clipboard.writeText(cashierUrl);
    } catch {
      // Fallback for HTTP or restricted browser contexts
      const ta = document.createElement('textarea');
      ta.value = cashierUrl;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const newUser = await api.post<CashierUser>('/api/v1/users/cashiers', {
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
      });
      setCashiers((prev) => [...prev, newUser]);
      setShowCreate(false);
      setCreateForm({ fullName: '', email: '', password: '' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create cashier';
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────────

  function openEdit(cashier: CashierUser) {
    setEditTarget(cashier);
    setEditForm({ fullName: cashier.fullName, email: cashier.email, isActive: cashier.isActive });
    setEditError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditLoading(true);
    try {
      const updated = await api.patch<CashierUser>(`/api/v1/users/cashiers/${editTarget.id}`, {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        isActive: editForm.isActive,
      });
      setCashiers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update cashier';
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/v1/users/cashiers/${deleteTarget.id}`);
      setCashiers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      /* swallow */
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header — matches other dashboard pages */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0DC56A]/10">
              <Monitor size={18} className="text-[#0DC56A]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Cashier App</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage cashier logins and your point-of-sale link
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
              setCreateError(null);
            }}
            className="flex items-center gap-1.5 self-start rounded-lg bg-[#0DC56A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0aad5b] transition-colors sm:self-auto"
          >
            <Plus size={15} />
            Add Cashier
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6 px-4 py-6 sm:px-6">
        {/* Cashier App URL card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-0.5">Your Cashier App URL</h2>
          <p className="text-xs text-slate-500 mb-4">
            Share this link with your cashiers — they use it to log in and process transactions on any device.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <p className="truncate font-mono text-sm text-slate-700">
                {cashierUrl || 'Loading…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!cashierUrl}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              {copied ? (
                <Check size={14} className="text-green-600" />
              ) : (
                <Copy size={14} />
              )}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>

        {/* Cashier accounts table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Cashier Accounts</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Staff who can log in and process loyalty transactions
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0DC56A] border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : cashiers.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Monitor size={22} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">No cashier accounts yet</p>
              <p className="mt-1 text-xs text-slate-400">Click "Add Cashier" to create the first one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 text-left">Name</th>
                    <th className="px-5 py-3 text-left">Email</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-left">Created</th>
                    <th className="px-5 py-3 text-left">Last Login</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashiers.map((cashier) => (
                    <tr key={cashier.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900">{cashier.fullName}</td>
                      <td className="px-5 py-3.5 text-slate-500">{cashier.email}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            cashier.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {cashier.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{formatDate(cashier.createdAt)}</td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {cashier.lastLoginAt ? formatDate(cashier.lastLoginAt) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(cashier)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            aria-label={`Edit ${cashier.fullName}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(cashier)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            aria-label={`Delete ${cashier.fullName}`}
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* ── Create modal ─────────────────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Add Cashier" onClose={() => setShowCreate(false)}>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <Field label="Full name">
              <input
                type="text"
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]"
                placeholder="e.g. Amara Osei"
              />
            </Field>
            <Field label="Email address">
              <input
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]"
                placeholder="cashier@example.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]"
                placeholder="Min. 8 characters"
              />
            </Field>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="rounded-lg bg-[#0DC56A] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0aad5b] disabled:opacity-50"
              >
                {createLoading ? 'Creating…' : 'Create Cashier'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {editTarget && (
        <Modal title="Edit Cashier" onClose={() => setEditTarget(null)}>
          <form onSubmit={(e) => void handleEdit(e)} className="space-y-4">
            <Field label="Full name">
              <input
                type="text"
                required
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]"
              />
            </Field>
            <Field label="Email address">
              <input
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]"
              />
            </Field>
            <label className="flex cursor-pointer select-none items-center gap-3">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-[#0DC56A] accent-[#0DC56A]"
              />
              <span className="text-sm font-medium text-slate-700">Active — can log in to cashier app</span>
            </label>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editLoading}
                className="rounded-lg bg-[#0DC56A] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0aad5b] disabled:opacity-50"
              >
                {editLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="Remove Cashier" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to remove{' '}
            <span className="font-semibold text-slate-900">{deleteTarget.fullName}</span>? They
            will no longer be able to log in.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteLoading ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Small shared components ──────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
