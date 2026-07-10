'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SUBSCRIPTION_STATUS_BADGES, TENANT_STATUS_BADGES } from '@/components/staff/badges';

interface StaffTenantListRow {
  id: string;
  businessName: string;
  slug: string;
  planTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface StaffTenantListResponse {
  rows: StaffTenantListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function StaffTenantsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    setIsSuperAdmin(localStorage.getItem('staff_role') === 'super_admin');
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isLoading } = useQuery<StaffTenantListResponse>({
    queryKey: ['staff-tenants', debouncedSearch],
    queryFn: () =>
      staffApi.get<StaffTenantListResponse>(
        debouncedSearch
          ? `/staff/tenants?search=${encodeURIComponent(debouncedSearch)}`
          : '/staff/tenants',
      ),
  });

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Tenants</h1>
        {isSuperAdmin && (
          <Link href="/staff/tenants/new">
            <Button size="sm">+ New tenant</Button>
          </Link>
        )}
      </div>

      <Input
        placeholder="Search by business name or slug…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No tenants found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.rows.map((tenant, idx) => {
            const subBadge = SUBSCRIPTION_STATUS_BADGES[tenant.subscriptionStatus];
            const statusBadge = TENANT_STATUS_BADGES[tenant.deletedAt ? 'deleted' : 'active'];
            return (
              <Link
                key={tenant.id}
                href={`/staff/tenants/${tenant.id}`}
                className={`flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{tenant.businessName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">/{tenant.slug} · {tenant.planTier}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                  {subBadge && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${subBadge.className}`}>
                      {subBadge.label}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
