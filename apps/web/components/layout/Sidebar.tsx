'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Zap,
  Bot,
  FileText,
  BarChart3,
  Monitor,
  QrCode,
  Settings as SettingsIcon,
  Plug,
  Wallet,
  CreditCard,
  UserCircle,
  LogOut,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, type TenantMe } from '@/lib/api';

interface SidebarSummary {
  totalCustomers: number;
  walletBalance: number;
}

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: 'customers' | 'wallet';
  external?: boolean;
}

const OVERVIEW: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/customers', icon: Users, label: 'Customers', badge: 'customers' },
];

const AUTOMATION: NavItem[] = [
  { href: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/triggers', icon: Zap, label: 'Triggers' },
  { href: '/wa-bot', icon: Bot, label: 'WA Bot' },
  { href: '/templates', icon: FileText, label: 'Templates' },
  { href: '/reports', icon: BarChart3, label: 'Reports' },
];

const NATIVE_MODE: NavItem[] = [
  { href: '/cashier', icon: Monitor, label: 'Cashier App', external: true },
  { href: '/qr-registration', icon: QrCode, label: 'QR Registration' },
];

const SETTINGS: NavItem[] = [
  { href: '/settings', icon: SettingsIcon, label: 'Settings' },
  { href: '/settings/integrations', icon: Plug, label: 'Integration' },
  { href: '/billing/wallet', icon: Wallet, label: 'Wallet', badge: 'wallet' },
  { href: '/billing', icon: CreditCard, label: 'Billing' },
];

function formatCompactNaira(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1_000) return `₦${Math.round(amount / 1_000)}k`;
  return `₦${amount}`;
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  const { data: tenant } = useQuery<TenantMe>({
    queryKey: ['tenant-me'],
    queryFn: () => api.get<TenantMe>('/api/v1/tenants/me'),
  });

  const { data: summary } = useQuery<SidebarSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<SidebarSummary>('/api/v1/dashboard/summary'),
  });

  const activeHref = [...OVERVIEW, ...AUTOMATION, ...NATIVE_MODE, ...SETTINGS]
    .filter((item) => !item.external)
    .filter((item) =>
      item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  function isActive(href: string) {
    return href === activeHref;
  }

  function badgeValue(badge: NavItem['badge']): string | undefined {
    if (badge === 'customers' && summary) return String(summary.totalCustomers);
    if (badge === 'wallet' && summary) return formatCompactNaira(summary.walletBalance);
    return undefined;
  }

  function renderSection(title: string, items: NavItem[]) {
    return (
      <div>
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const badge = badgeValue(item.badge);
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Icon size={17} />
                  {item.label}
                  <span className="ml-auto text-xs text-slate-500">↗</span>
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-[#0DC56A] text-[#0A1628]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {item.label}
                {badge && (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive(item.href)
                        ? 'bg-[#0A1628]/20 text-[#0A1628]'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 max-w-[80vw] flex-col bg-[#0A1628] transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0DC56A]/15">
                <svg width="16" height="16" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path
                    d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path
                    d="M7 11l2.5 2.5 5.5-5.5"
                    stroke="#0DC56A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-bold text-white"
                  title={tenant?.businessName}
                >
                  {tenant?.businessName ?? 'PingLoyal'}
                </p>
                <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#0DC56A]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0DC56A]">
                  PingLoyal
                </span>
              </div>
            </div>
            {/* Close button — mobile only */}
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          {tenant && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  tenant.mode === 'connected' ? 'bg-blue-400' : 'bg-[#0DC56A]'
                }`}
              />
              Mode{' '}
              <span className="font-semibold text-white">
                {tenant.mode === 'connected' ? 'Connected' : 'Native'}
              </span>
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {renderSection('Overview', OVERVIEW)}
          {renderSection('Automation Engine', AUTOMATION)}
          {tenant?.mode !== 'connected' && renderSection('Native Mode', NATIVE_MODE)}
          {renderSection('Settings', SETTINGS)}
        </nav>

        {/* Profile + Sign out */}
        <div className="border-t border-white/10 p-3 space-y-0.5">
          <Link
            href="/profile"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith('/profile')
                ? 'bg-[#0DC56A] text-[#0A1628]'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <UserCircle size={17} />
            Profile
          </Link>
          <button
            onClick={() => {
              localStorage.removeItem('access_token');
              localStorage.removeItem('refresh_token');
              window.location.href = '/login';
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
