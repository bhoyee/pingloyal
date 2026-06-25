'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../../lib/api';
import { CashierAuthLayout } from '@/components/auth/CashierAuthLayout';

interface LoginResponse {
  accessToken: string;
}

interface StoreInfo {
  businessName: string;
  logoUrl: string | null;
}

export default function CashierLoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState<string | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t');
    if (t) {
      setSlug(t);
      localStorage.setItem('cashier_tenant_slug', t);
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/v1/tenants/public/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StoreInfo | null) => {
        if (data?.businessName) setStoreInfo(data);
      })
      .catch(() => undefined);
  }, [slug]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 401) {
        setError('Invalid email or password');
        return;
      }

      if (res.status === 410) {
        router.replace('/');
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const msg =
          typeof body.message === 'string'
            ? body.message
            : `Login failed (${res.status})`;
        setError(msg);
        return;
      }

      const data = (await res.json()) as LoginResponse;
      localStorage.setItem('cashier_token', data.accessToken);
      const destination = slug ? `/cashier?t=${slug}` : '/cashier';
      router.replace(destination);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Network error — check your connection');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const storeName = storeInfo?.businessName ?? null;
  const logoUrl = storeInfo?.logoUrl ?? null;

  return (
    <CashierAuthLayout>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {logoUrl ? (
            <div className="mx-auto mb-4 h-14 w-14 overflow-hidden rounded-xl border border-slate-100 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={storeName ?? 'Store logo'}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#0A1628]">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
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
          )}
          <h1 className="text-xl font-bold text-[#0A1628]">
            {storeName ? `${storeName} Cashier` : 'PingLoyal Cashier'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#0A1628]/20 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#0A1628]/20 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1628]/10"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-[#0A1628] py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#16294a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
      </div>
    </CashierAuthLayout>
  );
}
