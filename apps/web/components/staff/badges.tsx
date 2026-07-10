export const STAFF_ROLE_BADGES: Record<string, { label: string; className: string }> = {
  super_admin: { label: 'Super Admin', className: 'bg-violet-100 text-violet-700' },
  support_agent: { label: 'Support Agent', className: 'bg-slate-100 text-slate-700' },
};

export const STAFF_STATUS_BADGES: Record<'active' | 'inactive', { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: 'Inactive', className: 'bg-red-100 text-red-700' },
};

export const SUBSCRIPTION_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  trialing: { label: 'Trialing', className: 'bg-amber-100 text-amber-700' },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  past_due: { label: 'Past Due', className: 'bg-orange-100 text-orange-700' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-700' },
};

export const TENANT_STATUS_BADGES: Record<'active' | 'deleted', { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  deleted: { label: 'Deleted', className: 'bg-red-100 text-red-700' },
};

export const TEMPLATE_REQUEST_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
};
