'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { api } from '@/lib/api';

type DatePreset = 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

interface SourceBreakdown {
  count: number;
  revenue: number;
  points: number;
}

interface ReconciliationResult {
  period: { startDate: string; endDate: string };
  transactions: {
    total: number;
    totalRevenue: number;
    totalPointsIssued: number;
    bySource: Record<string, SourceBreakdown>;
  };
  redemptions: {
    total: number;
    totalPointsRedeemed: number;
    totalRewardValue: number;
  };
}

const SOURCE_LABELS: Record<string, string> = {
  cashier_app: 'Cashier App',
  webhook: 'Webhook',
  api_pull: 'API Pull',
  file_import: 'File Import',
};

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000).toLocaleString()}k`;
  return `₦${n.toLocaleString()}`;
}

function getDateRange(preset: DatePreset, custom: { start: string; end: string }) {
  const today = new Date();
  if (preset === 'last30') {
    return {
      startDate: format(subDays(today, 29), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    };
  }
  if (preset === 'thisMonth') {
    return {
      startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  if (preset === 'lastMonth') {
    const last = subMonths(today, 1);
    return {
      startDate: format(startOfMonth(last), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(last), 'yyyy-MM-dd'),
    };
  }
  return { startDate: custom.start, endDate: custom.end };
}

export default function ReconciliationPage() {
  const [preset, setPreset] = useState<DatePreset>('last30');
  const [custom, setCustom] = useState({
    start: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });

  const { startDate, endDate } = getDateRange(preset, custom);

  const { data, isLoading, isError, error } = useQuery<ReconciliationResult>({
    queryKey: ['reconciliation', startDate, endDate],
    queryFn: () =>
      api.get<ReconciliationResult>(
        `/api/v1/transactions/reconciliation?startDate=${startDate}&endDate=${endDate}`,
      ),
    enabled: !!(startDate && endDate),
  });

  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'last30', label: 'Last 30 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reconciliation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Audit transactions and redemptions by source for the selected period.
        </p>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === p.key
                  ? 'bg-[#0DC56A] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Start date"
              value={custom.start}
              max={custom.end}
              onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
            />
            <span className="text-sm text-slate-400">to</span>
            <input
              type="date"
              aria-label="End date"
              value={custom.end}
              min={custom.start}
              onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0DC56A]/40"
            />
          </div>
        )}

        {!isLoading && data && (
          <span className="ml-auto text-xs text-slate-400">
            {data.period.startDate} → {data.period.endDate}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24 text-slate-400" role="status">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading report…
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          <p className="font-semibold">Failed to load reconciliation report.</p>
          {error instanceof Error && (
            <p className="mt-1 font-mono text-xs text-red-500">{error.message}</p>
          )}
        </div>
      )}

      {/* Report */}
      {data && !isLoading && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="Total Transactions" value={fmt(data.transactions.total)} />
            <SummaryCard label="Total Revenue" value={fmtCurrency(data.transactions.totalRevenue)} />
            <SummaryCard label="Points Issued" value={fmt(data.transactions.totalPointsIssued)} />
            <SummaryCard label="Redemptions" value={fmt(data.redemptions.total)} />
          </div>

          {/* Transaction breakdown by source */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              Transaction Breakdown by Source
            </h2>

            {data.transactions.total === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No transactions in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-4">Source</th>
                      <th className="pb-2 pr-4 text-right">Transactions</th>
                      <th className="pb-2 pr-4 text-right">Revenue</th>
                      <th className="pb-2 text-right">Points Issued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {Object.entries(data.transactions.bySource).map(([src, row]) => (
                      <tr key={src}>
                        <td className="py-3 pr-4 font-medium text-slate-700">
                          {SOURCE_LABELS[src] ?? src}
                          {src === 'cashier_app' && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right text-slate-600">{fmt(row.count)}</td>
                        <td className="py-3 pr-4 text-right text-slate-600">
                          ₦{row.revenue.toLocaleString()}
                        </td>
                        <td className="py-3 text-right text-slate-600">{fmt(row.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Redemptions summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Redemptions Summary</h2>

            {data.redemptions.total === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No redemptions in this period.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <RedemptionStat
                  label="Total Redemptions"
                  value={fmt(data.redemptions.total)}
                />
                <RedemptionStat
                  label="Points Redeemed"
                  value={fmt(data.redemptions.totalPointsRedeemed)}
                />
                <RedemptionStat
                  label="Reward Value"
                  value={fmtCurrency(data.redemptions.totalRewardValue)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function RedemptionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
