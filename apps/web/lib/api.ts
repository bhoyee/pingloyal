export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

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
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  if (!token) {
    window.location.href = '/login';
    throw new ApiError('No auth token', 401);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
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

export const api = {
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
};

// ── Typed API helpers ──────────────────────────────────────────────────────────

export interface TenantMe {
  id: string;
  businessName: string;
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

// ── Cashier API (uses cashier_token, redirects to /cashier/login on 401) ──────

function getCashierToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cashier_token');
}

async function cashierRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getCashierToken();

  if (!token) {
    window.location.href = '/cashier/login';
    throw new ApiError('No auth token', 401);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
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
    window.location.href = '/cashier/login';
    throw new ApiError('Session expired', 401);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg =
      typeof body.message === 'string' ? body.message : `HTTP ${res.status}`;
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
