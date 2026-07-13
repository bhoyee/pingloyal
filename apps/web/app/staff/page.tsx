'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

interface Stats {
  total: number;
  trialing: number;
  active: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
}

interface TenantRow {
  id: string;
  businessName: string;
  slug: string;
  planTier: string;
  subscriptionStatus: string;
  createdAt: string;
  ownerEmail: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trialing: 'bg-blue-50 text-blue-700 border-blue-200',
  past_due: 'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function StaffDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ['staff-stats'],
    queryFn: () => staffApi.get<Stats>('/staff/tenants/stats'),
  });

  const { data: recent } = useQuery<{ data: TenantRow[] }>({
    queryKey: ['staff-tenants-recent'],
    queryFn: () => staffApi.get<{ data: TenantRow[] }>('/staff/tenants?page=1'),
  });

  const statCards = [
    { label: 'Total Tenants', value: stats?.total ?? 0, color: 'text-slate-900' },
    { label: 'Active', value: stats?.active ?? 0, color: 'text-emerald-600' },
    { label: 'Trialing', value: stats?.trialing ?? 0, color: 'text-blue-600' },
    { label: 'Past Due', value: stats?.pastDue ?? 0, color: 'text-amber-600' },
    { label: 'Suspended', value: stats?.suspended ?? 0, color: 'text-red-600' },
  ];

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">PingLoyal platform overview</p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {statsLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse h-24" />
            ))
          : statCards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
                <p className={`mt-2 text-3xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
      </div>

      {/* Recent tenants */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">Recent Tenants</h2>
          <Link href="/staff/tenants" className="text-sm font-medium text-[#0DC56A] hover:underline">
            View all →
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {!recent ? (
            <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
          ) : recent.data.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No tenants yet.</p>
          ) : (
            recent.data.slice(0, 8).map((t, idx) => (
              <Link
                key={t.id}
                href={`/staff/tenants?highlight=${t.id}`}
                className={`flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.businessName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.ownerEmail ?? '—'} · {t.slug}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.subscriptionStatus] ?? STATUS_STYLE['cancelled']}`}>
                    {t.subscriptionStatus.replace('_', ' ')}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
