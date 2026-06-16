'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Search, BarChart3, Link2, CheckCircle2, PauseCircle } from 'lucide-react';
import { api, type TenantMe } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ToggleSwitch } from '@/components/ui/toggle-switch';

interface TriggerConfig {
  type: string;
  enabled: boolean;
  sentToday: number;
  sentThisMonth: number;
  allTime: number;
  pendingToday: number | null;
  timezone: string;
}

const HOW_IT_WORKS = [
  { icon: MessageCircle, text: 'Customer texts any message to your WhatsApp', bold: 'Customer texts any message' },
  { icon: Search, text: 'Bot looks them up by their phone number', bold: 'Bot looks them up' },
  { icon: BarChart3, text: 'Instant reply with their balance, tier, and progress', bold: 'Instant reply' },
  { icon: Link2, text: "Not registered? Bot lets them know how to join in-store", bold: 'Not registered?' },
];

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function WaBotPage() {
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const { data: bot, isLoading } = useQuery<TriggerConfig>({
    queryKey: ['wa-bot-config'],
    queryFn: () => api.get<TriggerConfig>('/api/v1/triggers/bot'),
  });

  const { data: tenant } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
  });

  async function handleToggle(enabled: boolean) {
    setUpdating(true);
    try {
      await api.patch('/api/v1/triggers/balance_bot_reply', { enabled });
      queryClient.setQueryData<TriggerConfig>(['wa-bot-config'], (prev) =>
        prev ? { ...prev, enabled } : prev,
      );
    } finally {
      setUpdating(false);
    }
  }

  const businessName = tenant?.businessName ?? 'Your Store';
  const currencySymbol = tenant?.currency === 'GBP' ? '£' : '₦';
  const pointsToGoal = Math.max(0, (tenant?.pointsThreshold ?? 1000) - 820);
  const amountToGoal = Math.ceil((pointsToGoal * (tenant?.pointsEarnRate ?? 100)) / 100) * 100;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">
          Self-Service WhatsApp Bot{' '}
          <span className="text-sm font-normal text-slate-400">Customers check their balance 24/7</span>
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">How it works</h2>
                  <ToggleSwitch checked={!!bot?.enabled} disabled={updating} onChange={handleToggle} />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Customers text anything — &quot;hi&quot;, &quot;balance&quot;, &quot;points&quot; — to your business
                  WhatsApp number. The bot responds instantly with their loyalty summary. No app download. No login.
                  Just WhatsApp.
                </p>
                <ul className="mt-4 space-y-3">
                  {HOW_IT_WORKS.map(({ icon: Icon, text, bold }) => (
                    <li key={text} className="flex items-start gap-3 text-sm text-slate-600">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <span>
                        <span className="font-medium text-slate-800">{bold}</span>
                        {text.slice(bold.length)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold text-slate-900">Bot Stats (This Month)</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <StatBox label="Replies Today" value={bot?.sentToday ?? 0} />
                  <StatBox label="Replies This Month" value={bot?.sentThisMonth ?? 0} />
                  <StatBox label="All Time" value={bot?.allTime ?? 0} />
                  <StatBox label="Status" value={bot?.enabled ? 'Active' : 'Paused'} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">What customers see</p>

            <div className="overflow-hidden rounded-2xl bg-[#0b141a] shadow-sm">
              <div className="flex items-center gap-3 bg-[#1f2c34] px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                  {businessName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{businessName}</p>
                  <p className="text-xs text-slate-400">Business account ✓</p>
                </div>
              </div>

              <div className="space-y-3 px-4 py-6">
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-none bg-[#005c4b] px-3 py-2 text-sm text-white">
                    balance
                    <p className="mt-1 text-right text-[10px] text-emerald-200">11:24 AM ✓✓</p>
                  </div>
                </div>

                <div className="flex justify-start">
                  <div className="max-w-sm rounded-2xl rounded-tl-none bg-[#1f2c34] px-3 py-2 text-sm text-slate-100">
                    <p>Hi Adaeze! Here&apos;s your {businessName} loyalty summary:</p>
                    <ul className="mt-2 space-y-1">
                      <li>🏆 Tier: <span className="font-semibold text-emerald-400">VIP Member</span></li>
                      <li>📊 Points: <span className="font-semibold text-emerald-400">820 pts</span></li>
                      <li>
                        🎁 Spend {currencySymbol}{amountToGoal.toLocaleString()} more to unlock your{' '}
                        {currencySymbol}{(tenant?.rewardValue ?? 1000).toLocaleString()} voucher
                      </li>
                      <li>🕐 Last visit: 2 days ago</li>
                    </ul>
                    <p className="mt-2">Keep shopping and keep earning!</p>
                    <p className="mt-1 text-[10px] text-slate-400">11:24 AM ✓✓</p>
                  </div>
                </div>
              </div>
            </div>

            {bot?.enabled ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                Bot is active and responding · Connected via Gupshup
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <PauseCircle className="h-4 w-4 shrink-0 text-amber-500" />
                Bot is paused · Customers won&apos;t receive automatic replies
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
