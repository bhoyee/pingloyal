'use client';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/lib/api';
import {
  TicketThread,
  type SupportTicketDetail,
  type SupportTicketMessage,
  type SupportTicketStatus,
} from '@/components/support/TicketThread';

interface TicketDetailResponse {
  ticket: SupportTicketDetail;
  messages: SupportTicketMessage[];
}

const STATUS_OPTIONS: SupportTicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export default function StaffTicketPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<TicketDetailResponse>({
    queryKey: ['staff-ticket', ticketId],
    queryFn: () => staffApi.get<TicketDetailResponse>(`/staff/tickets/${ticketId}`),
  });

  async function handleSendMessage(message: string) {
    const newMessage = await staffApi.post<SupportTicketMessage>(
      `/staff/tickets/${ticketId}/messages`,
      { message },
    );
    queryClient.setQueryData<TicketDetailResponse>(['staff-ticket', ticketId], (prev) =>
      prev ? { ticket: prev.ticket, messages: [...prev.messages, newMessage] } : prev,
    );
  }

  async function handleStatusChange(status: SupportTicketStatus) {
    const updated = await staffApi.patch<SupportTicketDetail>(
      `/staff/tickets/${ticketId}/status`,
      { status },
    );
    queryClient.setQueryData<TicketDetailResponse>(['staff-ticket', ticketId], (prev) =>
      prev ? { ticket: updated, messages: prev.messages } : prev,
    );
  }

  return (
    <TicketThread
      isLoading={isLoading}
      ticket={data?.ticket}
      messages={data?.messages}
      viewerType="staff"
      onSendMessage={handleSendMessage}
      backHref="/staff/tickets"
      headerExtra={
        data?.ticket && (
          <select
            value={data.ticket.status}
            onChange={(e) => void handleStatusChange(e.target.value as SupportTicketStatus)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 focus:border-[#0F1E35] focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        )
      }
    />
  );
}
