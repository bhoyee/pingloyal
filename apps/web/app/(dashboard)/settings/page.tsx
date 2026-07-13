'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info, Upload, UserPlus } from 'lucide-react';
import { api, ApiError, type Category, type TenantMe, type TierConfig } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── Schemas ───────────────────────────────────────────────────────────────────

const businessSchema = z.object({
  businessName: z.string().min(2, 'Business name is too short').max(255),
  timezone: z.string().min(1, 'Timezone is required'),
});
type BusinessFormValues = z.infer<typeof businessSchema>;

const loyaltySchema = z.object({
  pointsEarnRate: z.coerce.number().min(0.1).max(100000),
  pointsThreshold: z.coerce.number().min(50).max(1000000),
  rewardValue: z.coerce.number().min(0),
  lapsedDays: z.coerce.number().min(7).max(365),
});
type LoyaltyFormValues = z.infer<typeof loyaltySchema>;

const tiersSchema = z.object({
  vipLabel: z.string().min(1),
  vipMin: z.coerce.number().min(0),
  midLabel: z.string().min(1),
  midMin: z.coerce.number().min(0),
  midMax: z.coerce.number().min(0),
});
type TiersFormValues = z.infer<typeof tiersSchema>;

const categorySchema = z.object({
  name: z.string().min(2, 'Category name is too short').max(100),
});
type CategoryFormValues = z.infer<typeof categorySchema>;

const DEFAULT_TIERS: TiersFormValues = {
  vipLabel: 'VIP Member',
  vipMin: 400000,
  midLabel: 'Regular Customer',
  midMin: 100000,
  midMax: 399999,
};

function tiersToFormValues(tiers: TierConfig[]): TiersFormValues {
  if (tiers.length === 0) return DEFAULT_TIERS;

  const sorted = [...tiers].sort(
    (a, b) => b.minQuarterlySpend - a.minQuarterlySpend,
  );
  const vip = sorted.find((t) => t.tierName === 'vip') ?? sorted[0];
  const mid = sorted.find((t) => t.tierName === 'mid') ?? sorted[1] ?? sorted[0];

  return {
    vipLabel: vip.tierLabel,
    vipMin: vip.minQuarterlySpend,
    midLabel: mid.tierLabel,
    midMin: mid.minQuarterlySpend,
    midMax: mid.maxQuarterlySpend ?? Math.max(vip.minQuarterlySpend - 1, 0),
  };
}

const WA_STATUS_STYLES: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-700',
  awaiting_reply: 'bg-amber-100 text-amber-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

interface CashierUser {
  id: string;
  fullName: string;
  isActive: boolean;
}

interface PwModal {
  cashierId: string;
  cashierName: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cashiers, setCashiers] = useState<CashierUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [pwModal, setPwModal] = useState<PwModal | null>(null);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);

  const businessForm = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: { businessName: '', timezone: 'Africa/Lagos' },
  });

  const loyaltyForm = useForm<LoyaltyFormValues>({
    resolver: zodResolver(loyaltySchema),
    defaultValues: {
      pointsEarnRate: 100,
      pointsThreshold: 1000,
      rewardValue: 1000,
      lapsedDays: 60,
    },
  });

  const tiersForm = useForm<TiersFormValues>({
    resolver: zodResolver(tiersSchema),
    defaultValues: DEFAULT_TIERS,
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '' },
  });

  const tierValues = useWatch({ control: tiersForm.control });
  const vipMin = Number(tierValues.vipMin ?? DEFAULT_TIERS.vipMin);
  const midMin = Number(tierValues.midMin ?? DEFAULT_TIERS.midMin);
  const midMax = Number(tierValues.midMax ?? DEFAULT_TIERS.midMax);
  const standardMax = midMin > 0 ? midMin - 1 : 0;
  const tierOverlap = vipMin <= midMax;

  const teamMembers = [
    ...(tenant?.ownerName
      ? [{ id: 'owner', name: tenant.ownerName, role: 'Owner', isActive: true }]
      : []),
    ...cashiers.map((c) => ({ id: c.id, name: c.fullName, role: 'Cashier', isActive: c.isActive })),
  ];

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    void Promise.all([
      api.get<TenantMe>('/api/v1/tenants/me').then((t) => {
        setTenant(t);
        businessForm.reset({ businessName: t.businessName, timezone: t.timezone });
      }),
      api.get<TierConfig[]>('/api/v1/tenants/tier-config').then((t) => {
        setTiers(t);
        tiersForm.reset(tiersToFormValues(t));
      }),
      api.get<Category[]>('/api/v1/tenants/categories').then(setCategories),
      api
        .get<CashierUser[]>('/api/v1/users/cashiers')
        .then((c) => setCashiers(Array.isArray(c) ? c : [])),
    ])
      .catch(() => null)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync loyalty form once tenant data arrives
  useEffect(() => {
    if (!tenant) return;
    loyaltyForm.reset({
      pointsEarnRate: tenant.pointsEarnRate,
      pointsThreshold: tenant.pointsThreshold,
      rewardValue: tenant.rewardValue,
      lapsedDays: tenant.lapsedDays,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  async function onSaveBusiness(values: BusinessFormValues) {
    try {
      const updated = await api.patch<TenantMe>('/api/v1/tenants/settings', values);
      setTenant(updated);
      queryClient.setQueryData(['tenant-me'], updated);
      showToast('Business profile updated');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to save business profile', 'error');
    }
  }

  async function onSaveLoyalty(values: LoyaltyFormValues) {
    try {
      const updated = await api.patch<TenantMe>('/api/v1/tenants/settings', values);
      setTenant(updated);
      queryClient.setQueryData(['tenant-me'], updated);
      showToast('Loyalty programme settings updated');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to save loyalty settings', 'error');
    }
  }

  async function onSaveTiers(values: TiersFormValues) {
    if (tierOverlap) return;
    try {
      const updated = await api.put<TierConfig[]>('/api/v1/tenants/tier-config', {
        tiers: [
          {
            tierName: 'vip',
            tierLabel: values.vipLabel,
            minQuarterlySpend: values.vipMin,
            maxQuarterlySpend: null,
            displayOrder: 0,
          },
          {
            tierName: 'mid',
            tierLabel: values.midLabel,
            minQuarterlySpend: values.midMin,
            maxQuarterlySpend: values.midMax,
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
      setTiers(updated);
      tiersForm.reset(tiersToFormValues(updated));
      showToast('Loyalty tiers updated');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to save loyalty tiers', 'error');
    }
  }

  async function onAddCategory(values: CategoryFormValues) {
    try {
      const created = await api.post<Category>('/api/v1/tenants/categories', values);
      setCategories((prev) => [...prev, created]);
      categoryForm.reset({ name: '' });
      showToast(`Added category "${created.name}"`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Failed to add category', 'error');
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    try {
      const result = await api.upload<{ logoUrl: string }>('/api/v1/tenants/logo', file);
      setTenant((prev) => (prev ? { ...prev, logoUrl: result.logoUrl } : prev));
      showToast('Logo updated');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to upload logo', 'error');
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRequestDeletion() {
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await api.post('/api/v1/tenants/delete-request', {
        confirmBusinessName: deleteConfirmInput,
      });
      localStorage.removeItem('access_token');
      window.location.href = '/';
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Failed to request account deletion',
      );
      setDeleteLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!pwModal) return;
    if (pwNew.length < 8) {
      setPwError('Password must be at least 8 characters');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('Passwords do not match');
      return;
    }
    setPwLoading(true);
    setPwError(null);
    try {
      await api.patch(`/api/v1/users/cashiers/${pwModal.cashierId}/password`, { newPassword: pwNew });
      setPwModal(null);
      showToast(`Password updated for ${pwModal.cashierName}`);
    } catch (e) {
      setPwError(e instanceof ApiError ? e.message : 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0F1E35] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Manage your business profile, loyalty programme, and customer tiers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
        {/* ── Business Profile ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Business Profile</CardTitle>
            <CardDescription>
              Your business name and logo appear on receipts, the QR registration
              poster, and customer-facing messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              {tenant?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logoUrl}
                  alt={tenant.businessName}
                  className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                  No logo
                </div>
              )}
              <div className="space-y-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void handleLogoChange(e)}
                  data-testid="logo-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={logoUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {tenant?.logoUrl ? 'Change logo' : 'Upload logo'}
                </Button>
                <p className="text-xs text-slate-400">JPEG, PNG, or WebP — up to 2MB</p>
              </div>
            </div>

            <form
              onSubmit={(e) => e.preventDefault()}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  {...businessForm.register('businessName')}
                  error={!!businessForm.formState.errors.businessName}
                />
                {businessForm.formState.errors.businessName && (
                  <p className="text-xs text-red-600">
                    {businessForm.formState.errors.businessName.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  {...businessForm.register('timezone')}
                  error={!!businessForm.formState.errors.timezone}
                />
                {businessForm.formState.errors.timezone && (
                  <p className="text-xs text-red-600">
                    {businessForm.formState.errors.timezone.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan</p>
                  <p className="text-sm font-medium capitalize text-slate-900">{tenant?.planTier}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mode</p>
                  <p className="text-sm font-medium capitalize text-slate-900">{tenant?.mode}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Currency</p>
                  <p className="text-sm font-medium text-slate-900">{tenant?.currency}</p>
                </div>
              </div>

              <Button
                type="button"
                onClick={businessForm.handleSubmit(onSaveBusiness)}
                loading={businessForm.formState.isSubmitting}
              >
                Save business profile
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Loyalty Programme ──────────────────────────────────────────── */}
        <Card id="loyalty">
          <CardHeader>
            <CardTitle>Loyalty Programme</CardTitle>
            <CardDescription>
              Define how customers earn points and what reward they unlock.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pointsEarnRate">Spend per point (₦)</Label>
                <Input
                  id="pointsEarnRate"
                  type="number"
                  step="any"
                  {...loyaltyForm.register('pointsEarnRate')}
                  error={!!loyaltyForm.formState.errors.pointsEarnRate}
                />
                {loyaltyForm.formState.errors.pointsEarnRate && (
                  <p className="text-xs text-red-600">
                    {loyaltyForm.formState.errors.pointsEarnRate.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pointsThreshold">Points needed for reward</Label>
                <Input
                  id="pointsThreshold"
                  type="number"
                  {...loyaltyForm.register('pointsThreshold')}
                  error={!!loyaltyForm.formState.errors.pointsThreshold}
                />
                {loyaltyForm.formState.errors.pointsThreshold && (
                  <p className="text-xs text-red-600">
                    {loyaltyForm.formState.errors.pointsThreshold.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rewardValue">Reward voucher value (₦)</Label>
                <Input
                  id="rewardValue"
                  type="number"
                  {...loyaltyForm.register('rewardValue')}
                  error={!!loyaltyForm.formState.errors.rewardValue}
                />
                {loyaltyForm.formState.errors.rewardValue && (
                  <p className="text-xs text-red-600">
                    {loyaltyForm.formState.errors.rewardValue.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lapsedDays">Days before win-back message fires</Label>
                <Input
                  id="lapsedDays"
                  type="number"
                  {...loyaltyForm.register('lapsedDays')}
                  error={!!loyaltyForm.formState.errors.lapsedDays}
                />
                {loyaltyForm.formState.errors.lapsedDays && (
                  <p className="text-xs text-red-600">
                    {loyaltyForm.formState.errors.lapsedDays.message}
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={loyaltyForm.handleSubmit(onSaveLoyalty)}
                loading={loyaltyForm.formState.isSubmitting}
              >
                Save loyalty settings
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Loyalty Tiers ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Loyalty Tiers</CardTitle>
            <CardDescription>
              Customers are automatically sorted into tiers based on their
              quarterly spend. Tiers reset every quarter (Jan, Apr, Jul, Oct).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {/* VIP Tier */}
              <div className="space-y-3 rounded-xl border-2 border-amber-400 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👑</span>
                  <Input
                    placeholder="Tier name"
                    {...tiersForm.register('vipLabel')}
                    className="flex-1 font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Quarterly Spend (₦)</Label>
                    <Input type="number" {...tiersForm.register('vipMin')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Quarterly Spend (₦)</Label>
                    <Input value="No upper limit" disabled className="bg-slate-50 text-slate-500" />
                  </div>
                </div>
              </div>

              {/* Mid Tier */}
              <div className="space-y-3 rounded-xl border-2 border-slate-400 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⭐</span>
                  <Input
                    placeholder="Tier name"
                    {...tiersForm.register('midLabel')}
                    className="flex-1 font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Quarterly Spend (₦)</Label>
                    <Input type="number" {...tiersForm.register('midMin')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Quarterly Spend (₦)</Label>
                    <Input type="number" {...tiersForm.register('midMax')} />
                  </div>
                </div>
                {tierOverlap && (
                  <p className="text-xs text-red-600">
                    VIP minimum must be higher than Mid maximum (₦{midMax.toLocaleString()})
                  </p>
                )}
              </div>

              {/* Standard Tier */}
              <div className="space-y-3 rounded-xl border-2 border-slate-300 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🌱</span>
                  <span className="font-semibold text-slate-900">Standard</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Spend</Label>
                    <Input value="₦0" disabled className="bg-slate-50 text-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Spend (auto)</Label>
                    <Input
                      value={`₦${standardMax.toLocaleString()}`}
                      disabled
                      className="bg-slate-50 text-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="text-sm text-blue-700">
                  Use tier targeting in campaigns to reward your best customers.
                </p>
              </div>

              <Button
                type="button"
                onClick={tiersForm.handleSubmit(onSaveTiers)}
                loading={tiersForm.formState.isSubmitting}
                disabled={tierOverlap}
              >
                Save loyalty tiers
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Product Categories ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Product Categories</CardTitle>
            <CardDescription>
              Used to tag transactions and target campaigns at customers who
              buy specific kinds of products.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No categories yet</p>
            )}

            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
            >
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="e.g. Beverages"
                  {...categoryForm.register('name')}
                  error={!!categoryForm.formState.errors.name}
                />
                {categoryForm.formState.errors.name && (
                  <p className="text-xs text-red-600">
                    {categoryForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={categoryForm.handleSubmit(onAddCategory)}
                loading={categoryForm.formState.isSubmitting}
              >
                Add category
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── WhatsApp Connection ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Connection</CardTitle>
            <CardDescription>
              The WhatsApp Business number used to message your customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant?.whatsapp.isConnected ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="text-sm font-medium text-emerald-800">
                      Connected
                      {tenant.whatsapp.phoneNumber && ` · ${tenant.whatsapp.phoneNumber}`}
                    </span>
                  </div>
                  <a
                    href="/onboarding?step=4"
                    className="shrink-0 text-sm font-semibold text-red-600 hover:text-red-700"
                  >
                    Reconnect
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                      WA_STATUS_STYLES[tenant.whatsapp.verificationStatus] ??
                        'bg-slate-100 text-slate-500',
                    )}
                  >
                    {tenant.whatsapp.verificationStatus.replace(/_/g, ' ')}
                  </span>
                  {tenant.whatsapp.displayName && (
                    <span className="text-sm font-medium text-slate-900">
                      {tenant.whatsapp.displayName}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Business Category</Label>
                    <Input
                      value={tenant.whatsapp.category ?? '—'}
                      disabled
                      className="bg-slate-50 text-slate-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">BSP Provider</Label>
                    <Input value="Gupshup" disabled className="bg-slate-50 text-slate-500" />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">
                  WhatsApp is not yet connected. Connect your WhatsApp Business
                  number to start sending automated loyalty messages.
                </p>
                <a
                  href="/onboarding?step=4"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-[#0DC56A] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#0aad5b]"
                >
                  Connect WhatsApp →
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Team Accounts ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Team Accounts</CardTitle>
            <CardDescription>
              People who can log in to your dashboard and cashier app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-xl bg-emerald-50/70 px-3 py-2.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0DC56A]/15 text-xs font-bold text-[#0DC56A]">
                    {initials(member.name)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.role}</p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      member.isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {member.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {member.role === 'Cashier' && (
                    <button
                      type="button"
                      onClick={() => {
                        setPwNew('');
                        setPwConfirm('');
                        setPwError(null);
                        setPwShowNew(false);
                        setPwShowConfirm(false);
                        setPwModal({ cashierId: member.id, cashierName: member.name });
                      }}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                    >
                      Set Password
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Link
              href="/cashier-app"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0DC56A] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0aad5b]"
            >
              <UserPlus className="h-4 w-4" />
              Invite Cashier
            </Link>
          </CardContent>
        </Card>

        {/* ── Danger Zone ─────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete your PingLoyal account and all associated data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-red-800">Delete this account</p>
                <p className="mt-0.5 text-xs text-red-600">
                  Login is disabled immediately. All data is permanently deleted within 24 hours.
                  This cannot be undone once that runs.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setDeleteConfirmInput('');
                  setDeleteError(null);
                  setDeleteModalOpen(true);
                }}
                className="shrink-0"
              >
                Delete My Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Set cashier password modal ──────────────────────────────────────── */}
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">Set Password</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Update the login password for <span className="font-medium text-slate-700">{pwModal.cashierName}</span>
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="pwNew">New password</Label>
                <div className="relative">
                  <Input
                    id="pwNew"
                    type={pwShowNew ? 'text' : 'password'}
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
                  >
                    {pwShowNew ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pwConfirm">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="pwConfirm"
                    type={pwShowConfirm ? 'text' : 'password'}
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
                  >
                    {pwShowConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {pwError && <p className="text-sm text-red-600">{pwError}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPwModal(null)}
                  disabled={pwLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleResetPassword()}
                  loading={pwLoading}
                >
                  Update Password
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete account confirmation modal ───────────────────────────────── */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-semibold text-red-700">Delete {tenant?.businessName}?</h3>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-slate-600">
                This immediately blocks all logins to the dashboard and cashier app for this
                business. Within 24 hours, all customers, transactions, campaigns, and message
                history are permanently deleted. We'll email the owner and our support team a
                link to cancel before that happens.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="deleteConfirm">
                  Type <span className="font-semibold text-slate-900">{tenant?.businessName}</span> to confirm
                </Label>
                <Input
                  id="deleteConfirm"
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deleteLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleRequestDeletion()}
                  loading={deleteLoading}
                  disabled={deleteConfirmInput !== tenant?.businessName || deleteLoading}
                >
                  Delete My Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-4 right-4 mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-[#0DC56A]' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
