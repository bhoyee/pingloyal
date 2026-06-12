'use client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type TenantMe } from '@/lib/api';

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

type SortField = 'totalSpend' | 'pointsBalance' | 'lastPurchaseAt';

function tierBadge(tierLabel: string): { icon: string; classes: string } {
  const l = tierLabel.toLowerCase();
  if (l.includes('vip')) return { icon: '👑', classes: 'bg-amber-100 text-amber-700' };
  if (l.includes('standard')) return { icon: '🌱', classes: 'bg-emerald-100 text-emerald-700' };
  return { icon: '⭐', classes: 'bg-sky-100 text-sky-700' };
}

function isActiveCustomer(c: Customer): boolean {
  return !!c.lastPurchaseAt && c.purchaseCount > 0;
}

const FIXED_TIERS = ['VIP', 'Mid', 'Standard'];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
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
  const [tierFilter, setTierFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortField>('totalSpend');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      router.replace('/login');
    } else {
      setMounted(true);
    }
  }, [router]);

  useEffect(() => {
    if (searchParams.get('status') === 'inactive') {
      setTierFilter('inactive');
    }
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, tierFilter, sortBy, pageSize]);

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/api/v1/customers'),
    enabled: mounted,
    staleTime: 60_000,
  });

  const { data: tenant } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
    enabled: mounted,
    staleTime: 5 * 60_000,
  });

  const total = customers?.length ?? 0;
  const activeCount = customers?.filter(isActiveCustomer).length ?? 0;
  const inactiveCount = total - activeCount;

  const tierCounts = new Map<string, number>();
  for (const c of customers ?? []) {
    if (c.tier) {
      tierCounts.set(c.tier.tierLabel, (tierCounts.get(c.tier.tierLabel) ?? 0) + 1);
    }
  }
  const usedLabels = new Set<string>();
  const fixedTierPills: Array<[string, number]> = FIXED_TIERS.map((fixedLabel) => {
    const match = [...tierCounts.entries()].find(
      ([label]) => label.toLowerCase() === fixedLabel.toLowerCase(),
    );
    if (match) usedLabels.add(match[0]);
    return [match ? match[0] : fixedLabel, match ? match[1] : 0];
  });
  const extraTierPills = [...tierCounts.entries()].filter(([label]) => !usedLabels.has(label));
  const sortedTiers = [...fixedTierPills, ...extraTierPills];

  const filtered = (customers ?? []).filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.fullName.toLowerCase().includes(q) && !c.phoneE164.includes(q)) {
        return false;
      }
    }
    if (tierFilter === 'inactive') return !isActiveCustomer(c);
    if (tierFilter !== 'all') return c.tier?.tierLabel === tierFilter;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'lastPurchaseAt') {
      const at = a.lastPurchaseAt ? new Date(a.lastPurchaseAt).getTime() : 0;
      const bt = b.lastPurchaseAt ? new Date(b.lastPurchaseAt).getTime() : 0;
      return bt - at;
    }
    return b[sortBy] - a[sortBy];
  });

  const pointsThreshold = tenant?.pointsThreshold ?? 0;

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="min-h-screen bg-emerald-50/40">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Customers</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLoading ? 'Loading…' : `${total} total · ${activeCount} active`}
            </p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <a
              href="/cashier"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              Open Cashier App ↗
            </a>
            <a
              href="/campaigns/new"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Send Campaign
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
        {/* Tier filter pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTierFilter('all')}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              tierFilter === 'all'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            All ({total})
          </button>
          {sortedTiers.map(([label, count]) => {
            const badge = tierBadge(label);
            return (
              <button
                key={label}
                onClick={() => setTierFilter(label)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  tierFilter === label
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
                }`}
              >
                {badge.icon} {label} ({count})
              </button>
            );
          })}
          <button
            onClick={() => setTierFilter('inactive')}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              tierFilter === 'inactive'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            ⚠️ Inactive ({inactiveCount})
          </button>
        </div>

        {/* Search + sort */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:w-80"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:self-auto"
          >
            <option value="totalSpend">Sort: Total Spend</option>
            <option value="pointsBalance">Sort: Points</option>
            <option value="lastPurchaseAt">Sort: Last Visit</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Points</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Total Spend</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Last Visit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Joined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">WA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    {search ? 'No customers match your search' : 'No customers yet — share your QR code to get started'}
                  </td>
                </tr>
              ) : (
                paginated.map((customer) => {
                  const badge = customer.tier ? tierBadge(customer.tier.tierLabel) : null;
                  const pct = pointsThreshold > 0
                    ? Math.min(100, Math.round((customer.pointsBalance / pointsThreshold) * 100))
                    : 0;
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{customer.fullName}</p>
                        <p className="text-xs text-slate-400 font-mono">{customer.phoneE164}</p>
                      </td>
                      <td className="px-4 py-3">
                        {badge ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
                            {badge.icon} {customer.tier!.tierLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{customer.pointsBalance.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 min-w-[120px]">
                        <div className="h-1.5 w-full rounded-full bg-slate-200">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{pct}% to reward</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        ₦{Number(customer.totalSpend).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {customer.lastPurchaseAt
                          ? formatDistanceToNow(new Date(customer.lastPurchaseAt), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {formatDistanceToNow(new Date(customer.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        {customer.waOptedIn ? (
                          <span className="text-green-600 font-semibold">✓</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {!isLoading && sorted.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} customers
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5">
                  Rows per page
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:border-emerald-300 disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:border-emerald-300 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
