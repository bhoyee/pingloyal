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
  Pencil,
  RotateCcw,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

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

const TRIGGER_META: Record<string, { icon: LucideIcon; color: string }> = {
  welcome: { icon: Sparkles, color: 'bg-emerald-100 text-emerald-700' },
  purchase_confirmation: { icon: ShoppingCart, color: 'bg-blue-100 text-blue-700' },
  threshold_nudge: { icon: Gauge, color: 'bg-amber-100 text-amber-700' },
  reward_unlocked: { icon: Gift, color: 'bg-purple-100 text-purple-700' },
  birthday: { icon: Cake, color: 'bg-pink-100 text-pink-700' },
  lapsed_winback: { icon: UserX, color: 'bg-slate-100 text-slate-600' },
};

function VariableChip({
  name,
  onInsert,
}: {
  name: string;
  onInsert: (v: string) => void;
}) {
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

function TemplateCard({
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
    if (!el) {
      setDraft((d) => d + token);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = draft.slice(0, start) + token + draft.slice(end);
    setDraft(next);
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

  const charCount = draft.length;
  const charOver = charCount > 1024;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
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
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Body preview / editor */}
        {expanded && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4">
            {editing ? (
              <div className="space-y-3">
                {/* Variable chips */}
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Insert variable:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.variables.map((v) => (
                      <VariableChip key={v} name={v} onInsert={insertVar} />
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <div>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={6}
                    className={`w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-sm leading-relaxed text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]/30 ${
                      charOver
                        ? 'border-red-300 focus:border-red-400'
                        : 'border-slate-300 focus:border-[#0F1E35]'
                    }`}
                    placeholder="Type your WhatsApp message here…"
                  />
                  <div className={`mt-1 text-right text-xs ${charOver ? 'text-red-500' : 'text-slate-400'}`}>
                    {charCount} / 1024
                  </div>
                </div>

                {/* Action row */}
                <div className="flex items-center justify-between gap-3">
                  {entry.isCustom ? (
                    <button
                      type="button"
                      onClick={() => void handleReset()}
                      disabled={resetting}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {resetting ? 'Resetting…' : 'Reset to default'}
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
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
                    Last updated {new Date(entry.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<TemplateEntry[]>({
    queryKey: ['wa-templates'],
    queryFn: () => api.get<TemplateEntry[]>('/api/v1/wa-templates'),
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

  const customCount = templates?.filter((t) => t.isCustom).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Message Templates</h1>
        {!isLoading && templates && (
          <p className="mt-1 text-sm text-slate-500">
            {customCount > 0
              ? `${customCount} custom template${customCount !== 1 ? 's' : ''} — rest using defaults`
              : 'Using default templates for all triggers'}
          </p>
        )}
      </div>

      <div className="space-y-6 px-4 py-6 sm:px-6">
        {/* Info banner */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">Customise what gets sent</p>
          <p className="mt-0.5 text-blue-700">
            Each trigger uses a WhatsApp template with dynamic variables like{' '}
            <code className="rounded bg-blue-100 px-1 font-mono text-xs">{'{{firstName}}'}</code>.
            Changes take effect immediately on the next send.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="space-y-4">
            {templates?.map((entry) => (
              <TemplateCard
                key={entry.triggerType}
                entry={entry}
                onSave={handleSave}
                onReset={handleReset}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Powered by{' '}
        <a
          href="https://salisu.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-500 hover:underline"
        >
          Bhoyee salisu.dev
        </a>
      </footer>
    </div>
  );
}
