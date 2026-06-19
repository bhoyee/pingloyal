'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ConfirmationData {
  transactionId: string;
  customerName: string;
  pointsEarned: number;
  newBalance: number;
  progressPercent: number;
  threshold: number;
  tier: string | null;
  waVerificationStatus: string;
  amount: string;
  categoryName: string | null;
  currency: string;
  queued: boolean;
}

const DISMISS_SECS = 8;

export default function ConfirmationScreen({
  data,
}: {
  data: ConfirmationData;
}) {
  const router = useRouter();
  const [secsLeft, setSecsLeft] = useState(DISMISS_SECS);
  const dismissed = useRef(false);

  const symbol = data.currency === 'GBP' ? '£' : '₦';
  const queued = data.queued;

  function dismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    sessionStorage.removeItem('cashier_selected_customer');
    sessionStorage.removeItem('cashier_last_transaction');
    router.replace('/cashier');
  }

  // Countdown ticker — pure decrement only, no side effects in updater
  useEffect(() => {
    const id = setInterval(() => {
      setSecsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Navigate when countdown hits zero
  useEffect(() => {
    if (secsLeft === 0) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secsLeft]);

  const subtitle = [
    data.customerName,
    data.categoryName,
    data.amount ? `${symbol}${parseFloat(data.amount).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const bgClass = queued
    ? 'bg-gradient-to-b from-[#4a3800] to-[#2a2000]'
    : 'bg-gradient-to-b from-[#1a5c28] to-[#0a3318]';

  return (
    <div className={`min-h-screen ${bgClass} flex flex-col items-center justify-center px-5 py-8 text-white select-none`}>

      {/* Icon */}
      <div
        className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-5"
        style={{ animation: 'pop-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
      >
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${queued ? 'bg-amber-500' : 'bg-[#0DC56A]'}`}>
          {queued ? (
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v10l4 2" /><circle cx="12" cy="12" r="10" />
            </svg>
          ) : (
            <svg viewBox="0 0 52 52" className="w-8 h-8" fill="none" stroke="white" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 27l10 10 18-20" />
            </svg>
          )}
        </div>
      </div>

      <p className="text-lg font-semibold text-white/90 mb-1">
        {queued ? 'Transaction Queued' : 'Points Added!'}
      </p>

      {/* Points number */}
      <p className={`font-black leading-none mb-2 ${queued ? 'text-amber-400' : 'text-[#0DC56A]'}`} style={{ fontSize: 72 }}>
        +{data.pointsEarned.toLocaleString()}
      </p>

      {/* Customer · Category · Amount */}
      <p className="text-sm text-white/60 mb-6 text-center">{subtitle}</p>

      {/* Balance card */}
      <div className="w-full max-w-xs bg-black/20 rounded-2xl px-5 py-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/70">{queued ? 'Est. new balance:' : 'New balance:'}</span>
          <span className="text-base font-bold text-white">
            {data.newBalance.toLocaleString()} pts
          </span>
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${queued ? 'bg-amber-400' : 'bg-[#0DC56A]'}`}
            style={{ width: `${data.progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-white/50 text-center">
          {data.progressPercent}% to {symbol}{data.threshold.toLocaleString()} reward
        </p>
      </div>

      {/* Offline notice or WhatsApp nudge */}
      {queued ? (
        <div className="w-full max-w-xs bg-black/20 rounded-2xl px-5 py-3 mb-6 flex items-center gap-2">
          <span className="text-base">📵</span>
          <span className="text-sm text-amber-300 font-medium">
            Saved offline — points will sync when signal returns
          </span>
        </div>
      ) : data.waVerificationStatus === 'verified' ? (
        <div className="w-full max-w-xs bg-black/20 rounded-2xl px-5 py-3 mb-6 flex items-center gap-2">
          <span className="text-base">💬</span>
          <span className="text-sm text-[#0DC56A] font-medium">
            WhatsApp nudge sent automatically ✓
          </span>
        </div>
      ) : <div className="mb-6" />}

      {/* Countdown */}
      <p className="text-xs text-white/40 mb-5">
        Auto-returning in {secsLeft} second{secsLeft !== 1 ? 's' : ''}…
      </p>

      {/* Button */}
      <button
        type="button"
        onClick={() => dismiss()}
        className="w-full max-w-xs bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/30 text-white font-bold text-base py-3.5 rounded-2xl transition-colors"
      >
        New Customer
      </button>

      <style>{`
        @keyframes pop-in {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
