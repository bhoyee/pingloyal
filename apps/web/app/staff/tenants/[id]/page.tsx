'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi, ApiError } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { SUBSCRIPTION_STATUS_BADGES, TENANT_STATUS_BADGES } from '@/components/staff/badges';

interface StaffUserRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

interface StaffTenantDetail {
  tenant: {
    id: string;
    businessName: string;
    slug: string;
    planTier: string;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    deletedAt: string | null;
    deletionReason: string | null;
    createdAt: string;
  };
  users: StaffUserRow[];
  subscription: { amount: number; currency: string; currentPeriodEnd: string | null } | null;
  waTriggerTemplates: Array<{ triggerType: string }>;
  recentTickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
  recentTemplateRequests: Array<{ id: string; name: string; status: string; createdAt: string }>;
}

interface BillingStatus {
  status: string;
  planTier: string;
  currency: string;
  amount: number;
  daysRemaining: number | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  utilityIncluded: number;
  utilityUsedThisPeriod: number;
  utilityRemainingThisPeriod: number;
}

interface TriggerConfig {
  type: string;
  enabled: boolean;
  sentToday: number;
  sentThisMonth: number;
  allTime: number;
}

interface TemplateEntry {
  triggerType: string;
  label: string;
  defaultBody: string;
  customBody: string | null;
  activeBody: string;
  isCustom: boolean;
}

const TABS = ['overview', 'users', 'billing', 'triggers'] as const;
type Tab = (typeof TABS)[number];

export default function StaffTenantDetailPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    setIsSuperAdmin(localStorage.getItem('staff_role') === 'super_admin');
  }, []);

  const { data, isLoading } = useQuery<StaffTenantDetail>({
    queryKey: ['staff-tenant', tenantId],
    queryFn: () => staffApi.get<StaffTenantDetail>(`/staff/tenants/${tenantId}`),
  });

  const { data: billing, isLoading: billingLoading } = useQuery<BillingStatus>({
    queryKey: ['staff-tenant-billing', tenantId],
    queryFn: () => staffApi.get<BillingStatus>(`/staff/tenants/${tenantId}/billing/status`),
    enabled: tab === 'billing',
  });

  const { data: triggers } = useQuery<TriggerConfig[]>({
    queryKey: ['staff-tenant-triggers', tenantId],
    queryFn: () => staffApi.get<TriggerConfig[]>(`/staff/tenants/${tenantId}/triggers`),
    enabled: tab === 'triggers',
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<TemplateEntry[]>({
    queryKey: ['staff-tenant-templates', tenantId],
    queryFn: () => staffApi.get<TemplateEntry[]>(`/staff/tenants/${tenantId}/wa-templates`),
    enabled: tab === 'triggers',
  });

  async function handleResendWelcome() {
    try {
      const result = await staffApi.post<{ devCode?: string }>(
        `/staff/tenants/${tenantId}/resend-welcome-email`,
        {},
      );
      alert(result.devCode ? `Set-password code: ${result.devCode}` : 'Welcome email resent.');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not resend welcome email');
    }
  }

  async function handleSoftDelete() {
    const reason = window.prompt('Reason for deleting this tenant (optional):') ?? undefined;
    if (!window.confirm('Soft-delete this tenant? Owner login will be blocked immediately.')) return;
    try {
      await staffApi.post(`/staff/tenants/${tenantId}/delete`, { reason });
      void queryClient.invalidateQueries({ queryKey: ['staff-tenant', tenantId] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not delete tenant');
    }
  }

  async function handleRestore() {
    try {
      await staffApi.post(`/staff/tenants/${tenantId}/restore`, {});
      void queryClient.invalidateQueries({ queryKey: ['staff-tenant', tenantId] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not restore tenant');
    }
  }

  async function handleToggleUser(userId: string, isActive: boolean) {
    try {
      await staffApi.patch(`/staff/tenants/${tenantId}/users/${userId}`, { isActive });
      void queryClient.invalidateQueries({ queryKey: ['staff-tenant', tenantId] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update user');
    }
  }

  async function handleToggleTrigger(type: string, enabled: boolean) {
    try {
      await staffApi.patch(`/staff/tenants/${tenantId}/triggers/${type}`, { enabled });
      queryClient.setQueryData<TriggerConfig[]>(['staff-tenant-triggers', tenantId], (prev) =>
        prev?.map((t) => (t.type === type ? { ...t, enabled } : t)),
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update trigger');
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <p className="text-sm text-slate-500">Tenant not found.</p>
      </div>
    );
  }

  const { tenant } = data;
  const subBadge = SUBSCRIPTION_STATUS_BADGES[tenant.subscriptionStatus];
  const statusBadge = TENANT_STATUS_BADGES[tenant.deletedAt ? 'deleted' : 'active'];

  return (
    <div className="px-4 py-6 sm:px-6">
      <button
        onClick={() => router.push('/staff/tenants')}
        className="mb-3 text-sm text-slate-500 hover:text-slate-700"
      >
        ← Back to tenants
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tenant.businessName}</h1>
          <p className="mt-0.5 text-sm text-slate-500">/{tenant.slug} · {tenant.planTier}</p>
        </div>
        <div className="flex items-center gap-2">
          {subBadge && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${subBadge.className}`}>
              {subBadge.label}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-[#0F1E35] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t === 'users' ? 'Users & Cashiers' : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {tenant.deletedAt && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Deleted {new Date(tenant.deletedAt).toLocaleDateString()}
              {tenant.deletionReason ? ` — ${tenant.deletionReason}` : ''}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Created {new Date(tenant.createdAt).toLocaleDateString()}</p>
            {tenant.trialEndsAt && (
              <p className="mt-1 text-sm text-slate-500">
                Trial ends {new Date(tenant.trialEndsAt).toLocaleDateString()}
              </p>
            )}

            {isSuperAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleResendWelcome()}>
                  Resend welcome email
                </Button>
                {tenant.deletedAt ? (
                  <Button size="sm" onClick={() => void handleRestore()}>
                    Restore tenant
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => void handleSoftDelete()}>
                    Delete tenant
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent tickets</h3>
            {data.recentTickets.length === 0 ? (
              <p className="text-sm text-slate-400">No tickets yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.recentTickets.map((t) => (
                  <li key={t.id} className="text-sm text-slate-700">
                    {t.subject} <span className="text-slate-400">— {t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent template requests</h3>
            {data.recentTemplateRequests.length === 0 ? (
              <p className="text-sm text-slate-400">No template requests yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.recentTemplateRequests.map((r) => (
                  <li key={r.id} className="text-sm text-slate-700">
                    {r.name} <span className="text-slate-400">— {r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {data.users.map((u, idx) => (
            <div
              key={u.id}
              className={`flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{u.fullName}</p>
                <p className="mt-0.5 text-xs text-slate-500">{u.email} · {u.role}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => void handleToggleUser(u.id, !u.isActive)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'billing' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {billingLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : billing ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Status" value={billing.status} />
              <Stat label="Plan" value={billing.planTier} />
              <Stat label="Amount" value={`${billing.currency} ${billing.amount}`} />
              {billing.daysRemaining !== null && (
                <Stat label="Days remaining" value={String(billing.daysRemaining)} />
              )}
              {billing.trialDaysRemaining !== null && (
                <Stat label="Trial days remaining" value={String(billing.trialDaysRemaining)} />
              )}
              <Stat
                label="Utility messages"
                value={`${billing.utilityUsedThisPeriod}/${billing.utilityIncluded}`}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-400">No billing data.</p>
          )}
        </div>
      )}

      {tab === 'triggers' && (
        <TriggersTab
          tenantId={tenantId}
          triggers={triggers}
          templates={templates}
          templatesLoading={templatesLoading}
          isSuperAdmin={isSuperAdmin}
          onToggleTrigger={handleToggleTrigger}
          queryClient={queryClient}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TriggersTab({
  tenantId,
  triggers,
  templates,
  templatesLoading,
  isSuperAdmin,
  onToggleTrigger,
  queryClient,
}: {
  tenantId: string;
  triggers: TriggerConfig[] | undefined;
  templates: TemplateEntry[] | undefined;
  templatesLoading: boolean;
  isSuperAdmin: boolean;
  onToggleTrigger: (type: string, enabled: boolean) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const triggerByType = new Map(triggers?.map((t) => [t.type, t]));

  function startEdit(entry: TemplateEntry) {
    setEditing(entry.triggerType);
    setDraft(entry.activeBody);
  }

  async function saveEdit(triggerType: string) {
    setSaving(true);
    try {
      await staffApi.patch(`/staff/tenants/${tenantId}/wa-templates/${triggerType}`, { body: draft });
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['staff-tenant-templates', tenantId] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not save template');
    } finally {
      setSaving(false);
    }
  }

  async function resetTemplate(triggerType: string) {
    if (!window.confirm('Reset this template to the default?')) return;
    try {
      await staffApi.delete(`/staff/tenants/${tenantId}/wa-templates/${triggerType}`);
      void queryClient.invalidateQueries({ queryKey: ['staff-tenant-templates', tenantId] });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not reset template');
    }
  }

  if (templatesLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates?.map((entry) => {
        const trigger = triggerByType.get(entry.triggerType);
        const isEditing = editing === entry.triggerType;
        return (
          <div key={entry.triggerType} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{entry.label}</h3>
                {entry.isCustom && (
                  <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Customized
                  </span>
                )}
              </div>
              {trigger && (
                <ToggleSwitch
                  checked={trigger.enabled}
                  disabled={!isSuperAdmin}
                  onChange={(value) => onToggleTrigger(entry.triggerType, value)}
                />
              )}
            </div>

            {isEditing ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" loading={saving} onClick={() => void saveEdit(entry.triggerType)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="whitespace-pre-wrap text-sm text-slate-600">{entry.activeBody}</p>
                {isSuperAdmin && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="text-xs font-medium text-[#0F1E35] hover:underline"
                    >
                      Edit
                    </button>
                    {entry.isCustom && (
                      <button
                        type="button"
                        onClick={() => void resetTemplate(entry.triggerType)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
