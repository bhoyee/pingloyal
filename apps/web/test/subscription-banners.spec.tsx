import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}));

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

// Import the layout's DashboardContent — we test via rendering it
// Since layout uses 'use client' + hooks, render it directly
import DashboardLayout from '../app/(dashboard)/layout';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

function makeBillingStatus(overrides: Record<string, unknown> = {}) {
  return {
    status: 'active',
    trialDaysRemaining: null,
    planTier: 'starter',
    utilityIncluded: 300,
    marketingRate: 130,
    currency: 'NGN',
    ...overrides,
  };
}

// The layout also fetches /api/v1/tenants/me to check onboarding status —
// route each endpoint to its own response so onboarding doesn't redirect away.
function mockApiResponses(billingStatus: Record<string, unknown>) {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('billing/status')) return Promise.resolve(billingStatus);
    if (path.includes('tenants/me')) return Promise.resolve({ qrCodeUrl: 'https://example.com/qr.png' });
    return Promise.resolve({});
  });
}

// T16: trialing 10 days → blue trial banner ───────────────────────────────────

it('T16 — trialing with 10 days remaining shows blue trial banner', async () => {
  mockApiResponses(
    makeBillingStatus({ status: 'trialing', trialDaysRemaining: 10 }),
  );

  render(
    <DashboardLayout>
      <div data-testid="content">Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    expect(screen.getByTestId('trial-banner')).toBeInTheDocument();
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('10 days remaining');
  });

  // Content still shown (not hidden by banner)
  expect(screen.getByTestId('content')).toBeInTheDocument();
});

// T17: trialing 2 days → urgent warning banner ────────────────────────────────

it('T17 — trialing with 2 days remaining shows urgent warning banner', async () => {
  mockApiResponses(
    makeBillingStatus({ status: 'trialing', trialDaysRemaining: 2 }),
  );

  render(
    <DashboardLayout>
      <div>Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    const banner = screen.getByTestId('trial-banner');
    expect(banner).toHaveTextContent('Trial ending soon');
    expect(banner).toHaveTextContent('2 day');
  });
});

// T18: past_due → amber payment banner ────────────────────────────────────────

it('T18 — past_due status shows amber payment failed banner', async () => {
  mockApiResponses(makeBillingStatus({ status: 'past_due' }));

  render(
    <DashboardLayout>
      <div data-testid="content">Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    expect(screen.getByTestId('past-due-banner')).toBeInTheDocument();
    expect(screen.getByTestId('past-due-banner')).toHaveTextContent('Payment failed');
  });

  expect(screen.getByTestId('content')).toBeInTheDocument();
});

// T19: suspended → full-page overlay, content hidden ──────────────────────────

it('T19 — suspended status shows full-page overlay and hides dashboard content', async () => {
  mockApiResponses(makeBillingStatus({ status: 'suspended' }));

  render(
    <DashboardLayout>
      <div data-testid="dashboard-content">Secret Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    expect(screen.getByTestId('suspended-overlay')).toBeInTheDocument();
  });

  // Dashboard content should not be rendered
  expect(screen.queryByTestId('dashboard-content')).not.toBeInTheDocument();
});

// T20: active → no banner ─────────────────────────────────────────────────────

it('T20 — active subscription shows no status banner', async () => {
  mockApiResponses(makeBillingStatus({ status: 'active' }));

  render(
    <DashboardLayout>
      <div data-testid="content">Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  expect(screen.queryByTestId('trial-banner')).not.toBeInTheDocument();
  expect(screen.queryByTestId('past-due-banner')).not.toBeInTheDocument();
  expect(screen.queryByTestId('suspended-overlay')).not.toBeInTheDocument();
});

// T21: suspended overlay has subscribe link to /billing ────────────────────────

it('T21 — suspended overlay shows Subscribe button linking to /billing', async () => {
  mockApiResponses(makeBillingStatus({ status: 'suspended' }));

  render(
    <DashboardLayout>
      <div>Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    const link = screen.getByTestId('suspended-subscribe-link') as HTMLAnchorElement;
    expect(link.href).toContain('/billing');
  });
});

// T22: trial banner Subscribe button links to /billing ────────────────────────

it('T22 — trial banner Subscribe Now button links to /billing', async () => {
  mockApiResponses(
    makeBillingStatus({ status: 'trialing', trialDaysRemaining: 8 }),
  );

  render(
    <DashboardLayout>
      <div>Dashboard</div>
    </DashboardLayout>,
    { wrapper },
  );

  await waitFor(() => {
    const link = screen.getByTestId('trial-subscribe-link') as HTMLAnchorElement;
    expect(link.href).toContain('/billing');
  });
});
