'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { StaffSidebar } from '@/components/staff/StaffSidebar';

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

function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="text-sm font-bold text-[#0A1628]">PingLoyal Staff</span>
    </div>
  );
}

function StaffShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (pathname === '/staff/login') return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <StaffSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <MobileTopBar onOpenMenu={() => setMenuOpen(true)} />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <StaffGuard>
        <StaffShell>{children}</StaffShell>
      </StaffGuard>
    </QueryProvider>
  );
}
