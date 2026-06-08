'use client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Customer {
  id: string;
  fullName: string;
  phoneE164: string;
  pointsBalance: number;
  totalSpend: number;
  purchaseCount: number;
  lastPurchaseAt: string | null;
  waOptedIn: boolean;
  isActive: boolean;
  source: string;
  createdAt: string;
  tier: { tierLabel: string } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  qr_registration: 'QR Scan',
  cashier: 'Cashier',
  import: 'Import',
  manual: 'Manual',
};

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.replace('/login');
    } else {
      setMounted(true);
    }
  }, [router]);

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/api/v1/customers'),
    enabled: mounted,
    staleTime: 60_000,
  });

  const statusFilter = searchParams.get('status');

  const filtered = (customers ?? []).filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.fullName.toLowerCase().includes(q) && !c.phoneE164.includes(q)) {
        return false;
      }
    }
    if (statusFilter === 'inactive') return !c.lastPurchaseAt || c.purchaseCount === 0;
    return true;
  });

  const total = customers?.length ?? 0;
  const withPurchases = customers?.filter((c) => c.purchaseCount > 0).length ?? 0;
  const waOptedIn = customers?.filter((c) => c.waOptedIn).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Customers</h1>
            <p className="text-xs text-slate-400 mt-0.5">All registered loyalty members</p>
          </div>
          <a
            href="/cashier"
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 sm:self-auto"
          >
            Open Cashier App ↗
          </a>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-lg font-bold text-slate-900 sm:text-2xl">{isLoading ? '—' : total}</p>
            <p className="text-xs text-slate-500 sm:text-sm">Total Members</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-lg font-bold text-slate-900 sm:text-2xl">{isLoading ? '—' : withPurchases}</p>
            <p className="text-xs text-slate-500 sm:text-sm">Made a Purchase</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-lg font-bold text-slate-900 sm:text-2xl">{isLoading ? '—' : waOptedIn}</p>
            <p className="text-xs text-slate-500 sm:text-sm">WA Opted-In</p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
          />
          {statusFilter && (
            <button
              onClick={() => router.push('/customers')}
              className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-400 sm:self-auto"
            >
              Showing: {statusFilter} ✕
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Points</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Spend</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Visits</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">WA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                    {search ? 'No customers match your search' : 'No customers yet — share your QR code to get started'}
                  </td>
                </tr>
              ) : (
                filtered.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{customer.fullName}</p>
                        {customer.tier && (
                          <span className="text-xs text-slate-400">{customer.tier.tierLabel}</span>
                        )}
                        {!customer.tier && (
                          <span className="text-xs text-slate-400">{SOURCE_LABELS[customer.source] ?? customer.source}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{customer.phoneE164}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">⭐ {customer.pointsBalance.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      ₦{Number(customer.totalSpend).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{customer.purchaseCount}</td>
                    <td className="px-4 py-3">
                      {customer.waOptedIn ? (
                        <span className="text-green-600 font-semibold">✓</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatDistanceToNow(new Date(customer.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!isLoading && filtered.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Showing {filtered.length} of {total} customers
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
