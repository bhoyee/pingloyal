'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

interface StaffTicketRow {
  id: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
}

interface StaffAccountRow {
  id: string;
  isActive: boolean;
}

export default function StaffOverviewPage() {
  const { data: tickets, isLoading: ticketsLoading } = useQuery<StaffTicketRow[]>({
    queryKey: ['staff-tickets', 'all'],
    queryFn: () => staffApi.get<StaffTicketRow[]>('/staff/tickets'),
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery<StaffAccountRow[]>({
    queryKey: ['staff-accounts'],
    queryFn: () => staffApi.get<StaffAccountRow[]>('/staff/accounts'),
    // Support agents get a 403 here — that's fine, the card just stays blank for them.
    retry: false,
  });

  const openCount = tickets?.filter((t) => t.status === 'open').length;
  const pendingCount = tickets?.filter((t) => t.status === 'in_progress').length;
  const activeStaffCount = accounts?.filter((a) => a.isActive).length;

  const isLoading = ticketsLoading || accountsLoading;

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Overview</h1>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/staff/tickets"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-[#0DC56A]/30"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Open Tickets
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCount ?? 0}</p>
          </Link>

          <Link
            href="/staff/tickets"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-[#0DC56A]/30"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pending Tickets
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{pendingCount ?? 0}</p>
          </Link>

          {accounts !== undefined && (
            <Link
              href="/staff/team"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-[#0DC56A]/30"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Active Staff
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{activeStaffCount ?? 0}</p>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
