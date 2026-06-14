'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { ChevronDown } from 'lucide-react';
import { api, type AudiencePreview, type TierConfig, type TenantMe } from '@/lib/api';
import type { Category } from '@/lib/api';

interface Props {
  tenant: TenantMe | null;
  audienceCount: number | null;
  sampleNames: string[];
  previewLoading: boolean;
}

interface CategoryDropdownProps {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

function CategoryDropdown({ categories, selected, onChange }: CategoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const label =
    selected.length === 0
      ? 'Select categories'
      : selected.length === 1
        ? categories.find((c) => c.id === selected[0])?.name ?? '1 category selected'
        : `${selected.length} categories selected`;

  return (
    <div ref={ref} className="relative max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-[#0F1E35]"
      >
        <span className={selected.length ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {categories.map((cat) => (
            <label
              key={cat.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(cat.id)}
                onChange={() => toggle(cat.id)}
                className="h-4 w-4 accent-[#0F1E35]"
              />
              <span className="text-slate-700">{cat.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
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
          <div className="ml-7">
            <CategoryDropdown
              categories={categories}
              selected={(segmentRules?.categoryIds ?? []) as string[]}
              onChange={(ids) => setValue('segmentRules.categoryIds', ids)}
            />
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
