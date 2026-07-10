import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { maskPhone } from '@pingloyal/utils';
import type {
  CustomerDetail,
  CustomerTransactionRow,
  RedemptionRow,
  TriggerLogSummary,
} from '../app/(dashboard)/customers/[id]/page';
import type { TenantMe } from '../lib/api';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/api'),
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockPush = jest.fn();
let mockParamsId = 'cust-1';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: mockPush, replace: jest.fn() })),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: mockParamsId }),
}));

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => 'fake-access-token'),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  writable: true,
});

import { api, ApiError } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import CustomersPage from '../app/(dashboard)/customers/page';
import CustomerDetailPage from '../app/(dashboard)/customers/[id]/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_TENANT: TenantMe = {
  id: 'tenant-1',
  businessName: 'Test Store',
  ownerName: 'Owner',
  slug: 'test-store',
  mode: 'native',
  planTier: 'starter',
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  pointsEarnRate: 100,
  pointsThreshold: 1000,
  rewardValue: 500,
  lapsedDays: 60,
  subscriptionStatus: 'active',
  trialEndsAt: null,
  logoUrl: null,
  qrCodeUrl: null,
  marketingWalletBalance: 0,
  whatsapp: {
    isConnected: true,
    verificationStatus: 'verified',
    displayName: null,
    phoneNumber: null,
    category: null,
    verifiedAt: null,
  },
};

const BASE_CUSTOMER: CustomerDetail = {
  id: 'cust-1',
  fullName: 'Amaka Eze',
  phoneE164: '+2348012345678',
  pointsBalance: 400,
  lifetimePoints: 2400,
  totalSpend: 150000,
  purchaseCount: 12,
  lastPurchaseAt: new Date().toISOString(),
  waOptedIn: true,
  createdAt: new Date('2024-01-01').toISOString(),
  tier: { tierLabel: 'VIP' },
};

function makeTxRow(overrides: Partial<CustomerTransactionRow> = {}): CustomerTransactionRow {
  return {
    id: 'tx-1',
    amount: '5000',
    pointsEarned: 50,
    source: 'cashier_app',
    createdAt: new Date().toISOString(),
    categoryName: 'Groceries',
    cashierName: 'Chidi Eze',
    ...overrides,
  };
}

function makeRedemptionRow(overrides: Partial<RedemptionRow> = {}): RedemptionRow {
  return {
    id: 'red-1',
    customerId: 'cust-1',
    redeemedAt: new Date().toISOString(),
    pointsRedeemed: 1000,
    rewardsCount: 1,
    value: 500,
    balanceAfter: 200,
    cashierName: null,
    ...overrides,
  };
}

interface ApiMockOpts {
  customer?: CustomerDetail | (() => Promise<CustomerDetail>);
  tenant?: TenantMe;
  recentTx?: { data: CustomerTransactionRow[] };
  fullTransactions?: { data: CustomerTransactionRow[]; total: number };
  totalPointsRedeemed?: number;
  fullRedemptions?: { data: RedemptionRow[]; total: number };
  latestTriggerLogs?: TriggerLogSummary[];
  triggerCount?: { count: number };
}

function setupApiMock(opts: ApiMockOpts = {}) {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('/redemptions')) {
      if (path.includes('limit=1')) {
        return Promise.resolve({ totalPointsRedeemed: opts.totalPointsRedeemed ?? 0 });
      }
      return Promise.resolve(opts.fullRedemptions ?? { data: [], total: 0 });
    }
    if (path.includes('/trigger-logs/count')) {
      return Promise.resolve(opts.triggerCount ?? { count: 0 });
    }
    if (path.includes('/trigger-logs')) {
      return Promise.resolve(opts.latestTriggerLogs ?? []);
    }
    if (path.includes('/transactions')) {
      if (path.includes('limit=3')) return Promise.resolve(opts.recentTx ?? { data: [] });
      return Promise.resolve(opts.fullTransactions ?? { data: [], total: 0 });
    }
    if (path.includes('/tenants/me')) {
      return Promise.resolve(opts.tenant ?? BASE_TENANT);
    }
    if (/\/customers\/[^/?]+$/.test(path)) {
      const c = opts.customer ?? BASE_CUSTOMER;
      return typeof c === 'function' ? c() : Promise.resolve(c);
    }
    return Promise.resolve({});
  });
}

function renderDetail() {
  return render(<CustomerDetailPage />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParamsId = 'cust-1';
});

// ── T1: customer list rows clickable ──────────────────────────────────────────

describe('Customer list — row navigation', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  it('T1 — rows are clickable and navigate to /customers/[id]', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('tenants/me')) return Promise.resolve(BASE_TENANT);
      return Promise.resolve([
        {
          id: 'cust-1',
          fullName: 'Amaka Eze',
          phoneE164: '+2348012345678',
          pointsBalance: 400,
          totalSpend: 150000,
          purchaseCount: 12,
          lastPurchaseAt: new Date().toISOString(),
          waOptedIn: true,
          isActive: true,
          source: 'qr_registration',
          createdAt: new Date().toISOString(),
          tier: { tierLabel: 'VIP' },
        },
      ]);
    });

    render(<CustomersPage />, { wrapper });

    const nameCell = await screen.findByText('Amaka Eze');
    const row = nameCell.closest('tr');
    expect(row).toHaveClass('cursor-pointer');

    fireEvent.click(row!);

    expect(mockPush).toHaveBeenCalledWith('/customers/cust-1');
  });
});

// ── T2-T10: customer detail page ──────────────────────────────────────────────

describe('Customer detail page', () => {
  it('T2 — loads with correct name and masked phone', async () => {
    setupApiMock();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
    });

    expect(screen.getByText(maskPhone('+2348012345678'))).toBeInTheDocument();
  });

  it('T3 — points progress bar shows correct percentage', async () => {
    setupApiMock({
      customer: { ...BASE_CUSTOMER, pointsBalance: 400 },
      tenant: { ...BASE_TENANT, pointsThreshold: 1000 },
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('progress-label')).toHaveTextContent('(40%)');
    });
    expect(screen.getByTestId('progress-bar-fill')).toHaveStyle({ width: '40%' });
  });

  it('T4 — rewards available badge hidden when rewardsAvailable = 0', async () => {
    setupApiMock({
      customer: { ...BASE_CUSTOMER, pointsBalance: 400 },
      tenant: { ...BASE_TENANT, pointsThreshold: 1000 },
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rewards-available-badge')).not.toBeInTheDocument();
  });

  it('T5 — rewards available badge shows when rewardsAvailable >= 1', async () => {
    setupApiMock({
      customer: { ...BASE_CUSTOMER, pointsBalance: 1500 },
      tenant: { ...BASE_TENANT, pointsThreshold: 1000 },
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('rewards-available-badge')).toHaveTextContent('1 reward available');
    });
  });

  it('T6 — Overview tab shows recent 3 transactions', async () => {
    setupApiMock({
      recentTx: {
        data: [
          makeTxRow({ id: 'tx-1', pointsEarned: 10 }),
          makeTxRow({ id: 'tx-2', pointsEarned: 20 }),
          makeTxRow({ id: 'tx-3', pointsEarned: 30 }),
        ],
      },
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('+10 pts')).toBeInTheDocument();
      expect(screen.getByText('+20 pts')).toBeInTheDocument();
      expect(screen.getByText('+30 pts')).toBeInTheDocument();
    });
  });

  it('T7 — Transactions tab loads paginated transaction list', async () => {
    setupApiMock({
      fullTransactions: {
        data: [makeTxRow({ id: 'tx-full-1', cashierName: 'Chidi Eze' })],
        total: 45,
      },
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-transactions'));

    await waitFor(() => {
      expect(screen.getByText('Chidi Eze')).toBeInTheDocument();
      expect(screen.getByText(/45 total/)).toBeInTheDocument();
    });
  });

  it('T8 — Redemptions tab loads redemption history', async () => {
    setupApiMock({
      fullRedemptions: {
        data: [makeRedemptionRow({ id: 'red-full-1', pointsRedeemed: 2000, rewardsCount: 2 })],
        total: 3,
      },
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-redemptions'));

    await waitFor(() => {
      expect(screen.getByText('-2,000 pts')).toBeInTheDocument();
      expect(screen.getByText('2 rewards')).toBeInTheDocument();
    });
  });

  it('T9 — 404 state shown when customer not found', async () => {
    setupApiMock({
      customer: () => Promise.reject(new ApiError('Customer not found', 404)),
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Customer not found')).toBeInTheDocument();
    });
  });

  it('T10 — back button navigates to /customers', async () => {
    setupApiMock();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByTestId('back-to-customers')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('back-to-customers'));

    expect(mockPush).toHaveBeenCalledWith('/customers');
  });
});
