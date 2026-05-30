'use client';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@/lib/api';

const configs: Record<CampaignStatus, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-600 text-white' },
  sending:   { label: 'Sending',   className: 'bg-amber-100 text-amber-800' },
  sent:      { label: 'Sent',      className: 'bg-green-600 text-white' },
  cancelled: { label: 'Cancelled', className: 'bg-red-600 text-white' },
};

interface StatusBadgeProps {
  status: CampaignStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, className: base } = configs[status];
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        base,
        className,
      )}
    >
      {status === 'sending' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      )}
      {label}
    </span>
  );
}
