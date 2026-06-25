'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { publicPost } from '@/lib/api';
import { AuthSplitLayout, BrandMark } from '@/components/auth/AuthSplitLayout';

interface RegisterResponse {
  signupToken: string;
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
      const res = await publicPost<RegisterResponse>('/api/v1/signup/register', {
        businessName: businessName.trim(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        country: 'NG',
      });

      const params = new URLSearchParams({
        token: res.signupToken,
        email: res.email,
      });
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
    <AuthSplitLayout>
      <div className="w-full max-w-[440px]">
        <Link href="/" className="mb-8 flex justify-center lg:hidden" aria-label="PingLoyal home">
          <BrandMark />
        </Link>

        <h1 className="text-2xl font-bold text-[#0A1628]">Create your account</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Start your 14-day free trial — card required, nothing charged until day 14.
        </p>

        <form
          onSubmit={(e) => void handleRegister(e)}
          className="mt-8"
          noValidate
        >
          <div className="space-y-5">
            {/* Business name */}
            <div>
              <label
                htmlFor="businessName"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
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
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 ${
                  fieldErrors.businessName
                    ? 'border-red-300 bg-red-50 focus:ring-red-200'
                    : 'border-transparent bg-gray-100 focus:border-[#0A1628]/20 focus:ring-[#0A1628]/10'
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
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
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
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 ${
                  fieldErrors.fullName
                    ? 'border-red-300 bg-red-50 focus:ring-red-200'
                    : 'border-transparent bg-gray-100 focus:border-[#0A1628]/20 focus:ring-[#0A1628]/10'
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
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
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
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 ${
                  fieldErrors.email
                    ? 'border-red-300 bg-red-50 focus:ring-red-200'
                    : 'border-transparent bg-gray-100 focus:border-[#0A1628]/20 focus:ring-[#0A1628]/10'
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
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
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
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 ${
                  fieldErrors.password
                    ? 'border-red-300 bg-red-50 focus:ring-red-200'
                    : 'border-transparent bg-gray-100 focus:border-[#0A1628]/20 focus:ring-[#0A1628]/10'
                }`}
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Country — Nigeria only while we focus on the NG market */}
            <div>
              <label
                htmlFor="country"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Country
              </label>
              <input
                id="country"
                type="text"
                value="Nigeria"
                readOnly
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-transparent bg-gray-100 px-3.5 py-2.5 text-sm text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                We&apos;re currently focused on Nigeria — more countries coming soon.
              </p>
            </div>

            {serverError && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0A1628] py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#16294a] disabled:opacity-50"
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
    </AuthSplitLayout>
  );
}
