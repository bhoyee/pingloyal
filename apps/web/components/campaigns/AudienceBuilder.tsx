'use client';
import { useEffect, useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { api, type AudiencePreview, type TierConfig, type TenantMe } from '@/lib/api';
import type { Category } from '@/lib/api';

interface Props {
  tenant: TenantMe | null;
  audienceCount: number | null;
  sampleNames: string[];
  previewLoading: boolean;
}

export function AudienceBuilder({ tenant, audienceCount, sampleNames, previewLoading }: Props) {
  const { register, watch, setValue } = useFormContext();
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const segmentRules = watch('segmentRules');
  const audienceMode = watch('audienceMode') as string ?? 'all';
  const useCategoryFilter = watch('useCategoryFilter') as boolean ?? false;
  const useMinPoints = watch('useMinPoints') as boolean ?? false;

  useEffect(() => {
    void api.get<TierConfig[]>('/api/v1/tenants/tier-config').then(setTiers).catch(() => null);
    void api.get<Category[]>('/api/v1/tenants/categories').then(setCategories).catch(() => null);
  }, []);

  const estimatedCost =
    tenant && audienceCount != null
      ? audienceCount * 130
      : null;
  const walletBalance = tenant?.marketingWalletBalance ?? 0;

  return (
    <div className="space-y-6">
      {/* Audience mode */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Send to:</h3>

        {/* All customers */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            value="all"
            {...register('audienceMode')}
            className="h-4 w-4 accent-[#0F1E35]"
          />
          <span className="text-sm text-slate-700">All opted-in customers</span>
        </label>

        {/* By tier */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            value="tiers"
            {...register('audienceMode')}
            className="h-4 w-4 accent-[#0F1E35]"
          />
          <span className="text-sm text-slate-700">Specific tiers</span>
        </label>

        {audienceMode === 'tiers' && tiers.length > 0 && (
          <div className="ml-7 flex flex-wrap gap-2">
            {tiers.map((tier) => {
              const selected = (segmentRules?.tierIds ?? []).includes(tier.id) as boolean;
              return (
                <label key={tier.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    className="h-4 w-4 accent-[#0F1E35]"
                    onChange={(e) => {
                      const current = (segmentRules?.tierIds ?? []) as string[];
                      setValue(
                        'segmentRules.tierIds',
                        e.target.checked
                          ? [...current, tier.id]
                          : current.filter((id: string) => id !== tier.id),
                      );
                    }}
                  />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {tier.tierLabel}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Category filter */}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            {...register('useCategoryFilter')}
            className="h-4 w-4 accent-[#0F1E35]"
          />
          <span className="text-sm text-slate-700">
            Customers who bought from specific categories
          </span>
        </label>
        {useCategoryFilter && categories.length > 0 && (
          <div className="ml-7 flex flex-wrap gap-2">
            {categories.map((cat) => {
              const selected = (segmentRules?.categoryIds ?? []).includes(cat.id) as boolean;
              return (
                <label key={cat.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    className="h-4 w-4 accent-[#0F1E35]"
                    onChange={(e) => {
                      const current = (segmentRules?.categoryIds ?? []) as string[];
                      setValue(
                        'segmentRules.categoryIds',
                        e.target.checked
                          ? [...current, cat.id]
                          : current.filter((id: string) => id !== cat.id),
                      );
                    }}
                  />
                  <span className="text-sm text-slate-600">{cat.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Min points filter */}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            {...register('useMinPoints')}
            className="h-4 w-4 accent-[#0F1E35]"
          />
          <span className="text-sm text-slate-700">Minimum points balance</span>
        </label>
        {useMinPoints && (
          <div className="ml-7 flex items-center gap-2">
            <span className="text-sm text-slate-600">Customers with at least</span>
            <input
              type="number"
              min={0}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F1E35]"
              {...register('segmentRules.minPoints', { valueAsNumber: true })}
            />
            <span className="text-sm text-slate-600">points</span>
          </div>
        )}
      </div>

      {/* Activity status */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Customer activity</p>
        <div className="flex flex-col gap-2">
          {[
            { value: 'all', label: 'All customers' },
            { value: 'active', label: 'Active only — purchased recently' },
            { value: 'inactive', label: 'Inactive only — not purchased recently' },
          ].map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                value={opt.value}
                {...register('segmentRules.activityStatus')}
                className="h-4 w-4 accent-[#0F1E35]"
              />
              <span className="text-sm text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Audience Preview */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {previewLoading ? (
          <div className="space-y-2">
            <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
          </div>
        ) : audienceCount === 0 ? (
          <div className="space-y-1 text-red-600">
            <p className="font-semibold" data-testid="zero-audience-warning">
              ⚠️ No opted-in customers match these filters
            </p>
            <p className="text-sm">Try adjusting your filters to reach more customers</p>
          </div>
        ) : audienceCount != null ? (
          <div className="space-y-2">
            <p className="text-2xl font-bold text-slate-900" data-testid="audience-count">
              🎯 {audienceCount.toLocaleString()} customers
            </p>
            <p className="text-sm text-slate-500">will receive this message</p>
            {sampleNames.length > 0 && (
              <p className="text-xs text-slate-400">
                e.g. {sampleNames.slice(0, 3).join(', ')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Calculating audience...</p>
        )}

        {estimatedCost != null && audienceCount != null && audienceCount > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600">
            <p>Estimated cost: ₦{estimatedCost.toLocaleString()}</p>
            <p>Current wallet: ₦{walletBalance.toLocaleString()}</p>
            {estimatedCost > walletBalance && (
              <p className="mt-1 font-medium text-amber-600">
                ⚠️ Wallet may run out before all messages send.{' '}
                <a
                  href="/billing/wallet/topup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Top up →
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
