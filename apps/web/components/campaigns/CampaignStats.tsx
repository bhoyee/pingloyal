'use client';

interface Props {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export function CampaignStats({
  totalRecipients,
  sentCount,
  deliveredCount,
  failedCount,
  deliveryRate,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Recipients" value={totalRecipients} />
        <StatCard label="Sent" value={sentCount} />
        <StatCard label="Delivered" value={deliveredCount} />
        <StatCard label="Failed" value={failedCount} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm text-slate-500">Delivery Rate</p>
          <p className="text-lg font-bold text-slate-900" data-testid="delivery-rate">
            {deliveryRate}%
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${Math.min(deliveryRate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
