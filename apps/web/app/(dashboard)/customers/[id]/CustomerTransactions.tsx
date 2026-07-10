'use client';
import { useEffect, useState } from 'react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { api } from '@/lib/api';
import type { CustomerTransactionRow } from './page';

interface Props {
  customerId: string;
}

const PAGE_SIZE = 20;

const SOURCE_LABELS: Record<string, string> = {
  cashier_app: 'Cashier PWA',
  webhook: 'Webhook',
  api_pull: 'API',
  file_import: 'API',
};

function formatRelative(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return `Today ${format(date, 'HH:mm')}`;
  return formatDistanceToNow(date, { addSuffix: true });
}

export function CustomerTransactions({ customerId }: Props) {
  const [data, setData] = useState<CustomerTransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: CustomerTransactionRow[]; total: number }>(
        `/api/v1/customers/${customerId}/transactions?page=${page}&limit=${PAGE_SIZE}`,
      )
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setTotal(res.total);
      })
      .catch(() => {
        if (!cancelled) {
          setData([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : data.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm font-medium text-slate-500">No transactions yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Transactions logged via the Cashier app or your connected system will appear here
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Date/Time</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Amount</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Points</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Cashier</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatRelative(tx.createdAt)}</td>
                    <td className="px-5 py-3 text-slate-700">₦{Number(tx.amount).toLocaleString()}</td>
                    <td className="px-5 py-3 font-medium text-emerald-600">+{tx.pointsEarned} pts</td>
                    <td className="px-5 py-3 text-slate-600">{tx.cashierName ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{SOURCE_LABELS[tx.source] ?? tx.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-emerald-300 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-emerald-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
