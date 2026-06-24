'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  TicketThread,
  type SupportTicketDetail,
  type SupportTicketMessage,
} from '@/components/support/TicketThread';

interface TicketDetailResponse {
  ticket: SupportTicketDetail;
  messages: SupportTicketMessage[];
}

export default function SupportTicketPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<TicketDetailResponse>({
    queryKey: ['support-ticket', ticketId],
    queryFn: () => api.get<TicketDetailResponse>(`/api/v1/support/tickets/${ticketId}`),
  });

  // Fetching the thread marks it read server-side — refresh the sidebar
  // badge so it decreases without waiting for its own polling interval.
  useEffect(() => {
    if (data) {
      queryClient.invalidateQueries({ queryKey: ['support-unread-count'] });
    }
  }, [data, queryClient]);

  async function handleSendMessage(message: string) {
    const newMessage = await api.post<SupportTicketMessage>(
      `/api/v1/support/tickets/${ticketId}/messages`,
      { message },
    );
    queryClient.setQueryData<TicketDetailResponse>(['support-ticket', ticketId], (prev) =>
      prev
        ? {
            ticket: { ...prev.ticket, status: prev.ticket.status === 'resolved' || prev.ticket.status === 'closed' ? 'open' : prev.ticket.status },
            messages: [...prev.messages, newMessage],
          }
        : prev,
    );
    queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
  }

  async function handleReopen() {
    await api.post(`/api/v1/support/tickets/${ticketId}/reopen`, {});
    queryClient.setQueryData<TicketDetailResponse>(['support-ticket', ticketId], (prev) =>
      prev ? { ...prev, ticket: { ...prev.ticket, status: 'open' } } : prev,
    );
    queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
  }

  return (
    <TicketThread
      isLoading={isLoading}
      ticket={data?.ticket}
      messages={data?.messages}
      viewerType="tenant"
      onSendMessage={handleSendMessage}
      onReopen={handleReopen}
      backHref="/support"
    />
  );
}
