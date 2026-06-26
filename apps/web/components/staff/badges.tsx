export const STAFF_ROLE_BADGES: Record<string, { label: string; className: string }> = {
  super_admin: { label: 'Super Admin', className: 'bg-violet-100 text-violet-700' },
  support_agent: { label: 'Support Agent', className: 'bg-slate-100 text-slate-700' },
};

export const STAFF_STATUS_BADGES: Record<'active' | 'inactive', { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: 'Inactive', className: 'bg-red-100 text-red-700' },
};
