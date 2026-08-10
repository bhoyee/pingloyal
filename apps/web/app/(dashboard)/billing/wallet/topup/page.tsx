'use client';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface WalletBalance {
  balance: number;
  ratePerMessage: number;
  estimatedMessagesLeft: number;
  isLow: boolean;
  isEmpty: boolean;
}

interface TopupResponse {
  authorizationUrl: string;
  reference: string;
  amount: number;
  amountDisplay: string;
}

const QUICK_AMOUNTS = [5000, 15000, 30000, 50000];

function formatWithCommas(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function TopupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rawAmount, setRawAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [pollingBalance, setPollingBalance] = useState(false);

  const { data: wallet, refetch: refetchBalance } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: () => api.get<WalletBalance>('/api/v1/billing/wallet/balance'),
    staleTime: 30_000,
  });

  const parsedAmount = parseInt(rawAmount.replace(/,/g, ''), 10) || 0;
  const rate = wallet?.ratePerMessage ?? 130;
  const estimatedMsgs = parsedAmount > 0 ? Math.floor(parsedAmount / rate) : 0;
  const isValid = parsedAmount >= 1000 && Number.isInteger(parsedAmount);

  // Detect ?topup=success return from Paystack
  const returnedFromPaystack = searchParams.get('topup') === 'success';

  const startPolling = useCallback(() => {
    const prevBalance = wallet?.balance ?? 0;
    let attempts = 0;
    setPollingBalance(true);
    const interval = setInterval(() => {
      attempts++;
      void refetchBalance().then((res) => {
        const newBal = (res.data as WalletBalance | undefined)?.balance ?? 0;
        if (newBal > prevBalance) {
          clearInterval(interval);
          setPollingBalance(false);
          setSuccessMsg(`✅ ₦${(newBal - prevBalance).toLocaleString()} added to your wallet`);
          setTimeout(() => router.push('/billing/wallet'), 2000);
        }
        if (attempts >= 10) {
          clearInterval(interval);
          setPollingBalance(false);
        }
      });
    }, 3000);
  }, [wallet?.balance, refetchBalance, router]);

  useEffect(() => {
    if (returnedFromPaystack) {
      setSuccessMsg('Payment received! Your wallet will be credited shortly.');
      startPolling();
    }
  }, [returnedFromPaystack, startPolling]);

  async function handlePay() {
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<TopupResponse>('/api/v1/billing/wallet/topup', {
        amount: parsedAmount,
      });
      window.location.href = res.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment initiation failed. Try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-xl">
          <button
            onClick={() => router.push('/billing/wallet')}
            className="mb-1 text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back to Wallet
          </button>
          <h1 className="text-xl font-bold text-slate-900">Top Up Wallet</h1>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        {/* Success message */}
        {successMsg && (
          <div
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
            data-testid="success-msg"
          >
            {successMsg}
          </div>
        )}

        {pollingBalance && (
          <p className="text-center text-xs text-slate-400">Checking for payment confirmation…</p>
        )}

        {/* Current balance card */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs text-slate-400">Current balance</p>
            <p className="text-xl font-bold text-slate-900">
              ₦{(wallet?.balance ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Plan rate</p>
            <p className="text-sm font-semibold text-slate-700">
              ₦{rate}/message
            </p>
          </div>
        </div>

        {/* Quick amount buttons */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quick amounts
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => setRawAmount(formatWithCommas(String(amt)))}
                className={`rounded-xl border px-3 py-3 text-center text-sm transition-colors ${
                  parsedAmount === amt
                    ? 'border-[#0F1E35] bg-[#0F1E35] text-white'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-[#0F1E35]'
                }`}
                data-testid={`quick-${amt}`}
              >
                <p className="font-bold">₦{amt.toLocaleString()}</p>
                <p className="mt-0.5 text-xs opacity-70">
                  ≈ {Math.floor(amt / rate)} messages
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount input */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Or enter custom amount
          </label>
          <div className="flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-[#0F1E35] focus-within:ring-1 focus-within:ring-[#0F1E35]">
            <span className="pl-4 text-lg font-semibold text-slate-500">₦</span>
            <input
              type="text"
              inputMode="numeric"
              value={rawAmount}
              onChange={(e) => {
                const formatted = formatWithCommas(e.target.value);
                setRawAmount(formatted);
              }}
              placeholder="1,000"
              className="flex-1 bg-transparent px-2 py-3 text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
              data-testid="amount-input"
            />
          </div>
          {parsedAmount > 0 && parsedAmount < 1000 && (
            <p className="mt-1 text-xs text-red-500">Minimum top-up is ₦1,000</p>
          )}
        </div>

        {/* Live preview */}
        {parsedAmount >= 1000 && (
          <div
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            data-testid="preview-panel"
          >
            <p className="text-sm font-semibold text-slate-700">
              ≈{' '}
              <span data-testid="preview-messages" className="text-green-600">
                {estimatedMsgs}
              </span>{' '}
              Marketing messages
            </p>
            <p className="text-xs text-slate-400">at your ₦{rate}/msg rate</p>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Current balance</span>
                <span>₦{(wallet?.balance ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Top-up amount</span>
                <span>+₦{parsedAmount.toLocaleString()}</span>
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-green-700">
                <span>New balance</span>
                <span data-testid="new-balance">
                  ₦{((wallet?.balance ?? 0) + parsedAmount).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Pay button */}
        {error && (
          <p className="text-sm text-red-600" data-testid="pay-error">{error}</p>
        )}
        <button
          onClick={handlePay}
          disabled={!isValid || loading}
          className="w-full rounded-xl bg-green-600 py-4 text-base font-bold text-white disabled:opacity-40 hover:bg-green-700"
          data-testid="pay-btn"
        >
          {loading
            ? 'Redirecting to Paystack…'
            : `Pay ₦${parsedAmount > 0 ? parsedAmount.toLocaleString() : '—'} via Paystack →`}
        </button>

        <p className="text-center text-xs text-slate-400">
          Secured by Paystack · Instant credit · No expiry on wallet balance
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><TopupPage /></Suspense>;
}
