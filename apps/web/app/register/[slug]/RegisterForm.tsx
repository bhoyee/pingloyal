'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { TenantInfo } from '@/lib/api';
import SuccessScreen from './SuccessScreen';

const MIN_AGE = 13;

const schema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(7, 'Phone number is required'),
  country: z.enum(['NG', 'GB'], { required_error: 'Please select a country' }),
  dateOfBirth: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE);
        return new Date(val) <= cutoff;
      },
      { message: `You must be at least ${MIN_AGE} years old` },
    ),
  waOptedIn: z.literal(true, {
    errorMap: () => ({ message: 'WhatsApp consent is required' }),
  }),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  slug: string;
  tenantInfo: TenantInfo;
}

async function postWithRetry(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    return await fetch(url, options);
  }
}

export default function RegisterForm({ slug, tenantInfo }: Props) {
  const [registered, setRegistered] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().split('T')[0];
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const idempotencyKey = crypto.randomUUID();

    let res: Response;
    try {
      res = await postWithRetry(`/api/v1/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          tenantSlug: slug,
          fullName: data.fullName,
          phone: data.phone,
          dateOfBirth: data.dateOfBirth || undefined,
          waOptedIn: data.waOptedIn,
        }),
      });
    } catch {
      setServerError('Network error — please check your connection and try again.');
      return;
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setServerError(
        typeof body.message === 'string' ? body.message : 'Registration failed. Please try again.',
      );
      return;
    }

    setRegistered(true);
  };

  if (registered) {
    return <SuccessScreen tenantInfo={tenantInfo} />;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      {tenantInfo.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenantInfo.logoUrl}
          alt={`${tenantInfo.businessName} logo`}
          className="h-16 w-auto mx-auto mb-6 object-contain"
        />
      )}
      <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
        {tenantInfo.businessName}
      </h1>
      <p className="text-sm text-gray-500 text-center mb-6">
        Earn {tenantInfo.pointsThreshold} points to redeem a{' '}
        {tenantInfo.currency} {tenantInfo.rewardValue} reward
      </p>

      {serverError && (
        <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('fullName')}
          />
          {errors.fullName && (
            <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('phone')}
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
            Country
          </label>
          <select
            id="country"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('country')}
          >
            <option value="">Select country</option>
            <option value="NG">Nigeria (NG)</option>
            <option value="GB">United Kingdom (GB)</option>
          </select>
          {errors.country && (
            <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
            Date of Birth <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="dateOfBirth"
            type="date"
            max={maxDob}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            {...register('dateOfBirth')}
          />
          {errors.dateOfBirth && (
            <p className="mt-1 text-xs text-red-600">{errors.dateOfBirth.message}</p>
          )}
        </div>

        <div className="flex items-start gap-3 pt-1">
          <input
            id="waOptedIn"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
            {...register('waOptedIn')}
          />
          <label htmlFor="waOptedIn" className="text-sm text-gray-600 leading-snug">
            I consent to receive loyalty updates and messages on WhatsApp
          </label>
        </div>
        {errors.waOptedIn && (
          <p className="text-xs text-red-600">{errors.waOptedIn.message}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Registering...' : 'Join Loyalty Programme'}
        </button>
      </form>
    </div>
  );
}
