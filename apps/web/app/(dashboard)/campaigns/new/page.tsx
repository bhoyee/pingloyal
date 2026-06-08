'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addMinutes, isAfter } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { api, type TenantMe, type CampaignTemplate, type AudiencePreview } from '@/lib/api';
import { AudienceBuilder } from '@/components/campaigns/AudienceBuilder';
import { MessageBuilder } from '@/components/campaigns/MessageBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';

const schema = z.object({
  name: z.string().min(2, 'Campaign name required').max(255),
  messageBody: z.string().min(10, 'Message too short').max(1024, 'Message too long'),
  audienceMode: z.string().optional(),
  useCategoryFilter: z.boolean().optional(),
  useMinPoints: z.boolean().optional(),
  segmentRules: z.object({
    tierIds: z.array(z.string()).optional(),
    categoryIds: z.array(z.string()).optional(),
    minPoints: z.number().min(0).optional(),
    activityStatus: z.enum(['all', 'active', 'inactive']).optional(),
  }).optional(),
  scheduledAt: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string; action?: { label: string; href: string } } | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      messageBody: '',
      audienceMode: 'all',
      useCategoryFilter: false,
      useMinPoints: false,
      segmentRules: { activityStatus: 'all' },
    },
  });

  const { handleSubmit, watch, register, formState: { errors } } = methods;

  const segmentRules = watch('segmentRules');
  const audienceMode = watch('audienceMode');
  const useCategoryFilter = watch('useCategoryFilter');
  const useMinPoints = watch('useMinPoints');

  // Build segment rules for API from form state
  const rules = segmentRules ?? {};
  const effectiveSegmentRules = {
    ...(audienceMode === 'tiers' && rules.tierIds?.length ? { tierIds: rules.tierIds } : {}),
    ...(useCategoryFilter && rules.categoryIds?.length ? { categoryIds: rules.categoryIds } : {}),
    ...(useMinPoints && rules.minPoints ? { minPoints: rules.minPoints } : {}),
    activityStatus: rules.activityStatus ?? 'all',
  };

  // Debounce on a stringified key so the timer only resets when the rules
  // actually change — using the object directly resets it on every render
  // (a fresh object is built each time), which kept the audience preview
  // reloading and its loading-skeleton swap was shifting the layout below it.
  const rulesKey = JSON.stringify(effectiveSegmentRules);
  const debouncedRulesKey = useDebounce(rulesKey, 1000);
  const debouncedRules = useMemo(
    () => JSON.parse(debouncedRulesKey) as typeof effectiveSegmentRules,
    [debouncedRulesKey],
  );

  // Load tenant + templates on mount
  useEffect(() => {
    void api.get<TenantMe>('/api/v1/tenants/me').then(setTenant).catch(() => null);
    void api
      .get<CampaignTemplate[]>('/api/v1/templates')
      .then(setTemplates)
      .catch(() => null)
      .finally(() => setTemplatesLoading(false));
  }, []);

  // Refresh audience preview when segment rules change (debounced)
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedRules.tierIds?.length) {
      debouncedRules.tierIds.forEach((id) => params.append('tierIds[]', id));
    }
    if (debouncedRules.categoryIds?.length) {
      debouncedRules.categoryIds.forEach((id) => params.append('categoryIds[]', id));
    }
    if (debouncedRules.minPoints != null) {
      params.set('minPoints', String(debouncedRules.minPoints));
    }
    if (debouncedRules.activityStatus && debouncedRules.activityStatus !== 'all') {
      params.set('activityStatus', debouncedRules.activityStatus);
    }

    setPreviewLoading(true);
    void api
      .get<AudiencePreview>(`/api/v1/campaigns/audience-preview?${params.toString()}`)
      .then(setAudiencePreview)
      .catch(() => null)
      .finally(() => setPreviewLoading(false));
  }, [debouncedRules]);

  const audienceCount = audiencePreview?.count ?? null;
  const canSend =
    audienceCount != null && audienceCount > 0;

  async function createAndSend() {
    setSending(true);
    try {
      const values = methods.getValues();
      const campaign = await api.post<{ id: string }>('/api/v1/campaigns', {
        name: values.name,
        messageBody: values.messageBody,
        segmentRules: effectiveSegmentRules,
      });
      const result = await api.post<{ totalRecipients: number }>(`/api/v1/campaigns/${campaign.id}/send`, {});
      setToast(`Campaign is sending to ${result.totalRecipients.toLocaleString()} customers!`);
      setTimeout(() => router.push(`/campaigns/${campaign.id}`), 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message.toLowerCase().includes('wallet')) {
          setErrorModal({
            title: 'Wallet is empty',
            message: 'Top up your marketing wallet to send this campaign.',
            action: { label: 'Top Up Wallet', href: '/billing/wallet/topup' },
          });
        } else if (err.message.toLowerCase().includes('whatsapp')) {
          setErrorModal({
            title: 'Connect WhatsApp first',
            message: err.message,
            action: { label: 'Connect WhatsApp', href: '/settings#whatsapp' },
          });
        } else {
          setToast(`Error: ${err.message}`);
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function createAndSchedule() {
    const values = methods.getValues();
    if (!values.scheduledAt) return;

    const schedDate = new Date(values.scheduledAt);
    if (!isAfter(schedDate, addMinutes(new Date(), 5))) {
      methods.setError('scheduledAt', { message: 'Must be at least 5 minutes in the future' });
      return;
    }

    setScheduling(true);
    try {
      const campaign = await api.post<{ id: string }>('/api/v1/campaigns', {
        name: values.name,
        messageBody: values.messageBody,
        segmentRules: effectiveSegmentRules,
      });
      await api.post(`/api/v1/campaigns/${campaign.id}/schedule`, {
        scheduledAt: new Date(values.scheduledAt).toISOString(),
      });
      setToast(`Campaign scheduled for ${format(schedDate, 'dd MMM yyyy, HH:mm')}`);
      setTimeout(() => router.push('/campaigns'), 1500);
    } catch (err) {
      if (err instanceof ApiError) setToast(`Error: ${err.message}`);
    } finally {
      setScheduling(false);
    }
  }

  const minDateTime = format(addMinutes(new Date(), 10), "yyyy-MM-dd'T'HH:mm");
  const scheduledAt = watch('scheduledAt');
  const scheduleIsValid =
    !!scheduledAt && isAfter(new Date(scheduledAt), addMinutes(new Date(), 5));

  return (
    <FormProvider {...methods}>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/campaigns')}
                aria-label="Back to campaigns"
                title="Back to campaigns"
                className="-ml-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </button>
              <h1 className="text-xl font-bold text-slate-900">New Campaign</h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
          {/* Campaign name */}
          <div className="space-y-1">
            <Label htmlFor="name">Campaign Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g. Weekend Promo"
              data-testid="campaign-name-input"
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Section 1: Audience */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-bold text-slate-900">1. Audience</h2>
            <AudienceBuilder
              tenant={tenant}
              audienceCount={audienceCount}
              sampleNames={audiencePreview?.sampleNames ?? []}
              previewLoading={previewLoading}
            />
          </section>

          {/* Section 2: Message */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-bold text-slate-900">2. Message</h2>
            <MessageBuilder templates={templates} templatesLoading={templatesLoading} tenant={tenant} />
          </section>

          {/* Section 3: Schedule & Send */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-6 text-base font-bold text-slate-900">3. Schedule & Send</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Send Now */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-1 text-2xl">⚡</div>
                <h3 className="font-semibold text-slate-900">Send Now</h3>
                <p className="mb-4 mt-1 text-sm text-slate-500">
                  Send immediately to all matching customers
                </p>
                <Button
                  variant="primary"
                  className="w-full bg-green-600 hover:bg-green-700"
                  loading={sending}
                  disabled={!canSend || sending}
                  data-testid="send-now-button"
                  onClick={handleSubmit(createAndSend)}
                >
                  Send Now →
                </Button>
              </div>

              {/* Schedule */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-1 text-2xl">📅</div>
                <h3 className="font-semibold text-slate-900">Schedule for Later</h3>
                <p className="mb-3 mt-1 text-sm text-slate-500">
                  Choose a date and time to send automatically
                </p>
                <input
                  type="datetime-local"
                  min={minDateTime}
                  {...register('scheduledAt')}
                  data-testid="schedule-datetime-input"
                  className="mb-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]"
                />
                {errors.scheduledAt && (
                  <p className="mb-2 text-xs text-red-500">
                    {errors.scheduledAt.message}
                  </p>
                )}
                {tenant?.timezone && (
                  <p className="mb-3 text-xs text-slate-400">
                    Time shown in {tenant.timezone} timezone
                  </p>
                )}
                <Button
                  variant="primary"
                  className="w-full"
                  loading={scheduling}
                  disabled={!canSend || !scheduleIsValid || scheduling}
                  data-testid="schedule-button"
                  onClick={handleSubmit(createAndSchedule)}
                >
                  Schedule Campaign →
                </Button>
              </div>
            </div>
          </section>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            className="fixed bottom-4 left-4 right-4 mx-auto max-w-sm rounded-xl bg-gray-800 px-4 py-3 text-center text-sm text-white shadow-lg"
          >
            {toast}
          </div>
        )}

        {/* Error modal */}
        {errorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-bold text-slate-900">{errorModal.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{errorModal.message}</p>
              <div className="mt-4 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setErrorModal(null)}>
                  Cancel
                </Button>
                {errorModal.action && (
                  <Button
                    className="flex-1"
                    onClick={() => window.open(errorModal.action!.href, '_blank')}
                  >
                    {errorModal.action.label}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </FormProvider>
  );
}
