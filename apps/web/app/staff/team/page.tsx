'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { STAFF_ROLE_BADGES, STAFF_STATUS_BADGES } from '@/components/staff/badges';

interface StaffAccountRow {
  id: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'support_agent';
  isActive: boolean;
  createdAt: string;
}

export default function StaffTeamPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (localStorage.getItem('staff_role') !== 'super_admin') {
      router.replace('/staff');
    }
  }, [router]);

  const { data: accounts, isLoading } = useQuery<StaffAccountRow[]>({
    queryKey: ['staff-accounts'],
    queryFn: () => staffApi.get<StaffAccountRow[]>('/staff/accounts'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      staffApi.patch(`/staff/accounts/${id}`, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not update staff account';
      alert(message);
    },
  });

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Team</h1>
        <Link href="/staff/team/new">
          <Button size="sm">+ New staff</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No staff accounts yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {accounts.map((account, idx) => {
            const roleBadge = STAFF_ROLE_BADGES[account.role];
            const statusBadge = STAFF_STATUS_BADGES[account.isActive ? 'active' : 'inactive'];
            return (
              <div
                key={account.id}
                className={`flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{account.fullName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{account.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                  {roleBadge && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge.className}`}>
                      {roleBadge.label}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                  <button
                    type="button"
                    disabled={toggleActive.isPending}
                    onClick={() =>
                      toggleActive.mutate({ id: account.id, isActive: !account.isActive })
                    }
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {account.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
