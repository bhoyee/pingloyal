'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cashierApi, ApiError, type CustomerLookupResult } from '../../lib/api';
import { useCashier } from './context/cashier-context';

type LookupState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'found'; customer: CustomerLookupResult }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export default function CashierPage() {
  const router = useRouter();
  const { tenant, tenantSlug, offlineQueueCount } = useCashier();
  const [phoneInput, setPhoneInput] = useState('');
  const [state, setState] = useState<LookupState>({ status: 'empty' });
  const [offline, setOffline] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOnline() {
      setOffline(false);
    }
    function handleOffline() {
      setOffline(true);
    }
    setOffline(!isOnline());
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const doLookup = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7) {
      setState({ status: 'empty' });
      return;
    }

    setState({ status: 'loading' });
    try {
      const customer = await cashierApi.get<CustomerLookupResult>(
        `/customers/lookup?phone=${encodeURIComponent(raw)}`,
      );
      setState({ status: 'found', customer });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'not_found' });
      } else if (err instanceof ApiError && err.status === 0) {
        setState({
          status: 'error',
          message: 'No connection — results may be stale',
        });
      } else {
        const msg =
          err instanceof ApiError ? err.message : 'Unexpected error';
        setState({ status: 'error', message: msg });
      }
    }
  }, []);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setPhoneInput(raw);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doLookup(raw);
    }, 400);
  }

  function handleClear() {
    setPhoneInput('');
    setState({ status: 'empty' });
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }

  function handleLogPurchase(customer: CustomerLookupResult) {
    sessionStorage.setItem('cashier_selected_customer', JSON.stringify(customer));
    router.push(`/cashier/transaction?customerId=${customer.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg" />
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              {tenant?.businessName ?? 'PingLoyal Cashier'}
            </p>
            <p className="text-xs text-gray-500">Customer Lookup</p>
          </div>
        </div>
        {offlineQueueCount > 0 && (
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
            {offlineQueueCount} queued
          </span>
        )}
      </header>

      {/* Offline banner */}
      {offline && (
        <div
          role="status"
          className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-800 text-center"
        >
          You are offline — lookup may not be available
        </div>
      )}

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <input
            type="tel"
            inputMode="numeric"
            aria-label="Phone number"
            value={formatPhone(phoneInput)}
            onChange={handlePhoneChange}
            placeholder="Enter phone number…"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          />
          {phoneInput && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear phone number"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Result area */}
      <div className="flex-1 px-4">
        {state.status === 'empty' && (
          <div className="text-center text-gray-400 mt-16 text-sm">
            Enter a phone number to look up a customer
          </div>
        )}

        {state.status === 'loading' && (
          <div
            role="status"
            aria-label="Loading"
            className="flex justify-center mt-16"
          >
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state.status === 'not_found' && (
          <div className="mt-8">
            <div
              role="status"
              className="text-center text-gray-500 text-sm mb-4"
            >
              No customer found with that number
            </div>
            {tenantSlug && (
              <div className="text-center">
                <Link
                  href={`/register/${tenantSlug}`}
                  className="inline-block bg-green-600 text-white text-sm px-5 py-2.5 rounded-xl font-medium hover:bg-green-700 transition-colors"
                >
                  Register new customer
                </Link>
              </div>
            )}
          </div>
        )}

        {state.status === 'error' && (
          <div
            role="alert"
            className="mt-8 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 text-center"
          >
            {state.message}
          </div>
        )}

        {state.status === 'found' && (
          <div className="space-y-3">
            <CustomerCard customer={state.customer} />
            <button
              type="button"
              onClick={() => handleLogPurchase(state.customer)}
              className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-green-700 transition-colors"
            >
              Log Purchase →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerCard({ customer }: { customer: CustomerLookupResult }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {customer.fullName}
          </h2>
          <p className="text-sm text-gray-500">{customer.phoneE164}</p>
        </div>
        {customer.tier && (
          <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
            {customer.tier}
          </span>
        )}
      </div>

      {/* Points */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-gray-600">Points balance</span>
          <span className="font-semibold text-gray-900">
            {customer.pointsBalance.toLocaleString()}
          </span>
        </div>
        <div
          className="h-2 bg-gray-100 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={customer.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress to next reward"
        >
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${customer.progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {customer.progressPercent}% to next reward
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-gray-500 text-xs">Purchases</p>
          <p className="font-semibold text-gray-900 mt-0.5">
            {customer.purchaseCount}
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-gray-500 text-xs">Last visit</p>
          <p className="font-semibold text-gray-900 mt-0.5">
            {customer.lastPurchaseAt
              ? new Date(customer.lastPurchaseAt).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                })
              : 'Never'}
          </p>
        </div>
      </div>
    </div>
  );
}
