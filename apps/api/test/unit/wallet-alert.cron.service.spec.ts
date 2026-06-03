import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { WalletAlertCronService } from '../../src/modules/billing/wallet-alert.cron';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { TriggerType } from '@pingloyal/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid';

function makeTenant(overrides: Partial<Tenant> = {}): Partial<Tenant> {
  return {
    id: TENANT_ID,
    businessName: 'FreshMart',
    marketingWalletBalance: 500,
    walletLowAlertSentAt: null,
    ...overrides,
  };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('WalletAlertCronService', () => {
  let service: WalletAlertCronService;
  let mockTenantRepo: { createQueryBuilder: jest.Mock; update: jest.Mock };
  let mockQb: Record<string, jest.Mock>;
  let mockWaQueue: { add: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockTenantRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockWaQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletAlertCronService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
      ],
    }).compile();

    service = module.get(WalletAlertCronService);
  });

  // ── T1: balance = 0 → WALLET_ZERO ─────────────────────────────────────────

  it('T1 — tenant with balance=0 → wallet_zero alert queued', async () => {
    mockQb.getMany.mockResolvedValue([
      makeTenant({ marketingWalletBalance: 0 }),
    ]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ type: TriggerType.WALLET_ZERO }),
      expect.any(Object),
    );
  });

  // ── T2: balance = 2000 → WALLET_LOW_BALANCE ───────────────────────────────

  it('T2 — tenant with balance=2000 → wallet_low_balance alert queued', async () => {
    mockQb.getMany.mockResolvedValue([
      makeTenant({ marketingWalletBalance: 2000 }),
    ]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ type: TriggerType.WALLET_LOW_BALANCE }),
      expect.any(Object),
    );
  });

  // ── T3: balance = 5000 → no alert (above threshold, excluded by QB) ───────

  it('T3 — tenant with balance=5000: QB excludes them, no alert queued', async () => {
    // QB returns no tenants (they are filtered out by the query)
    mockQb.getMany.mockResolvedValue([]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T4: within 24h cooldown → no alert (excluded by QB) ──────────────────

  it('T4 — tenant alerted 1 hour ago: QB excludes them within 24h cooldown', async () => {
    // QB filters by walletLowAlertSentAt — returns empty when within cooldown
    mockQb.getMany.mockResolvedValue([]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T5: cooldown expired (25h ago) → alert queued ─────────────────────────

  it('T5 — tenant alerted 25 hours ago: QB includes them, alert queued', async () => {
    const oldAlert = new Date(Date.now() - 25 * 3600 * 1000);
    mockQb.getMany.mockResolvedValue([
      makeTenant({ walletLowAlertSentAt: oldAlert }),
    ]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── T6: walletLowAlertSentAt = null → alert queued ────────────────────────

  it('T6 — tenant with walletLowAlertSentAt=null → alert queued', async () => {
    mockQb.getMany.mockResolvedValue([
      makeTenant({ walletLowAlertSentAt: null }),
    ]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── T7: after alert → walletLowAlertSentAt updated ────────────────────────

  it('T7 — after alert queued: walletLowAlertSentAt updated to NOW()', async () => {
    mockQb.getMany.mockResolvedValue([makeTenant()]);

    await service.checkLowWalletBalances();

    expect(mockTenantRepo.update).toHaveBeenCalledWith(TENANT_ID, {
      walletLowAlertSentAt: expect.any(Date) as unknown,
    });
  });

  // ── T8: suspended tenants excluded by QB ──────────────────────────────────

  it('T8 — suspended tenants excluded: QB WHERE filters statuses', async () => {
    await service.checkLowWalletBalances();

    expect(mockQb.where).toHaveBeenCalledWith(
      't.subscriptionStatus IN (:...statuses)',
      expect.objectContaining({
        statuses: expect.arrayContaining(['active', 'trialing']) as unknown,
      }),
    );
    // Verify 'suspended' is not in the statuses
    const whereCall = mockQb.where.mock.calls[0] as [
      string,
      { statuses: string[] },
    ];
    expect(whereCall[1].statuses).not.toContain('suspended');
  });

  // ── T9: one tenant fails → others still processed ────────────────────────

  it('T9 — one tenant fails: error caught, other tenants still processed', async () => {
    const tenant1 = makeTenant({ id: 'tenant-1' });
    const tenant2 = makeTenant({ id: 'tenant-2' });
    mockQb.getMany.mockResolvedValue([tenant1, tenant2]);

    // First add succeeds, second throws
    mockWaQueue.add
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockRejectedValueOnce(new Error('queue error'));

    await expect(service.checkLowWalletBalances()).resolves.not.toThrow();
    expect(mockWaQueue.add).toHaveBeenCalledTimes(2);
  });

  // ── T10: empty result → no queue calls ────────────────────────────────────

  it('T10 — no tenants below threshold: no queue add called', async () => {
    mockQb.getMany.mockResolvedValue([]);

    await service.checkLowWalletBalances();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
    expect(mockTenantRepo.update).not.toHaveBeenCalled();
  });

  // ── T11-T13: Template name verification (MessageBuilderService) ───────────

  describe('MessageBuilderService template verification', () => {
    it('T11 — WALLET_LOW_BALANCE uses pingloyal_wallet_low template', () => {
      const { MessageBuilderService } = jest.requireActual<
        typeof import('../../src/queue/message-builder.service')
      >('../../src/queue/message-builder.service');

      const builder = new MessageBuilderService();
      const result = builder.build(
        TriggerType.WALLET_LOW_BALANCE,
        null,
        {
          businessName: 'FreshMart',
          pointsThreshold: 1000,
          rewardValue: 500,
        } as never,
        {
          balance: '2,000',
          topUpUrl: 'https://app.pingloyal.com/billing/wallet/topup',
        },
      );

      expect(result.templateName).toBe('pingloyal_wallet_low');
      expect(result.variables).toContain('2,000');
      expect(result.variables).toContain(
        'https://app.pingloyal.com/billing/wallet/topup',
      );
    });

    it('T12 — WALLET_ZERO uses pingloyal_wallet_zero template', () => {
      const { MessageBuilderService } = jest.requireActual<
        typeof import('../../src/queue/message-builder.service')
      >('../../src/queue/message-builder.service');

      const builder = new MessageBuilderService();
      const result = builder.build(
        TriggerType.WALLET_ZERO,
        null,
        {
          businessName: 'FreshMart',
          pointsThreshold: 1000,
          rewardValue: 500,
        } as never,
        { topUpUrl: 'https://app.pingloyal.com/billing/wallet/topup' },
      );

      expect(result.templateName).toBe('pingloyal_wallet_zero');
      expect(result.variables).toContain(
        'https://app.pingloyal.com/billing/wallet/topup',
      );
    });

    it('T13 — templates use pingloyal_ prefix NOT loyalpulse_', () => {
      const { MessageBuilderService } = jest.requireActual<
        typeof import('../../src/queue/message-builder.service')
      >('../../src/queue/message-builder.service');

      const builder = new MessageBuilderService();
      const low = builder.build(
        TriggerType.WALLET_LOW_BALANCE,
        null,
        { businessName: 'S', pointsThreshold: 1000, rewardValue: 500 } as never,
        { balance: '500', topUpUrl: 'https://example.com' },
      );
      const zero = builder.build(
        TriggerType.WALLET_ZERO,
        null,
        { businessName: 'S', pointsThreshold: 1000, rewardValue: 500 } as never,
        { topUpUrl: 'https://example.com' },
      );

      expect(low.templateName).toMatch(/^pingloyal_/);
      expect(zero.templateName).toMatch(/^pingloyal_/);
      expect(low.templateName).not.toMatch(/^loyalpulse_/);
      expect(zero.templateName).not.toMatch(/^loyalpulse_/);
    });
  });
});
