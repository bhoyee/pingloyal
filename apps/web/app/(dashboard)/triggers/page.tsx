'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Gauge,
  Gift,
  Cake,
  UserX,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { api, type TenantMe } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatNaira } from '@/lib/utils';

interface TriggerConfig {
  type: string;
  enabled: boolean;
  sentToday: number;
  sentThisMonth: number;
  allTime: number;
  pendingToday: number | null;
  timezone: string;
}

const TRIGGER_META: Record<
  string,
  { title: string; icon: LucideIcon; describe: (tenant?: TenantMe) => string }
> = {
  welcome: {
    title: 'Welcome Message',
    icon: Sparkles,
    describe: () =>
      'Sent automatically when a new customer registers and opts in to WhatsApp messages.',
  },
  threshold_nudge: {
    title: '80% Threshold Nudge',
    icon: Gauge,
    describe: (tenant) =>
      `Sent when a customer reaches 80% of the ${tenant?.pointsThreshold ?? 1000} points needed for a reward.`,
  },
  reward_unlocked: {
    title: 'Reward Unlocked',
    icon: Gift,
    describe: (tenant) =>
      `Sent when a customer reaches ${tenant?.pointsThreshold ?? 1000} points and unlocks a ${formatNaira(tenant?.rewardValue ?? 1000)} reward.`,
  },
  birthday: {
    title: 'Birthday Message',
    icon: Cake,
    describe: () => "Sent on a customer's birthday with a special offer.",
  },
  lapsed_winback: {
    title: 'Lapsed Customer Win-back',
    icon: UserX,
    describe: (tenant) =>
      `Sent to customers who haven't visited in over ${tenant?.lapsedDays ?? 60} days, encouraging them to return.`,
  },
};

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function TriggerCard({
  config,
  tenant,
  onToggle,
  pending,
}: {
  config: TriggerConfig;
  tenant?: TenantMe;
  onToggle: (type: string, enabled: boolean) => void;
  pending: boolean;
}) {
  const meta = TRIGGER_META[config.type];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F1E35]/5 text-[#0F1E35]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{meta.title}</h3>
            <p className="mt-1 max-w-xl text-sm text-slate-500">{meta.describe(tenant)}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>Sent today: <span className="font-medium text-slate-600">{config.sentToday}</span></span>
              <span>This month: <span className="font-medium text-slate-600">{config.sentThisMonth}</span></span>
              <span>All time: <span className="font-medium text-slate-600">{config.allTime}</span></span>
              {config.pendingToday !== null && (
                <span>Pending today: <span className="font-medium text-slate-600">{config.pendingToday}</span></span>
              )}
            </div>
            {config.type === 'lapsed_winback' && (
              <Link href="/settings#loyalty" className="mt-2 inline-block text-xs font-medium text-[#0F1E35] hover:underline">
                Adjust threshold →
              </Link>
            )}
          </div>
        </div>
        <ToggleSwitch
          checked={config.enabled}
          disabled={pending}
          onChange={(value) => onToggle(config.type, value)}
        />
      </CardContent>
    </Card>
  );
}

export default function TriggersPage() {
  const queryClient = useQueryClient();
  const [updatingType, setUpdatingType] = useState<string | null>(null);

  const { data: triggers, isLoading } = useQuery<TriggerConfig[]>({
    queryKey: ['triggers'],
    queryFn: () => api.get<TriggerConfig[]>('/api/v1/triggers'),
  });

  const { data: tenant } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
  });

  async function handleToggle(type: string, enabled: boolean) {
    setUpdatingType(type);
    try {
      await api.patch(`/api/v1/triggers/${type}`, { enabled });
      queryClient.setQueryData<TriggerConfig[]>(['triggers'], (prev) =>
        prev?.map((t) => (t.type === type ? { ...t, enabled } : t)),
      );
    } finally {
      setUpdatingType(null);
    }
  }

  const activeCount = triggers?.filter((t) => t.enabled).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-bold text-slate-900">Automation Triggers</h1>
          {!isLoading && (
            <p className="mt-1 text-sm text-slate-500">
              {activeCount} active — running automatically
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <p>
            These triggers send WhatsApp messages automatically based on customer activity. Turn off
            any trigger to pause it without losing your customer data or message templates.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="space-y-4">
            {triggers?.map((config) => (
              <TriggerCard
                key={config.type}
                config={config}
                tenant={tenant}
                onToggle={handleToggle}
                pending={updatingType === config.type}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
