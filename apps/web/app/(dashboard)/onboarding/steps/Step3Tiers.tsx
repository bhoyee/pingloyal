'use client';
import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StepCard } from '@/components/onboarding/StepCard';
import { StepNavigation } from '@/components/onboarding/StepNavigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const tierSchema = z.object({
  vipLabel: z.string().min(1),
  vipMin: z.coerce.number().min(0),
  midLabel: z.string().min(1),
  midMin: z.coerce.number().min(0),
  midMax: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof tierSchema>;

interface Step3TiersProps {
  onComplete: () => void;
  onBack: () => void;
}

export function Step3Tiers({ onComplete, onBack }: Step3TiersProps) {
  const [apiError, setApiError] = useState('');
  const [overlapError, setOverlapError] = useState('');

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(tierSchema),
    defaultValues: {
      vipLabel: 'VIP Member',
      vipMin: 400000,
      midLabel: 'Regular Customer',
      midMin: 100000,
      midMax: 399999,
    },
  });

  const values = useWatch({ control });
  const vipMin = Number(values.vipMin ?? 400000);
  const midMin = Number(values.midMin ?? 100000);
  const midMax = Number(values.midMax ?? 399999);
  const standardMax = midMin > 0 ? midMin - 1 : 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (vipMin <= midMax) {
        setOverlapError(
          `VIP minimum must be higher than Mid maximum (₦${midMax.toLocaleString()})`,
        );
      } else {
        setOverlapError('');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [vipMin, midMax]);

  async function onSubmit(data: FormValues) {
    if (overlapError) return;
    setApiError('');
    try {
      await api.put('/tenants/tier-config', {
        tiers: [
          {
            tierName: 'vip',
            tierLabel: data.vipLabel,
            minQuarterlySpend: data.vipMin,
            maxQuarterlySpend: null,
            displayOrder: 0,
          },
          {
            tierName: 'mid',
            tierLabel: data.midLabel,
            minQuarterlySpend: data.midMin,
            maxQuarterlySpend: data.midMax,
            displayOrder: 1,
          },
          {
            tierName: 'standard',
            tierLabel: 'Standard',
            minQuarterlySpend: 0,
            maxQuarterlySpend: standardMax,
            displayOrder: 2,
          },
        ],
      });
      onComplete();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <StepCard
      title="Customer tier thresholds"
      subtitle="Customers are automatically sorted into tiers based on their quarterly spend."
    >
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {/* VIP Tier */}
        <TierRow
          color="gold"
          icon="👑"
          labelId="vipLabel"
          minId="vipMin"
          register={register}
          labelName="vipLabel"
          minName="vipMin"
          maxLabel="No upper limit"
          maxDisabled
          errorMsg={overlapError}
        />

        {/* Mid Tier */}
        <TierRow
          color="silver"
          icon="⭐"
          labelId="midLabel"
          minId="midMin"
          maxId="midMax"
          register={register}
          labelName="midLabel"
          minName="midMin"
          maxName="midMax"
          errorMsg={
            errors.midMax?.message ?? errors.midMin?.message
          }
        />

        {/* Standard Tier */}
        <div className="rounded-xl border-2 border-slate-300 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌱</span>
            <span className="font-semibold text-slate-900">Standard</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Min Spend</Label>
              <Input value="₦0" disabled className="bg-slate-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Spend (auto)</Label>
              <Input
                value={`₦${standardMax.toLocaleString()}`}
                disabled
                className="bg-slate-50"
              />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">
            Tiers reset every quarter (Jan, Apr, Jul, Oct). Use tier targeting
            in campaigns to reward your best customers.
          </p>
        </div>

        {apiError && <p className="text-sm text-red-600">{apiError}</p>}

        <StepNavigation
          onBack={onBack}
          onContinue={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={!!overlapError}
        />
      </form>
    </StepCard>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────────

type ColorScheme = 'gold' | 'silver';

interface TierRowProps {
  color: ColorScheme;
  icon: string;
  labelId: string;
  minId: string;
  maxId?: string;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  labelName: keyof FormValues;
  minName: keyof FormValues;
  maxName?: keyof FormValues;
  maxLabel?: string;
  maxDisabled?: boolean;
  errorMsg?: string;
}

function TierRow({
  color,
  icon,
  labelId,
  minId,
  maxId,
  register,
  labelName,
  minName,
  maxName,
  maxLabel,
  maxDisabled,
  errorMsg,
}: TierRowProps) {
  const borderColor =
    color === 'gold' ? 'border-amber-400' : 'border-slate-400';

  return (
    <div className={cn('rounded-xl border-2 p-4 space-y-3', borderColor)}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <Input
            id={labelId}
            placeholder="Tier name"
            {...register(labelName)}
            className="font-semibold"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={minId} className="text-xs">
            Min Quarterly Spend (₦)
          </Label>
          <Input
            id={minId}
            type="number"
            {...register(minName)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={maxId} className="text-xs">
            Max Quarterly Spend (₦)
          </Label>
          {maxDisabled ? (
            <Input value={maxLabel} disabled className="bg-slate-50 text-slate-500" />
          ) : (
            <Input
              id={maxId}
              type="number"
              {...(maxName ? register(maxName) : {})}
            />
          )}
        </div>
      </div>
      {errorMsg && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
