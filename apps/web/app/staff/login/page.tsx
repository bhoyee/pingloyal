'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../../lib/api';

interface StaffLoginResponse {
  accessToken: string;
  refreshToken: string;
}

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/staff-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 401) {
        setError('Invalid email or password');
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const msg =
          typeof body.message === 'string'
            ? body.message
            : `Login failed (${res.status})`;
        setError(msg);
        return;
      }

      const data = (await res.json()) as StaffLoginResponse;
      localStorage.setItem('staff_access_token', data.accessToken);
      localStorage.setItem('staff_refresh_token', data.refreshToken);
      router.replace('/staff');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1628] p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-[#0F1E35] rounded-xl mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">PingLoyal Staff</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to the support panel</p>
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]"
              placeholder="you@pingloyal.com"
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F1E35]"
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
            className="w-full bg-[#0F1E35] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#1a3050] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
