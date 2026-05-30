import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { WaBotService } from '../../src/modules/whatsapp/wa-bot.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { TierConfig } from '../../src/modules/tenants/entities/tier-config.entity';
import { TriggerLog } from '../../src/modules/triggers/entities/trigger-log.entity';
import {
  TriggerStatus,
  TriggerType,
  WaVerificationStatus,
} from '@pingloyal/types';

// Mock the @pingloyal/utils decrypt function + maskPhone
jest.mock('@pingloyal/utils', () => ({
  decrypt: jest.fn(() => 'decrypted-api-key'),
  maskPhone: jest.fn((p: string) => p.slice(0, 4) + '****'),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT: Partial<Tenant> = {
  id: 'tenant-1',
  businessName: 'FreshMart',
  gupshupAppId: 'app-fresh',
  gupshupApiKey: 'encrypted-key',
  waPhoneNumber: '+2341234567890',
  waVerificationStatus: WaVerificationStatus.VERIFIED,
  pointsThreshold: 1000,
  pointsEarnRate: 100,
  rewardValue: 1000,
  currency: 'NGN',
  lapsedDays: 60,
};

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    tenantId: 'tenant-1',
    fullName: 'Amara Okafor',
    phoneE164: '+2348012345678',
    pointsBalance: 800,
    tierId: null,
    waOptedIn: true,
    lastPurchaseAt: null,
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('WaBotService', () => {
  let service: WaBotService;
  let mockTenantRepo: Record<string, jest.Mock>;
  let mockCustomerRepo: Record<string, jest.Mock>;
  let mockTierConfigRepo: Record<string, jest.Mock>;
  let mockTriggerLogRepo: Record<string, jest.Mock>;

  const mockConfig = {
    getOrThrow: jest.fn().mockReturnValue('https://api.gupshup.io'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default fetch success
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'submitted', messageId: 'wa-msg-1' }),
    });

    mockTenantRepo = { findOne: jest.fn().mockResolvedValue(TENANT) };
    mockCustomerRepo = {
      findOne: jest.fn().mockResolvedValue(makeCustomer()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockTierConfigRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockTriggerLogRepo = {
      create: jest.fn((d: unknown) => d),
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaBotService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        {
          provide: getRepositoryToken(TierConfig),
          useValue: mockTierConfigRepo,
        },
        {
          provide: getRepositoryToken(TriggerLog),
          useValue: mockTriggerLogRepo,
        },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(WaBotService);
  });

  function call(overrides: Record<string, string> = {}) {
    return service.handleInbound({
      appId: 'app-fresh',
      senderPhone: '+2348012345678',
      messageText: 'hi',
      ...overrides,
    });
  }

  // ── T1: Unknown appId → silent return ─────────────────────────────────────

  it('T1 — unknown appId returns silently without sending', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    await call();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockTriggerLogRepo.save).not.toHaveBeenCalled();
  });

  // ── T2: Customer not found → registration prompt ───────────────────────────

  it('T2 — unregistered phone sends registration prompt', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(null);

    await call();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(fetchCall[1].body as string);
    const msg = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(msg.text).toContain('not yet registered');
    expect(msg.text).toContain('FreshMart');
  });

  // ── T3: Customer found → sends balance summary ─────────────────────────────

  it('T3 — registered customer receives balance summary', async () => {
    await call();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const msg = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(msg.text).toContain('Amara');
    expect(msg.text).toContain('Points:');
    expect(msg.text).toContain('800');
  });

  // ── T4: amountToGoal calculation (800pts, threshold=1000, rate=100) ────────

  it('T4 — amountToGoal: 200pts × ₦100 earnRate = ₦20,000', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 800 }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const msg = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(msg.text).toContain('20,000');
  });

  // ── T5: amountToGoal rounded up (855pts, threshold=1000, rate=100) ─────────

  it('T5 — amountToGoal: 145pts × ₦100 = ₦14,500 (no rounding needed)', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 855 }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const msg = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(msg.text).toContain('14,500');
  });

  // ── T6: reward unlocked ────────────────────────────────────────────────────

  it('T6 — reward unlocked when pointsBalance >= threshold', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 1000 }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const msg = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(msg.text).toContain('You have unlocked your');
    expect(msg.text).not.toContain('Spend');
  });

  // ── T7: lastPurchaseAt = today → 'Today' ─────────────────────────────────

  it("T7 — lastPurchaseAt today shows 'Today'", async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ lastPurchaseAt: new Date() }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const text = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(text.text).toContain('Today');
  });

  // ── T8: lastPurchaseAt = yesterday ────────────────────────────────────────

  it("T8 — lastPurchaseAt 1 day ago shows 'Yesterday'", async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ lastPurchaseAt: yesterday }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const text = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(text.text).toContain('Yesterday');
  });

  // ── T9: lastPurchaseAt = 5 days ago ───────────────────────────────────────

  it("T9 — lastPurchaseAt 5 days ago shows '5 days ago'", async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ lastPurchaseAt: fiveDaysAgo }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const text = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(text.text).toContain('5 days ago');
  });

  // ── T10: lastPurchaseAt = null → 'No purchases yet' ───────────────────────

  it("T10 — lastPurchaseAt null shows 'No purchases yet'", async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ lastPurchaseAt: null }),
    );

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const text = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(text.text).toContain('No purchases yet');
  });

  // ── T11: trigger_log saved as BALANCE_BOT_REPLY ───────────────────────────

  it('T11 — saves trigger_log with BALANCE_BOT_REPLY type and SENT status', async () => {
    await call();

    expect(mockTriggerLogRepo.save).toHaveBeenCalledTimes(1);
    expect(mockTriggerLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: TriggerType.BALANCE_BOT_REPLY,
        status: TriggerStatus.SENT,
      }),
    );
  });

  // ── T12: STOP command ─────────────────────────────────────────────────────

  it('T12 — STOP command unsubscribes customer and sends opt-out message', async () => {
    await call({ messageText: 'stop' });

    expect(mockCustomerRepo.update).toHaveBeenCalledWith('cust-1', {
      waOptedIn: false,
    });
    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const text = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(text.text).toContain('unsubscribed');
    // Balance summary should NOT be sent
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ── T13: wallet NOT deducted ───────────────────────────────────────────────

  it('T13 — does NOT call walletService for bot replies (free service messages)', async () => {
    // WaBotService has no walletService injection — verify fetch is called but no wallet deduction
    await call();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Confirm it's a session message call (/msg) not template (/template/msg)
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toMatch(/\/msg$/);
    expect(url).not.toContain('/template/');
  });

  // ── T14: GBP tenant uses £ ────────────────────────────────────────────────

  it('T14 — GBP tenant uses £ currency symbol', async () => {
    mockTenantRepo.findOne.mockResolvedValue({ ...TENANT, currency: 'GBP' });

    await call();

    const body = new URLSearchParams(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    const text = JSON.parse(body.get('message') ?? '{}') as { text: string };
    expect(text.text).toContain('£');
    expect(text.text).not.toContain('₦');
  });

  // ── T15: Gupshup fails → error logged, no exception ──────────────────────

  it('T15 — Gupshup send failure is caught, trigger_log saved as FAILED', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(call()).resolves.not.toThrow();

    expect(mockTriggerLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: TriggerStatus.FAILED }),
    );
  });
});
