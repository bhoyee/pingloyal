'use client';
import { format, isToday } from 'date-fns';

interface Props {
  totalRecipients: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number;
  sentAt: string | null;
}

function pct(count: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

function formatSentAt(sentAt: string | null): string {
  if (!sentAt) return '—';
  const date = new Date(sentAt);
  if (isToday(date)) return `Today ${format(date, 'h:mm')}`;
  return format(date, 'MMM d, h:mm a');
}

export function CampaignStats({
  totalRecipients,
  deliveredCount,
  failedCount,
  deliveryRate,
  sentAt,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipients</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalRecipients}</p>
        </div>
        <div className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300 [animation-delay:50ms] hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Delivered</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{deliveredCount}</p>
          <p className="mt-0.5 text-xs text-emerald-500">{pct(deliveredCount, totalRecipients)}</p>
        </div>
        <div className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300 [animation-delay:100ms] hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{failedCount}</p>
          <p className="mt-0.5 text-xs text-red-500">{pct(failedCount, totalRecipients)}</p>
        </div>
        <div className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300 [animation-delay:150ms] hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sent At</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatSentAt(sentAt)}</p>
        </div>
      </div>

      <div className="animate-fade-in-up rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-300 [animation-delay:200ms] hover:shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">Delivery rate</p>
          <p className="text-lg font-bold text-slate-900" data-testid="delivery-rate">
            {deliveryRate}%
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${Math.min(deliveryRate, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {deliveredCount} delivered · {failedCount} failed
          {failedCount > 0 && ' (invalid numbers or BSP error)'}
        </p>
      </div>
    </div>
  );
}
