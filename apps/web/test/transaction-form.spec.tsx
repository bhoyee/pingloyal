import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/api'),
  cashierApi: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('../lib/offline-queue', () => ({
  addToQueue: jest.fn().mockResolvedValue(1),
  getPendingCount: jest.fn().mockResolvedValue(0),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../app/cashier/context/cashier-context', () => ({
  useCashier: jest.fn(),
  CashierProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { cashierApi, ApiError } from '../lib/api';
import { addToQueue } from '../lib/offline-queue';
import { useCashier } from '../app/cashier/context/cashier-context';
import TransactionPage from '../app/cashier/(app)/transaction/page';
import type { CustomerLookupResult, TransactionResult } from '../lib/api';

const mockCashierApi = cashierApi as jest.Mocked<typeof cashierApi>;
const mockAddToQueue = addToQueue as jest.Mock;
const mockUseCashier = useCashier as jest.Mock;
const mockRouter = { replace: jest.fn(), push: jest.fn() };

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOMER: CustomerLookupResult = {
  id: 'cust-001',
  fullName: 'Ada Okonkwo',
  phoneE164: '+234 801 *** 5678',
  pointsBalance: 350,
  tierId: 'tier-1',
  tier: 'Silver',
  lastPurchaseAt: null,
  purchaseCount: 7,
  progressPercent: 35,
};

const TX_RESULT: TransactionResult = {
  id: 'tx-001',
  amount: '5000',
  pointsEarned: 50,
  alreadyProcessed: false,
  customer: {
    id: 'cust-001',
    fullName: 'Ada Okonkwo',
    pointsBalance: 400,
    progressPercent: 40,
    tier: 'Silver',
  },
  createdAt: new Date().toISOString(),
};

function makeTenant(earnRate = 100) {
  return {
    id: 'tenant-1',
    businessName: 'Mama Store',
    slug: 'mama-store',
    currency: 'NGN',
    pointsEarnRate: earnRate,
    pointsThreshold: 1000,
    whatsapp: { verificationStatus: 'verified' },
  };
}

function defaultContext(earnRate = 100) {
  mockUseCashier.mockReturnValue({
    tenant: makeTenant(earnRate),
    isLoading: false,
    offlineQueueCount: 0,
    tenantSlug: 'mama-store',
    refreshOfflineCount: jest.fn(),
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  defaultContext();
  mockCashierApi.get.mockResolvedValue([]);
  mockCashierApi.post.mockResolvedValue(TX_RESULT);
  mockAddToQueue.mockResolvedValue(1);
  Object.defineProperty(navigator, 'onLine', { writable: true, value: true });
  sessionStorage.setItem('cashier_selected_customer', JSON.stringify(CUSTOMER));
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
  sessionStorage.clear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAmountInput() {
  // exact match avoids collision with the button's aria-label
  return screen.getByLabelText('Amount');
}

// ── T84 — points preview earnRate=100 ─────────────────────────────────────────

it('T84 — points preview shows correct calculation with earnRate=100', async () => {
  render(<TransactionPage />);

  fireEvent.change(getAmountInput(), { target: { value: '5000' } });
  act(() => { jest.advanceTimersByTime(200); });

  await waitFor(() => {
    expect(screen.getByLabelText(/points preview/i)).toHaveTextContent('50');
  });
});

// ── T85 — points preview earnRate=50 ──────────────────────────────────────────

it('T85 — points preview shows correct calculation with earnRate=50', async () => {
  defaultContext(50); // override earnRate before render

  render(<TransactionPage />);

  fireEvent.change(getAmountInput(), { target: { value: '5000' } });
  act(() => { jest.advanceTimersByTime(200); });

  await waitFor(() => {
    expect(screen.getByLabelText(/points preview/i)).toHaveTextContent('100');
  });
});

// ── T86 — points preview hidden when amount is empty ─────────────────────────

it('T86 — points preview hidden when amount is empty', () => {
  render(<TransactionPage />);

  expect(screen.queryByLabelText(/points preview/i)).not.toBeInTheDocument();
});

// ── T87 — points preview shows below minimum when points = 0 ─────────────────

it('T87 — points preview shows below minimum when calculated points = 0', async () => {
  render(<TransactionPage />);

  // ₦10 ÷ 100 = 0 pts
  fireEvent.change(getAmountInput(), { target: { value: '10' } });
  act(() => { jest.advanceTimersByTime(200); });

  await waitFor(() => {
    expect(screen.getByLabelText(/points preview/i)).toHaveTextContent(
      /below minimum/i,
    );
  });
});

// ── T88 — confirm button disabled when amount is empty ────────────────────────

it('T88 — confirm button disabled when amount is empty', () => {
  render(<TransactionPage />);

  const btn = screen.getByRole('button', { name: /enter amount/i });
  expect(btn).toBeDisabled();
});

// ── T89 — confirm button shows correct points text ────────────────────────────

it('T89 — confirm button shows "Add 50 Points →" for ₦5,000 with earnRate=100', async () => {
  render(<TransactionPage />);

  fireEvent.change(getAmountInput(), { target: { value: '5000' } });

  // Button text is derived from amount state immediately (no debounce needed)
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: /add 50 points/i }),
    ).not.toBeDisabled();
  });
});

// ── T90 — same idempotency key on API attempt and offline save ────────────────

it('T90 — same idempotency key used on API attempt and offline fallback', async () => {
  mockCashierApi.post.mockRejectedValueOnce(new ApiError('Network error', 0));

  render(<TransactionPage />);
  fireEvent.change(getAmountInput(), { target: { value: '5000' } });

  // Button is now 'Add 50 Points →' — click it
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add 50 points/i }));
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(mockCashierApi.post).toHaveBeenCalled();
    expect(mockAddToQueue).toHaveBeenCalled();
  });

  const apiKey = (
    mockCashierApi.post.mock.calls[0]![1] as Record<string, unknown>
  ).idempotencyKey;
  const queueKey = (
    mockAddToQueue.mock.calls[0]![0] as Record<string, unknown>
  ).idempotencyKey;

  expect(apiKey).toBe(queueKey);
  expect(apiKey).toBe('test-uuid-0000-0000-0000-000000000000');
});

// ── T91 — offline: saves to queue with status=pending ────────────────────────

it('T91 — saves to offline queue with status=pending when device is offline', async () => {
  Object.defineProperty(navigator, 'onLine', { writable: true, value: false });

  render(<TransactionPage />);
  fireEvent.change(getAmountInput(), { target: { value: '5000' } });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add 50 points/i }));
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(mockAddToQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-001',
        customerName: 'Ada Okonkwo',
        amount: '5000',
        status: 'pending',
        idempotencyKey: 'test-uuid-0000-0000-0000-000000000000',
      }),
    );
  });
  expect(mockCashierApi.post).not.toHaveBeenCalled();
});

// ── T92 — online success navigates to confirmation ────────────────────────────

it('T92 — online success navigates to /cashier/confirmation', async () => {
  jest.useRealTimers();
  render(<TransactionPage />);
  fireEvent.change(getAmountInput(), { target: { value: '5000' } });

  const btn = await screen.findByRole('button', { name: /add 50 points/i });
  await userEvent.click(btn);

  await waitFor(() => {
    expect(mockRouter.replace).toHaveBeenCalledWith('/cashier/confirmation');
  });
});

// ── T93 — network error falls through to offline save ────────────────────────

it('T93 — network error (status 0) falls through to offline queue', async () => {
  mockCashierApi.post.mockRejectedValueOnce(new ApiError('Network error', 0));

  render(<TransactionPage />);
  fireEvent.change(getAmountInput(), { target: { value: '5000' } });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add 50 points/i }));
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(mockCashierApi.post).toHaveBeenCalled();
    expect(mockAddToQueue).toHaveBeenCalled();
  });
});
