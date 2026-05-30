import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: () => new URLSearchParams(),
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

Object.assign(navigator, {
  clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
});

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import IntegrationsPage from '../app/(dashboard)/settings/integrations/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTenant() {
  return {
    id: 'tenant-1',
    slug: 'freshmart',
    businessName: 'FreshMart',
    mode: 'connected',
    marketingWalletBalance: 5000,
    waVerificationStatus: 'verified',
    timezone: 'Africa/Lagos',
    pointsEarnRate: 100,
    pointsThreshold: 1000,
    rewardValue: 1000,
    lapsedDays: 60,
    currency: 'NGN',
    planTier: 'starter',
    subscriptionStatus: 'active',
    trialEndsAt: null,
    logoUrl: null,
    qrCodeUrl: null,
    whatsapp: { isConnected: true, verificationStatus: 'verified', displayName: null, phoneNumber: null, category: null, verifiedAt: null },
  };
}

function makeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integ-1',
    connectionType: 'webhook',
    endpointUrl: null,
    apiKey: '••••••••',
    webhookSecret: '••••••abcdef',
    pollIntervalMins: 15,
    fieldMapping: {
      phone: 'customer_phone',
      amount: 'sale_amount',
    },
    syncStatus: 'active',
    lastSyncedAt: new Date().toISOString(),
    errorMessage: null,
    ...overrides,
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
    if (path.includes('tenants/me')) return Promise.resolve(makeTenant());
    if (path.includes('integrations')) return Promise.resolve(makeIntegration());
    return Promise.resolve(null);
  });
  mockApi.post.mockResolvedValue(makeIntegration());
});

// ── T15: Webhook URL shown and copyable ───────────────────────────────────────

it('T15 — webhook URL is shown and copy button copies to clipboard', async () => {
  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByTestId('webhook-url')).toBeInTheDocument();
  });

  const urlInput = screen.getByTestId('webhook-url') as HTMLInputElement;
  expect(urlInput.value).toContain('/integrations/webhook/freshmart');

  const copyBtn = screen.getByTestId('copy-webhook-url');
  await userEvent.click(copyBtn);

  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
    expect.stringContaining('freshmart'),
  );
});

// ── T16: Webhook secret shown masked ─────────────────────────────────────────

it('T16 — webhook secret is shown with only last 6 chars visible', async () => {
  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByTestId('webhook-secret')).toBeInTheDocument();
  });

  const secretInput = screen.getByTestId('webhook-secret') as HTMLInputElement;
  expect(secretInput.value).toMatch(/^••••••/);
  expect(secretInput.value).toContain('abcdef');
});

// ── T17: Field mapper placeholder text ────────────────────────────────────────

it('T17 — field mapper shows correct placeholder text for phone field', async () => {
  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    const phoneInput = screen.getByTestId('field-phone') as HTMLInputElement;
    expect(phoneInput.placeholder).toContain('msisdn');
  });
});

// ── T18: Empty phone field shows validation error ──────────────────────────────

it('T18 — saving with empty phone field shows validation error', async () => {
  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Save Integration Settings')).toBeInTheDocument();
  });

  // Clear the phone field
  const phoneInput = screen.getByTestId('field-phone');
  await userEvent.clear(phoneInput);

  // Try to submit
  await userEvent.click(screen.getByText('Save Integration Settings'));

  await waitFor(() => {
    expect(screen.getByText('Phone field name is required')).toBeInTheDocument();
  });
});

// ── T19: Sync status shows Connected ─────────────────────────────────────────

it('T19 — sync status shows Connected when syncStatus = active', async () => {
  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    const statusText = screen.getByTestId('sync-status-text');
    expect(statusText).toHaveTextContent('✅ Connected');
  });
});

// ── T20: Sync status shows error message ─────────────────────────────────────

it('T20 — sync status shows error message when syncStatus = error', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('tenants/me')) return Promise.resolve(makeTenant());
    if (path.includes('integrations'))
      return Promise.resolve(
        makeIntegration({ syncStatus: 'error', errorMessage: 'API key rejected' }),
      );
    return Promise.resolve(null);
  });

  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    const statusText = screen.getByTestId('sync-status-text');
    expect(statusText).toHaveTextContent('❌ Error: API key rejected');
  });
});

// ── T21: Retry Now button calls POST /integrations/test ──────────────────────

it('T21 — Retry Now button calls POST /integrations/test', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('tenants/me')) return Promise.resolve(makeTenant());
    if (path.includes('integrations'))
      return Promise.resolve(
        makeIntegration({ syncStatus: 'error', errorMessage: 'Connection failed' }),
      );
    return Promise.resolve(null);
  });
  mockApi.post.mockResolvedValue({});

  render(<IntegrationsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByTestId('retry-now-button')).toBeInTheDocument();
  });

  await userEvent.click(screen.getByTestId('retry-now-button'));

  await waitFor(() => {
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/integrations/test', {});
  });
});
