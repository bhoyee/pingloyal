'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CashierProvider } from './context/cashier-context';

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

export default function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CashierProvider>
      <CashierGuard>{children}</CashierGuard>
    </CashierProvider>
  );
}
