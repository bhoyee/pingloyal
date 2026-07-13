'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cashierApi, ApiError, type CustomerLookupResult } from '@/lib/api';
import { useCashier } from '../../context/cashier-context';

type PageState =
  | { status: 'loading' }
  | { status: 'no_customer' }
  | { status: 'no_rewards'; customer: CustomerLookupResult }
  | { status: 'ready'; customer: CustomerLookupResult; maxRewards: number }
  | { status: 'confirming'; customer: CustomerLookupResult; rewardsToRedeem: number }
  | { status: 'submitting' }
  | { status: 'success'; customerName: string; rewardsRedeemed: number; valueRedeemed: number; balanceAfter: number }
  | { status: 'error'; message: string };

export default function RedemptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenant } = useCashier();

  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [selectedRewards, setSelectedRewards] = useState(1);

  const symbol = tenant?.currency === 'GBP' ? '£' : '₦';
  const threshold = tenant?.pointsThreshold ?? 1000;
  const rewardValue = tenant?.rewardValue ?? 0;

  useEffect(() => {
    const customerId = searchParams.get('customerId');
    const stored = sessionStorage.getItem('cashier_selected_customer');

    if (!stored || !customerId) {
      setState({ status: 'no_customer' });
      return;
    }

    try {
      const customer = JSON.parse(stored) as CustomerLookupResult;
      if (customer.id !== customerId) {
        setState({ status: 'no_customer' });
        return;
      }

      const maxRewards = Math.floor(customer.pointsBalance / threshold);
      if (maxRewards < 1) {
        setState({ status: 'no_rewards', customer });
      } else {
        setState({ status: 'ready', customer, maxRewards });
        setSelectedRewards(1);
      }
    } catch {
      setState({ status: 'no_customer' });
    }
  }, [searchParams, threshold]);

  async function handleConfirm() {
    if (state.status !== 'confirming') return;

    const rewardsToRedeem = Math.floor(state.rewardsToRedeem);
    if (!Number.isFinite(rewardsToRedeem) || rewardsToRedeem < 1) {
      setState({ status: 'error', message: 'Invalid reward count — please go back and try again.' });
      return;
    }

    setState({ status: 'submitting' });
    try {
      const result = await cashierApi.post<{
        rewardsCount: number;
        value: number;
        balanceAfter: number;
      }>('/redemptions', {
        customerId: state.customer.id,
        rewardsToRedeem,
      });

      setState({
        status: 'success',
        customerName: state.customer.fullName,
        rewardsRedeemed: result.rewardsCount,
        valueRedeemed: result.value,
        balanceAfter: result.balanceAfter,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message ?? 'Failed to apply reward'
          : 'Network error — please try again';
      setState({ status: 'error', message });
    }
  }

  function handleSelectRewards(count: number) {
    if (state.status !== 'ready') return;
    const safe = Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
    setState({ status: 'confirming', customer: state.customer, rewardsToRedeem: safe });
    setSelectedRewards(safe);
  }

  function handleBack() {
    router.back();
  }

  function handleDone() {
    sessionStorage.removeItem('cashier_selected_customer');
    router.push('/cashier');
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-[#0DC56A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── No customer ──────────────────────────────────────────────────────────────
  if (state.status === 'no_customer') {
    return (
      <div className="px-4 py-8 text-center space-y-4">
        <p className="text-3xl">❌</p>
        <p className="text-sm font-semibold text-gray-700">No customer selected</p>
        <button
          type="button"
          onClick={() => router.push('/cashier')}
          className="text-sm text-[#0DC56A] font-semibold underline"
        >
          Back to lookup
        </button>
      </div>
    );
  }

  // ── No rewards available ─────────────────────────────────────────────────────
  if (state.status === 'no_rewards') {
    const pointsNeeded = threshold - state.customer.pointsBalance;
    return (
      <div className="px-4 py-6 space-y-5">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back
        </button>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center space-y-3">
          <p className="text-3xl">🔒</p>
          <p className="font-bold text-amber-800">Not enough points</p>
          <p className="text-sm text-amber-700">
            <span className="font-semibold">{state.customer.fullName}</span> needs{' '}
            <span className="font-bold">{pointsNeeded.toLocaleString()} more points</span> to unlock
            a reward.
          </p>
          <p className="text-xs text-amber-600">
            Current balance: {state.customer.pointsBalance.toLocaleString()} pts /{' '}
            {threshold.toLocaleString()} needed
          </p>
        </div>

        <button
          type="button"
          onClick={handleBack}
          className="w-full bg-gray-100 text-gray-700 font-semibold text-base py-3.5 rounded-xl hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (state.status === 'success') {
    return (
      <div className="px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
          <p className="text-4xl">🎉</p>
          <p className="text-lg font-bold text-emerald-800">Reward Applied!</p>
          <p className="text-sm text-emerald-700">
            <span className="font-semibold">{state.customerName}</span> redeemed{' '}
            <span className="font-bold">
              {state.rewardsRedeemed} reward{state.rewardsRedeemed > 1 ? 's' : ''}
            </span>{' '}
            worth{' '}
            <span className="font-bold">
              {symbol}{Number(state.valueRedeemed).toLocaleString()}
            </span>
          </p>
          <p className="text-xs text-emerald-600">
            New balance: <span className="font-semibold">{state.balanceAfter.toLocaleString()} pts</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleDone}
          className="w-full bg-[#0DC56A] text-white font-bold text-base py-3.5 rounded-xl hover:bg-[#0aad5b] transition-colors"
        >
          Done ✓
        </button>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div className="px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center space-y-3">
          <p className="text-3xl">⚠️</p>
          <p className="font-bold text-red-800">Redemption failed</p>
          <p className="text-sm text-red-600">{state.message}</p>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="w-full bg-gray-100 text-gray-700 font-semibold text-base py-3.5 rounded-xl hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  // ── Submitting ───────────────────────────────────────────────────────────────
  if (state.status === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-8 h-8 border-2 border-[#0DC56A] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Applying reward…</p>
      </div>
    );
  }

  // ── Ready / Confirming ───────────────────────────────────────────────────────
  const customer = state.status === 'ready' ? state.customer : state.customer;
  const maxRewards = state.status === 'ready' ? state.maxRewards : selectedRewards;
  const isConfirming = state.status === 'confirming';

  const totalValue = selectedRewards * rewardValue;
  const pointsToDeduct = selectedRewards * threshold;

  return (
    <div className="px-4 py-6 space-y-5">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        ← Back
      </button>

      {/* Customer header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-400 mb-1">Customer</p>
        <p className="text-lg font-bold text-gray-900">{customer.fullName}</p>
        <p className="text-sm text-gray-500">
          Balance: <span className="font-semibold text-[#0DC56A]">{customer.pointsBalance.toLocaleString()} pts</span>
        </p>
      </div>

      {/* Reward selector */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
          How many rewards?
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              const current = Number.isFinite(selectedRewards) ? selectedRewards : 1;
              const next = Math.max(1, current - 1);
              setSelectedRewards(next);
              setState({ status: 'ready', customer, maxRewards });
            }}
            disabled={selectedRewards <= 1}
            className="w-10 h-10 rounded-xl border border-gray-200 text-lg font-bold text-gray-700 hover:border-emerald-300 disabled:opacity-30"
          >
            −
          </button>
          <span className="text-4xl font-bold text-gray-900 w-12 text-center">
            {Number.isFinite(selectedRewards) ? selectedRewards : 1}
          </span>
          <button
            type="button"
            onClick={() => {
              const current = Number.isFinite(selectedRewards) ? selectedRewards : 1;
              const safeMax = Number.isFinite(maxRewards) ? maxRewards : current;
              const next = Math.min(safeMax, current + 1);
              setSelectedRewards(next);
              setState({ status: 'ready', customer, maxRewards });
            }}
            disabled={selectedRewards >= maxRewards}
            className="w-10 h-10 rounded-xl border border-gray-200 text-lg font-bold text-gray-700 hover:border-emerald-300 disabled:opacity-30"
          >
            +
          </button>
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
          <p className="text-sm font-bold text-emerald-800">
            {symbol}{totalValue.toLocaleString()} value
          </p>
          <p className="text-xs text-emerald-600">
            {pointsToDeduct.toLocaleString()} pts will be deducted
          </p>
        </div>
      </div>

      {/* Confirm section */}
      {!isConfirming ? (
        <button
          type="button"
          onClick={() => handleSelectRewards(selectedRewards)}
          className="w-full bg-emerald-600 text-white font-bold text-base py-3.5 rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Apply {selectedRewards} Reward{selectedRewards > 1 ? 's' : ''} 🎁
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="text-sm font-bold text-amber-800">Confirm redemption?</p>
            <p className="text-xs text-amber-600 mt-0.5">
              This will deduct {pointsToDeduct.toLocaleString()} points from{' '}
              {customer.fullName.split(' ')[0]}'s account
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setState({ status: 'ready', customer, maxRewards })}
              className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3.5 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Confirm ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
