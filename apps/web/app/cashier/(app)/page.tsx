'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cashierApi, ApiError, type CustomerLookupResult } from '@/lib/api';
import { lookupCustomerByPhone } from '@/lib/offline-queue';
import { useCashier } from '../context/cashier-context';

type LookupState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'found'; customer: CustomerLookupResult }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

function toE164(local: string): string {
  const digits = local.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length > 0) return `+234${digits}`;
  return local;
}

function formatLocalDisplay(digits: string): string {
  // Format as: 0801 234 5678
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
}

function tierStyle(tier: string | null): { bg: string; text: string; icon: string } {
  if (!tier) return { bg: 'bg-gray-100', text: 'text-gray-600', icon: '⭐' };
  const t = tier.toLowerCase();
  if (t.includes('vip')) return { bg: 'bg-amber-100', text: 'text-amber-700', icon: '👑' };
  if (t.includes('mid') || t.includes('regular')) return { bg: 'bg-sky-100', text: 'text-sky-700', icon: '🌟' };
  return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '🌱' };
}

export default function CashierPage() {
  const router = useRouter();
  const { tenant, tenantSlug, isOnline, offlineQueueCount } = useCashier();

  const [localInput, setLocalInput] = useState('');
  const [state, setState] = useState<LookupState>({ status: 'empty' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doLookup = useCallback(async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7) {
      setState({ status: 'empty' });
      return;
    }
    const phone = toE164(raw);
    setState({ status: 'loading' });
    try {
      const customer = await cashierApi.get<CustomerLookupResult>(
        `/customers/lookup?phone=${encodeURIComponent(phone)}`,
      );
      setState({ status: 'found', customer });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'not_found' });
      } else {
        // Offline or network error — search the local IndexedDB customer cache
        const cached = await lookupCustomerByPhone(phone);
        if (cached) {
          setState({
            status: 'found',
            customer: { ...cached, _fromCache: true } as CustomerLookupResult,
          });
        } else {
          setState({ status: 'error', message: 'offline-no-match' });
        }
      }
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    setLocalInput(raw);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doLookup(raw), 400);
  }

  function handleClear() {
    setLocalInput('');
    setState({ status: 'empty' });
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }

  function handleLogPurchase(customer: CustomerLookupResult) {
    sessionStorage.setItem('cashier_selected_customer', JSON.stringify(customer));
    router.push(`/cashier/transaction?customerId=${customer.id}`);
  }

  const symbol = tenant?.currency === 'GBP' ? '£' : '₦';

  return (
    <div className="flex flex-col h-full">
      {/* Offline banner */}
      {isOnline === false && (
        <div role="alert" className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center gap-2">
          <span className="text-base">📵</span>
          <p className="text-xs font-semibold text-red-700">You are offline — lookups will use cached data</p>
        </div>
      )}

      {/* Tip banner */}
      <div className="bg-green-50 border-b border-green-100 px-4 py-2.5 flex items-center gap-2">
        <span className="text-base">📌</span>
        <p className="text-xs font-medium text-green-800">
          Type a phone number to look up a customer
        </p>
        {offlineQueueCount > 0 && (
          <span className="ml-auto text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
            {offlineQueueCount} queued
          </span>
        )}
      </div>

      {/* Phone input section */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          Customer Phone Number
        </p>
        <div className="flex items-center gap-2">
          {/* Country code prefix */}
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700 shrink-0 select-none">
            <span className="text-base leading-none">🇳🇬</span>
            <span>+234</span>
          </div>

          {/* Number input */}
          <div className="relative flex-1">
            <input
              type="tel"
              inputMode="numeric"
              aria-label="Phone number"
              value={formatLocalDisplay(localInput)}
              onChange={handleInputChange}
              placeholder="0801 234 5678"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#0DC56A] focus:border-transparent"
            />
            {localInput && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Result area */}
      <div className="flex-1 px-4 py-4">
        {state.status === 'empty' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">📱</div>
            <p className="text-sm font-medium text-gray-500">Enter a customer's phone number above</p>
            <p className="text-xs text-gray-400 mt-1">Results appear automatically as you type</p>
          </div>
        )}

        {state.status === 'loading' && (
          <div role="status" aria-label="Loading" className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#0DC56A] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state.status === 'not_found' && (
          <div className="py-8 text-center space-y-4">
            <div className="text-4xl">🔍</div>
            <div>
              <p className="text-sm font-semibold text-gray-700">No customer found</p>
              <p className="text-xs text-gray-400 mt-1">No account with that number</p>
            </div>
            {tenantSlug && (
              <a
                href={`/register/${tenantSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-[#0DC56A] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#0aad5b] transition-colors"
              >
                + Register New Customer
              </a>
            )}
          </div>
        )}

        {state.status === 'error' && (
          <div role="alert" className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-4 text-center space-y-2">
            <p className="text-2xl">📵</p>
            <p className="text-sm font-semibold text-amber-800">No signal — customer not found locally</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              The customer list syncs automatically when online. Once connected, reopen the app and it will download all customers so every lookup works offline.
            </p>
          </div>
        )}

        {state.status === 'found' && (
          <CustomerCard
            customer={state.customer}
            symbol={symbol}
            tenant={tenant}
            onLogPurchase={handleLogPurchase}
          />
        )}
      </div>
    </div>
  );
}

function CustomerCard({
  customer,
  symbol,
  tenant,
  onLogPurchase,
}: {
  customer: CustomerLookupResult;
  symbol: string;
  tenant: { pointsThreshold: number; rewardValue: number; pointsEarnRate: number } | null;
  onLogPurchase: (c: CustomerLookupResult) => void;
}) {
  const tier = tierStyle(customer.tier);
  const threshold = tenant?.pointsThreshold ?? 1000;
  const earnRate = tenant?.pointsEarnRate ?? 100;
  const rewardValue = tenant?.rewardValue ?? 0;

  const pointsRemaining = Math.max(0, threshold - customer.pointsBalance);
  const spendRemaining = pointsRemaining * earnRate;
  const progressPercent = Math.min(100, customer.progressPercent);

  const fromCache = (customer as CustomerLookupResult & { _fromCache?: boolean })._fromCache;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Offline cache notice */}
      {fromCache && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2">
          <span className="text-xs">📵</span>
          <p className="text-xs text-amber-700 font-medium">Offline — showing cached data. Points may have changed.</p>
        </div>
      )}
      {/* Name + tier */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{customer.fullName}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{customer.phoneE164}</p>
        </div>
        {customer.tier && (
          <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${tier.bg} ${tier.text}`}>
            <span>{tier.icon}</span>
            {customer.tier}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
        <div className="py-3 text-center">
          <p className="text-2xl font-bold text-[#0DC56A]">{customer.pointsBalance.toLocaleString()}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">Points</p>
        </div>
        <div className="py-3 text-center">
          <p className="text-2xl font-bold text-[#0DC56A]">{progressPercent}%</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">To reward</p>
        </div>
        <div className="py-3 text-center">
          <p className="text-2xl font-bold text-[#0DC56A]">{customer.purchaseCount}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">Visits</p>
        </div>
      </div>

      {/* Progress bar + voucher text */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div
          role="progressbar"
          aria-label="Progress to reward"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2"
        >
          <div
            className="h-full bg-[#0DC56A] rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {rewardValue > 0 && pointsRemaining > 0 ? (
          <p className="text-xs text-gray-500 text-center">
            {symbol}{spendRemaining.toLocaleString()} more to unlock{' '}
            <span className="font-semibold text-gray-700">
              {symbol}{rewardValue.toLocaleString()} voucher
            </span>
          </p>
        ) : pointsRemaining === 0 ? (
          <p className="text-xs text-center font-semibold text-[#0DC56A]">
            🎉 Reward unlocked!
          </p>
        ) : (
          <p className="text-xs text-gray-400 text-center">{progressPercent}% to next reward</p>
        )}
      </div>

      {/* CTA button */}
      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={() => onLogPurchase(customer)}
          className="w-full bg-[#0DC56A] text-white font-bold text-base py-3.5 rounded-xl hover:bg-[#0aad5b] transition-colors"
        >
          Log Purchase →
        </button>
      </div>
    </div>
  );
}
