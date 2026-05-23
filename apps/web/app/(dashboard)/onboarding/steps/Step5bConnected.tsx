'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CheckCircle, Copy, Webhook, PlugZap, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ConnectionType = 'webhook' | 'api_pull' | 'file_export';

interface Step5bConnectedProps {
  tenantSlug: string;
}

const FIELD_MAP = [
  { ourField: 'phone', placeholder: 'e.g. customer_msisdn' },
  { ourField: 'amount', placeholder: 'e.g. transaction_value' },
  { ourField: 'customerName', placeholder: 'e.g. customer.full_name' },
  { ourField: 'categorySlug', placeholder: 'e.g. department_code (optional)' },
  { ourField: 'transactionId', placeholder: 'e.g. receipt_no (optional)' },
];

export function Step5bConnected({ tenantSlug }: Step5bConnectedProps) {
  const router = useRouter();
  const [connType, setConnType] = useState<ConnectionType>('webhook');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pollInterval, setPollInterval] = useState('15');
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = `https://api.pingloyal.com/webhooks/${tenantSlug}`;
  const webhookSecret = 'wh_' + tenantSlug.slice(0, 8) + '_secret';

  function copyToClipboard(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleTest() {
    setTestResult('idle');
    setTestMsg('');
    try {
      await api.post('/integrations/test', {
        type: connType,
        apiUrl,
        fieldMap,
      });
      setTestResult('ok');
      setTestMsg('Connection successful!');
    } catch (e) {
      setTestResult('error');
      setTestMsg(e instanceof Error ? e.message : 'Connection failed');
    }
  }

  async function handleComplete() {
    setSaving(true);
    setError('');
    try {
      await api.post('/integrations', {
        type: connType,
        apiUrl: connType === 'api_pull' ? apiUrl : undefined,
        apiKey: connType === 'api_pull' ? apiKey : undefined,
        pollInterval:
          connType === 'api_pull' ? Number(pollInterval) : undefined,
        fieldMap,
      });
      localStorage.setItem('onboarding_step', 'complete');
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <h2 className="text-xl font-semibold text-slate-900">
          Connect your existing system
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose how your system will send transaction data to PingLoyal.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Connection type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            {
              type: 'webhook' as ConnectionType,
              icon: <Webhook className="h-5 w-5" />,
              title: 'Webhook',
              badge: 'recommended',
              desc: 'Your system pushes data when a purchase happens. Real-time.',
            },
            {
              type: 'api_pull' as ConnectionType,
              icon: <PlugZap className="h-5 w-5" />,
              title: 'API Pull',
              badge: null,
              desc: 'We call your API every few minutes. Near real-time.',
            },
            {
              type: 'file_export' as ConnectionType,
              icon: <FileText className="h-5 w-5" />,
              title: 'File Export',
              badge: null,
              desc: 'Your system drops a CSV file. Hourly updates.',
            },
          ] as const).map((opt) => {
            const active = connType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => setConnType(opt.type)}
                className={cn(
                  'relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none',
                  active
                    ? 'border-[#0F1E35] bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300',
                )}
              >
                {opt.badge && (
                  <span className="absolute top-2 right-2 text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                    {opt.badge}
                  </span>
                )}
                <div
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg mb-2',
                    active
                      ? 'bg-[#0F1E35] text-white'
                      : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {opt.icon}
                </div>
                <p className="font-semibold text-sm text-slate-900">
                  {opt.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Config fields */}
        {connType === 'webhook' && (
          <div className="space-y-3">
            <ReadOnlyField
              label="Your Webhook URL"
              value={webhookUrl}
              onCopy={() => copyToClipboard(webhookUrl, 'url')}
              copied={copied === 'url'}
            />
            <ReadOnlyField
              label="Webhook Secret"
              value={webhookSecret}
              onCopy={() => copyToClipboard(webhookSecret, 'secret')}
              copied={copied === 'secret'}
              masked
            />
            <p className="text-sm text-slate-500">
              Configure your POS to POST transaction data to this URL after each
              purchase.
            </p>
          </div>
        )}

        {connType === 'api_pull' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Your API endpoint URL</Label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.yourpos.com/transactions"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Your API key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_live_…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Poll interval</Label>
              <Select
                value={pollInterval}
                onChange={(e) => setPollInterval(e.target.value)}
              >
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every 60 minutes</option>
              </Select>
            </div>
          </div>
        )}

        {connType === 'file_export' && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-700">
              File export setup will be configured by the PingLoyal team after
              onboarding. We&apos;ll contact you within 24 hours.
            </p>
          </div>
        )}

        {/* Field mapper */}
        {(connType === 'webhook' || connType === 'api_pull') && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Field mapping
            </p>
            <p className="text-xs text-slate-500">
              Map our field names to your system&apos;s field names.
            </p>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                      Our field
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                      Your field name
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_MAP.map((row) => (
                    <tr
                      key={row.ourField}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">
                        {row.ourField}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-7 text-xs"
                          placeholder={row.placeholder}
                          value={fieldMap[row.ourField] ?? ''}
                          onChange={(e) =>
                            setFieldMap((prev) => ({
                              ...prev,
                              [row.ourField]: e.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Test + Complete */}
        {connType !== 'file_export' && (
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="md" onClick={() => void handleTest()}>
              Test Connection
            </Button>
            {testResult === 'ok' && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {testMsg}
              </span>
            )}
            {testResult === 'error' && (
              <span className="text-sm text-red-600">{testMsg}</span>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          onClick={() => void handleComplete()}
          loading={saving}
          className="w-full"
        >
          Complete Setup →
        </Button>
      </div>
    </div>
  );
}

// ── Read-only copy field ───────────────────────────────────────────────────────

function ReadOnlyField({
  label,
  value,
  onCopy,
  copied,
  masked,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  masked?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={masked ? '••••••••••••••••' : value}
          className="font-mono text-xs bg-slate-50"
        />
        <Button variant="outline" size="sm" onClick={onCopy} className="shrink-0">
          {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
