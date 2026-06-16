'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Gauge,
  Gift,
  Cake,
  UserX,
  ShoppingCart,
  Megaphone,
  Pencil,
  RotateCcw,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  PlusCircle,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TemplateRequest {
  id: string;
  name: string;
  useCase: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
}

interface TemplateEntry {
  triggerType: string;
  label: string;
  defaultBody: string;
  customBody: string | null;
  activeBody: string;
  isCustom: boolean;
  variables: string[];
  updatedAt: string | null;
}

interface CampaignTemplate {
  id: string;
  name: string;
  body: string;
}

// ── Trigger metadata ───────────────────────────────────────────────────────────

const TRIGGER_META: Record<string, { icon: LucideIcon; color: string }> = {
  welcome: { icon: Sparkles, color: 'bg-emerald-100 text-emerald-700' },
  purchase_confirmation: { icon: ShoppingCart, color: 'bg-blue-100 text-blue-700' },
  threshold_nudge: { icon: Gauge, color: 'bg-amber-100 text-amber-700' },
  reward_unlocked: { icon: Gift, color: 'bg-purple-100 text-purple-700' },
  birthday: { icon: Cake, color: 'bg-pink-100 text-pink-700' },
  lapsed_winback: { icon: UserX, color: 'bg-slate-100 text-slate-600' },
};

// ── Small helpers ──────────────────────────────────────────────────────────────

function VariableChip({ name, onInsert }: { name: string; onInsert: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(`{{${name}}}`)}
      className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-mono text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
    >
      {`{{${name}}}`}
    </button>
  );
}

// ── Editable trigger template card ────────────────────────────────────────────

function TriggerTemplateCard({
  entry,
  onSave,
  onReset,
}: {
  entry: TemplateEntry;
  onSave: (triggerType: string, body: string) => Promise<void>;
  onReset: (triggerType: string) => Promise<void>;
}) {
  const meta = TRIGGER_META[entry.triggerType];
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.activeBody);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const Icon = meta?.icon ?? Sparkles;
  const iconColor = meta?.color ?? 'bg-slate-100 text-slate-600';

  function startEdit() {
    setDraft(entry.activeBody);
    setEditing(true);
    setExpanded(true);
  }

  function cancelEdit() {
    setDraft(entry.activeBody);
    setEditing(false);
  }

  function insertVar(token: string) {
    const el = textareaRef.current;
    if (!el) { setDraft((d) => d + token); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setDraft(draft.slice(0, start) + token + draft.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSave() {
    if (draft.trim().length < 10) return;
    setSaving(true);
    try {
      await onSave(entry.triggerType, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await onReset(entry.triggerType);
      setEditing(false);
      setDraft(entry.defaultBody);
    } finally {
      setResetting(false);
    }
  }

  const charOver = draft.length > 1024;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{entry.label}</h3>
                {entry.isCustom && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    Custom
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {entry.variables.length} variable{entry.variables.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Insert variable:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.variables.map((v) => (
                      <VariableChip key={v} name={v} onInsert={insertVar} />
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={6}
                    className={`w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-sm leading-relaxed text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/30 ${
                      charOver ? 'border-red-300 focus:border-red-400' : 'border-slate-300 focus:border-[#0F1E35]'
                    }`}
                    placeholder="Type your WhatsApp message here…"
                  />
                  <div className={`mt-1 text-right text-xs ${charOver ? 'text-red-500' : 'text-slate-400'}`}>
                    {draft.length} / 1024
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {entry.isCustom && (
                    <button
                      type="button"
                      onClick={() => void handleReset()}
                      disabled={resetting}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {resetting ? 'Resetting…' : 'Reset to default'}
                    </button>
                  )}
                  <div className="flex items-center justify-end gap-2 sm:ml-auto">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving || charOver || draft.trim().length < 10}
                      className="flex items-center gap-1.5 rounded-lg bg-[#0F1E35] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1a3050] disabled:opacity-50 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {saving ? 'Saving…' : 'Save template'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                  {entry.activeBody}
                </p>
                {entry.isCustom && entry.updatedAt && (
                  <p className="mt-2 text-xs text-slate-400">
                    Last updated{' '}
                    {new Date(entry.updatedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                )}
                {!entry.isCustom && (
                  <p className="mt-2 text-xs text-slate-400">Default template — click Edit to customise</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Read-only campaign template card ──────────────────────────────────────────

function CampaignTemplateCard({ template }: { template: CampaignTemplate }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(template.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Megaphone className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-slate-900">{template.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Starter template — copy and paste into a campaign
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4">
            <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
              {template.body}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Copy this text, then paste it when creating a new campaign message.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Request New Template modal ────────────────────────────────────────────────

function RequestTemplateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (req: TemplateRequest) => void;
}) {
  const [name, setName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const created = await api.post<TemplateRequest>('/api/v1/template-requests', {
        name: name.trim(),
        useCase: useCase.trim(),
      });
      onSuccess(created);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-[#0F1E35]" />
            <h2 className="text-base font-semibold text-slate-900">Request New Template</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-semibold text-slate-900">Request submitted!</p>
            <p className="text-sm text-slate-500">
              Our team has been notified and will review your request. You can track its status in the <strong>My Requests</strong> section below.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3050]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Template name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Ramadan Special, Product Launch…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Describe the use case <span className="text-red-500">*</span>
              </label>
              <textarea
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                required
                rows={4}
                placeholder="What is this template for? Who receives it, and when? Any specific wording or tone you want?"
                className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F1E35] focus:outline-none focus:ring-1 focus:ring-[#0F1E35]"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <p className="text-xs text-slate-400">
              Your request is saved and our team is notified immediately. We usually respond within 2–3 business days.
            </p>

            <div className="flex items-center justify-end gap-3 pt-1">
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
                disabled={submitting || !name.trim() || !useCase.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-[#0F1E35] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3050] disabled:opacity-50"
              >
                {submitting ? (
                  'Submitting…'
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const { data: myRequests } = useQuery<TemplateRequest[]>({
    queryKey: ['template-requests'],
    queryFn: () => api.get<TemplateRequest[]>('/api/v1/template-requests'),
    retry: 1,
  });

  function handleRequestCreated(req: TemplateRequest) {
    queryClient.setQueryData<TemplateRequest[]>(['template-requests'], (prev) =>
      [req, ...(prev ?? [])],
    );
  }

  const { data: triggerTemplates, isLoading: loadingTriggers, error: triggerError } =
    useQuery<TemplateEntry[]>({
      queryKey: ['wa-templates'],
      queryFn: () => api.get<TemplateEntry[]>('/api/v1/wa-templates'),
      retry: 1,
    });

  const { data: campaignTemplates, isLoading: loadingCampaigns } =
    useQuery<CampaignTemplate[]>({
      queryKey: ['campaign-templates'],
      queryFn: () => api.get<CampaignTemplate[]>('/api/v1/templates'),
      retry: 1,
    });

  async function handleSave(triggerType: string, body: string) {
    setErrorMsg(null);
    try {
      const updated = await api.patch<TemplateEntry>(
        `/api/v1/wa-templates/${triggerType}`,
        { body },
      );
      queryClient.setQueryData<TemplateEntry[]>(['wa-templates'], (prev) =>
        prev?.map((t) => (t.triggerType === triggerType ? updated : t)),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save template.');
      throw err;
    }
  }

  async function handleReset(triggerType: string) {
    setErrorMsg(null);
    try {
      const updated = await api.delete<TemplateEntry>(
        `/api/v1/wa-templates/${triggerType}`,
      );
      queryClient.setQueryData<TemplateEntry[]>(['wa-templates'], (prev) =>
        prev?.map((t) => (t.triggerType === triggerType ? updated : t)),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reset template.');
      throw err;
    }
  }

  const customCount = triggerTemplates?.filter((t) => t.isCustom).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-6">
      {/* Page header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Message Templates</h1>
        {!loadingTriggers && triggerTemplates && (
          <p className="mt-1 text-sm text-slate-500">
            {customCount > 0
              ? `${customCount} custom trigger template${customCount !== 1 ? 's' : ''} · ${campaignTemplates?.length ?? 0} campaign starters`
              : `Default trigger templates · ${campaignTemplates?.length ?? 0} campaign starters`}
          </p>
        )}
      </div>

      <div className="space-y-8 px-4 py-6 sm:px-6">

        {/* ── Automation Trigger Templates ── */}
        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-slate-900">Automation Trigger Templates</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Sent automatically based on customer activity. Edit to match your brand voice — variables like{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-xs">{'{{firstName}}'}</code> are filled in at send time.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {loadingTriggers ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-7 w-7" />
            </div>
          ) : triggerError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              <p className="font-medium">Could not load trigger templates</p>
              <p className="mt-1 text-red-600">
                {triggerError instanceof Error
                  ? triggerError.message
                  : 'An unexpected error occurred. Please refresh the page.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {triggerTemplates?.map((entry) => (
                <TriggerTemplateCard
                  key={entry.triggerType}
                  entry={entry}
                  onSave={handleSave}
                  onReset={handleReset}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Campaign Templates ── */}
        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">Campaign Templates</h2>
                {campaignTemplates && (
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                    {campaignTemplates.length} available
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                Ready-made message starters for broadcast campaigns. Copy a template and paste it when composing a new campaign.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRequestModal(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#0F1E35] bg-white px-3 py-2 text-sm font-medium text-[#0F1E35] hover:bg-[#0F1E35] hover:text-white transition-colors sm:w-auto sm:py-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Request New Template
            </button>
          </div>

          {loadingCampaigns ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-7 w-7" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {campaignTemplates?.map((t) => (
                <CampaignTemplateCard key={t.id} template={t} />
              ))}
            </div>
          )}
        </section>

        {/* ── My Template Requests ── */}
        {myRequests && myRequests.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-900">My Template Requests</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Track the status of templates you've requested from the PingLoyal team.
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {myRequests.map((req, idx) => {
                const statusStyle =
                  req.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : req.status === 'in_progress'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-600';
                const statusLabel =
                  req.status === 'completed'
                    ? 'Completed'
                    : req.status === 'in_progress'
                    ? 'In Progress'
                    : 'Pending';
                return (
                  <div
                    key={req.id}
                    className={`flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{req.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{req.useCase}</p>
                        <p className="mt-1 text-xs font-medium text-indigo-500">
                          Submitted{' '}
                          {new Date(req.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <span className={`self-start shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium sm:mt-0.5 ${statusStyle}`}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {showRequestModal && (
        <RequestTemplateModal
          onClose={() => setShowRequestModal(false)}
          onSuccess={(req) => {
            handleRequestCreated(req);
            setShowRequestModal(false);
          }}
        />
      )}
    </div>
  );
}
