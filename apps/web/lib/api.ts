// Server components run in Node.js where relative URLs are not supported,
// so they call the API directly. Browser code uses '' (relative) which goes
// through the Next.js rewrite proxy → avoids CORS entirely.
export const API_BASE_URL =
  typeof window === 'undefined'
    ? (process.env.INTERNAL_API_URL ?? 'http://localhost:3333')
    : '';

const API_URL = API_BASE_URL;

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function publicGet<T>(path: string): Promise<T> {
  const normalizedPath = path.startsWith('/api/') ? path : `/api/v1${path}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Network error', 0);
  }
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const normalizedPath = path.startsWith('/api/') ? path : `/api/v1${path}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Network error — check your connection', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof data.message === 'string' ? data.message : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  if (!token) {
    window.location.href = '/login';
    throw new ApiError('No auth token', 401);
  }

  // Normalize: short paths like "/tenants/me" → "/api/v1/tenants/me"
  // Full paths already carrying "/api/v1/" are left untouched.
  const normalizedPath = path.startsWith('/api/') ? path : `/api/v1${path}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${normalizedPath}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('Network error — check your connection', 0);
  }

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof body.message === 'string' ? body.message : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function upload<T>(path: string, file: File): Promise<T> {
  const token = getToken();

  if (!token) {
    window.location.href = '/login';
    throw new ApiError('No auth token', 401);
  }

  const normalizedPath = path.startsWith('/api/') ? path : `/api/v1${path}`;
  const formData = new FormData();
  formData.append('file', file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${normalizedPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch {
    throw new ApiError('Network error — check your connection', 0);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof body.message === 'string' ? body.message : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
  upload: <T>(path: string, file: File) => upload<T>(path, file),
};

// ── Typed API helpers ──────────────────────────────────────────────────────────

export interface TenantMe {
  id: string;
  businessName: string;
  ownerName: string | null;
  slug: string;
  mode: string;
  planTier: string;
  currency: string;
  timezone: string;
  pointsEarnRate: number;
  pointsThreshold: number;
  rewardValue: number;
  lapsedDays: number;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  logoUrl: string | null;
  qrCodeUrl: string | null;
  marketingWalletBalance: number;
  whatsapp: {
    isConnected: boolean;
    verificationStatus: string;
    displayName: string | null;
    phoneNumber: string | null;
    category: string | null;
    verifiedAt: string | null;
  };
}

export interface WaStatus {
  isConnected: boolean;
  verificationStatus: string;
  displayName: string | null;
  phoneNumber: string | null;
  category: string | null;
  verifiedAt: string | null;
}

export interface QrCodeResult {
  qrCodeUrl: string;
  registrationUrl: string;
}

export interface TenantInfo {
  businessName: string;
  logoUrl: string | null;
  qrCodeUrl: string | null;
  currency: string;
  pointsThreshold: number;
  rewardValue: number;
  waVerificationStatus: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface TransactionResult {
  id: string;
  amount: string;
  pointsEarned: number;
  alreadyProcessed: boolean;
  customer: {
    id: string;
    fullName: string;
    pointsBalance: number;
    progressPercent: number;
    tier: string | null;
  };
  createdAt: string;
}

export interface CustomerLookupResult {
  id: string;
  fullName: string;
  phoneE164: string;
  pointsBalance: number;
  tierId: string | null;
  tier: string | null;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  progressPercent: number;
}

// ── Campaign types ─────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

export interface SegmentRules {
  tierIds?: string[];
  categoryIds?: string[];
  minPoints?: number;
  activityStatus?: 'all' | 'active' | 'inactive';
}

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  messageBody: string;
  segmentRules: SegmentRules;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStats {
  id: string;
  name: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number;
  estimatedCost: number;
  createdAt: string;
  scheduledAt: string | null;
  sentAt: string | null;
}

export interface AudiencePreview {
  count: number;
  sampleNames: string[];
}

export interface CampaignTemplate {
  id: string;
  name: string;
  body: string;
}

export interface CampaignLogRow {
  customerId: string;
  customerName: string;
  status: string;
  waMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
}

export interface TierConfig {
  id: string;
  tierName: string;
  tierLabel: string;
  minQuarterlySpend: number;
  maxQuarterlySpend: number | null;
  displayOrder: number;
}

// ── Cashier API (uses cashier_token, redirects to /cashier/login on 401) ──────

function getCashierToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cashier_token');
}

// Cashier login is store-specific (?t=<slug> shows that store's branding).
// We persist the slug separately from the token so an expired/missing
// session still redirects back to the right store, not the bare login page.
function cashierLoginUrl(): string {
  const slug = typeof window === 'undefined' ? null : localStorage.getItem('cashier_tenant_slug');
  return slug ? `/cashier/login?t=${slug}` : '/cashier/login';
}

async function cashierRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getCashierToken();

  if (!token) {
    window.location.href = cashierLoginUrl();
    throw new ApiError('No auth token', 401);
  }

  // Cashier paths like "/tenants/me" need the global prefix the regular
  // api client paths already carry. Add it if absent.
  const normalizedPath = path.startsWith('/api/') ? path : `/api/v1${path}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${normalizedPath}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('Network error — check your connection', 0);
  }

  if (res.status === 401) {
    localStorage.removeItem('cashier_token');
    window.location.href = cashierLoginUrl();
    throw new ApiError('Session expired', 401);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? (body.message as string[]).join('; ')
          : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const cashierApi = {
  get: <T>(path: string) => cashierRequest<T>(path),
  post: <T>(path: string, body: unknown) =>
    cashierRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
