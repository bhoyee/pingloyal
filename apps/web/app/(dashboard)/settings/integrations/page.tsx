'use client';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, type TenantMe } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegrationConfig {
  id?: string;
  connectionType: 'webhook' | 'api_pull' | 'file_export';
  endpointUrl: string | null;
  apiKey: string;
  webhookSecret: string;
  pollIntervalMins: number;
  fieldMapping: {
    phone?: string;
    amount?: string;
    customerName?: string;
    categorySlug?: string;
    transactionId?: string;
    occurredAt?: string;
  };
  syncStatus: string;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  connectionType: z.enum(['webhook', 'api_pull', 'file_export']),
  endpointUrl: z.string().optional(),
  apiKey: z.string().optional(),
  pollIntervalMins: z.number().optional(),
  phone: z.string().min(1, 'Phone field name is required'),
  amount: z.string().min(1, 'Amount field name is required'),
  customerName: z.string().optional(),
  categorySlug: z.string().optional(),
  transactionId: z.string().optional(),
  occurredAt: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ── Sync status widget ────────────────────────────────────────────────────────

function SyncStatusWidget({ config, onRetry }: {
  config: IntegrationConfig;
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  const dotClass =
    config.syncStatus === 'active'
      ? 'bg-green-500'
      : config.syncStatus === 'error'
        ? 'bg-red-500'
        : config.syncStatus === 'paused'
          ? 'bg-amber-400'
          : 'bg-slate-400';

  const statusText =
    config.syncStatus === 'active'
      ? `✅ Connected${config.lastSyncedAt ? ` — Last synced ${new Date(config.lastSyncedAt).toLocaleString()}` : ''}`
      : config.syncStatus === 'error'
        ? `❌ Error: ${(config.errorMessage ?? '').slice(0, 100)}`
        : config.syncStatus === 'paused'
          ? '⏸️ Paused'
          : '⏳ Waiting for first sync...';

  return (
    <div
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"
      data-testid="sync-status-widget"
    >
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${dotClass}`} />
        <p className="text-sm text-slate-700" data-testid="sync-status-text">
          {statusText}
        </p>
      </div>
      {config.syncStatus === 'error' && (
        <Button
          variant="outline"
          size="sm"
          data-testid="retry-now-button"
          loading={retrying}
          onClick={async () => {
            setRetrying(true);
            await onRetry().finally(() => setRetrying(false));
          }}
        >
          Retry Now
        </Button>
      )}
    </div>
  );
}

// ── Field mapper row ───────────────────────────────────────────────────────────

function FieldRow({
  label,
  name,
  placeholder,
  required,
  register,
  error,
}: {
  label: string;
  name: keyof FormValues;
  placeholder: string;
  required?: boolean;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  error?: string;
}) {
  return (
    <tr>
      <td className="py-2 pr-4 text-sm text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </td>
      <td className="py-2">
        <Input
          {...register(name)}
          placeholder={placeholder}
          data-testid={`field-${name}`}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationsSettingsPage() {
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { connectionType: 'webhook' },
  });

  const connectionType = watch('connectionType');

  const webhookUrl = tenant
    ? `${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.pingloyal.com'}/api/v1/integrations/webhook/${tenant.slug}`
    : '';

  // Load data on mount
  useEffect(() => {
    void Promise.all([
      api.get<TenantMe>('/api/v1/tenants/me').then(setTenant).catch(() => null),
      api
        .get<IntegrationConfig>('/api/v1/integrations')
        .then((c) => {
          setConfig(c);
          reset({
            connectionType: c.connectionType,
            endpointUrl: c.endpointUrl ?? '',
            pollIntervalMins: c.pollIntervalMins,
            phone: (c.fieldMapping.phone as string) ?? '',
            amount: (c.fieldMapping.amount as string) ?? '',
            customerName: (c.fieldMapping.customerName as string) ?? '',
            categorySlug: (c.fieldMapping.categorySlug as string) ?? '',
            transactionId: (c.fieldMapping.transactionId as string) ?? '',
            occurredAt: (c.fieldMapping.occurredAt as string) ?? '',
          });
        })
        .catch(() => null),
    ]).finally(() => setLoading(false));
  }, [reset]);

  // Poll sync status every 60s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const updated = await api
        .get<IntegrationConfig>('/api/v1/integrations')
        .catch(() => null);
      if (updated) setConfig(updated);
    }, 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const saved = await api.post<IntegrationConfig>('/api/v1/integrations', {
        connectionType: values.connectionType,
        endpointUrl: values.endpointUrl || undefined,
        apiKey: values.apiKey || undefined,
        pollIntervalMins: values.pollIntervalMins,
        fieldMapping: {
          phone: values.phone,
          amount: values.amount,
          customerName: values.customerName || undefined,
          categorySlug: values.categorySlug || undefined,
          transactionId: values.transactionId || undefined,
          occurredAt: values.occurredAt || undefined,
        },
      });
      setConfig(saved);
      setToast(
        values.connectionType === 'api_pull'
          ? `Integration saved. First sync will run in ${values.pollIntervalMins ?? 15} minutes.`
          : 'Integration saved. Your webhook is ready to receive transactions.',
      );
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Failed to save integration');
    } finally {
      setSaving(false);
    }
  }

  async function handleRetry() {
    await api.post('/api/v1/integrations/test', {}).catch(() => null);
    const updated = await api
      .get<IntegrationConfig>('/api/v1/integrations')
      .catch(() => null);
    if (updated) setConfig(updated);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-bold text-slate-900">Integration Settings</h1>
          <p className="text-sm text-slate-500">
            Connect your existing POS or loyalty system to PingLoyal
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {/* Mode badge */}
        {tenant && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              {tenant.mode === 'connected' ? (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                  🔗 Connected Mode
                </span>
              ) : (
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                  🆕 Native Mode
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {tenant.mode === 'connected'
                ? 'Your existing system is connected to PingLoyal. We receive transaction data automatically and handle WhatsApp automation on top.'
                : 'PingLoyal is managing your customer registration and purchase logging via the Cashier App and QR codes.'}
            </p>
          </div>
        )}

        {/* Sync status */}
        {config && (
          <SyncStatusWidget config={config} onRetry={handleRetry} />
        )}

        {/* Configuration form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {/* Connection type selector */}
          <div className="space-y-3">
            <h2 className="font-bold text-slate-900">Connection Type</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  value: 'webhook',
                  icon: '🔗',
                  title: 'Webhook — Real Time',
                  desc: 'Your system pushes data the moment a purchase happens.',
                  badge: 'Recommended',
                },
                {
                  value: 'api_pull',
                  icon: '🔄',
                  title: 'API Pull — Near Real Time',
                  desc: 'PingLoyal calls your API every few minutes.',
                },
              ].map(({ value, icon, title, desc, badge }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 transition-colors ${
                    connectionType === value
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    value={value}
                    {...register('connectionType')}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    <span className="font-semibold text-slate-800">{title}</span>
                    {badge && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{desc}</p>
                </label>
              ))}
              <div className="flex cursor-not-allowed flex-col gap-1 rounded-xl border-2 border-slate-200 p-4 opacity-50">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📁</span>
                  <span className="font-semibold text-slate-800">File Export — Hourly</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Coming Soon
                  </span>
                </div>
                <p className="text-xs text-slate-500">Drop a CSV file for PingLoyal to pick up.</p>
              </div>
            </div>
          </div>

          {/* Webhook config */}
          {connectionType === 'webhook' && (
            <div className="space-y-3">
              <h2 className="font-bold text-slate-900">Webhook Configuration</h2>
              <div>
                <Label>Your Webhook URL</Label>
                <div className="mt-1 flex gap-2">
                  <input
                    readOnly
                    value={webhookUrl}
                    data-testid="webhook-url"
                    className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="copy-webhook-url"
                    onClick={() => void copyToClipboard(webhookUrl)}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
              {config?.webhookSecret && (
                <div>
                  <Label>Webhook Secret</Label>
                  <div className="mt-1 flex gap-2">
                    <input
                      readOnly
                      value={config.webhookSecret}
                      data-testid="webhook-secret"
                      className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600"
                    />
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
                <p className="font-semibold">Setup instructions:</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  <li>Send a POST request to your webhook URL after each purchase</li>
                  <li>Include: <code>X-Webhook-Signature: HMAC-SHA256(body, secret)</code></li>
                  <li>Set <code>Content-Type: application/json</code></li>
                </ol>
              </div>
            </div>
          )}

          {/* API Pull config */}
          {connectionType === 'api_pull' && (
            <div className="space-y-3">
              <h2 className="font-bold text-slate-900">API Pull Configuration</h2>
              <div>
                <Label>Your API Endpoint URL</Label>
                <Input
                  {...register('endpointUrl')}
                  placeholder="https://your-system.com/api/transactions"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Your API Key</Label>
                <Input
                  type="password"
                  {...register('apiKey')}
                  placeholder={config?.apiKey === '••••••••' ? '••••••••' : 'Enter API key'}
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Your API key is encrypted and stored securely
                </p>
              </div>
              <div>
                <Label>Poll Interval</Label>
                <select
                  {...register('pollIntervalMins', { valueAsNumber: true })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {[5, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </div>
              {config?.lastSyncedAt && (
                <p className="text-xs text-slate-400">
                  Last cursor:{' '}
                  <code className="rounded bg-slate-100 px-1">
                    {config.lastSyncedAt}
                  </code>
                </p>
              )}
            </div>
          )}

          {/* Field mapper */}
          <div className="space-y-3">
            <h2 className="font-bold text-slate-900">Field Mapping</h2>
            <p className="text-sm text-slate-500">
              Map your system's field names to ours. Use dot notation for nested fields (e.g.{' '}
              <code>customer.phone</code>).
            </p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                      PingLoyal field
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                      Your system's field name
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <FieldRow
                    label="Phone Number"
                    name="phone"
                    placeholder="e.g. customer.msisdn"
                    required
                    register={register}
                    error={errors.phone?.message}
                  />
                  <FieldRow
                    label="Transaction Amount"
                    name="amount"
                    placeholder="e.g. sale_total"
                    required
                    register={register}
                    error={errors.amount?.message}
                  />
                  <FieldRow
                    label="Customer Name"
                    name="customerName"
                    placeholder="e.g. customer.full_name"
                    register={register}
                  />
                  <FieldRow
                    label="Product Category"
                    name="categorySlug"
                    placeholder="e.g. department_code"
                    register={register}
                  />
                  <FieldRow
                    label="Transaction ID"
                    name="transactionId"
                    placeholder="e.g. receipt_no"
                    register={register}
                  />
                  <FieldRow
                    label="Transaction Date"
                    name="occurredAt"
                    placeholder="e.g. created_at"
                    register={register}
                  />
                </tbody>
              </table>
            </div>
          </div>

          <Button type="submit" loading={saving} className="w-full">
            Save Integration Settings
          </Button>
        </form>
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
