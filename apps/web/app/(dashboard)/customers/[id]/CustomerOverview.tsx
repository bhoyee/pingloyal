'use client';
import { formatDistanceToNow } from 'date-fns';
import type { TenantMe } from '@/lib/api';
import type { CustomerDetail, CustomerTransactionRow, TriggerLogSummary } from './page';

interface Props {
  customer: CustomerDetail;
  tenant: TenantMe | null;
  recentTransactions: CustomerTransactionRow[];
  totalPointsRedeemed: number;
  rewardsAvailable: number;
  latestMessage: TriggerLogSummary | null;
  messageCount: number;
  onViewAllTransactions: () => void;
}

function formatTriggerType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function StatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold text-slate-900 ${valueClassName ?? ''}`}>{value}</p>
    </div>
  );
}

export function CustomerOverview({
  customer,
  tenant,
  recentTransactions,
  totalPointsRedeemed,
  rewardsAvailable,
  latestMessage,
  messageCount,
  onViewAllTransactions,
}: Props) {
  const threshold = tenant?.pointsThreshold ?? 0;
  const earnRate = tenant?.pointsEarnRate ?? 0;
  const rewardValue = tenant?.rewardValue ?? 0;
  const percent = threshold > 0 ? Math.min(100, Math.round((customer.pointsBalance / threshold) * 100)) : 0;
  const amountToGoal =
    threshold > 0
      ? Math.ceil(((threshold - (customer.pointsBalance % threshold)) * earnRate) / 100) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Spend" value={`₦${Number(customer.totalSpend).toLocaleString()}`} />
        <StatCard label="Points Earned" value={customer.lifetimePoints.toLocaleString()} valueClassName="text-emerald-600" />
        <StatCard label="Points Redeemed" value={totalPointsRedeemed.toLocaleString()} valueClassName="text-red-600" />
        <StatCard label="Visit Count" value={customer.purchaseCount.toLocaleString()} />
      </div>

      {/* Progress bar / rewards ready */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {rewardsAvailable > 0 ? (
          <p data-testid="rewards-ready" className="text-sm font-semibold text-green-600">
            🎁 {rewardsAvailable} reward{rewardsAvailable > 1 ? 's' : ''} ready to redeem
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Progress to next reward</p>
              <p data-testid="progress-label" className="text-sm text-slate-500">
                {customer.pointsBalance.toLocaleString()} / {threshold.toLocaleString()} pts ({percent}%)
              </p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                data-testid="progress-bar-fill"
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Spend ₦{amountToGoal.toLocaleString()} more to unlock ₦{Number(rewardValue).toLocaleString()} voucher
            </p>
          </>
        )}
      </div>

      {/* WhatsApp summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-slate-900">WhatsApp activity</p>
        <p className="mt-2 text-sm text-slate-600">
          {latestMessage
            ? `Last message: ${formatTriggerType(latestMessage.triggerType)} · ${formatDistanceToNow(new Date(latestMessage.createdAt), { addSuffix: true })}`
            : 'No messages sent yet'}
        </p>
        <p className="mt-1 text-sm text-slate-600">Total messages sent: {messageCount}</p>
      </div>

      {/* Recent purchases */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Recent purchases</h2>
          <button
            onClick={onViewAllTransactions}
            data-testid="view-all-transactions"
            className="cursor-pointer text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            View all transactions →
          </button>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">No purchases yet</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentTransactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-500">
                  {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                </span>
                <span className="text-slate-700">₦{Number(tx.amount).toLocaleString()}</span>
                <span className="font-medium text-emerald-600">+{tx.pointsEarned} pts</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
