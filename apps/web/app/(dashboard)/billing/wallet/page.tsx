'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDistanceToNow, isToday, format } from 'date-fns';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WalletBalance {
  balance: number;
  ratePerMessage: number;
  estimatedMessagesLeft: number;
  thisMonthSpend: number;
  thisMonthMessageCount: number;
  isLow: boolean;
  isEmpty: boolean;
}

interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

interface WalletTransactionsResult {
  transactions: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  topup:                  { label: 'Top-up',   cls: 'bg-green-100 text-green-700' },
  debit_birthday:         { label: 'Birthday', cls: 'bg-blue-100 text-blue-700' },
  debit_lapsed:           { label: 'Win-back', cls: 'bg-red-100 text-red-700' },
  debit_campaign:         { label: 'Campaign', cls: 'bg-amber-100 text-amber-700' },
  debit_utility_overage:  { label: 'Overage',  cls: 'bg-slate-100 text-slate-600' },
  refund:                 { label: 'Refund',   cls: 'bg-green-100 text-green-700' },
};

function formatTxDate(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Today ${format(d, 'HH:mm')}`;
  return formatDistanceToNow(d, { addSuffix: true });
}

function TypeBadge({ type }: { type: string }) {
  const badge = TYPE_BADGES[type] ?? { label: type, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
      data-testid={`badge-${type}`}
    >
      {badge.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const LIMIT = 20;

export default function WalletPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: () => api.get<WalletBalance>('/api/v1/billing/wallet/balance'),
    staleTime: 30_000,
  });

  const { data: txResult, isLoading: txLoading } = useQuery<WalletTransactionsResult>({
    queryKey: ['wallet-transactions', page],
    queryFn: () =>
      api.get<WalletTransactionsResult>(
        `/api/v1/billing/wallet/transactions?page=${page}&limit=${LIMIT}`,
      ),
  });

  const balanceColour = wallet?.isEmpty
    ? 'text-red-500'
    : wallet?.isLow
      ? 'text-amber-500'
      : 'text-green-400';

  function handleExportCsv() {
    void api
      .get<WalletTransactionsResult>(
        '/api/v1/billing/wallet/transactions?page=1&limit=10000',
      )
      .then(({ transactions }) => {
        const header = 'Date,Type,Description,Amount,Balance After\n';
        const rows = transactions.map((t) =>
          [
            new Date(t.createdAt).toISOString(),
            t.type,
            `"${t.description.replace(/"/g, '""')}"`,
            t.amount,
            t.balanceAfter,
          ].join(','),
        );
        const csv = header + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wallet-transactions.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const totalPages = txResult ? Math.ceil(txResult.total / LIMIT) : 1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-xl font-bold text-slate-900">Marketing Wallet</h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">

        {/* ── Balance Hero ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-[#0F1E35] p-5 text-white shadow-lg sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Marketing Wallet Balance
              </p>
              {walletLoading ? (
                <div className="mt-2 h-10 w-40 animate-pulse rounded bg-slate-700" />
              ) : (
                <p
                  className={`mt-1 text-4xl font-bold sm:text-5xl ${balanceColour}`}
                  data-testid="wallet-balance"
                >
                  ₦{(wallet?.balance ?? 0).toLocaleString()}
                </p>
              )}
              {wallet && !walletLoading && (
                <p className="mt-2 text-sm text-slate-400">
                  ≈ {wallet.estimatedMessagesLeft} Marketing messages remaining at your
                  ₦{wallet.ratePerMessage}/msg rate
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/billing/wallet/topup')}
              className="self-start shrink-0 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-600 sm:self-auto"
              data-testid="topup-btn"
            >
              + Top Up
            </button>
          </div>
        </div>

        {/* ── Low balance warning ──────────────────────────────────────────── */}
        {wallet?.isLow && !wallet.isEmpty && (
          <div
            className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="low-balance-warning"
          >
            <p className="text-sm font-medium text-amber-800">
              ⚠️ Your wallet is running low. Top up to keep Birthday messages and win-backs
              firing automatically.
            </p>
            <button
              onClick={() => router.push('/billing/wallet/topup')}
              className="self-start shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 sm:ml-4 sm:self-auto"
            >
              Top Up Now →
            </button>
          </div>
        )}

        {/* ── Empty warning ────────────────────────────────────────────────── */}
        {wallet?.isEmpty && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-4"
            data-testid="empty-balance-warning"
          >
            <p className="font-semibold text-red-700">
              🔴 Wallet empty — Marketing messages are paused.
            </p>
            <p className="mt-1 text-sm text-red-600">
              Birthday messages, lapsed win-backs, and campaign broadcasts will not send
              until you top up.
            </p>
            <button
              onClick={() => router.push('/billing/wallet/topup')}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Top Up Now →
            </button>
          </div>
        )}

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: 'Spent This Month',
              value: `₦${(wallet?.thisMonthSpend ?? 0).toLocaleString()}`,
            },
            {
              label: 'Birthday Messages',
              value: txResult?.transactions.filter((t) => t.type === 'debit_birthday').length ?? '—',
            },
            {
              label: 'Lapsed Win-backs',
              value: txResult?.transactions.filter((t) => t.type === 'debit_lapsed').length ?? '—',
            },
            {
              label: 'Campaign Sends',
              value: txResult?.transactions.filter((t) => t.type === 'debit_campaign').length ?? '—',
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* ── How wallet works ─────────────────────────────────────────────── */}
        <div className="rounded-xl bg-green-50 p-5">
          <h3 className="mb-3 text-sm font-bold text-green-800">How the Marketing Wallet Works</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '💳', title: 'Load any amount', body: '₦1,000 minimum, no maximum, via Paystack' },
              { icon: '⚡', title: 'Credits instantly', body: 'Balance updates the moment payment confirms' },
              { icon: '📤', title: 'Auto-deducted', body: `₦${wallet?.ratePerMessage ?? 130} per Marketing message sent` },
              { icon: '🔔', title: 'Low balance alert', body: 'WhatsApp alert when balance drops below ₦3,000' },
            ].map((step, i) => (
              <div key={i} className="rounded-lg bg-white p-3 shadow-sm">
                <p className="text-2xl">{step.icon}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{step.title}</p>
                <p className="text-xs text-slate-500">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Transaction history ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Transaction History</h2>
            <button
              onClick={handleExportCsv}
              className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800"
              data-testid="export-csv"
            >
              ⬇ Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="tx-table">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txLoading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : txResult?.transactions.length === 0
                    ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 text-center text-sm text-slate-400"
                          >
                            No transactions yet — top up to get started.
                          </td>
                        </tr>
                      )
                    : txResult?.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatTxDate(tx.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <TypeBadge type={tx.type} />
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {tx.description.slice(0, 50)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
                              tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {tx.amount >= 0 ? '+' : ''}₦{Math.abs(tx.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                            ₦{Number(tx.balanceAfter).toLocaleString()}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {txResult && totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {txResult.total} transactions
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                  data-testid="prev-page"
                >
                  ← Previous
                </button>
                <span className="px-2 py-1.5 text-xs text-slate-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                  data-testid="next-page"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
