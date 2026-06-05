import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

jest.mock('recharts', () => {
  const MockChart = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: MockChart, Bar: () => null, AreaChart: MockChart, Area: () => null,
    PieChart: MockChart, Pie: () => null, Cell: () => null,
    XAxis: () => null, YAxis: () => null, Tooltip: () => null,
    Legend: () => null, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => {
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

import ReportsPage from '../app/(dashboard)/reports/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReport() {
  return {
    period: { type: 'this_month', start: '2026-05-01', end: '2026-05-31' },
    generatedAt: new Date().toISOString(),
    loyalty: {
      totalCustomers: 120,
      activeCustomers: 85,
      retentionRate: 42,
      newCustomersThisMonth: 12,
      weeklyNewCustomers: [{ week: '2026-05-01', count: 5 }, { week: '2026-05-08', count: 7 }],
      vsLastPeriod: { totalCustomers: 108, activeRate: 70 },
    },
    points: {
      issued: 15000,
      redeemed: 1200,
      redemptionRate: 8,
      nearRewardCount: 9,
      dailyIssued: [{ date: '2026-05-01', amount: 500 }],
    },
    whatsapp: {
      totalSent: 320,
      deliveryRate: 93,
      botInteractions: 28,
      triggerBreakdown: {
        birthday: { sent: 50, delivered: 47, rate: 94, cost: '₦6,500' },
        welcome: { sent: 120, delivered: 115, rate: 96, cost: 'Plan included' },
      },
    },
    wallet: {
      totalSpend: 8500,
      spendByType: { debit_birthday: 6500, debit_campaign: 2000 },
      costPerReach: 123,
      estimatedRoi: 4.2,
    },
    content: {
      bestCampaign: { id: 'c1', name: 'May Flash Sale', deliveryRate: 97.5 },
      busiestDayOfWeek: [{ day: 'Monday', count: 45 }, { day: 'Friday', count: 62 }],
      topCustomers: [
        { id: 'u1', fullName: 'Amara Okafor', totalSpend: 180000, pointsBalance: 850, tierLabel: 'VIP' },
      ],
      categoryBreakdown: [{ name: 'Groceries', percentage: 65 }, { name: 'Beverages', percentage: 35 }],
    },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// T1 — skeleton cards while loading
it('T1 — shows skeleton cards while data is loading', () => {
  mockApi.get.mockImplementation(() => new Promise(() => {})); // never resolves
  render(<ReportsPage />, { wrapper });
  expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
});

// T2 — all 6 sections when data loads
it('T2 — shows all 6 sections when data loads', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('schedule')) return Promise.resolve(null);
    return Promise.resolve(makeReport());
  });

  render(<ReportsPage />, { wrapper });

  await waitFor(() => screen.getByTestId('loyalty-section'));
  expect(screen.getByTestId('loyalty-section')).toBeInTheDocument();
  expect(screen.getByTestId('points-section')).toBeInTheDocument();
  expect(screen.getByTestId('whatsapp-section')).toBeInTheDocument();
  expect(screen.getByTestId('wallet-section')).toBeInTheDocument();
  expect(screen.getByTestId('content-section')).toBeInTheDocument();
  expect(screen.getByTestId('export-section')).toBeInTheDocument();
});

// T3 — period dropdown change triggers new fetch
it('T3 — period dropdown change triggers refetch with new period', async () => {
  mockApi.get.mockResolvedValue(makeReport());
  render(<ReportsPage />, { wrapper });

  await waitFor(() => screen.getByTestId('period-select'));
  fireEvent.change(screen.getByTestId('period-select'), { target: { value: 'last_month' } });

  await waitFor(() => {
    const calls = mockApi.get.mock.calls as [string][];
    expect(calls.some((c) => c[0].includes('last_month'))).toBe(true);
  });
});

// T4 — refresh button calls POST /reports/refresh
it('T4 — refresh button calls POST /reports/refresh', async () => {
  mockApi.get.mockResolvedValue(makeReport());
  mockApi.post.mockResolvedValue(makeReport());

  render(<ReportsPage />, { wrapper });
  await waitFor(() => screen.getByTestId('refresh-btn'));

  fireEvent.click(screen.getByTestId('refresh-btn'));
  await waitFor(() =>
    expect(mockApi.post).toHaveBeenCalledWith(
      expect.stringContaining('reports/refresh'),
      expect.anything(),
    ),
  );
});

// T5 — loyalty stat cards show correct values
it('T5 — loyalty stat cards show correct values', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('schedule')) return Promise.resolve(null);
    return Promise.resolve(makeReport());
  });

  render(<ReportsPage />, { wrapper });

  // Wait until stat cards are visible (data has loaded)
  await waitFor(() => {
    const cards = screen.getAllByTestId('stat-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  const cards = screen.getAllByTestId('stat-card');
  const texts = cards.map((c) => c.textContent ?? '');
  expect(texts.some((t) => t.includes('120'))).toBe(true); // totalCustomers
  expect(texts.some((t) => t.includes('85'))).toBe(true);  // activeCustomers
  expect(texts.some((t) => t.includes('42%'))).toBe(true); // retentionRate
});

// T6 — trigger breakdown table renders one row per trigger type
it('T6 — trigger breakdown table renders one row per trigger type', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('schedule')) return Promise.resolve(null);
    return Promise.resolve(makeReport());
  });

  render(<ReportsPage />, { wrapper });

  await waitFor(() => screen.getByTestId('trigger-table'));
  const rows = screen.getByTestId('trigger-table').querySelectorAll('tbody tr');
  expect(rows.length).toBe(2); // birthday + welcome
});

// T7 — PDF download triggers file download
it('T7 — PDF download button triggers fetch to reports/pdf', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('schedule')) return Promise.resolve(null);
    return Promise.resolve(makeReport());
  });

  // Mock fetch for the download
  const mockFetch = jest.fn().mockResolvedValue({
    blob: jest.fn().mockResolvedValue(new Blob(['pdf-content'])),
  });
  Object.defineProperty(window, 'fetch', { value: mockFetch, writable: true });
  Object.defineProperty(window, 'URL', {
    value: { createObjectURL: jest.fn(() => 'blob:test'), revokeObjectURL: jest.fn() },
    writable: true,
  });

  render(<ReportsPage />, { wrapper });
  await waitFor(() => screen.getByTestId('pdf-download-btn'));

  fireEvent.click(screen.getByTestId('pdf-download-btn'));

  await waitFor(() =>
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('reports/pdf'),
      expect.any(Object),
    ),
  );
});

// T8 — email schedule form shows current schedule when active
it('T8 — shows active schedule with cancel button when schedule is active', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('schedule'))
      return Promise.resolve({ id: 's1', email: 'owner@store.com', isActive: true });
    return Promise.resolve(makeReport());
  });

  render(<ReportsPage />, { wrapper });

  await waitFor(() => screen.getByTestId('cancel-schedule-btn'));
  expect(screen.getByText(/owner@store\.com/)).toBeInTheDocument();
});

// T9 — cancel schedule calls DELETE
it('T9 — cancel schedule calls DELETE /reports/schedule', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('schedule'))
      return Promise.resolve({ id: 's1', email: 'owner@store.com', isActive: true });
    return Promise.resolve(makeReport());
  });
  mockApi.delete.mockResolvedValue(undefined);

  render(<ReportsPage />, { wrapper });
  await waitFor(() => screen.getByTestId('cancel-schedule-btn'));
  fireEvent.click(screen.getByTestId('cancel-schedule-btn'));

  await waitFor(() =>
    expect(mockApi.delete).toHaveBeenCalledWith('/api/v1/reports/schedule'),
  );
});
