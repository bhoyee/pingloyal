import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), put: jest.fn(), upload: jest.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

import SettingsPage from '../app/(dashboard)/settings/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-1',
    businessName: 'FreshMart',
    ownerName: 'Amaka',
    slug: 'freshmart',
    mode: 'native',
    planTier: 'starter',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    pointsEarnRate: 100,
    pointsThreshold: 1000,
    rewardValue: 1000,
    lapsedDays: 60,
    subscriptionStatus: 'active',
    trialEndsAt: null,
    logoUrl: null,
    qrCodeUrl: null,
    marketingWalletBalance: 5000,
    whatsapp: {
      isConnected: true,
      verificationStatus: 'verified',
      displayName: 'FreshMart NG',
      phoneNumber: '+2348011234567',
      category: 'Retail',
      verifiedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

function makeTiers() {
  return [
    { id: 't1', tierName: 'vip', tierLabel: 'VIP Member', minQuarterlySpend: 400000, maxQuarterlySpend: null, displayOrder: 0 },
    { id: 't2', tierName: 'mid', tierLabel: 'Regular Customer', minQuarterlySpend: 100000, maxQuarterlySpend: 399999, displayOrder: 1 },
    { id: 't3', tierName: 'standard', tierLabel: 'Standard', minQuarterlySpend: 0, maxQuarterlySpend: 99999, displayOrder: 2 },
  ];
}

function makeCategories() {
  return [
    { id: 'c1', name: 'Beverages', slug: 'beverages' },
    { id: 'c2', name: 'Snacks', slug: 'snacks' },
  ];
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('tier-config')) return Promise.resolve(makeTiers());
    if (path.includes('categories')) return Promise.resolve(makeCategories());
    if (path.includes('tenants/me')) return Promise.resolve(makeTenant());
    return Promise.resolve(null);
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('renders business profile, loyalty, tiers, categories and whatsapp sections', async () => {
  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByDisplayValue('FreshMart')).toBeInTheDocument();
  });

  expect(screen.getByDisplayValue('Africa/Lagos')).toBeInTheDocument();
  expect(screen.getByText('starter')).toBeInTheDocument();
  expect(screen.getByText('native')).toBeInTheDocument();

  expect(screen.getByDisplayValue('100')).toBeInTheDocument(); // pointsEarnRate
  expect(screen.getAllByDisplayValue('1000')).toHaveLength(2); // pointsThreshold and rewardValue

  expect(screen.getByDisplayValue('VIP Member')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Regular Customer')).toBeInTheDocument();

  expect(screen.getByText('Beverages')).toBeInTheDocument();
  expect(screen.getByText('Snacks')).toBeInTheDocument();

  expect(screen.getByText('verified')).toBeInTheDocument();
  expect(screen.getByText('FreshMart NG')).toBeInTheDocument();
});

it('saves business profile via PATCH /tenants/settings', async () => {
  mockApi.patch.mockResolvedValue(makeTenant({ businessName: 'Fresh Mart NG' }));
  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByDisplayValue('FreshMart')).toBeInTheDocument();
  });

  const nameInput = screen.getByDisplayValue('FreshMart');
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, 'Fresh Mart NG');

  await userEvent.click(screen.getByText('Save business profile'));

  await waitFor(() => {
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/api/v1/tenants/settings',
      expect.objectContaining({ businessName: 'Fresh Mart NG' }),
    );
  });

  expect(screen.getByText('Business profile updated')).toBeInTheDocument();
});

it('saves loyalty settings via PATCH /tenants/settings', async () => {
  mockApi.patch.mockResolvedValue(makeTenant());
  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Save loyalty settings')).toBeInTheDocument();
  });

  await userEvent.click(screen.getByText('Save loyalty settings'));

  await waitFor(() => {
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/api/v1/tenants/settings',
      expect.objectContaining({
        pointsEarnRate: 100,
        pointsThreshold: 1000,
        rewardValue: 1000,
        lapsedDays: 60,
      }),
    );
  });
});

it('saves loyalty tiers via PUT /tenants/tier-config', async () => {
  mockApi.put.mockResolvedValue(makeTiers());
  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Save loyalty tiers')).toBeInTheDocument();
  });

  await userEvent.click(screen.getByText('Save loyalty tiers'));

  await waitFor(() => {
    expect(mockApi.put).toHaveBeenCalledWith(
      '/api/v1/tenants/tier-config',
      expect.objectContaining({
        tiers: expect.arrayContaining([
          expect.objectContaining({ tierName: 'vip', minQuarterlySpend: 400000 }),
          expect.objectContaining({ tierName: 'mid', minQuarterlySpend: 100000, maxQuarterlySpend: 399999 }),
          expect.objectContaining({ tierName: 'standard', minQuarterlySpend: 0, maxQuarterlySpend: 99999 }),
        ]),
      }),
    );
  });
});

it('shows validation error and disables save when VIP min overlaps Mid max', async () => {
  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByDisplayValue('400000')).toBeInTheDocument();
  });

  const vipMinInput = screen.getByDisplayValue('400000');
  await userEvent.clear(vipMinInput);
  await userEvent.type(vipMinInput, '50000');

  await waitFor(() => {
    expect(screen.getByText(/VIP minimum must be higher than Mid maximum/)).toBeInTheDocument();
  });

  expect(screen.getByText('Save loyalty tiers')).toBeDisabled();
});

it('adds a new product category via POST /tenants/categories', async () => {
  mockApi.post.mockResolvedValue({ id: 'c3', name: 'Bakery', slug: 'bakery' });
  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Beverages')).toBeInTheDocument();
  });

  const input = screen.getByPlaceholderText('e.g. Beverages');
  await userEvent.type(input, 'Bakery');
  await userEvent.click(screen.getByText('Add category'));

  await waitFor(() => {
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/tenants/categories', { name: 'Bakery' });
  });

  expect(await screen.findByText('Bakery')).toBeInTheDocument();
});

it('falls back to default tiers when tier-config is empty', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('tier-config')) return Promise.resolve([]);
    if (path.includes('categories')) return Promise.resolve([]);
    if (path.includes('tenants/me')) return Promise.resolve(makeTenant());
    return Promise.resolve(null);
  });

  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByDisplayValue('VIP Member')).toBeInTheDocument();
  });

  expect(screen.getByDisplayValue('400000')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Regular Customer')).toBeInTheDocument();
});

it('shows WhatsApp not-connected message when whatsapp.isConnected is false', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('tier-config')) return Promise.resolve(makeTiers());
    if (path.includes('categories')) return Promise.resolve([]);
    if (path.includes('tenants/me'))
      return Promise.resolve(
        makeTenant({
          whatsapp: {
            isConnected: false,
            verificationStatus: 'pending',
            displayName: null,
            phoneNumber: null,
            category: null,
            verifiedAt: null,
          },
        }),
      );
    return Promise.resolve(null);
  });

  render(<SettingsPage />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText(/WhatsApp is not yet connected/)).toBeInTheDocument();
  });
});
