import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TenantMe } from '../lib/api';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: mockPush, replace: mockReplace })),
}));

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => 'fake-access-token'),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  writable: true,
});

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import TransactionsPage from '../app/(dashboard)/transactions/page';

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

interface TransactionLogRow {
  id: string;
  amount: string;
  pointsEarned: number;
  source: string;
  createdAt: string;
  customer: { id: string; fullName: string } | null;
  categoryName: string | null;
  cashierName: string | null;
}

function makeRow(overrides: Partial<TransactionLogRow> = {}): TransactionLogRow {
  return {
    id: 'tx-1',
    amount: '5000',
    pointsEarned: 50,
    source: 'cashier_app',
    createdAt: new Date().toISOString(),
    customer: { id: 'cust-1', fullName: 'Amaka Eze' },
    categoryName: 'Groceries',
    cashierName: 'Chidi Eze',
    ...overrides,
  };
}

interface ApiMockOpts {
  role?: string;
  tenant?: TenantMe;
  cashiers?: { id: string; fullName: string; isActive: boolean }[];
  transactions?: { data: TransactionLogRow[]; total: number; page: number; limit: number; totalAmount: string; totalPoints: number };
}

function setupApiMock(opts: ApiMockOpts = {}) {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('/auth/me')) {
      return Promise.resolve({ role: opts.role ?? 'owner' });
    }
    if (path.includes('/tenants/me')) {
      return Promise.resolve(opts.tenant ?? BASE_TENANT);
    }
    if (path.includes('/users/cashiers')) {
      return Promise.resolve(opts.cashiers ?? [{ id: 'user-1', fullName: 'Chidi Eze', isActive: true }]);
    }
    if (path.includes('/transactions')) {
      return Promise.resolve(
        opts.transactions ?? { data: [], total: 0, page: 1, limit: 50, totalAmount: '0', totalPoints: 0 },
      );
    }
    return Promise.resolve({});
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <TransactionsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

// ── T1: role gating ───────────────────────────────────────────────────────────

it('T1 — redirects cashiers away from the page', async () => {
  setupApiMock({ role: 'cashier' });
  renderPage();

  await waitFor(() => {
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});

it('T2 — owners are not redirected and see the filter bar', async () => {
  setupApiMock({ role: 'owner' });
  renderPage();

  await waitFor(() => {
    expect(screen.getByTestId('date-range-select')).toBeInTheDocument();
  });
  expect(mockReplace).not.toHaveBeenCalled();
});

// ── T3: default range = Today, live indicator ────────────────────────────────

it('T3 — defaults to "Today" with the live indicator showing', async () => {
  setupApiMock();
  renderPage();

  await waitFor(() => {
    expect(screen.getByTestId('date-range-select')).toHaveValue('today');
  });
  expect(screen.getByTestId('live-indicator')).toHaveTextContent('Live');
});

// ── T4: switching to a historical range flips the indicator ─────────────────

it('T4 — switching to "This month" shows the historical indicator', async () => {
  setupApiMock();
  renderPage();

  await waitFor(() => screen.getByTestId('date-range-select'));
  fireEvent.change(screen.getByTestId('date-range-select'), { target: { value: 'month' } });

  await waitFor(() => {
    expect(screen.getByTestId('live-indicator')).toHaveTextContent('Historical');
  });
});

// ── T5: custom range reveals date inputs ─────────────────────────────────────

it('T5 — selecting "Custom range" reveals start/end date inputs', async () => {
  setupApiMock();
  renderPage();

  await waitFor(() => screen.getByTestId('date-range-select'));
  fireEvent.change(screen.getByTestId('date-range-select'), { target: { value: 'custom' } });

  expect(screen.getByTestId('custom-start-date')).toBeInTheDocument();
  expect(screen.getByTestId('custom-end-date')).toBeInTheDocument();
});

// ── T6: cashier dropdown populated from GET /users/cashiers ─────────────────

it('T6 — cashier dropdown lists cashiers from the API', async () => {
  setupApiMock({ cashiers: [{ id: 'user-1', fullName: 'Chidi Eze', isActive: true }] });
  renderPage();

  await waitFor(() => {
    expect(screen.getByRole('option', { name: 'Chidi Eze' })).toBeInTheDocument();
  });
});

// ── T7: summary bar reflects period-wide aggregates, not just the page ──────

it('T7 — summary bar shows count/spend/points/avg from the aggregate response', async () => {
  setupApiMock({
    transactions: {
      data: [makeRow()],
      total: 120,
      page: 1,
      limit: 50,
      totalAmount: '600000',
      totalPoints: 6000,
    },
  });
  renderPage();

  await waitFor(() => {
    expect(screen.getByTestId('summary-count')).toHaveTextContent('120');
  });
  expect(screen.getByTestId('summary-spend')).toHaveTextContent('600,000');
  expect(screen.getByTestId('summary-points')).toHaveTextContent('6,000');
  expect(screen.getByTestId('summary-avg')).toHaveTextContent('5,000');
});

// ── T8: table renders rows with badges, points, first-name cashier ──────────

it('T8 — table row shows customer name, green points, first-name cashier, and source badge', async () => {
  setupApiMock({
    transactions: {
      data: [makeRow({ source: 'webhook' })],
      total: 1,
      page: 1,
      limit: 50,
      totalAmount: '5000',
      totalPoints: 50,
    },
  });
  renderPage();

  await waitFor(() => {
    expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
  });
  expect(screen.getByText('+50')).toBeInTheDocument();
  expect(screen.getByText('Chidi')).toBeInTheDocument();
  expect(screen.getByText('Webhook')).toBeInTheDocument();
});

// ── T9: clicking a customer name navigates to detail page ───────────────────

it('T9 — clicking a customer name navigates to /customers/[id]', async () => {
  setupApiMock({
    transactions: {
      data: [makeRow()],
      total: 1,
      page: 1,
      limit: 50,
      totalAmount: '5000',
      totalPoints: 50,
    },
  });
  renderPage();

  await waitFor(() => screen.getByText('Amaka Eze'));
  fireEvent.click(screen.getByText('Amaka Eze'));

  expect(mockPush).toHaveBeenCalledWith('/customers/cust-1');
});

// ── T10: View button deep-links to the Transactions tab ──────────────────────

it('T10 — the View action button links to the customer\'s Transactions tab', async () => {
  setupApiMock({
    transactions: {
      data: [makeRow()],
      total: 1,
      page: 1,
      limit: 50,
      totalAmount: '5000',
      totalPoints: 50,
    },
  });
  renderPage();

  await waitFor(() => screen.getByText('View'));
  fireEvent.click(screen.getByText('View'));

  expect(mockPush).toHaveBeenCalledWith('/customers/cust-1?tab=transactions');
});

// ── T11: empty states are mode-aware ─────────────────────────────────────────

it('T11 — shows the "no transactions today" empty state with a Native-mode CTA', async () => {
  setupApiMock({
    tenant: { ...BASE_TENANT, mode: 'native' },
    transactions: { data: [], total: 0, page: 1, limit: 50, totalAmount: '0', totalPoints: 0 },
  });
  renderPage();

  await waitFor(() => {
    expect(screen.getByTestId('empty-state-today')).toBeInTheDocument();
  });
  expect(screen.getByText('Open Cashier App')).toBeInTheDocument();
});
