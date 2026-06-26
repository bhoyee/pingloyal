'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, LifeBuoy, Building2, FileText, LogOut, X } from 'lucide-react';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/staff', icon: LayoutDashboard, label: 'Overview' },
  { href: '/staff/tenants', icon: Building2, label: 'Tenants' },
  { href: '/staff/template-requests', icon: FileText, label: 'Template Requests' },
  { href: '/staff/team', icon: Users, label: 'Team', superAdminOnly: true },
  { href: '/staff/tickets', icon: LifeBuoy, label: 'Tickets' },
];

interface StaffSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function StaffSidebar({ open = false, onClose }: StaffSidebarProps) {
  const pathname = usePathname();
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    setStaffRole(localStorage.getItem('staff_role'));
    setFullName(localStorage.getItem('staff_full_name'));
  }, []);

  const items = NAV_ITEMS.filter((item) => !item.superAdminOnly || staffRole === 'super_admin');

  function isActive(href: string) {
    return href === '/staff' ? pathname === '/staff' : pathname.startsWith(href);
  }

  function handleLogout() {
    localStorage.removeItem('staff_access_token');
    localStorage.removeItem('staff_refresh_token');
    localStorage.removeItem('staff_role');
    localStorage.removeItem('staff_full_name');
    window.location.href = '/staff/login';
  }

  return (
    <>
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
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {fullName ?? 'PingLoyal Staff'}
              </p>
              <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-[#0DC56A]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0DC56A]">
                {staffRole === 'super_admin' ? 'Super Admin' : staffRole === 'support_agent' ? 'Support Agent' : 'Staff'}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {items.map((item) => {
            const Icon = item.icon;
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
              </Link>
            );
          })}
        </nav>

        <div className="p-3">
          <button
            onClick={handleLogout}
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
