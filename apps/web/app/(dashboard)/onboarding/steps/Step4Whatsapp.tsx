'use client';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { StepCard } from '@/components/onboarding/StepCard';
import { StepNavigation } from '@/components/onboarding/StepNavigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { AlertCircle, Info } from 'lucide-react';

const COUNTRY_CODES = [
  { code: '+234', country: 'NG' },
  { code: '+44', country: 'GB' },
  { code: '+1', country: 'US' },
  { code: '+27', country: 'ZA' },
  { code: '+233', country: 'GH' },
  { code: '+254', country: 'KE' },
];

const WA_CATEGORIES = [
  'Grocery & Supermarkets',
  'Pharmacy & Health',
  'Fashion & Clothing',
  'Electronics',
  'Cosmetics & Beauty',
  'Baby Products',
  'Restaurant & Food',
  'General Retail',
  'Other',
];

const HOW_IT_WORKS = [
  'You fill in your business details below',
  'We send a verification message to your WhatsApp number',
  'Reply YES on WhatsApp — takes 30 seconds',
];

const schema = z.object({
  countryCode: z.string().min(1),
  localNumber: z
    .string()
    .min(7, 'Enter a valid phone number')
    .regex(/^\d+$/, 'Digits only'),
  displayName: z.string().min(3).max(100),
  category: z.string().min(1, 'Select a category'),
  description: z.string().min(10).max(256),
  website: z
    .string()
    .url('Enter a valid URL')
    .optional()
    .or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

interface Step4WhatsappProps {
  businessName?: string;
  onComplete: (phoneNumber: string) => void;
  onBack: () => void;
  onSkip: () => void;
}

export function Step4Whatsapp({
  businessName = '',
  onComplete,
  onBack,
  onSkip,
}: Step4WhatsappProps) {
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      countryCode: '+234',
      localNumber: '',
      displayName: businessName,
      category: '',
      description: '',
      website: '',
    },
  });

  const description = watch('description') ?? '';
  const countryCode = watch('countryCode') ?? '+234';
  const localNumber = watch('localNumber') ?? '';

  async function onSubmit(data: FormValues) {
    setApiError('');
    const phoneNumber = `${data.countryCode}${data.localNumber.replace(/^0/, '')}`;
    try {
      await api.post('/whatsapp/onboarding/initiate', {
        phoneNumber,
        displayName: data.displayName,
        category: data.category,
        description: data.description,
        website: data.website || undefined,
      });
      onComplete(phoneNumber);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <StepCard
      title="Connect your WhatsApp Business number"
      subtitle="Fill in your details and we'll handle the rest. Your customers will receive messages from your business WhatsApp number."
    >
      {/* How it works strip */}
      <div className="rounded-xl bg-[#0F1E35] text-white p-4 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
          How it works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="h-5 w-5 rounded-full bg-white/20 text-white text-xs flex items-center justify-center shrink-0 font-semibold mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-200">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
        {/* Phone number */}
        <div className="space-y-1.5">
          <Label>WhatsApp Business Number *</Label>
          <div className="flex gap-2">
            <Controller
              name="countryCode"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  className="w-28 shrink-0"
                  aria-label="Country code"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.country} {c.code}
                    </option>
                  ))}
                </Select>
              )}
            />
            <Input
              placeholder="8012345678"
              error={!!errors.localNumber}
              {...register('localNumber')}
              className="flex-1"
            />
          </div>
          {errors.localNumber && (
            <p className="text-xs text-red-600">{errors.localNumber.message}</p>
          )}
          <p className="text-xs text-slate-500">
            Preview: {countryCode}
            {localNumber.replace(/^0/, '') || '…'}
          </p>
          <p className="text-xs text-slate-500">
            The number your customers will receive messages from
          </p>
        </div>

        {/* Display name */}
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display Name (Brand Name) *</Label>
          <Input
            id="displayName"
            placeholder="Your Business Name"
            error={!!errors.displayName}
            {...register('displayName')}
          />
          {errors.displayName && (
            <p className="text-xs text-red-600">{errors.displayName.message}</p>
          )}
          <p className="text-xs text-slate-500">
            What customers see as the sender name on WhatsApp
          </p>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="category">Business Category *</Label>
          <Select
            id="category"
            error={!!errors.category}
            {...register('category')}
          >
            <option value="">Select a category…</option>
            {WA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          {errors.category && (
            <p className="text-xs text-red-600">{errors.category.message}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description">Business Description *</Label>
          <Textarea
            id="description"
            rows={3}
            placeholder="Briefly describe what your business does…"
            maxLength={256}
            error={!!errors.description}
            {...register('description')}
          />
          <div className="flex justify-between">
            {errors.description ? (
              <p className="text-xs text-red-600">
                {errors.description.message}
              </p>
            ) : (
              <span />
            )}
            <p
              className={`text-xs ${description.length > 230 ? 'text-amber-600' : 'text-slate-400'}`}
            >
              {description.length}/256
            </p>
          </div>
        </div>

        {/* Website */}
        <div className="space-y-1.5">
          <Label htmlFor="website">Business Website (optional)</Label>
          <Input
            id="website"
            type="url"
            placeholder="https://yourstore.com"
            error={!!errors.website}
            {...register('website')}
          />
          {errors.website && (
            <p className="text-xs text-red-600">{errors.website.message}</p>
          )}
        </div>

        {/* Important notice */}
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">
            The number must be a registered WhatsApp Business number and must
            not already be connected to another service. Personal WhatsApp
            numbers cannot be used.
          </p>
        </div>

        {apiError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{apiError}</p>
          </div>
        )}

        <StepNavigation
          onBack={onBack}
          onContinue={handleSubmit(onSubmit)}
          continueLabel="Connect WhatsApp →"
          loading={isSubmitting}
        />

        <p className="text-center text-xs text-slate-400 pt-1">
          BSP approval still pending?{' '}
          <button
            type="button"
            onClick={onSkip}
            className="text-slate-500 underline hover:text-slate-700"
          >
            Skip WhatsApp for now — set up later in Settings
          </button>
        </p>
      </form>
    </StepCard>
  );
}
