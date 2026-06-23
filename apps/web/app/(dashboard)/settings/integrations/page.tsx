'use client';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { API_BASE_URL, api, type TenantMe } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle,
  Copy,
  FileText,
  Link2,
  PlugZap,
  Upload,
  Webhook,
} from 'lucide-react';

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

// ── Test connection result types (mirrors IntegrationsService.test()) ────────

interface TestWebhookResult {
  webhookUrl: string;
  webhookSecret: string;
  instructions: string[];
  samplePayload: Record<string, string>;
}

interface TestApiPullResult {
  connected: boolean;
  sampleResponse?: string;
  error?: string;
}

type TestResult = TestWebhookResult | TestApiPullResult;

function isWebhookResult(r: TestResult): r is TestWebhookResult {
  return 'instructions' in r;
}

// ── File upload job status (mirrors FileImportService.getJobStatus()) ───────

interface FileImportJobStatus {
  status: 'pending' | 'processing' | 'done' | 'failed';
  total: number;
  processed: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

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
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
      data-testid="sync-status-widget"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
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

// ── Test connection panel ──────────────────────────────────────────────────────

function TestConnectionPanel({ connectionType }: { connectionType: 'webhook' | 'api_pull' }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');

  async function handleTest() {
    setTesting(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post<TestResult>('/api/v1/integrations/test', {});
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Connection test failed — save your configuration first.',
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="test-connection-button"
        loading={testing}
        onClick={() => void handleTest()}
        className="border-green-300 text-green-700 hover:border-green-400 hover:bg-green-50 hover:text-green-800"
      >
        Test Connection
      </Button>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {result && !isWebhookResult(result) && (
        <p
          className={`rounded-lg px-3 py-2.5 text-sm ${
            result.connected
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {result.connected
            ? `✅ Connected${result.sampleResponse ? ` — ${result.sampleResponse.slice(0, 120)}` : ''}`
            : `❌ ${result.error ?? 'Could not connect'}`}
        </p>
      )}

      {result && isWebhookResult(result) && (
        <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold">
            Webhooks can&apos;t be tested from here — your POS has to send the
            request. Use these to verify it yourself:
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {result.instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <p className="mt-2 font-mono text-xs">
            Sample payload: {JSON.stringify(result.samplePayload)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── File upload panel ──────────────────────────────────────────────────────────

function FileUploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [job, setJob] = useState<FileImportJobStatus | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    setJob(null);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const { jobId } = await api.upload<{ jobId: string }>(
        '/api/v1/integrations/file-upload',
        file,
      );
      pollRef.current = setInterval(() => {
        void api
          .get<FileImportJobStatus>(`/api/v1/integrations/file-upload/${jobId}`)
          .then((status) => {
            setJob(status);
            if (
              (status.status === 'done' || status.status === 'failed') &&
              pollRef.current
            ) {
              clearInterval(pollRef.current);
            }
          })
          .catch(() => null);
      }, 2000);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Upload failed — save your configuration first.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const token = localStorage.getItem('access_token') ?? '';
      const res = await fetch(
        `${API_BASE_URL}/api/v1/integrations/file-upload/template`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pingloyal-transactions-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download template');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between">
        <Label>Upload a transaction CSV</Label>
        <button
          type="button"
          data-testid="download-template-button"
          disabled={downloading}
          onClick={() => void handleDownloadTemplate()}
          className="text-xs font-medium text-[#0F1E35] underline-offset-2 hover:underline disabled:opacity-50"
        >
          Download template
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="file"
          accept=".csv,text/csv"
          data-testid="file-upload-input"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <Button
          type="button"
          size="sm"
          data-testid="upload-file-button"
          disabled={!file}
          loading={uploading}
          onClick={() => void handleUpload()}
          className="border-green-300 text-green-700 hover:border-green-400 hover:bg-green-50 hover:text-green-800"
          variant="outline"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {job && (
        <div
          data-testid="file-upload-status"
          className={`rounded-lg px-3 py-2.5 text-sm ${
            job.status === 'done'
              ? 'bg-green-50 text-green-700'
              : job.status === 'failed'
                ? 'bg-red-50 text-red-600'
                : 'bg-blue-50 text-blue-700'
          }`}
        >
          {job.status === 'pending' || job.status === 'processing'
            ? '⏳ Processing your file…'
            : job.status === 'done'
              ? `✅ Processed ${job.processed} of ${job.total} rows${
                  job.failed ? ` — ${job.failed} skipped` : ''
                }`
              : `❌ Import failed${job.errors[0] ? `: ${job.errors[0].reason}` : ''}`}
          {job.status !== 'pending' && job.errors.length > 0 && (
            <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs">
              {job.errors.slice(0, 10).map((e, idx) => (
                <li key={idx}>
                  Row {e.row}: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
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
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { connectionType: 'webhook' },
  });

  const connectionType = watch('connectionType');

  // Switching connection type shares the same Field Mapping inputs, but a
  // failed-validation error from a previous save attempt (e.g. "phone field
  // name is required" while on Webhook) must not linger and look like it
  // also applies to API Pull before the user has even tried saving there.
  useEffect(() => {
    clearErrors();
  }, [connectionType, clearErrors]);

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
          : values.connectionType === 'file_export'
            ? 'Integration saved. You can now upload a CSV file below.'
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
      <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F1E35]/5 text-[#0F1E35]">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Integration Settings</h1>
            <p className="text-sm text-slate-500">
              Connect your existing POS or loyalty system to PingLoyal
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
            {/* ── Main column: configuration form ── */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6 lg:col-span-2"
            >
              {/* Connection type selector */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold text-slate-900">
                  Connection Type
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Choose how your system sends transaction data to PingLoyal.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: 'webhook' as const,
                        icon: Webhook,
                        title: 'Webhook',
                        sub: 'Real-time',
                        desc: 'Your system pushes data the moment a purchase happens.',
                        badge: 'Recommended',
                      },
                      {
                        value: 'api_pull' as const,
                        icon: PlugZap,
                        title: 'API Pull',
                        sub: 'Near real-time',
                        desc: 'PingLoyal calls your API every few minutes.',
                        badge: null,
                      },
                      {
                        value: 'file_export' as const,
                        icon: FileText,
                        title: 'File Export',
                        sub: 'On demand',
                        desc: 'Upload a CSV of transactions whenever you have one.',
                        badge: null,
                      },
                    ]
                  ).map(({ value, icon: Icon, title, sub, desc, badge }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer flex-col gap-2.5 rounded-xl border-2 p-4 transition-colors ${
                        connectionType === value
                          ? 'border-[#0F1E35] bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        value={value}
                        {...register('connectionType')}
                        className="sr-only"
                      />
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            connectionType === value
                              ? 'bg-[#0F1E35] text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {badge && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            {badge}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {title}{' '}
                          <span className="font-normal text-slate-400">
                            — {sub}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Webhook config */}
              {connectionType === 'webhook' && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-base font-semibold text-slate-900">
                    Webhook Configuration
                  </h2>
                  <div>
                    <Label>Your Webhook URL</Label>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                      <input
                        readOnly
                        value={webhookUrl}
                        data-testid="webhook-url"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="copy-webhook-url"
                        onClick={() => void copyToClipboard(webhookUrl)}
                      >
                        {copied ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
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
                  <TestConnectionPanel connectionType="webhook" />
                </div>
              )}

              {/* API Pull config */}
              {connectionType === 'api_pull' && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-base font-semibold text-slate-900">
                    API Pull Configuration
                  </h2>
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
                  <TestConnectionPanel connectionType="api_pull" />
                </div>
              )}

              {/* File export config */}
              {connectionType === 'file_export' && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-base font-semibold text-slate-900">
                    File Export Configuration
                  </h2>
                  <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
                    <p className="font-semibold">How it works:</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-4">
                      <li>Export transactions from your POS as a CSV file</li>
                      <li>
                        Set the Field Mapping below using your CSV&apos;s exact
                        column headers (case-sensitive)
                      </li>
                      <li>Save, then upload the file whenever you have one</li>
                    </ol>
                  </div>
                  <FileUploadPanel />
                </div>
              )}

              {/* Field mapper */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Field Mapping
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Map your system&apos;s field names to ours. Use dot notation for
                    nested fields (e.g. <code>customer.phone</code>).
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[480px] text-sm">
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

              <Button type="submit" loading={saving} size="lg" className="w-full sm:w-auto">
                Save Integration Settings
              </Button>
            </form>

            {/* ── Sidebar: status & mode ── */}
            <div className="space-y-6 lg:col-span-1">
              {tenant && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-900">Mode</h2>
                  <div className="mt-2 flex items-center gap-2">
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
                  <p className="mt-3 text-sm text-slate-600">
                    {tenant.mode === 'connected'
                      ? 'Your existing system is connected to PingLoyal. We receive transaction data automatically and handle WhatsApp automation on top.'
                      : 'PingLoyal is managing your customer registration and purchase logging via the Cashier App and QR codes.'}
                  </p>
                </div>
              )}

              {config && (
                <div className="space-y-2">
                  <h2 className="px-1 text-sm font-semibold text-slate-900">
                    Sync Status
                  </h2>
                  <SyncStatusWidget config={config} onRetry={handleRetry} />
                </div>
              )}
            </div>
          </div>
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
