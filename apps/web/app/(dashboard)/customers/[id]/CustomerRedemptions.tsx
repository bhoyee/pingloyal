'use client';
import { useEffect, useState } from 'react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { api } from '@/lib/api';
import type { RedemptionRow } from './page';

interface Props {
  customerId: string;
}

const PAGE_SIZE = 20;

function formatRelative(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return `Today ${format(date, 'HH:mm')}`;
  return formatDistanceToNow(date, { addSuffix: true });
}

export function CustomerRedemptions({ customerId }: Props) {
  const [data, setData] = useState<RedemptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: RedemptionRow[]; total: number }>(
        `/api/v1/redemptions?customerId=${customerId}&page=${page}&limit=${PAGE_SIZE}`,
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
          <p className="text-sm font-medium text-slate-500">No redemptions yet</p>
          <p className="mt-1 text-xs text-slate-400">
            When this customer redeems a reward, it will appear here
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Date/Time</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Points used</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Value</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Rewards</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Cashier</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Balance after</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatRelative(r.redeemedAt)}</td>
                    <td className="px-5 py-3 font-medium text-red-600">-{r.pointsRedeemed.toLocaleString()} pts</td>
                    <td className="px-5 py-3 font-medium text-green-600">₦{Number(r.value).toLocaleString()}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {r.rewardsCount} reward{r.rewardsCount > 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.cashierName ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-700">{r.balanceAfter.toLocaleString()}</td>
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
