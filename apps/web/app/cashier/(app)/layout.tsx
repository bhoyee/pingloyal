'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CashierProvider, useCashier } from '../context/cashier-context';
import { cashierApi } from '@/lib/api';
import { getPendingCount } from '@/lib/offline-queue';
import { offlineSyncService } from '@/lib/offline-sync';

type SyncStatus = 'idle' | 'syncing' | 'complete' | 'partial';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!)) as {
      exp?: number;
    };
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

function SyncBanner() {
  const { refreshOfflineCount } = useCashier();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncCounts, setSyncCounts] = useState({ synced: 0, failed: 0 });

  const runSync = useCallback(async () => {
    const pendingCount = await getPendingCount();
    if (pendingCount === 0) return;

    setSyncStatus('syncing');
    const result = await offlineSyncService.sync(cashierApi);
    setSyncCounts(result);

    if (result.failed > 0) {
      setSyncStatus('partial');
    } else {
      setSyncStatus('complete');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }

    refreshOfflineCount();
  }, [refreshOfflineCount]);

  useEffect(() => {
    const handleOnline = () => {
      void runSync();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [runSync]);

  if (syncStatus === 'idle') return null;

  return (
    <div
      aria-live="polite"
      className={`px-4 py-2 text-xs text-center ${
        syncStatus === 'syncing'
          ? 'bg-amber-50 text-amber-800 border-b border-amber-200'
          : syncStatus === 'complete'
            ? 'bg-green-50 text-green-800 border-b border-green-200'
            : 'bg-red-50 text-red-800 border-b border-red-200 cursor-pointer'
      }`}
      onClick={syncStatus === 'partial' ? () => void runSync() : undefined}
    >
      {syncStatus === 'syncing' && (
        <span className="animate-pulse">Syncing transactions…</span>
      )}
      {syncStatus === 'complete' && (
        <span>
          {syncCounts.synced} transaction{syncCounts.synced !== 1 ? 's' : ''}{' '}
          synced ✓
        </span>
      )}
      {syncStatus === 'partial' && (
        <span>
          {syncCounts.synced} synced, {syncCounts.failed} failed — tap to retry
        </span>
      )}
    </div>
  );
}

function CashierGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('cashier_token');
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('cashier_token');
      router.replace('/cashier/login');
    }
  }, [router]);

  return <>{children}</>;
}

export default function CashierAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CashierProvider>
      <CashierGuard>
        <SyncBanner />
        {children}
      </CashierGuard>
    </CashierProvider>
  );
}
