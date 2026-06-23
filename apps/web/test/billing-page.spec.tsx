import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(() => {
      const payload = btoa(JSON.stringify({ tenantId: 'tenant-1' }));
      return `h.${payload}.s`;
    }),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
});

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import BillingPage from '../app/(dashboard)/billing/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    status: 'active',
    planTier: 'starter',
    currency: 'NGN',
    amount: 8000,
    currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    daysRemaining: 20,
    trialEndsAt: null,
    trialDaysRemaining: null,
    utilityIncluded: 300,
    utilityUsedThisPeriod: 50,
    utilityRemainingThisPeriod: 250,
    utilityOverageRate: 20,
    marketingWalletBalance: 5000,
    marketingRate: 130,
    marketingMessagesThisMonth: 40,
    marketingSpendThisMonth: 5200,
    botRepliesThisMonth: 12,
    paystackManageUrl: null,
    stripeManageUrl: null,
    ...overrides,
  };
}

function makePlans(currentTier = 'starter') {
  return {
    currency: 'NGN',
    plans: [
      {
        planId: 'starter_ngn',
        planTier: 'starter',
        amount: 8000,
        amountDisplay: '₦8,000',
        utilityIncluded: 300,
        marketingRate: 130,
        marketingRateDisplay: '₦130/msg',
        isCurrent: currentTier === 'starter',
      },
      {
        planId: 'growth_ngn',
        planTier: 'growth',
        amount: 20000,
        amountDisplay: '₦20,000',
        utilityIncluded: 800,
        marketingRate: 115,
        marketingRateDisplay: '₦115/msg',
        isCurrent: currentTier === 'growth',
      },
      {
        planId: 'connect_ngn',
        planTier: 'connect',
        amount: 45000,
        amountDisplay: '₦45,000',
        utilityIncluded: 2000,
        marketingRate: 105,
        marketingRateDisplay: '₦105/msg',
        isCurrent: currentTier === 'connect',
      },
    ],
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('billing/status')) return Promise.resolve(makeStatus());
    if (path.includes('billing/plans')) return Promise.resolve(makePlans());
    return Promise.resolve(null);
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('renders the usage section with utility, marketing, and bot-reply figures', async () => {
  render(<BillingPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText("This Month's Usage")).toBeInTheDocument();
  });

  expect(
    screen.getByText((_, el) => el?.textContent === '50 / 300'),
  ).toBeInTheDocument();
  expect(screen.getByText('₦5,200 spent this month')).toBeInTheDocument();
  expect(screen.getByText('12')).toBeInTheDocument();
});

it('renders all three plans with full feature lists and marks the current plan', async () => {
  render(<BillingPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Solo Store')).toBeInTheDocument();
  });

  expect(screen.getByText('Growing Chain')).toBeInTheDocument();
  expect(screen.getByText('Existing System')).toBeInTheDocument();
  expect(screen.getByText('Current Plan')).toBeInTheDocument();
  expect(screen.getByText('Dedicated onboarding support')).toBeInTheDocument();
});

it('clicking Upgrade on a higher plan calls POST /billing/change-plan with that planTier', async () => {
  mockApi.post.mockResolvedValue({ message: 'Plan updated to growth.' });

  render(<BillingPage />, { wrapper });

  await waitFor(() => screen.getByText(/Upgrade to growth/));
  await userEvent.click(screen.getByText(/Upgrade to growth/));

  await waitFor(() => {
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/billing/change-plan', {
      planTier: 'growth',
    });
  });
});

it('clicking Downgrade on a lower plan calls POST /billing/change-plan with that planTier', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('billing/status'))
      return Promise.resolve(makeStatus({ planTier: 'growth', amount: 20000 }));
    if (path.includes('billing/plans')) return Promise.resolve(makePlans('growth'));
    return Promise.resolve(null);
  });
  mockApi.post.mockResolvedValue({ message: 'Plan updated to starter.' });

  render(<BillingPage />, { wrapper });

  await waitFor(() => screen.getByText(/Downgrade to starter/));
  await userEvent.click(screen.getByText(/Downgrade to starter/));

  await waitFor(() => {
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/billing/change-plan', {
      planTier: 'starter',
    });
  });
});

it('on the top Connect tier, every other plan shows Downgrade — never Upgrade — regardless of amount', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('billing/status'))
      return Promise.resolve(makeStatus({ planTier: 'connect', amount: 45000 }));
    if (path.includes('billing/plans')) return Promise.resolve(makePlans('connect'));
    return Promise.resolve(null);
  });

  render(<BillingPage />, { wrapper });

  await waitFor(() => screen.getByText('Current Plan'));

  expect(screen.getByText(/Downgrade to starter/)).toBeInTheDocument();
  expect(screen.getByText(/Downgrade to growth/)).toBeInTheDocument();
  const upgradeButtons = screen
    .getAllByRole('button')
    .filter((btn) => /Upgrade/.test(btn.textContent ?? ''));
  expect(upgradeButtons).toHaveLength(0);
});

it('suspended tenants see "Select" buttons that start checkout instead of change-plan', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('billing/status'))
      return Promise.resolve(makeStatus({ status: 'suspended' }));
    if (path.includes('billing/plans')) return Promise.resolve(makePlans());
    return Promise.resolve(null);
  });
  mockApi.post.mockResolvedValue({ authorizationUrl: 'https://paystack.com/pay/x' });

  render(<BillingPage />, { wrapper });

  await waitFor(() => screen.getByText('Select Growing Chain'));
  await userEvent.click(screen.getByText('Select Growing Chain'));

  await waitFor(() => {
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/billing/subscribe', {
      planId: 'growth_ngn',
    });
  });
});
