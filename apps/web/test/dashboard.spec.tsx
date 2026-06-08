import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface DashboardSummary {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomersThisMonth: number;
  pointsIssuedThisMonth: number;
  pointsRedeemedThisMonth: number;
  campaignsSentThisMonth: number;
  avgDeliveryRate: number;
  messagesSentThisMonth: number;
  walletBalance: number;
  walletSpentThisMonth: number;
  marketingMessagesThisMonth: number;
  walletIsLow: boolean;
  walletIsEmpty: boolean;
  waIsConnected: boolean;
  waVerificationStatus: string;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: { get: jest.fn() },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock localStorage so JWT decode works
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => {
      // Return a fake JWT with tenantId in payload
      const payload = btoa(JSON.stringify({ tenantId: 'tenant-1' }));
      return `header.${payload}.sig`;
    }),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
  writable: true,
});

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import DashboardPage from '../app/(dashboard)/dashboard/page';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    totalCustomers: 50,
    activeCustomers: 35,
    inactiveCustomers: 15,
    newCustomersThisMonth: 5,
    pointsIssuedThisMonth: 12000,
    pointsRedeemedThisMonth: 800,
    campaignsSentThisMonth: 3,
    avgDeliveryRate: 92,
    messagesSentThisMonth: 200,
    walletBalance: 5000,
    walletSpentThisMonth: 3000,
    marketingMessagesThisMonth: 23,
    walletIsLow: false,
    walletIsEmpty: false,
    waIsConnected: true,
    waVerificationStatus: 'verified',
    ...overrides,
  };
}

function makeTopSpenders() {
  return [
    {
      id: 'c1',
      fullName: 'Amara Okafor',
      pointsBalance: 850,
      totalSpend: 150000,
      lastPurchaseAt: new Date().toISOString(),
      purchaseCount: 12,
      tierLabel: 'VIP',
    },
  ];
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary')) return Promise.resolve(makeSummary());
    if (path.includes('top-spenders')) return Promise.resolve(makeTopSpenders());
    if (path.includes('trigger-logs')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

// T11: skeleton cards while loading ──────────────────────────────────────────

it('T11 — shows skeleton cards while data is loading', () => {
  // Delay the API response so the loading state is visible
  mockApi.get.mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(makeSummary()), 500)),
  );

  render(<DashboardPage />, { wrapper });

  expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
});

// T12: wallet empty banner ────────────────────────────────────────────────────

it('T12 — shows wallet empty banner when walletIsEmpty=true', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary'))
      return Promise.resolve(
        makeSummary({ walletIsEmpty: true, walletBalance: 0 }),
      );
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() => {
    const banner = screen.getByTestId('alert-banner');
    expect(banner).toHaveTextContent('Top Up Wallet');
    expect(banner).toHaveClass('bg-red-50');
  });
});

// T13: wallet low banner ──────────────────────────────────────────────────────

it('T13 — shows wallet low banner when walletIsLow=true (not empty)', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary'))
      return Promise.resolve(
        makeSummary({ walletIsLow: true, walletBalance: 1500, walletIsEmpty: false }),
      );
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() => {
    const banner = screen.getByTestId('alert-banner');
    expect(banner).toHaveClass('bg-amber-50');
    expect(banner).toHaveTextContent('running low');
  });
});

// T14: walletIsEmpty → no WA banner ──────────────────────────────────────────

it('T14 — does NOT show WA banner when walletIsEmpty=true (wallet takes priority)', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary'))
      return Promise.resolve(
        makeSummary({
          walletIsEmpty: true,
          walletBalance: 0,
          waIsConnected: false,
        }),
      );
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() => {
    const banner = screen.getByTestId('alert-banner');
    // Should show wallet banner (red), NOT WA banner (blue)
    expect(banner).toHaveClass('bg-red-50');
    expect(banner).not.toHaveClass('bg-blue-50');
  });
});

// T15: WA not connected banner ────────────────────────────────────────────────

it('T15 — shows WA not connected banner when waIsConnected=false', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary'))
      return Promise.resolve(makeSummary({ waIsConnected: false }));
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() => {
    const banner = screen.getByTestId('alert-banner');
    expect(banner).toHaveClass('bg-blue-50');
    expect(banner).toHaveTextContent('Connect WhatsApp');
  });
});

// T16: inactive customers card click ─────────────────────────────────────────

it('T16 — clicking inactive customers card navigates to /customers?status=inactive', async () => {
  const { useRouter } = await import('next/navigation');
  const mockPush = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: jest.fn() });

  render(<DashboardPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Lapsed Customers')).toBeInTheDocument();
  });

  await userEvent.click(screen.getByText('Lapsed Customers').closest('div')!);

  expect(mockPush).toHaveBeenCalledWith('/customers?status=inactive');
});

// T17: top spenders table has no phone numbers ────────────────────────────────

it('T17 — top spenders table does not show any phone numbers', async () => {
  // Add a spender with a phoneE164 that should NOT appear
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary')) return Promise.resolve(makeSummary());
    if (path.includes('top-spenders'))
      return Promise.resolve([
        {
          ...makeTopSpenders()[0],
          // phoneE164 should never be in the response, but verify UI doesn't show it
        },
      ]);
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByTestId('top-spenders-table')).toBeInTheDocument();
  });

  // No phone number columns in the rendered table
  const table = screen.getByTestId('top-spenders-table');
  expect(table).not.toHaveTextContent('+234');
  expect(table.querySelector('th[data-col="phone"]')).toBeNull();
});

// T18: refetchInterval configured ─────────────────────────────────────────────

it('T18 — data refetches every 5 minutes (refetchInterval=300000)', async () => {
  jest.useFakeTimers();

  render(<DashboardPage />, { wrapper });

  // Initial fetch
  await act(async () => { await Promise.resolve(); });
  const initialCallCount = mockApi.get.mock.calls.filter(
    (c) => (c[0] as string).includes('summary'),
  ).length;

  // Advance 5 minutes
  act(() => { jest.advanceTimersByTime(300_000); });
  await act(async () => { await Promise.resolve(); });

  const afterCallCount = mockApi.get.mock.calls.filter(
    (c) => (c[0] as string).includes('summary'),
  ).length;

  expect(afterCallCount).toBeGreaterThan(initialCallCount);

  jest.useRealTimers();
});
