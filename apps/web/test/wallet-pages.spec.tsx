import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

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

import WalletPage from '../app/(dashboard)/billing/wallet/page';
import TopupPage from '../app/(dashboard)/billing/wallet/topup/page';
import WalletEmptyPage from '../app/(dashboard)/billing/wallet/empty/page';
import DashboardPage from '../app/(dashboard)/page';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeWallet(overrides = {}) {
  return {
    balance: 5000,
    ratePerMessage: 115,
    estimatedMessagesLeft: 43,
    thisMonthSpend: 2300,
    thisMonthMessageCount: 20,
    isLow: false,
    isEmpty: false,
    ...overrides,
  };
}

function makeTxResult(txs = []) {
  return { transactions: txs, total: 0, page: 1, limit: 20 };
}

function makeDashSummary(overrides = {}) {
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

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// T1: balance green when normal ───────────────────────────────────────────────

it('T1 — wallet overview shows balance in green when normal', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('balance')) return Promise.resolve(makeWallet());
    return Promise.resolve(makeTxResult());
  });

  render(<WalletPage />, { wrapper });

  await waitFor(() =>
    expect(screen.getByTestId('wallet-balance')).toBeInTheDocument(),
  );
  expect(screen.getByTestId('wallet-balance').className).toContain('text-green');
});

// T2: balance amber when isLow ────────────────────────────────────────────────

it('T2 — wallet overview shows amber colour when isLow=true', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('balance')) return Promise.resolve(makeWallet({ isLow: true, balance: 2000 }));
    return Promise.resolve(makeTxResult());
  });

  render(<WalletPage />, { wrapper });

  await waitFor(() => screen.getByTestId('wallet-balance'));
  expect(screen.getByTestId('wallet-balance').className).toContain('text-amber');
});

// T3: balance red when isEmpty ────────────────────────────────────────────────

it('T3 — wallet overview shows red colour when isEmpty=true', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('balance'))
      return Promise.resolve(makeWallet({ isEmpty: true, isLow: true, balance: 0 }));
    return Promise.resolve(makeTxResult());
  });

  render(<WalletPage />, { wrapper });

  await waitFor(() => screen.getByTestId('wallet-balance'));
  expect(screen.getByTestId('wallet-balance').className).toContain('text-red');
});

// T4: low balance warning shown ───────────────────────────────────────────────

it('T4 — low balance warning shown when isLow=true and not empty', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('balance'))
      return Promise.resolve(makeWallet({ isLow: true, balance: 1500 }));
    return Promise.resolve(makeTxResult());
  });

  render(<WalletPage />, { wrapper });

  await waitFor(() =>
    expect(screen.getByTestId('low-balance-warning')).toBeInTheDocument(),
  );
});

// T5: empty warning shown ─────────────────────────────────────────────────────

it('T5 — empty warning shown when isEmpty=true', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('balance'))
      return Promise.resolve(makeWallet({ isEmpty: true, isLow: true, balance: 0 }));
    return Promise.resolve(makeTxResult());
  });

  render(<WalletPage />, { wrapper });

  await waitFor(() =>
    expect(screen.getByTestId('empty-balance-warning')).toBeInTheDocument(),
  );
});

// T6: transaction type badge colours ──────────────────────────────────────────

it('T6 — transaction type badges render with correct colours', async () => {
  const txs = [
    { id: '1', type: 'topup', amount: 10000, balanceAfter: 10000, description: 'Top up', createdAt: new Date().toISOString() },
    { id: '2', type: 'debit_birthday', amount: -115, balanceAfter: 9885, description: 'Birthday', createdAt: new Date().toISOString() },
    { id: '3', type: 'debit_lapsed', amount: -115, balanceAfter: 9770, description: 'Win-back', createdAt: new Date().toISOString() },
    { id: '4', type: 'debit_campaign', amount: -115, balanceAfter: 9655, description: 'Campaign', createdAt: new Date().toISOString() },
  ];

  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('balance')) return Promise.resolve(makeWallet());
    return Promise.resolve({ transactions: txs, total: txs.length, page: 1, limit: 20 });
  });

  render(<WalletPage />, { wrapper });

  await waitFor(() => screen.getByTestId('badge-topup'));
  expect(screen.getByTestId('badge-topup').className).toContain('text-green');
  expect(screen.getByTestId('badge-debit_birthday').className).toContain('text-blue');
  expect(screen.getByTestId('badge-debit_lapsed').className).toContain('text-red');
  expect(screen.getByTestId('badge-debit_campaign').className).toContain('text-amber');
});

// T7: quick amount button sets input ──────────────────────────────────────────

it('T7 — clicking quick amount button sets the input value', async () => {
  mockApi.get.mockResolvedValue(makeWallet());

  render(<TopupPage />, { wrapper });

  await waitFor(() => screen.getByTestId('quick-15000'));
  fireEvent.click(screen.getByTestId('quick-15000'));

  await waitFor(() => {
    const input = screen.getByTestId('amount-input') as HTMLInputElement;
    expect(input.value).toBe('15,000');
  });
});

// T8: live preview calculates messages correctly ───────────────────────────────

it('T8 — live preview: amount=15000 rate=115 → ≈ 130 messages', async () => {
  mockApi.get.mockResolvedValue(makeWallet({ ratePerMessage: 115 }));

  render(<TopupPage />, { wrapper });

  await waitFor(() => screen.getByTestId('amount-input'));
  fireEvent.change(screen.getByTestId('amount-input'), {
    target: { value: '15,000' },
  });

  await waitFor(() => {
    const msgs = screen.getByTestId('preview-messages');
    expect(msgs.textContent).toBe('130'); // Math.floor(15000/115) = 130
  });
});

// T9: pay button disabled when amount < 1000 ──────────────────────────────────

it('T9 — Pay button is disabled when amount < 1000', async () => {
  mockApi.get.mockResolvedValue(makeWallet());

  render(<TopupPage />, { wrapper });

  await waitFor(() => screen.getByTestId('pay-btn'));

  // No amount entered
  expect(screen.getByTestId('pay-btn')).toBeDisabled();

  // Enter invalid amount
  fireEvent.change(screen.getByTestId('amount-input'), {
    target: { value: '500' },
  });
  expect(screen.getByTestId('pay-btn')).toBeDisabled();
});

// T10: pay button shows formatted amount ──────────────────────────────────────

it('T10 — Pay button shows formatted amount ₦15,000', async () => {
  mockApi.get.mockResolvedValue(makeWallet());

  render(<TopupPage />, { wrapper });

  await waitFor(() => screen.getByTestId('amount-input'));
  fireEvent.click(screen.getByTestId('quick-15000'));

  await waitFor(() =>
    expect(screen.getByTestId('pay-btn').textContent).toContain('₦15,000'),
  );
});

// T11: clicking Pay calls POST /billing/wallet/topup ─────────────────────────

it('T11 — clicking Pay calls POST /billing/wallet/topup', async () => {
  mockApi.get.mockResolvedValue(makeWallet());
  mockApi.post.mockResolvedValue({
    authorizationUrl: 'https://checkout.paystack.com/abc',
    reference: 'ref_test',
    amount: 15000,
    amountDisplay: '₦15,000',
  });

  // Mock window.location.href assignment
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  });

  render(<TopupPage />, { wrapper });

  await waitFor(() => screen.getByTestId('quick-15000'));
  fireEvent.click(screen.getByTestId('quick-15000'));

  await waitFor(() => expect(screen.getByTestId('pay-btn')).not.toBeDisabled());
  fireEvent.click(screen.getByTestId('pay-btn'));

  await waitFor(() =>
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/billing/wallet/topup', {
      amount: 15000,
    }),
  );
});

// T12: successful response redirects to Paystack URL ─────────────────────────

it('T12 — successful topup response sets window.location to authorizationUrl', async () => {
  mockApi.get.mockResolvedValue(makeWallet());
  const authUrl = 'https://checkout.paystack.com/test123';
  mockApi.post.mockResolvedValue({
    authorizationUrl: authUrl,
    reference: 'ref_test',
    amount: 15000,
    amountDisplay: '₦15,000',
  });

  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  });

  render(<TopupPage />, { wrapper });

  await waitFor(() => screen.getByTestId('quick-15000'));
  fireEvent.click(screen.getByTestId('quick-15000'));
  await waitFor(() => expect(screen.getByTestId('pay-btn')).not.toBeDisabled());
  fireEvent.click(screen.getByTestId('pay-btn'));

  await waitFor(() => expect(window.location.href).toBe(authUrl));
});

// T13: empty state page shows paused vs running ───────────────────────────────

it('T13 — empty state page shows paused and running sections', () => {
  render(<WalletEmptyPage />, { wrapper });

  expect(screen.getByTestId('paused-running-split')).toBeInTheDocument();
  expect(screen.getByTestId('paused-list')).toBeInTheDocument();
  expect(screen.getByTestId('running-list')).toBeInTheDocument();

  // Paused items
  expect(screen.getByText('Birthday messages')).toBeInTheDocument();
  expect(screen.getByText('Lapsed win-backs')).toBeInTheDocument();

  // Running items
  expect(screen.getByText('Purchase confirmations')).toBeInTheDocument();
  expect(screen.getByText('Welcome messages')).toBeInTheDocument();
});

// T14: dashboard wallet card shows correct colour ─────────────────────────────

it('T14 — dashboard wallet card shows red colour when walletIsEmpty=true', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary'))
      return Promise.resolve(makeDashSummary({ walletIsEmpty: true, walletBalance: 0 }));
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() =>
    expect(screen.getByTestId('wallet-metric-card')).toBeInTheDocument(),
  );
  expect(screen.getByTestId('wallet-metric-balance').className).toContain('text-red');
});

// T15: dashboard red banner shown when walletIsEmpty ──────────────────────────

it('T15 — dashboard shows red alert banner when walletIsEmpty=true', async () => {
  mockApi.get.mockImplementation((path: string) => {
    if (path.includes('summary'))
      return Promise.resolve(makeDashSummary({ walletIsEmpty: true, walletBalance: 0 }));
    return Promise.resolve([]);
  });

  render(<DashboardPage />, { wrapper });

  await waitFor(() =>
    expect(screen.getByTestId('alert-banner')).toBeInTheDocument(),
  );
  expect(screen.getByTestId('alert-banner').className).toContain('bg-red');
});
