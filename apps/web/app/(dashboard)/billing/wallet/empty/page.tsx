'use client';
import { useRouter } from 'next/navigation';

const PAUSED = [
  { icon: '🎂', label: 'Birthday messages' },
  { icon: '👻', label: 'Lapsed win-backs' },
  { icon: '📣', label: 'Campaign broadcasts' },
];

const RUNNING = [
  { icon: '🛍️', label: 'Purchase confirmations' },
  { icon: '👋', label: 'Welcome messages' },
  { icon: '🎊', label: 'Reward notifications' },
  { icon: '🔥', label: 'Threshold nudges' },
  { icon: '🤖', label: 'Self-service bot replies' },
];

export default function WalletEmptyPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      {/* Hero */}
      <div className="mb-8 text-center">
        <p className="text-6xl">👛</p>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          Marketing Wallet is Empty
        </h1>
        <p className="mx-auto mt-3 max-w-md text-slate-600">
          Birthday messages, lapsed win-backs, and campaign broadcasts have been
          paused. Top up your wallet to resume them instantly.
        </p>
        <button
          onClick={() => router.push('/billing/wallet/topup')}
          className="mt-6 rounded-xl bg-green-600 px-8 py-3 text-base font-bold text-white hover:bg-green-700"
          data-testid="empty-topup-btn"
        >
          + Top Up Wallet Now →
        </button>
      </div>

      {/* Paused vs Running split */}
      <div
        className="grid w-full max-w-2xl gap-4 sm:grid-cols-2"
        data-testid="paused-running-split"
      >
        {/* Paused */}
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-red-500">
            ⏸️ Paused (wallet empty)
          </p>
          <ul className="space-y-2" data-testid="paused-list">
            {PAUSED.map(({ icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm text-red-700">
                <span>{icon}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-red-400">
            Queued — will send when wallet is topped up
          </p>
        </div>

        {/* Still running */}
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-green-600">
            ✅ Still Running (covered by plan)
          </p>
          <ul className="space-y-2" data-testid="running-list">
            {RUNNING.map(({ icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm text-green-700">
                <span>{icon}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
