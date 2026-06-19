'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { CashierProvider, useCashier } from '../context/cashier-context';
import { cashierApi } from '@/lib/api';
import { getPendingCount } from '@/lib/offline-queue';
import { offlineSyncService } from '@/lib/offline-sync';

type SyncStatus = 'idle' | 'syncing' | 'complete' | 'partial';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!)) as { exp?: number };
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

function CashierGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('cashier_token');
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('cashier_token');
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('t');
      const loginUrl = slug ? `/cashier/login?t=${slug}` : '/cashier/login';
      router.replace(loginUrl);
    }
  }, [router]);

  return <>{children}</>;
}

function OnlineIndicator() {
  const { isOnline } = useCashier();

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        isOnline ? 'bg-[#0DC56A] text-white' : 'bg-red-500 text-white'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}

function SyncBar() {
  const { refreshOfflineCount, offlineQueueCount, isOnline: online, syncCustomers } = useCashier();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncCounts, setSyncCounts] = useState({ synced: 0, failed: 0 });
  const prevOnlineRef = useRef<boolean | null>(null);

  const runSync = useCallback(async () => {
    const pendingCount = await getPendingCount();
    if (pendingCount === 0) return;
    setSyncStatus('syncing');
    const result = await offlineSyncService.sync(cashierApi);
    setSyncCounts(result);
    setSyncStatus(result.failed > 0 ? 'partial' : 'complete');
    if (result.failed === 0) setTimeout(() => setSyncStatus('idle'), 3000);
    refreshOfflineCount();
    // Refresh customer cache AFTER transactions are posted so points are up to date
    await syncCustomers();
  }, [refreshOfflineCount, syncCustomers]);

  // Trigger sync whenever isOnline flips from false → true (server came back)
  useEffect(() => {
    const wasOffline = prevOnlineRef.current === false;
    prevOnlineRef.current = online;
    if (online && wasOffline) {
      void runSync();
    }
  }, [online, runSync]);

  const pending = offlineQueueCount;

  if (syncStatus === 'idle' && pending === 0 && online) {
    return (
      <div className="bg-[#0DC56A] px-4 py-2 text-xs font-medium text-white text-center">
        Online · 0 transactions pending sync
      </div>
    );
  }

  if (!online || pending > 0) {
    return (
      <div className="bg-amber-500 px-4 py-2 text-xs font-medium text-white text-center">
        {online ? `${pending} transaction${pending !== 1 ? 's' : ''} pending sync` : `Offline · ${pending} queued — will sync when connected`}
      </div>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <div className="bg-blue-500 px-4 py-2 text-xs font-medium text-white text-center animate-pulse">
        Syncing transactions…
      </div>
    );
  }

  if (syncStatus === 'complete') {
    return (
      <div className="bg-[#0DC56A] px-4 py-2 text-xs font-medium text-white text-center">
        {syncCounts.synced} transaction{syncCounts.synced !== 1 ? 's' : ''} synced ✓
      </div>
    );
  }

  if (syncStatus === 'partial') {
    return (
      <div
        className="bg-red-500 px-4 py-2 text-xs font-medium text-white text-center cursor-pointer"
        onClick={() => void runSync()}
      >
        {syncCounts.synced} synced, {syncCounts.failed} failed — tap to retry
      </div>
    );
  }

  return null;
}

function BottomNav() {
  const pathname = usePathname();
  const { tenantSlug } = useCashier();

  const isLookup =
    pathname === '/cashier' ||
    pathname === '/cashier/transaction' ||
    pathname === '/cashier/confirmation';

  const registerHref = tenantSlug ? `/register/${tenantSlug}` : '#';

  function handleLogout() {
    localStorage.removeItem('cashier_token');
    const loginUrl = tenantSlug
      ? `/cashier/login?t=${tenantSlug}`
      : '/cashier/login';
    window.location.href = loginUrl;
  }

  return (
    <nav className="border-t border-gray-200 bg-white grid grid-cols-3">
      <Link
        href="/cashier"
        className={`flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors ${
          isLookup ? 'text-[#0DC56A]' : 'text-gray-400'
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        Lookup
      </Link>
      <a
        href={registerHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center gap-1 py-3 text-[11px] font-semibold text-gray-400 hover:text-[#0DC56A] transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        Register
      </a>
      <button
        type="button"
        onClick={handleLogout}
        className="flex flex-col items-center gap-1 py-3 text-[11px] font-semibold text-gray-400 hover:text-red-500 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Log Out
      </button>
    </nav>
  );
}

function CashierShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { tenant } = useCashier();

  const showBack =
    pathname === '/cashier/transaction' ||
    pathname === '/cashier/confirmation';

  return (
    /* Outer: centres the app on desktop, fills screen on mobile */
    <div className="min-h-screen bg-gray-100 flex items-center justify-center sm:py-6">
      <div className="w-full sm:max-w-sm sm:rounded-3xl sm:shadow-2xl overflow-hidden flex flex-col min-h-screen sm:min-h-0 sm:h-auto bg-white">

        {/* Header bar */}
        <div className="bg-[#0A1628] px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {showBack ? (
              <button
                onClick={() => router.back()}
                className="text-white/70 hover:text-white transition-colors p-0.5"
                aria-label="Go back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
              </button>
            ) : (
              <div className="w-5" />
            )}
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <div>
                <p className="text-white font-bold text-sm leading-tight">
                  {tenant?.businessName ?? 'Loading…'}
                </p>
                <p className="text-white/50 text-[10px] leading-tight">Cashier App</p>
              </div>
            </div>
          </div>
          <OnlineIndicator />
        </div>

        {/* Online/sync status bar */}
        <SyncBar />

        {/* Page content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </div>

        {/* Bottom navigation */}
        <BottomNav />

        {/* Footer */}
        <div className="bg-white border-t border-gray-100 py-2 text-center text-[10px] text-gray-400 shrink-0">
          Powered by <span className="font-semibold text-gray-500">PingLoyal</span>
        </div>
      </div>
    </div>
  );
}

export default function CashierAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CashierProvider>
      <CashierGuard>
        <CashierShell>{children}</CashierShell>
      </CashierGuard>
    </CashierProvider>
  );
}
