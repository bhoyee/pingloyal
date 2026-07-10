import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
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

import ReconciliationPage from '../app/(dashboard)/reconciliation/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPTY_RESULT = {
  period: { startDate: '2024-02-10', endDate: '2024-03-10' },
  transactions: {
    total: 0,
    totalRevenue: 0,
    totalPointsIssued: 0,
    bySource: {
      cashier_app: { count: 0, revenue: 0, points: 0 },
      webhook: { count: 0, revenue: 0, points: 0 },
      api_pull: { count: 0, revenue: 0, points: 0 },
      file_import: { count: 0, revenue: 0, points: 0 },
    },
  },
  redemptions: { total: 0, totalPointsRedeemed: 0, totalRewardValue: 0 },
};

const POPULATED_RESULT = {
  period: { startDate: '2024-02-10', endDate: '2024-03-10' },
  transactions: {
    total: 25,
    totalRevenue: 50000,
    totalPointsIssued: 500,
    bySource: {
      cashier_app: { count: 20, revenue: 40000, points: 400 },
      webhook: { count: 3, revenue: 6000, points: 60 },
      api_pull: { count: 2, revenue: 4000, points: 40 },
      file_import: { count: 0, revenue: 0, points: 0 },
    },
  },
  redemptions: { total: 4, totalPointsRedeemed: 4000, totalRewardValue: 2000 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ReconciliationPage />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconciliationPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('T1: shows loading spinner while data is being fetched', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('T2: renders summary cards when data loads', async () => {
    mockApi.get.mockResolvedValueOnce(POPULATED_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
  });

  it('T3: shows empty-state messages when all totals are zero', async () => {
    mockApi.get.mockResolvedValueOnce(EMPTY_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No transactions in this period.')).toBeInTheDocument();
    });
    expect(screen.getByText('No redemptions in this period.')).toBeInTheDocument();
  });

  it('T4: shows an error state when the API call fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load reconciliation report/i),
      ).toBeInTheDocument();
    });
  });

  it('T5: renders all four source rows when transactions exist', async () => {
    mockApi.get.mockResolvedValueOnce(POPULATED_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cashier App')).toBeInTheDocument();
    });
    expect(screen.getByText('Webhook')).toBeInTheDocument();
    expect(screen.getByText('API Pull')).toBeInTheDocument();
    expect(screen.getByText('File Import')).toBeInTheDocument();
  });

  it('T6: cashier_app row is labelled as Manual', async () => {
    mockApi.get.mockResolvedValueOnce(POPULATED_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Manual')).toBeInTheDocument();
    });
  });

  it('T7: redemption stats render when redemptions exist', async () => {
    mockApi.get.mockResolvedValueOnce(POPULATED_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Points Redeemed')).toBeInTheDocument();
    });
    expect(screen.getByText('4,000')).toBeInTheDocument();
  });

  it('T8: switching to custom preset shows date inputs', async () => {
    mockApi.get.mockResolvedValue(EMPTY_RESULT);
    renderPage();
    fireEvent.click(screen.getByText('Custom'));
    await waitFor(() => {
      expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });
});
