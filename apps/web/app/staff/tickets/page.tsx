'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import {
  STATUS_BADGES,
  PRIORITY_BADGES,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from '@/components/support/TicketThread';

interface StaffTicketRow {
  id: string;
  businessName: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  lastMessageAt: string;
}

const TABS: Array<{ key: SupportTicketStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

export default function StaffTicketsPage() {
  const [tab, setTab] = useState<SupportTicketStatus | 'all'>('open');

  const { data: tickets, isLoading } = useQuery<StaffTicketRow[]>({
    queryKey: ['staff-tickets', tab],
    queryFn: () =>
      staffApi.get<StaffTicketRow[]>(
        tab === 'all' ? '/staff/tickets' : `/staff/tickets?status=${tab}`,
      ),
  });

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Support Tickets</h1>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-[#0F1E35] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : !tickets || tickets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No tickets here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {tickets.map((ticket, idx) => {
            const badge = STATUS_BADGES[ticket.status];
            const priorityBadge = PRIORITY_BADGES[ticket.priority];
            return (
              <Link
                key={ticket.id}
                href={`/staff/tickets/${ticket.id}`}
                className={`flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{ticket.businessName}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Last activity{' '}
                    {new Date(ticket.lastMessageAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                  {ticket.priority === 'high' && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadge.className}`}>
                      {priorityBadge.label}
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
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
