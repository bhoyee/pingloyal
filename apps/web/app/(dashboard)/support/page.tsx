'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion, PlusCircle, Check, Paperclip, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { RichTextEditor } from '@/components/support/RichTextEditor';
import {
  STATUS_BADGES,
  PRIORITY_BADGES,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from '@/components/support/TicketThread';

interface SupportTicket {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  lastMessageAt: string;
  createdAt: string;
}

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '2348000000000';

function plainTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, '').trim().length;
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function NewTicketForm({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<SupportTicketPriority>('low');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(picked.type)) {
      setError('Only JPEG, PNG, WebP, GIF images or PDF files are allowed');
      e.target.value = '';
      return;
    }
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment must be under 5 MB');
      e.target.value = '';
      return;
    }
    setError('');
    setFile(picked);
  }

  function removeFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const ticket = file
        ? await api.upload<SupportTicket>('/api/v1/support/tickets', file, {
            subject: subject.trim(),
            message,
            priority,
          })
        : await api.post<SupportTicket>('/api/v1/support/tickets', {
            subject: subject.trim(),
            message,
            priority,
          });
      onCreated(ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder="e.g. Cannot send a campaign"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
          />
        </div>
        <div className="sm:w-44">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
          >
            <option value="low">Low priority</option>
            <option value="high">High priority</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          What's going on? <span className="text-red-500">*</span>
        </label>
        <RichTextEditor
          value={message}
          onChange={setMessage}
          placeholder="Describe what happened, what you expected, and any error messages you saw."
        />
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleFileChange}
          className="hidden"
          id="ticket-attachment"
        />
        {file ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-slate-700">{file.name}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatFileSize(file.size)}</span>
            <button
              type="button"
              onClick={removeFile}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="ticket-attachment"
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Attach a file
          </label>
        )}
        <p className="mt-1 text-xs text-slate-400">JPEG, PNG, WebP, GIF or PDF, up to 5 MB</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || subject.trim().length < 3 || plainTextLength(message) < 10}
          className="flex items-center gap-1.5 rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3050] disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : (<><Check className="h-3.5 w-3.5" />Open ticket</>)}
        </button>
      </div>
    </form>
  );
}

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: tickets, isLoading } = useQuery<SupportTicket[]>({
    queryKey: ['support-tickets'],
    queryFn: () => api.get<SupportTicket[]>('/api/v1/support/tickets'),
  });

  function handleCreated(ticket: SupportTicket) {
    queryClient.setQueryData<SupportTicket[]>(['support-tickets'], (prev) => [ticket, ...(prev ?? [])]);
    setShowForm(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-6">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Help &amp; Support</h1>
        <p className="mt-1 text-sm text-slate-500">
          Open a ticket and our team will get back to you, or chat with us directly on WhatsApp.
        </p>
      </div>

      <div className="space-y-6 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#0F1E35]/30 hover:shadow-md"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F1E35]/10 text-[#0F1E35]">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Open a ticket</p>
              <p className="mt-0.5 text-sm text-slate-500">Describe your issue, we'll follow up by email</p>
            </div>
          </button>

          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <MessageCircleQuestion className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Chat on WhatsApp</p>
              <p className="mt-0.5 text-sm text-slate-500">Talk to us in real time</p>
            </div>
          </a>
        </div>

        {showForm && (
          <NewTicketForm onClose={() => setShowForm(false)} onCreated={handleCreated} />
        )}

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">My Tickets</h2>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-7 w-7" />
            </div>
          ) : !tickets || tickets.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
              No tickets yet. Open one above if you need help.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {tickets.map((ticket, idx) => {
                const badge = STATUS_BADGES[ticket.status];
                const priorityBadge = PRIORITY_BADGES[ticket.priority];
                return (
                  <Link
                    key={ticket.id}
                    href={`/support/${ticket.id}`}
                    className={`flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{ticket.subject}</p>
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
        </section>
      </div>
    </div>
  );
}
