'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import { api } from '@/lib/api';

type DatePreset = 'today' | 'last7' | 'thisMonth' | 'custom';

interface CashierBreakdown {
  cashierId: string | null;
  cashierName: string;
  transactionCount: number;
  totalAmount: number;
  averageAmount: number;
  manualEntryCount: number;
  percentageOfStoreTotal: number;
  flagged: boolean;
}

interface RedemptionLogEntry {
  redeemedAt: string;
  customerName: string;
  pointsRedeemed: number;
  rewardValue: number;
  cashierName: string;
}

interface ReconciliationResult {
  period: { start: string; end: string };
  summary: {
    totalTransactions: number;
    totalAmountLogged: number;
    totalPointsIssued: number;
    expectedPoints: number;
    pointsDiscrepancy: number;
    terminalVerifiedCount: number;
    terminalVerifiedAmount: number;
    manualEntryCount: number;
    manualEntryAmount: number;
    manualEntryPercent: number;
  };
  redemptions: {
    totalRedemptions: number;
    totalPointsRedeemed: number;
    totalValueGivenOut: number;
  };
  cashierBreakdown: CashierBreakdown[];
  redemptionLog: RedemptionLogEntry[];
}

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000).toLocaleString()}k`;
  return `₦${n.toLocaleString()}`;
}

function getDateRange(preset: DatePreset, custom: { start: string; end: string }) {
  const today = new Date();
  if (preset === 'today') {
    const d = format(today, 'yyyy-MM-dd');
    return { startDate: d, endDate: d };
  }
  if (preset === 'last7') {
    return {
      startDate: format(subDays(today, 6), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    };
  }
  if (preset === 'thisMonth') {
    return {
      startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  return { startDate: custom.start, endDate: custom.end };
}

function integrityStatus(
  discrepancy: number,
  expectedPoints: number,
): 'green' | 'amber' | 'red' {
  if (expectedPoints === 0) return 'green';
  const pct = Math.abs(discrepancy / expectedPoints);
  if (pct <= 0.02) return 'green';
  if (pct <= 0.1) return 'amber';
  return 'red';
}

function exportRedemptionCsv(log: RedemptionLogEntry[], period: { start: string; end: string }) {
  const header = 'Date/Time,Customer,Points Redeemed,Reward Value (₦),Cashier';
  const rows = log.map((r) =>
    [
      new Date(r.redeemedAt).toLocaleString(),
      r.customerName,
      r.pointsRedeemed,
      r.rewardValue,
      r.cashierName,
    ]
      .map(String)
      .join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `redemption-log-${period.start}-to-${period.end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const RED_LOG_PAGE_SIZE = 10;

export default function ReconciliationPage() {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [custom, setCustom] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [howToOpen, setHowToOpen] = useState(false);
  const [redPage, setRedPage] = useState(1);

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
    { key: 'today', label: 'Today' },
    { key: 'last7', label: 'Last 7 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'custom', label: 'Custom' },
  ];

  const flaggedCashiers = data?.cashierBreakdown.filter((c) => c.flagged) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reconciliation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Audit transactions, points integrity, and redemptions for the selected period.
        </p>
      </div>

      {/* ── Date filter ───────────────────────────────────────────────────── */}
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
            {data.period.start} → {data.period.end}
          </span>
        )}
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {isError && !isLoading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          <p className="font-semibold">Failed to load reconciliation report.</p>
          {error instanceof Error && (
            <p className="mt-1 font-mono text-xs text-red-500">{error.message}</p>
          )}
        </div>
      )}

      {/* ── Report ────────────────────────────────────────────────────────── */}
      {(data || isLoading) && !isError && (
        <div className="space-y-6">

          {/* ── Section 1: Summary overview ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {isLoading ? (
              <>
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
                <SkeletonStatCard />
              </>
            ) : (
              <>
                <StatCard label="Transactions" value={fmt(data!.summary.totalTransactions)} />
                <StatCard label="Total Spend" value={fmtCurrency(data!.summary.totalAmountLogged)} />
                <StatCard label="Points Issued" value={fmt(data!.summary.totalPointsIssued)} />
                <StatCard label="Rewards Given" value={fmtCurrency(data!.redemptions.totalValueGivenOut)} />
              </>
            )}
          </div>

          {data && (<>
          {/* Points integrity card */}
          <PointsIntegrityCard
            discrepancy={data.summary.pointsDiscrepancy}
            expectedPoints={data.summary.expectedPoints}
            totalPointsIssued={data.summary.totalPointsIssued}
            totalAmount={data.summary.totalAmountLogged}
          />

          {/* Source breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Transaction source breakdown</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#0DC56A]">✓</span>
                <span className="text-slate-700">
                  Terminal / webhook verified:{' '}
                  <span className="font-semibold">{fmt(data.summary.terminalVerifiedCount)}</span> transactions
                  {' '}({fmtCurrency(data.summary.terminalVerifiedAmount)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-500">⚠</span>
                <span className="text-slate-700">
                  Manual entry:{' '}
                  <span className="font-semibold">{fmt(data.summary.manualEntryCount)}</span> transactions
                  {' '}({fmtCurrency(data.summary.manualEntryAmount)} — {data.summary.manualEntryPercent}%)
                </span>
              </div>
            </div>
          </div>

          {/* ── Section 2: Cashier breakdown ─────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-800">Per-cashier analysis</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Compare each cashier&apos;s average transaction value. Consistently low averages may
              indicate under-recording.
            </p>

            {data.cashierBreakdown.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No transactions in this period.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-4">Cashier</th>
                        <th className="pb-2 pr-4 text-right">Transactions</th>
                        <th className="pb-2 pr-4 text-right">Total ₦</th>
                        <th className="pb-2 pr-4 text-right">Avg/Sale</th>
                        <th className="pb-2 pr-4 text-right">Manual</th>
                        <th className="pb-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Store total row */}
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                        <td className="py-2 pr-4">Store total</td>
                        <td className="py-2 pr-4 text-right">{fmt(data.summary.totalTransactions)}</td>
                        <td className="py-2 pr-4 text-right">₦{data.summary.totalAmountLogged.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">
                          {data.summary.totalTransactions > 0
                            ? `₦${Math.round(data.summary.totalAmountLogged / data.summary.totalTransactions).toLocaleString()}`
                            : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {fmt(data.summary.manualEntryCount)} ({data.summary.manualEntryPercent}%)
                        </td>
                        <td className="py-2 text-right" />
                      </tr>

                      {data.cashierBreakdown.map((cashier) => {
                        const manualPct =
                          cashier.transactionCount > 0
                            ? Math.round((cashier.manualEntryCount / cashier.transactionCount) * 100)
                            : 0;
                        return (
                          <tr
                            key={cashier.cashierId ?? cashier.cashierName}
                            data-flagged={cashier.flagged ? 'true' : undefined}
                            className={`border-l-2 ${
                              cashier.flagged
                                ? 'border-l-amber-400 bg-amber-50/40'
                                : 'border-l-transparent'
                            }`}
                          >
                            <td className="py-3 pr-4 font-medium text-slate-700">
                              {cashier.cashierName}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {fmt(cashier.transactionCount)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              ₦{cashier.totalAmount.toLocaleString()}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              ₦{Math.round(cashier.averageAmount).toLocaleString()}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {cashier.manualEntryCount} ({manualPct}%)
                            </td>
                            <td className="py-3 text-right">
                              {cashier.flagged ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                  ⚠ Review
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                  ✓ Normal
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Flagged cashier info box */}
                {flaggedCashiers.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium">ⓘ Flagged cashiers detected</p>
                    <p className="mt-1 text-amber-700">
                      Flagged cashiers have either an unusually low average sale amount or a high
                      proportion of manual entries compared to the store average. This may indicate
                      under-recording of transaction amounts. Review their recent transactions for patterns.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {flaggedCashiers.map((c) => (
                        <a
                          key={c.cashierId ?? c.cashierName}
                          href={`/transactions?cashierId=${c.cashierId ?? ''}&startDate=${startDate}&endDate=${endDate}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          View flagged transactions — {c.cashierName} →
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Section 3: Redemption log ─────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-800">
                Rewards redeemed this period
              </h2>
              <div className="flex items-center gap-2">
                {data.redemptionLog.length > 0 && (
                  <button
                    onClick={() => exportRedemptionCsv(data.redemptionLog, data.period)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                )}
                <a
                  href="/redemptions"
                  className="rounded-lg border border-[#0DC56A]/40 bg-[#0DC56A]/5 px-3 py-1.5 text-xs font-medium text-[#0a9f54] hover:bg-[#0DC56A]/10"
                >
                  View all redemptions →
                </a>
              </div>
            </div>

            {data.redemptionLog.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No rewards redeemed in this period.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-500">
                  {fmt(data.redemptions.totalRedemptions)} reward
                  {data.redemptions.totalRedemptions !== 1 ? 's' : ''} redeemed
                  &nbsp;·&nbsp; {fmtCurrency(data.redemptions.totalValueGivenOut)} total value given out
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-4">Date / Time</th>
                        <th className="pb-2 pr-4">Customer</th>
                        <th className="pb-2 pr-4 text-right">Points</th>
                        <th className="pb-2 pr-4 text-right">Value</th>
                        <th className="pb-2">Cashier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.redemptionLog
                        .slice((redPage - 1) * RED_LOG_PAGE_SIZE, redPage * RED_LOG_PAGE_SIZE)
                        .map((row, idx) => (
                          <tr key={idx}>
                            <td className="py-3 pr-4 text-slate-500">
                              {new Date(row.redeemedAt).toLocaleString('en-NG', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 pr-4 font-medium text-slate-700">
                              {row.customerName}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {fmt(row.pointsRedeemed)} pts
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              ₦{row.rewardValue.toLocaleString()}
                            </td>
                            <td className="py-3 text-slate-600">{row.cashierName}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination controls */}
                {data.redemptionLog.length > RED_LOG_PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>
                      Showing {((redPage - 1) * RED_LOG_PAGE_SIZE) + 1}–
                      {Math.min(redPage * RED_LOG_PAGE_SIZE, data.redemptionLog.length)} of{' '}
                      {data.redemptionLog.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRedPage((p) => Math.max(1, p - 1))}
                        disabled={redPage === 1}
                        className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                      >
                        ← Prev
                      </button>
                      {Array.from(
                        { length: Math.ceil(data.redemptionLog.length / RED_LOG_PAGE_SIZE) },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <button
                          key={n}
                          onClick={() => setRedPage(n)}
                          className={`rounded px-2.5 py-1 font-medium ${
                            n === redPage
                              ? 'bg-[#0DC56A] text-white'
                              : 'hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          setRedPage((p) =>
                            Math.min(Math.ceil(data.redemptionLog.length / RED_LOG_PAGE_SIZE), p + 1),
                          )
                        }
                        disabled={redPage * RED_LOG_PAGE_SIZE >= data.redemptionLog.length}
                        className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Section 4: How to use this data ─────────────────────────── */}
          <div className="rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <button
              onClick={() => setHowToOpen((v) => !v)}
              className="flex w-full items-center justify-between p-5 text-left"
            >
              <span className="flex items-center gap-2.5 text-sm font-semibold text-amber-900">
                <span className="inline-flex shrink-0 items-center rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-white">
                  NOTE
                </span>
                How to use this report with your existing POS / till system
              </span>
              <svg
                className={`h-4 w-4 shrink-0 text-amber-500 transition-transform ${howToOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {howToOpen && (
              <div className="border-t border-amber-200 p-5 text-sm text-amber-900">
                <ol className="list-decimal list-inside space-y-3">
                  <li>
                    Compare total rewards redeemed (
                    <span className="font-semibold">
                      {fmtCurrency(data.redemptions.totalValueGivenOut)}
                    </span>
                    ) with discounts recorded in your POS for the same period — they should match.
                  </li>
                  <li>
                    If you see a flagged cashier, open their transaction history and compare against
                    your till tape or POS records for that day.
                  </li>
                  <li>
                    The points discrepancy check tells you if points are being awarded correctly
                    relative to actual spend amounts.
                  </li>
                </ol>
              </div>
            )}
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-8 w-28 animate-pulse rounded-lg bg-slate-200" />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900 animate-fade-in-up">{value}</p>
    </div>
  );
}

function PointsIntegrityCard({
  discrepancy,
  expectedPoints,
  totalPointsIssued,
  totalAmount,
}: {
  discrepancy: number;
  expectedPoints: number;
  totalPointsIssued: number;
  totalAmount: number;
}) {
  const status = integrityStatus(discrepancy, expectedPoints);

  const colors = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      title: 'text-green-800',
      body: 'text-green-700',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      title: 'text-amber-800',
      body: 'text-amber-700',
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      title: 'text-red-800',
      body: 'text-red-700',
    },
  }[status];

  const icon = { green: '✓', amber: '⚠️', red: '🔴' }[status];

  return (
    <div
      data-integrity={status}
      className={`rounded-2xl border p-5 ${colors.bg} ${colors.border}`}
    >
      {status === 'green' && (
        <>
          <p className={`font-semibold ${colors.title}`}>
            {icon} Points check passed
          </p>
          <p className={`mt-1 text-sm ${colors.body}`}>
            Expected {fmt(expectedPoints)} pts from ₦{totalAmount.toLocaleString()} spend.
            Actual issued: {fmt(totalPointsIssued)} pts — matches ✓
          </p>
        </>
      )}
      {status === 'amber' && (
        <>
          <p className={`font-semibold ${colors.title}`}>
            {icon} Minor discrepancy detected
          </p>
          <p className={`mt-1 text-sm ${colors.body}`}>
            Expected {fmt(expectedPoints)} pts, issued {fmt(totalPointsIssued)} pts.
            Difference: {fmt(Math.abs(discrepancy))} pts — review manual entries below.
          </p>
        </>
      )}
      {status === 'red' && (
        <>
          <p className={`font-semibold ${colors.title}`}>
            {icon} Significant discrepancy
          </p>
          <p className={`mt-1 text-sm ${colors.body}`}>
            Expected {fmt(expectedPoints)} pts, issued {fmt(totalPointsIssued)} pts.
            Difference: {fmt(Math.abs(discrepancy))} pts — immediate review recommended.
          </p>
        </>
      )}
    </div>
  );
}
