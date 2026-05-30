import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Campaign, CampaignStats as CampaignStatsType } from '../lib/api';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/api'),
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: mockPush, replace: jest.fn() })),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'campaign-123' }),
}));

import { api } from '../lib/api';
const mockApi = api as jest.Mocked<typeof api>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DRAFT_CAMPAIGN: Campaign = {
  id: 'camp-1',
  tenantId: 'tenant-1',
  name: 'Weekend Promo',
  messageBody: 'Hi {{firstName}}!',
  segmentRules: {},
  status: 'draft',
  scheduledAt: null,
  sentAt: null,
  totalRecipients: 0,
  sentCount: 0,
  deliveredCount: 0,
  failedCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const SENDING_CAMPAIGN: Campaign = {
  ...DRAFT_CAMPAIGN,
  id: 'camp-2',
  status: 'sending',
  totalRecipients: 100,
  sentCount: 45,
};

const SENT_CAMPAIGN: Campaign = {
  ...DRAFT_CAMPAIGN,
  id: 'camp-3',
  status: 'sent',
  totalRecipients: 100,
  sentCount: 100,
  deliveredCount: 95,
  failedCount: 5,
};

const STATS_SENDING: CampaignStatsType = {
  id: 'camp-2',
  name: 'Weekend Promo',
  status: 'sending',
  totalRecipients: 100,
  sentCount: 45,
  deliveredCount: 40,
  failedCount: 5,
  deliveryRate: 89,
  estimatedCost: 5850,
  createdAt: new Date().toISOString(),
  scheduledAt: null,
  sentAt: null,
};

const STATS_SENT: CampaignStatsType = {
  ...STATS_SENDING,
  status: 'sent',
  sentCount: 100,
  deliveredCount: 95,
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockApi.get.mockResolvedValue([]);
  mockApi.post.mockResolvedValue({});
  mockApi.patch.mockResolvedValue({});
}

// ── T1-T2: Campaign list ──────────────────────────────────────────────────────

import CampaignsPage from '../app/(dashboard)/campaigns/page';

describe('Campaign list page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue([
      DRAFT_CAMPAIGN,
      SENDING_CAMPAIGN,
      SENT_CAMPAIGN,
    ]);
  });

  it('T1 — shows correct status badge colours for each campaign status', async () => {
    render(<CampaignsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('status-badge-draft')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-sending')).toBeInTheDocument();
      expect(screen.getByTestId('status-badge-sent')).toBeInTheDocument();
    });

    expect(screen.getByTestId('status-badge-draft')).toHaveClass('bg-slate-100');
    expect(screen.getByTestId('status-badge-sent')).toHaveClass('bg-green-600');
    expect(screen.getByTestId('status-badge-sending')).toHaveClass('bg-amber-100');
  });

  it('T2 — filter tabs update query on click', async () => {
    mockPush.mockClear();
    render(<CampaignsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-sent')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('filter-tab-sent'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('status=sent'),
    );
  });
});

// ── T3-T5: Audience builder ───────────────────────────────────────────────────

import NewCampaignPage from '../app/(dashboard)/campaigns/new/page';

describe('Audience builder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('tenants/me')) return Promise.resolve({ businessName: 'TestStore', rewardValue: 500, marketingWalletBalance: 10000, timezone: 'Africa/Lagos' });
      if (path.includes('tier-config')) return Promise.resolve([]);
      if (path.includes('categories')) return Promise.resolve([]);
      if (path.includes('templates')) return Promise.resolve([]);
      if (path.includes('audience-preview')) return Promise.resolve({ count: 0, sampleNames: [] });
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('T3 — debounces audience preview API call by 1 second', async () => {
    render(<NewCampaignPage />);

    // Wait for initial render & initial preview call
    await act(async () => { await Promise.resolve(); });
    const initialCallCount = mockApi.get.mock.calls.filter((c) =>
      (c[0] as string).includes('audience-preview'),
    ).length;

    // Advance less than 1 second — should NOT fire another call
    act(() => { jest.advanceTimersByTime(500); });
    const midCallCount = mockApi.get.mock.calls.filter((c) =>
      (c[0] as string).includes('audience-preview'),
    ).length;
    expect(midCallCount).toBe(initialCallCount);

    // Advance past 1 second — should fire
    act(() => { jest.advanceTimersByTime(600); });
    await act(async () => { await Promise.resolve(); });
    const afterCallCount = mockApi.get.mock.calls.filter((c) =>
      (c[0] as string).includes('audience-preview'),
    ).length;
    expect(afterCallCount).toBeGreaterThan(initialCallCount);
  });

  it('T4 — shows zero-audience warning when count is 0', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('audience-preview')) return Promise.resolve({ count: 0, sampleNames: [] });
      return Promise.resolve([]);
    });

    render(<NewCampaignPage />);

    act(() => { jest.advanceTimersByTime(1100); });
    await act(async () => { await Promise.resolve(); });

    await waitFor(() => {
      expect(screen.getByTestId('zero-audience-warning')).toBeInTheDocument();
    });
  });

  it('T5 — Send Now button is disabled when audience count is 0', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('audience-preview')) return Promise.resolve({ count: 0, sampleNames: [] });
      return Promise.resolve([]);
    });

    render(<NewCampaignPage />);
    act(() => { jest.advanceTimersByTime(1100); });
    await act(async () => { await Promise.resolve(); });

    await waitFor(() => {
      expect(screen.getByTestId('send-now-button')).toBeDisabled();
    });
  });
});

// ── T6-T10: Message builder ───────────────────────────────────────────────────

import { MessageBuilder } from '../components/campaigns/MessageBuilder';
import { useForm, FormProvider } from 'react-hook-form';

function MessageBuilderWrapper({ initialBody = '' }: { initialBody?: string }) {
  const methods = useForm({ defaultValues: { messageBody: initialBody } });
  return (
    <FormProvider {...methods}>
      <MessageBuilder templates={[{ id: 'tpl-1', name: 'Test Tpl', body: 'Hello {{firstName}}!' }]} tenant={null} />
    </FormProvider>
  );
}

describe('Message builder', () => {
  it('T6 — variable chip click inserts variable at cursor position', async () => {
    render(<MessageBuilderWrapper initialBody="Hello " />);

    const textarea = screen.getByTestId('message-textarea') as HTMLTextAreaElement;
    await userEvent.click(textarea);
    textarea.selectionStart = 6;
    textarea.selectionEnd = 6;

    const chip = screen.getByTestId('variable-chip-{{firstName}}');
    await userEvent.click(chip);

    expect(textarea.value).toContain('{{firstName}}');
  });

  it('T7 — character counter shows red when message exceeds 1000 chars', async () => {
    const longMsg = 'a'.repeat(1001);
    render(<MessageBuilderWrapper initialBody={longMsg} />);

    await waitFor(() => {
      const counter = screen.getByTestId('char-counter');
      expect(counter).toHaveClass('text-red-500');
    });
  });

  it('T8 — clicking a template card loads its body into the textarea', async () => {
    render(<MessageBuilderWrapper />);

    const templateCard = screen.getByTestId('template-card-tpl-1');
    await userEvent.click(templateCard);

    const textarea = screen.getByTestId('message-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello {{firstName}}!');
  });

  it('T9 — live preview substitutes {{firstName}} with Sarah', async () => {
    render(<MessageBuilderWrapper initialBody="Hi {{firstName}}!" />);

    const preview = screen.getByTestId('message-preview');
    expect(preview).toHaveTextContent('Hi Sarah!');
  });

  it('T10 — live preview marks unknown variable in red', async () => {
    render(<MessageBuilderWrapper initialBody="Hello {{unknownVar}}!" />);

    await waitFor(() => {
      const unknownEl = screen.getByTestId('unknown-variable');
      expect(unknownEl).toBeInTheDocument();
      expect(unknownEl).toHaveClass('text-red-400');
    });
  });
});

// ── T11-T13: Schedule & Send ──────────────────────────────────────────────────

describe('Schedule & Send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('tenants/me')) return Promise.resolve({ businessName: 'TestStore', rewardValue: 500, marketingWalletBalance: 10000, timezone: 'Africa/Lagos' });
      if (path.includes('audience-preview')) return Promise.resolve({ count: 50, sampleNames: [] });
      return Promise.resolve([]);
    });
    mockApi.post.mockResolvedValue({ id: 'new-campaign-1', totalRecipients: 50 });
  });

  it('T11 — schedule button is disabled when date is in the past', async () => {
    render(<NewCampaignPage />);

    // Set a past date
    const dateInput = await screen.findByTestId('schedule-datetime-input');
    fireEvent.change(dateInput, { target: { value: '2020-01-01T08:00' } });

    expect(screen.getByTestId('schedule-button')).toBeDisabled();
  });

  it('T12 — schedule button is disabled when date is < 10 minutes away', async () => {
    render(<NewCampaignPage />);

    // Set date 3 minutes in the future
    const soonDate = new Date(Date.now() + 3 * 60 * 1000);
    const formatted = soonDate.toISOString().slice(0, 16);
    const dateInput = await screen.findByTestId('schedule-datetime-input');
    fireEvent.change(dateInput, { target: { value: formatted } });

    expect(screen.getByTestId('schedule-button')).toBeDisabled();
  });

  it('T13 — Send Now first creates campaign then calls send endpoint', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('tenants/me')) return Promise.resolve({ businessName: 'T', rewardValue: 500, marketingWalletBalance: 10000, timezone: 'UTC' });
      if (path.includes('audience-preview')) return Promise.resolve({ count: 10, sampleNames: [] });
      return Promise.resolve([]);
    });
    mockApi.post
      .mockResolvedValueOnce({ id: 'new-camp-99' })
      .mockResolvedValueOnce({ totalRecipients: 10 });

    render(<NewCampaignPage />);

    // Wait for audience count to load
    await waitFor(() => {
      expect(screen.getByTestId('audience-count')).toBeInTheDocument();
    });

    // Fill in name + message
    const nameInput = screen.getByTestId('campaign-name-input');
    await userEvent.type(nameInput, 'Test Campaign');
    const textarea = screen.getByTestId('message-textarea');
    await userEvent.type(textarea, 'Hello {{firstName}} come visit us!');

    const sendBtn = screen.getByTestId('send-now-button');
    await userEvent.click(sendBtn);

    await waitFor(() => {
      // POST /campaigns
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/v1/campaigns',
        expect.objectContaining({ name: 'Test Campaign' }),
      );
      // POST /campaigns/:id/send
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/v1/campaigns/new-camp-99/send',
        {},
      );
    });
  });
});

// ── T14-T15: Campaign detail auto-refresh ─────────────────────────────────────

import CampaignDetailPage from '../app/(dashboard)/campaigns/[id]/page';

describe('Campaign detail auto-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('T14 — auto-refreshes stats every 5 seconds when status is sending', async () => {
    let callCount = 0;
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('/stats')) {
        callCount++;
        return Promise.resolve(STATS_SENDING);
      }
      if (path.endsWith(`/campaign-123`)) return Promise.resolve(SENDING_CAMPAIGN);
      if (path.includes('/logs')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve(null);
    });

    render(<CampaignDetailPage />);

    // Wait for initial load
    await act(async () => { await Promise.resolve(); });
    const initialCount = callCount;

    // Advance 5 seconds — should trigger one more poll
    act(() => { jest.advanceTimersByTime(5000); });
    await act(async () => { await Promise.resolve(); });

    expect(callCount).toBeGreaterThan(initialCount);
  });

  it('T15 — stops polling when campaign status changes to sent', async () => {
    let statsCallCount = 0;
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('/stats')) {
        statsCallCount++;
        // After first call, return 'sent'
        return Promise.resolve(statsCallCount === 1 ? STATS_SENDING : STATS_SENT);
      }
      if (path.endsWith('/campaign-123')) return Promise.resolve(SENDING_CAMPAIGN);
      if (path.includes('/logs')) return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve(null);
    });

    render(<CampaignDetailPage />);
    await act(async () => { await Promise.resolve(); });

    // Advance past first interval — status becomes 'sent'
    act(() => { jest.advanceTimersByTime(5000); });
    await act(async () => { await Promise.resolve(); });

    const countAfterSent = statsCallCount;

    // Advance another interval — should NOT poll again
    act(() => { jest.advanceTimersByTime(5000); });
    await act(async () => { await Promise.resolve(); });

    expect(statsCallCount).toBe(countAfterSent);
  });
});
