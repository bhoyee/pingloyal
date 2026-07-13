'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { staffApi } from '@/lib/api';

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

const NAV = [
  {
    href: '/staff',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/staff/tenants',
    label: 'Tenants',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/staff/template-requests',
    label: 'Template Requests',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: '/staff/tickets',
    label: 'Tickets',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

function Sidebar() {
  const pathname = usePathname();

  const { data: templateCounts } = useQuery<{ pending: number; in_progress: number }>({
    queryKey: ['staff-template-counts'],
    queryFn: () => staffApi.get('/staff/template-requests/counts'),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const { data: ticketCounts } = useQuery<{ open: number; in_progress: number }>({
    queryKey: ['staff-ticket-counts'],
    queryFn: () => staffApi.get('/staff/tickets/counts'),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const pendingTemplates = templateCounts?.pending ?? 0;
  const openTickets = (ticketCounts?.open ?? 0) + (ticketCounts?.in_progress ?? 0);

  function handleLogout() {
    localStorage.removeItem('staff_access_token');
    localStorage.removeItem('staff_refresh_token');
    window.location.href = '/staff/login';
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-[#0A1628]">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
            <path d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" fill="none" />
            <path d="M7 11l2.5 2.5 5.5-5.5" stroke="#0DC56A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">PingLoyal</p>
          <p className="text-[10px] text-white/40 mt-0.5">Staff Portal</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const badge =
            item.href === '/staff/template-requests' && pendingTemplates > 0 ? pendingTemplates :
            item.href === '/staff/tickets' && openTickets > 0 ? openTickets :
            null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <span className={active ? 'text-[#0DC56A]' : ''}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {badge !== null && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </button>
      </div>
    </aside>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onLoginPage = pathname === '/staff/login';

  return (
    <QueryProvider>
      <StaffGuard>
        {onLoginPage ? (
          <div className="min-h-screen bg-slate-50">{children}</div>
        ) : (
          <div className="flex h-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        )}
      </StaffGuard>
    </QueryProvider>
  );
}
