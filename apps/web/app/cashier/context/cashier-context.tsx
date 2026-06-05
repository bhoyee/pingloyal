'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { cashierApi, type TenantMe } from '../../../lib/api';
import { getPendingCount } from '../../../lib/offline-queue';

interface CashierContextValue {
  tenant: TenantMe | null;
  isLoading: boolean;
  offlineQueueCount: number;
  tenantSlug: string | null;
  refreshOfflineCount: () => void;
}

const CashierContext = createContext<CashierContextValue>({
  tenant: null,
  isLoading: true,
  offlineQueueCount: 0,
  tenantSlug: null,
  refreshOfflineCount: () => undefined,
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
      value={{ tenant, isLoading, offlineQueueCount, tenantSlug, refreshOfflineCount }}
    >
      {children}
    </CashierContext.Provider>
  );
}

export function useCashier() {
  return useContext(CashierContext);
}
