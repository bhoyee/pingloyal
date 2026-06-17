'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../../lib/api';

interface LoginResponse {
  access_token: string;
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
    if (t) setSlug(t);
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
      localStorage.setItem('cashier_token', data.access_token);
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <div className="mb-8 text-center">
          {logoUrl ? (
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl overflow-hidden border border-slate-100 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={storeName ?? 'Store logo'}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-green-600 rounded-xl mx-auto mb-4" />
          )}
          <h1 className="text-xl font-semibold text-gray-900">
            {storeName ? `${storeName} Cashier` : 'PingLoyal Cashier'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 mb-4">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
