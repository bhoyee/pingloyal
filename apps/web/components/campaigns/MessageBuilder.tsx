'use client';
import { useCallback, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { Bold, Italic, Strikethrough, Code } from 'lucide-react';
import type { CampaignTemplate, TenantMe } from '@/lib/api';

const FORMATS = [
  { marker: '*', placeholder: 'bold text', label: 'Bold', Icon: Bold },
  { marker: '_', placeholder: 'italic text', label: 'Italic', Icon: Italic },
  { marker: '~', placeholder: 'strikethrough text', label: 'Strikethrough', Icon: Strikethrough },
  { marker: '```', placeholder: 'monospace text', label: 'Monospace', Icon: Code },
] as const;

const VARIABLES = [
  '{{firstName}}',
  '{{fullName}}',
  '{{points}}',
  '{{tier}}',
  '{{businessName}}',
  '{{rewardValue}}',
];

const PREVIEW_VALUES: Record<string, string> = {
  firstName: 'Sarah',
  fullName: 'Sarah Obi',
  points: '350',
  tier: 'VIP Member',
  businessName: 'Your Store',
  rewardValue: '₦1,000',
};

function substitutePreview(body: string, tenant: TenantMe | null): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key === 'businessName' && tenant) return tenant.businessName;
    if (key === 'rewardValue' && tenant)
      return `₦${tenant.rewardValue.toLocaleString()}`;
    return PREVIEW_VALUES[key] ?? match;
  });
}

interface Props {
  templates: CampaignTemplate[];
  templatesLoading: boolean;
  tenant: TenantMe | null;
}

export function MessageBuilder({ templates, templatesLoading, tenant }: Props) {
  const {
    register,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useFormContext();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageBody = watch('messageBody') as string ?? '';
  const charCount = messageBody.length;

  const charClass =
    charCount > 1000
      ? 'text-red-500'
      : charCount > 800
        ? 'text-amber-500'
        : 'text-slate-400';

  function loadTemplate(body: string) {
    setValue('messageBody', body);
  }

  function insertVariable(variable: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setValue('messageBody', messageBody + variable);
      return;
    }
    const start = textarea.selectionStart ?? messageBody.length;
    const end = textarea.selectionEnd ?? messageBody.length;
    const newValue = messageBody.slice(0, start) + variable + messageBody.slice(end);
    setValue('messageBody', newValue);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  }

  // Wrap the selected text in WhatsApp's markdown symbols (e.g. *bold*).
  // WhatsApp messages are plain text — there's no HTML formatting — so a
  // toolbar that inserts these symbols is the "rich text" equivalent for this
  // channel, and what gets sent still renders correctly on WhatsApp.
  function wrapSelection(marker: string, placeholder: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? messageBody.length;
    const end = textarea?.selectionEnd ?? messageBody.length;
    const selected = messageBody.slice(start, end) || placeholder;
    const newValue =
      messageBody.slice(0, start) + marker + selected + marker + messageBody.slice(end);
    setValue('messageBody', newValue);
    setTimeout(() => {
      if (!textarea) return;
      const selStart = start + marker.length;
      textarea.selectionStart = selStart;
      textarea.selectionEnd = selStart + selected.length;
      textarea.focus();
    }, 0);
  }

  // Render preview with unknown vars highlighted red
  function renderPreview(body: string): React.ReactNode {
    const parts = body.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, i) => {
      const match = /^\{\{(\w+)\}\}$/.exec(part);
      if (!match) return part;
      const key = match[1];
      const known = Object.keys(PREVIEW_VALUES).includes(key) || key === 'businessName' || key === 'rewardValue';
      if (known) {
        const val = key === 'businessName'
          ? (tenant?.businessName ?? PREVIEW_VALUES.businessName)
          : key === 'rewardValue'
            ? `₦${(tenant?.rewardValue ?? 1000).toLocaleString()}`
            : PREVIEW_VALUES[key];
        return <span key={i}>{val}</span>;
      }
      return (
        <span key={i} className="text-red-400" data-testid="unknown-variable">
          {part}
        </span>
      );
    });
  }

  const { ref: rhfRef, ...restRegister } = register('messageBody');

  // Stable merged ref — an inline arrow function here gets recreated on every
  // keystroke (since watch() re-renders this component), which makes React
  // detach/reattach the ref each time and caused RHF to snap the textarea's
  // value back, blocking typing.
  const setTextareaRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      rhfRef(el);
      textareaRef.current = el;
    },
    [rhfRef],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: editor */}
      <div className="space-y-4">
        {/* Template picker */}
        {templatesLoading ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Templates</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] min-w-[160px] animate-pulse rounded-xl border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
          </div>
        ) : templates.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Templates</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`template-card-${t.id}`}
                  onClick={() => loadTemplate(t.body)}
                  className="h-[72px] min-w-[160px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-green-500 hover:shadow-md"
                >
                  <p className="text-xs font-semibold text-slate-700">{t.name}</p>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                    {t.body.slice(0, 60)}...
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Textarea */}
        <div className="space-y-1">
          {/* Formatting toolbar — wraps the selection in WhatsApp's markdown
              symbols (*bold*, _italic_, ~strike~, ```mono```); WhatsApp
              messages are plain text, so this is the "rich text" equivalent
              for this channel and renders correctly once delivered. */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {FORMATS.map(({ marker, placeholder, label, Icon }) => (
              <button
                key={label}
                type="button"
                title={`${label} (wraps selection in ${marker})`}
                aria-label={label}
                onClick={() => wrapSelection(marker, placeholder)}
                className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="relative">
            <textarea
              {...restRegister}
              ref={setTextareaRef}
              rows={6}
              maxLength={1024}
              placeholder="Type your message here or choose a template above"
              data-testid="message-textarea"
              className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]"
            />
            <span
              className={`absolute bottom-2 right-3 text-xs ${charClass}`}
              data-testid="char-counter"
            >
              {charCount}/1024
            </span>
          </div>
          {errors.messageBody && (
            <p className="text-xs text-red-500">
              {String(errors.messageBody.message)}
            </p>
          )}
        </div>

        {/* Variable chips */}
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Insert variable:</p>
          <div className="flex flex-wrap gap-2">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                data-testid={`variable-chip-${v}`}
                onClick={() => insertVariable(v)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-mono text-slate-700 hover:border-[#0F1E35] hover:bg-slate-50"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: preview */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Preview</p>
        <div className="rounded-xl bg-slate-100 p-4">
          <div
            className="max-w-xs rounded-xl rounded-tl-none bg-[#1a5c3e] px-4 py-3 text-sm text-white"
            data-testid="message-preview"
          >
            {messageBody ? (
              <span className="whitespace-pre-wrap">{renderPreview(messageBody)}</span>
            ) : (
              <span className="italic text-white/60">Your message will appear here</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
