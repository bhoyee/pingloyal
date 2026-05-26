import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/api'),
  cashierApi: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('../app/(cashier)/context/cashier-context', () => ({
  useCashier: jest.fn(),
  CashierProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { cashierApi, ApiError } from '../lib/api';
import { useCashier } from '../app/(cashier)/context/cashier-context';
import CashierPage from '../app/(cashier)/page';
import CashierLoginPage from '../app/(cashier)/login/page';
import type { CustomerLookupResult } from '../lib/api';

const mockCashierApi = cashierApi as jest.Mocked<typeof cashierApi>;
const mockUseCashier = useCashier as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOMER: CustomerLookupResult = {
  id: 'cust-001',
  fullName: 'Ada Okonkwo',
  phoneE164: '+234 801 *** 5678',
  pointsBalance: 350,
  tierId: 'tier-1',
  tier: 'Silver',
  lastPurchaseAt: '2026-05-10T10:00:00.000Z',
  purchaseCount: 7,
  progressPercent: 35,
};

function defaultCashierContext() {
  mockUseCashier.mockReturnValue({
    tenant: { businessName: 'Mama Store', slug: 'mama-store' },
    isLoading: false,
    offlineQueueCount: 0,
    tenantSlug: 'mama-store',
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  defaultCashierContext();
  mockCashierApi.get.mockResolvedValue(CUSTOMER);
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
});

// ── T70 — empty state renders prompt ─────────────────────────────────────────

it('T70 — renders phone input and empty-state prompt on mount', () => {
  render(<CashierPage />);

  expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
  expect(
    screen.getByText(/enter a phone number to look up/i),
  ).toBeInTheDocument();
});

// ── T71 — loading state shown during debounce ─────────────────────────────────

it('T71 — shows loading spinner after typing a phone number', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });
});

// ── T72 — found state renders customer card ───────────────────────────────────

it('T72 — shows customer card when API returns a match', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(screen.getByText('Ada Okonkwo')).toBeInTheDocument();
    expect(screen.getByText('Silver')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
  });
});

// ── T73 — progress bar renders ────────────────────────────────────────────────

it('T73 — progress bar renders with correct aria attributes', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    const bar = screen.getByRole('progressbar', { name: /progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '35');
  });
});

// ── T74 — not-found state shows register link ─────────────────────────────────

it('T74 — not-found state shows Register link with tenant slug', async () => {
  mockCashierApi.get.mockRejectedValueOnce(new ApiError('Not found', 404));

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(screen.getByText(/no customer found/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /register new customer/i });
    expect(link).toHaveAttribute('href', '/register/mama-store');
  });
});

// ── T75 — network error state shows alert ─────────────────────────────────────

it('T75 — API error shows an alert with error message', async () => {
  mockCashierApi.get.mockRejectedValueOnce(
    Object.assign(new Error('Server error'), { status: 500, name: 'ApiError' }),
  );

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ── T76 — clear button resets state ──────────────────────────────────────────

it('T76 — clear button resets phone input and hides customer card', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '08012345678');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(screen.getByText('Ada Okonkwo')).toBeInTheDocument();
  });

  await user.click(screen.getByLabelText(/clear phone/i));

  expect(screen.queryByText('Ada Okonkwo')).not.toBeInTheDocument();
  expect(
    screen.getByText(/enter a phone number to look up/i),
  ).toBeInTheDocument();
});

// ── T77 — offline banner shown ────────────────────────────────────────────────

it('T77 — offline banner appears when navigator.onLine is false', () => {
  Object.defineProperty(navigator, 'onLine', { writable: true, value: false });

  render(<CashierPage />);

  expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
});

// ── T78 — debounce prevents multiple API calls ────────────────────────────────

it('T78 — debounce fires only once after rapid typing', async () => {
  render(<CashierPage />);
  const input = screen.getByLabelText(/phone number/i);

  // Simulate rapid successive changes (all within the debounce window)
  fireEvent.change(input, { target: { value: '0801' } });
  fireEvent.change(input, { target: { value: '08012' } });
  fireEvent.change(input, { target: { value: '080123' } });
  fireEvent.change(input, { target: { value: '08012345678' } });

  act(() => {
    jest.advanceTimersByTime(400);
  });

  await waitFor(() => {
    expect(mockCashierApi.get).toHaveBeenCalledTimes(1);
  });
});

// ── T79 — phone shorter than 7 digits stays in empty state ────────────────────

it('T79 — no API call when phone has fewer than 7 digits', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<CashierPage />);

  await user.type(screen.getByLabelText(/phone number/i), '0801');
  act(() => {
    jest.advanceTimersByTime(400);
  });

  expect(mockCashierApi.get).not.toHaveBeenCalled();
  expect(screen.getByText(/enter a phone number/i)).toBeInTheDocument();
});

// ── T80 — business name shown from CashierContext ────────────────────────────

it('T80 — header shows business name from CashierContext', () => {
  render(<CashierPage />);

  expect(screen.getByText('Mama Store')).toBeInTheDocument();
});

// ── T81 — queued items badge shown ───────────────────────────────────────────

it('T81 — shows offline queue badge when offlineQueueCount > 0', () => {
  mockUseCashier.mockReturnValue({
    tenant: { businessName: 'Mama Store', slug: 'mama-store' },
    isLoading: false,
    offlineQueueCount: 3,
    tenantSlug: 'mama-store',
  });

  render(<CashierPage />);

  expect(screen.getByText('3 queued')).toBeInTheDocument();
});

// ── T82 — login form renders ──────────────────────────────────────────────────

it('T82 — login page renders email and password inputs', () => {
  render(<CashierLoginPage />);

  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});

// ── T83 — login failure shows error ──────────────────────────────────────────

it('T83 — login form shows error on 401 response', async () => {
  jest.useRealTimers(); // login test doesn't need fake timers
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({}),
  });

  const user = userEvent.setup();
  render(<CashierLoginPage />);

  await user.type(screen.getByLabelText(/email/i), 'bad@test.com');
  await user.type(screen.getByLabelText(/password/i), 'wrongpass');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
  });
});
