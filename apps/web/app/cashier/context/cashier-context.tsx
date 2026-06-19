'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { cashierApi, type TenantMe, type CustomerLookupResult } from '../../../lib/api';
import { getPendingCount, upsertCustomerCache } from '../../../lib/offline-queue';

const HEARTBEAT_INTERVAL_MS = 8_000; // ping every 8 seconds
const HEARTBEAT_TIMEOUT_MS  = 4_000; // treat as offline if no response in 4s

async function pingServer(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
  try {
    const token = localStorage.getItem('cashier_token') ?? '';
    const res = await fetch('/api/v1/tenants/me', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    // 2xx (success) or 401 (token issue) = NestJS itself responded = server is up
    // 502/503/504 = Next.js proxy couldn't reach NestJS = server is down
    return res.ok || res.status === 401;
  } catch {
    // Network error, abort (timeout), or connection refused = server is down
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface CashierContextValue {
  tenant: TenantMe | null;
  isLoading: boolean;
  isOnline: boolean;
  offlineQueueCount: number;
  tenantSlug: string | null;
  refreshOfflineCount: () => void;
  syncCustomers: () => Promise<void>;
}

const CashierContext = createContext<CashierContextValue>({
  tenant: null,
  isLoading: true,
  isOnline: true,
  offlineQueueCount: 0,
  tenantSlug: null,
  refreshOfflineCount: () => undefined,
  syncCustomers: async () => undefined,
});

export function CashierProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTenant = useCallback(async () => {
    if (!localStorage.getItem('cashier_token')) {
      setIsLoading(false);
      return;
    }
    try {
      const data = await cashierApi.get<TenantMe>('/tenants/me');
      setTenant(data);
      localStorage.setItem('cashier_tenant_slug', data.slug);
    } catch {
      // expired/invalid token — CashierGuard will redirect
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  // ── Server heartbeat ────────────────────────────────────────────────────────
  // navigator.onLine only detects device-level connectivity, not server reachability.
  // We ping the API every 20 s so the indicator reflects actual server availability.
  useEffect(() => {
    let mounted = true;

    async function check() {
      const reachable = await pingServer();
      if (mounted) setIsOnline(reachable);
    }

    void check(); // immediate check on mount

    heartbeatRef.current = setInterval(() => void check(), HEARTBEAT_INTERVAL_MS);

    // Also check immediately whenever device-level network events fire
    const handleOnline  = () => void check();
    const handleOffline = () => { if (mounted) setIsOnline(false); };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Customer cache sync ─────────────────────────────────────────────────────
  const syncCustomers = useCallback(async () => {
    if (!localStorage.getItem('cashier_token')) return;
    try {
      const customers = await cashierApi.get<CustomerLookupResult[]>('/customers/sync');
      await upsertCustomerCache(customers);
    } catch {
      /* server down or token expired — skip silently */
    }
  }, []);

  // Initial sync when app loads or server comes back online
  useEffect(() => {
    if (!isOnline) return;
    void syncCustomers();
  }, [isOnline, syncCustomers]);

  const refreshOfflineCount = useCallback(() => {
    getPendingCount()
      .then(setOfflineQueueCount)
      .catch(() => setOfflineQueueCount(0));
  }, []);

  useEffect(() => {
    refreshOfflineCount();
  }, [refreshOfflineCount]);

  const tenantSlug = tenant?.slug ?? null;

  return (
    <CashierContext.Provider
      value={{ tenant, isLoading, isOnline, offlineQueueCount, tenantSlug, refreshOfflineCount, syncCustomers }}
    >
      {children}
    </CashierContext.Provider>
  );
}

export function useCashier() {
  return useContext(CashierContext);
}
