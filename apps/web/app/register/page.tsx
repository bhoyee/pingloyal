'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { publicPost } from '@/lib/api';

interface RegisterResponse {
  requiresVerification: true;
  email: string;
  devCode?: string;
}

interface FieldErrors {
  businessName?: string;
  fullName?: string;
  email?: string;
  password?: string;
  country?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('NG');
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (businessName.trim().length < 2)
      errors.businessName = 'Business name must be at least 2 characters';
    if (fullName.trim().length < 2)
      errors.fullName = 'Full name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = 'Enter a valid email address';
    if (password.length < 8)
      errors.password = 'Password must be at least 8 characters';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleRegister(e: { preventDefault(): void }) {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await publicPost<RegisterResponse>('/api/v1/auth/register', {
        businessName: businessName.trim(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        country,
      });

      const params = new URLSearchParams({ email: res.email });
      if (res.devCode) params.set('devCode', res.devCode);
      router.replace(`/verify-email?${params.toString()}`);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : 'Registration failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A1628]">
              <svg
                width="22"
                height="22"
                viewBox="0 0 22 22"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  stroke="rgba(255,255,255,0.65)"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M7 11l2.5 2.5 5.5-5.5"
                  stroke="#0DC56A"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-2xl font-bold text-[#0A1628]">PingLoyal</span>
          </div>
          <p className="text-sm text-gray-500">
            Start your 14-day free trial — no card required
          </p>
        </div>

        <form
          onSubmit={(e) => void handleRegister(e)}
          className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
          noValidate
        >
          <div className="space-y-5">
            {/* Business name */}
            <div>
              <label
                htmlFor="businessName"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Business name
              </label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoComplete="organization"
                placeholder="e.g. FreshMart Surulere"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  fieldErrors.businessName
                    ? 'border-red-400 focus:ring-red-200'
                    : 'border-gray-300 focus:border-[#0A1628] focus:ring-[#0A1628]/10'
                }`}
              />
              {fieldErrors.businessName && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.businessName}
                </p>
              )}
            </div>

            {/* Full name */}
            <div>
              <label
                htmlFor="fullName"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Your full name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                placeholder="e.g. Adewale Ogundimu"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  fieldErrors.fullName
                    ? 'border-red-400 focus:ring-red-200'
                    : 'border-gray-300 focus:border-[#0A1628] focus:ring-[#0A1628]/10'
                }`}
              />
              {fieldErrors.fullName && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.fullName}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@yourbusiness.com"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  fieldErrors.email
                    ? 'border-red-400 focus:ring-red-200'
                    : 'border-gray-300 focus:border-[#0A1628] focus:ring-[#0A1628]/10'
                }`}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  fieldErrors.password
                    ? 'border-red-400 focus:ring-red-200'
                    : 'border-gray-300 focus:border-[#0A1628] focus:ring-[#0A1628]/10'
                }`}
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Country */}
            <div>
              <label
                htmlFor="country"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Country
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10"
              >
                <option value="NG">Nigeria</option>
                <option value="UK">United Kingdom</option>
              </select>
            </div>

            {serverError && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0DC56A] py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#0ab55e] disabled:opacity-50"
            >
              {loading ? 'Creating your account…' : 'Create free account →'}
            </button>

            <p className="text-center text-xs text-gray-400">
              By signing up you agree to our{' '}
              <a href="/terms" className="underline hover:text-gray-600">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="underline hover:text-gray-600">
                Privacy Policy
              </a>
              .
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-[#0A1628] hover:underline"
            >
              Sign in →
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
