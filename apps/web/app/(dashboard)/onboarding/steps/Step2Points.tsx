'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { StepCard } from '@/components/onboarding/StepCard';
import { StepNavigation } from '@/components/onboarding/StepNavigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const schema = z.object({
  pointsEarnRate: z.coerce.number().min(1).max(100000),
  pointsThreshold: z.coerce.number().min(50).max(1000000),
  rewardValue: z.coerce.number().min(0),
  lapsedDays: z.coerce.number().min(7).max(365),
});

type FormValues = z.infer<typeof schema>;

interface Step2PointsProps {
  initialValues?: Partial<FormValues>;
  onComplete: () => void;
  onBack: () => void;
}

export function Step2Points({
  initialValues,
  onComplete,
  onBack,
}: Step2PointsProps) {
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      pointsEarnRate: initialValues?.pointsEarnRate ?? 100,
      pointsThreshold: initialValues?.pointsThreshold ?? 1000,
      rewardValue: initialValues?.rewardValue ?? 1000,
      lapsedDays: initialValues?.lapsedDays ?? 60,
    },
  });

  const earnRate = watch('pointsEarnRate') || 100;
  const threshold = watch('pointsThreshold') || 1000;
  const reward = watch('rewardValue') || 1000;
  const lapsed = watch('lapsedDays') || 60;

  const estPurchases = Math.ceil(threshold / 10);

  async function onSubmit(values: FormValues) {
    setApiError('');
    try {
      await api.patch('/tenants/settings', values);
      onComplete();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <StepCard
      title="Set up your points programme"
      subtitle="Define how customers earn points and what reward they unlock."
    >
      <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="earnRate">Spend per point (₦)</Label>
          <Input
            id="earnRate"
            type="number"
            {...register('pointsEarnRate')}
            error={!!errors.pointsEarnRate}
          />
          <p className="text-xs text-slate-500">
            Customers earn 1 point for every ₦{earnRate.toLocaleString()} they
            spend
          </p>
          {errors.pointsEarnRate && (
            <p className="text-xs text-red-600">
              {errors.pointsEarnRate.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="threshold">Points needed for reward</Label>
          <Input
            id="threshold"
            type="number"
            {...register('pointsThreshold')}
            error={!!errors.pointsThreshold}
          />
          {errors.pointsThreshold && (
            <p className="text-xs text-red-600">
              {errors.pointsThreshold.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reward">Reward voucher value (₦)</Label>
          <Input
            id="reward"
            type="number"
            {...register('rewardValue')}
            error={!!errors.rewardValue}
          />
          {errors.rewardValue && (
            <p className="text-xs text-red-600">{errors.rewardValue.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lapsed">Days before win-back message fires</Label>
          <Input
            id="lapsed"
            type="number"
            {...register('lapsedDays')}
            error={!!errors.lapsedDays}
          />
          <p className="text-xs text-slate-500">
            If a customer hasn&apos;t purchased in {lapsed} days, we send them a
            win-back WhatsApp message
          </p>
          {errors.lapsedDays && (
            <p className="text-xs text-red-600">{errors.lapsedDays.message}</p>
          )}
        </div>

        {/* Live Preview */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Preview
          </p>
          <p className="text-sm text-slate-700">
            Customer spending ₦{(earnRate * 10).toLocaleString()} earns{' '}
            <strong>10 points</strong>
          </p>
          <p className="text-sm text-slate-700">
            Reach <strong>{threshold.toLocaleString()} points</strong> → unlock
            ₦{reward.toLocaleString()} voucher
          </p>
          <p className="text-sm text-slate-700">
            Estimated purchases to first reward:{' '}
            <strong>~{estPurchases}</strong>
          </p>
        </div>

        {apiError && <p className="text-sm text-red-600">{apiError}</p>}

        <StepNavigation
          onBack={onBack}
          onContinue={handleSubmit(onSubmit)}
          loading={isSubmitting}
        />
      </form>
    </StepCard>
  );
}
