'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, FileText } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { RichTextEditor } from './RichTextEditor';

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketPriority = 'high' | 'low';

export interface SupportTicketMessage {
  id: string;
  authorType: 'tenant' | 'staff';
  authorName: string;
  body: string;
  createdAt: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
}

export interface SupportTicketDetail {
  id: string;
  subject: string;
  businessName: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
}

// open = needs attention (red), in_progress = being worked (amber/warning),
// resolved/closed = done (green) — matches the traffic-light convention
// requested for the support inbox.
export const STATUS_BADGES: Record<SupportTicketStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-red-100 text-red-700' },
  in_progress: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  resolved: { label: 'Resolved', className: 'bg-emerald-100 text-emerald-700' },
  closed: { label: 'Closed', className: 'bg-emerald-100 text-emerald-700' },
};

export const PRIORITY_BADGES: Record<SupportTicketPriority, { label: string; className: string }> = {
  high: { label: 'High priority', className: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200' },
  low: { label: 'Low priority', className: 'bg-slate-100 text-slate-500' },
};

function isHtmlEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length < 1;
}

interface TicketThreadProps {
  isLoading: boolean;
  ticket: SupportTicketDetail | undefined;
  messages: SupportTicketMessage[] | undefined;
  /** Which side of the conversation the current viewer is — their own
   * messages render right-aligned/dark, the other party's left-aligned. */
  viewerType: 'tenant' | 'staff';
  onSendMessage: (message: string) => Promise<void>;
  /** Rendered next to the status badge — e.g. the staff-only status `<select>`. */
  headerExtra?: ReactNode;
  backHref: string;
  /** Tenant-only "Reopen ticket" button — omit on the staff side, which
   * already has a status `<select>` for this. */
  onReopen?: () => Promise<void>;
}

export function TicketThread({
  isLoading,
  ticket,
  messages,
  viewerType,
  onSendMessage,
  headerExtra,
  backHref,
  onReopen,
}: TicketThreadProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reopening, setReopening] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (isHtmlEmpty(draft)) return;
    setError('');
    setSending(true);
    try {
      await onSendMessage(draft);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  async function handleReopen() {
    if (!onReopen) return;
    setError('');
    setReopening(true);
    try {
      await onReopen();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen ticket.');
    } finally {
      setReopening(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6">
        Ticket not found.
      </div>
    );
  }

  const badge = STATUS_BADGES[ticket.status];
  const priorityBadge = PRIORITY_BADGES[ticket.priority];
  const isClosed = ticket.status === 'closed';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to tickets
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900">{ticket.subject}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{ticket.businessName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityBadge.className}`}>
              {priorityBadge.label}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {headerExtra}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-4 py-6 sm:px-6">
        {messages?.map((msg) => {
          const isOwn = msg.authorType === viewerType;
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%] ${
                  isOwn
                    ? 'bg-[#0F1E35] text-white'
                    : 'border border-slate-200 bg-white text-slate-800'
                }`}
              >
                <p className={`mb-1 text-xs font-semibold ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>
                  {msg.authorName}
                </p>
                {/* msg.body is sanitized server-side (allowlisted tags only)
                    before storage — safe to render as HTML here. */}
                <div
                  className="prose-sm max-w-none leading-relaxed [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: msg.body }}
                />
                {msg.attachmentUrl && (
                  <a
                    href={msg.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block"
                  >
                    {msg.attachmentMimeType?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={msg.attachmentUrl}
                        alt={msg.attachmentName ?? 'Attachment'}
                        className="max-h-48 rounded-lg border border-black/10 object-cover"
                      />
                    ) : (
                      <span
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                          isOwn
                            ? 'border-white/20 text-white/90 hover:bg-white/10'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{msg.attachmentName ?? 'Attachment'}</span>
                      </span>
                    )}
                  </a>
                )}
                <p className={`mt-1.5 text-[11px] ${isOwn ? 'text-white/50' : 'text-slate-400'}`}>
                  {new Date(msg.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {isClosed ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-500">This ticket is closed.</p>
            {onReopen && (
              <button
                type="button"
                onClick={() => void handleReopen()}
                disabled={reopening}
                className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#0F1E35] px-4 text-sm font-medium text-white hover:bg-[#1a3050] disabled:opacity-50"
              >
                {reopening ? 'Reopening…' : 'Reopen ticket'}
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => void handleSend(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <RichTextEditor value={draft} onChange={setDraft} placeholder="Type your reply…" />
            </div>
            <button
              type="submit"
              disabled={sending || isHtmlEmpty(draft)}
              className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#0F1E35] px-4 text-sm font-medium text-white hover:bg-[#1a3050] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
