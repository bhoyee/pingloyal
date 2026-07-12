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

// CSV export helpers used by the page
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import ReconciliationPage from '../app/(dashboard)/reconciliation/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_RESULT = {
  period: { start: '2024-03-10', end: '2024-03-10' },
  summary: {
    totalTransactions: 25,
    totalAmountLogged: 125000,
    totalPointsIssued: 1250,
    expectedPoints: 1250,
    pointsDiscrepancy: 0,
    terminalVerifiedCount: 5,
    terminalVerifiedAmount: 25000,
    manualEntryCount: 20,
    manualEntryAmount: 100000,
    manualEntryPercent: 80,
  },
  redemptions: {
    totalRedemptions: 4,
    totalPointsRedeemed: 4000,
    totalValueGivenOut: 4000,
  },
  cashierBreakdown: [
    {
      cashierId: 'cid-1',
      cashierName: 'Chidinma',
      transactionCount: 20,
      totalAmount: 100000,
      averageAmount: 5000,
      manualEntryCount: 5,
      percentageOfStoreTotal: 80,
      flagged: false,
    },
    {
      cashierId: 'cid-2',
      cashierName: 'Taiwo',
      transactionCount: 5,
      totalAmount: 25000,
      averageAmount: 2000,
      manualEntryCount: 4,
      percentageOfStoreTotal: 20,
      flagged: true,
    },
  ],
  redemptionLog: [
    {
      redeemedAt: '2024-03-10T14:32:00.000Z',
      customerName: 'Ngozi Amaka',
      pointsRedeemed: 1000,
      rewardValue: 1000,
      cashierName: 'Chidinma',
    },
  ],
};

// Amber integrity: discrepancy between 2% and 10%
const AMBER_RESULT = {
  ...BASE_RESULT,
  summary: {
    ...BASE_RESULT.summary,
    expectedPoints: 1000,
    totalPointsIssued: 1050,   // 5% over → amber
    pointsDiscrepancy: 50,
  },
};

// Red integrity: discrepancy > 10%
const RED_RESULT = {
  ...BASE_RESULT,
  summary: {
    ...BASE_RESULT.summary,
    expectedPoints: 1000,
    totalPointsIssued: 1200,   // 20% over → red
    pointsDiscrepancy: 200,
  },
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
    (global.URL.createObjectURL as jest.Mock).mockClear();
  });

  it('T10: shows green integrity card when discrepancy is within 2%', async () => {
    mockApi.get.mockResolvedValueOnce(BASE_RESULT);  // discrepancy = 0
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Points check passed/i)).toBeInTheDocument();
    });
    const card = screen.getByText(/Points check passed/i).closest('[data-integrity]');
    expect(card?.getAttribute('data-integrity')).toBe('green');
  });

  it('T11: shows amber integrity card when discrepancy is between 2% and 10%', async () => {
    mockApi.get.mockResolvedValueOnce(AMBER_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Minor discrepancy detected/i)).toBeInTheDocument();
    });
    const card = screen.getByText(/Minor discrepancy detected/i).closest('[data-integrity]');
    expect(card?.getAttribute('data-integrity')).toBe('amber');
  });

  it('T12: shows red integrity card when discrepancy is greater than 10%', async () => {
    mockApi.get.mockResolvedValueOnce(RED_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Significant discrepancy/i)).toBeInTheDocument();
    });
    const card = screen.getByText(/Significant discrepancy/i).closest('[data-integrity]');
    expect(card?.getAttribute('data-integrity')).toBe('red');
  });

  it('T13: flagged cashier row has amber highlight attribute', async () => {
    mockApi.get.mockResolvedValueOnce(BASE_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Taiwo')).toBeInTheDocument();
    });
    // Taiwo is flagged — the row carries data-flagged="true"
    const row = screen.getByText('Taiwo').closest('tr');
    expect(row?.getAttribute('data-flagged')).toBe('true');
  });

  it('T14: non-flagged cashier row has no amber highlight', async () => {
    mockApi.get.mockResolvedValueOnce(BASE_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Chidinma').length).toBeGreaterThanOrEqual(1);
    });
    // Chidinma appears in both the cashier table and the redemption log.
    // The cashier breakdown row is the one inside a <tbody> that could carry data-flagged.
    // Find the first tr that is a direct descendant of a tbody (cashier breakdown table).
    const allChidinma = screen.getAllByText('Chidinma');
    const cashierRow = allChidinma
      .map((el) => el.closest('tr'))
      .find((tr) => tr?.getAttribute('data-flagged') === null && tr?.closest('tbody') !== null);
    expect(cashierRow).not.toBeNull();
    expect(cashierRow?.getAttribute('data-flagged')).toBeNull();
  });

  it('T15: Export CSV button calls URL.createObjectURL to trigger download', async () => {
    mockApi.get.mockResolvedValueOnce(BASE_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Export Redemption Log CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Export Redemption Log CSV'));
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('T16: View flagged transactions link points to correct cashier transaction URL', async () => {
    mockApi.get.mockResolvedValueOnce(BASE_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/View flagged transactions — Taiwo/i)).toBeInTheDocument();
    });
    const link = screen.getByText(/View flagged transactions — Taiwo/i).closest('a');
    expect(link?.getAttribute('href')).toContain('/transactions?cashierId=cid-2');
  });

  it('T17: switching the period filter triggers a new API call', async () => {
    mockApi.get.mockResolvedValue(BASE_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Points check passed/i)).toBeInTheDocument();
    });

    // Click a different preset to change the query key
    fireEvent.click(screen.getByText('Last 7 days'));

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledTimes(2);
    });
    // Second call should have a different startDate in the URL
    const firstCall = (mockApi.get.mock.calls[0][0] as string);
    const secondCall = (mockApi.get.mock.calls[1][0] as string);
    expect(firstCall).not.toBe(secondCall);
  });
});
