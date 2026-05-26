'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { cashierApi, type TenantMe } from '../../../lib/api';

interface CashierContextValue {
  tenant: TenantMe | null;
  isLoading: boolean;
  offlineQueueCount: number;
  tenantSlug: string | null;
}

const CashierContext = createContext<CashierContextValue>({
  tenant: null,
  isLoading: true,
  offlineQueueCount: 0,
  tenantSlug: null,
});

export function CashierProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const loadTenant = useCallback(async () => {
    try {
      const data = await cashierApi.get<TenantMe>('/tenants/me');
      setTenant(data);
    } catch {
      // token invalid or network failure — layout will redirect
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  // Count pending offline items from localStorage
  useEffect(() => {
    function syncCount() {
      try {
        const queue = JSON.parse(
          localStorage.getItem('cashier_offline_queue') ?? '[]',
        ) as unknown[];
        setOfflineQueueCount(Array.isArray(queue) ? queue.length : 0);
      } catch {
        setOfflineQueueCount(0);
      }
    }
    syncCount();
    window.addEventListener('storage', syncCount);
    return () => window.removeEventListener('storage', syncCount);
  }, []);

  const tenantSlug = tenant?.slug ?? null;

  return (
    <CashierContext.Provider
      value={{ tenant, isLoading, offlineQueueCount, tenantSlug }}
    >
      {children}
    </CashierContext.Provider>
  );
}

export function useCashier() {
  return useContext(CashierContext);
}
