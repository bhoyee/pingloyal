'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, MessageCircle } from 'lucide-react';
import { api, type TenantMe } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatBadge } from '@/components/ui/stat-badge';
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">WhatsApp Bot</h1>
        {!isLoading && (
          <p className="mt-1 text-sm text-slate-500">
            {bot?.enabled ? 'Active — replying automatically' : 'Paused — not replying to customers'}
          </p>
        )}
      </div>

      <div className="space-y-6 px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : bot ? (
          <>
            <Card>
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F1E35]/5 text-[#0F1E35]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Loyalty Balance Replies</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                      When a registered customer sends any WhatsApp message to {tenant?.businessName ?? 'your store'},
                      the bot automatically replies with their points balance, tier, and reward progress.
                      Customers can reply <span className="font-medium text-slate-700">STOP</span> at any time
                      to unsubscribe from WhatsApp messages.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatBadge label="Sent today" value={bot.sentToday} color="bg-blue-100 text-blue-700" />
                      <StatBadge label="This month" value={bot.sentThisMonth} color="bg-purple-100 text-purple-700" />
                      <StatBadge label="All time" value={bot.allTime} color="bg-slate-100 text-slate-600" />
                    </div>
                  </div>
                </div>
                <ToggleSwitch checked={bot.enabled} disabled={updating} onChange={handleToggle} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MessageCircle className="h-4 w-4 text-[#0F1E35]" />
                  Sample reply
                </div>
                <div className="max-w-md rounded-2xl rounded-tl-none bg-[#DCF8C6] p-3 text-sm text-slate-800">
                  <p className="whitespace-pre-line">
                    {`Hi Amara! 👋 Here is your ${tenant?.businessName ?? 'your store'} loyalty summary:\n\n📊 Points: 800 pts\n🏆 Tier: Regular Customer\n🎁 Reward: Spend ₦20,000 more to unlock your ₦1,000 reward voucher\n🕐 Last visit: Today\n\nKeep shopping and keep earning! 🛍️`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
