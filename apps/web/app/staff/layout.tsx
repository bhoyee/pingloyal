'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { QueryProvider } from '@/components/providers/QueryProvider';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!)) as { exp?: number };
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

function StaffGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onLoginPage = pathname === '/staff/login';

  useEffect(() => {
    if (onLoginPage) return;
    const token = localStorage.getItem('staff_access_token');
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('staff_access_token');
      localStorage.removeItem('staff_refresh_token');
      router.replace('/staff/login');
    }
  }, [router, onLoginPage]);

  return <>{children}</>;
}

function TopBar() {
  const pathname = usePathname();
  if (pathname === '/staff/login') return null;

  function handleLogout() {
    localStorage.removeItem('staff_access_token');
    localStorage.removeItem('staff_refresh_token');
    window.location.href = '/staff/login';
  }

  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-[#0A1628] px-4 py-3 sm:px-6">
      <span className="text-sm font-bold text-white">PingLoyal Staff</span>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
      >
        Log out
      </button>
    </div>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <StaffGuard>
        <div className="min-h-screen bg-slate-50">
          <TopBar />
          {children}
        </div>
      </StaffGuard>
    </QueryProvider>
  );
}
