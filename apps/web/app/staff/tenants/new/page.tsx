'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface CreateTenantResponse {
  tenantId: string;
  userId: string;
  devCode?: string;
}

export default function NewTenantPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState<'NG' | 'UK'>('NG');
  const [planTier, setPlanTier] = useState<'starter' | 'growth' | 'connect'>('starter');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('staff_role') !== 'super_admin') {
      router.replace('/staff/tenants');
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await staffApi.post<CreateTenantResponse>('/staff/tenants', {
        businessName,
        country,
        planTier,
        ownerEmail,
        ownerFullName,
      });
      if (result.devCode) {
        setDevCode(result.devCode);
        return;
      }
      router.replace(`/staff/tenants/${result.tenantId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create tenant');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (devCode) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Tenant created</p>
          <p className="mt-2 text-sm text-amber-800">
            The welcome email couldn&apos;t be sent (no email provider configured in this
            environment). Give the owner this set-password code manually:
          </p>
          <p className="mt-3 rounded-lg bg-white px-4 py-3 text-center text-2xl font-bold tracking-widest text-slate-900">
            {devCode}
          </p>
          <Button className="mt-4" onClick={() => router.push('/staff/tenants')}>
            Back to tenants
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold text-slate-900">New tenant</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            required
            minLength={2}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Select id="country" value={country} onChange={(e) => setCountry(e.target.value as 'NG' | 'UK')}>
            <option value="NG">Nigeria</option>
            <option value="UK">United Kingdom</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="planTier">Plan</Label>
          <Select
            id="planTier"
            value={planTier}
            onChange={(e) => setPlanTier(e.target.value as 'starter' | 'growth' | 'connect')}
          >
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="connect">Connect</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ownerFullName">Owner full name</Label>
          <Input
            id="ownerFullName"
            required
            minLength={2}
            value={ownerFullName}
            onChange={(e) => setOwnerFullName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ownerEmail">Owner email</Label>
          <Input
            id="ownerEmail"
            type="email"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={isSubmitting}>
          Create tenant
        </Button>
      </form>
    </div>
  );
}
