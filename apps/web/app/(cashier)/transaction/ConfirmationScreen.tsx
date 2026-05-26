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
}

const DISMISS_MS = 3000;

export default function ConfirmationScreen({
  data,
}: {
  data: ConfirmationData;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(100);
  const dismissed = useRef(false);

  function dismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    sessionStorage.removeItem('cashier_selected_customer');
    sessionStorage.removeItem('cashier_last_transaction');
    router.replace('/cashier');
  }

  // Auto-dismiss after DISMISS_MS
  useEffect(() => {
    const timer = setTimeout(() => dismiss(), DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress bar depleting from 100→0
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, (1 - elapsed / DISMISS_MS) * 100);
      setProgress(remaining);
      if (remaining === 0) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      onClick={() => dismiss()}
      className="min-h-screen bg-gradient-to-b from-green-500 to-green-700 flex flex-col items-center justify-center px-6 text-white cursor-pointer select-none"
      aria-label="Confirmation screen — tap to dismiss"
    >
      {/* Animated checkmark */}
      <div
        className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6"
        style={{ animation: 'pop-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both' }}
      >
        <svg
          viewBox="0 0 52 52"
          className="w-12 h-12 stroke-white"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 27l9 9 16-18" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold mb-1">Points Added!</h1>
      <p className="text-white/80 text-sm mb-8">{data.customerName}</p>

      {/* Points earned */}
      <p
        className="font-bold text-white leading-none mb-2"
        style={{ fontSize: 64 }}
      >
        +{data.pointsEarned.toLocaleString()} pts
      </p>

      {/* New balance */}
      <p className="text-white/80 text-lg mb-8">
        {data.newBalance.toLocaleString()} pts total
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-2">
        <div className="flex justify-between text-xs text-white/70 mb-1">
          <span>{data.newBalance.toLocaleString()} pts</span>
          <span>{data.threshold.toLocaleString()} pts</span>
        </div>
        <div className="h-2 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full"
            style={{ width: `${data.progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-white/70 text-center mt-1">
          {data.progressPercent}% to next reward
        </p>
      </div>

      {/* WhatsApp status — only when verified */}
      {data.waVerificationStatus === 'verified' && (
        <p className="text-sm text-white/90 mt-4">
          💬 WhatsApp message queued ✓
        </p>
      )}

      {/* Auto-dismiss progress bar */}
      <div className="fixed bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-white/60 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      <style>{`
        @keyframes pop-in {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
