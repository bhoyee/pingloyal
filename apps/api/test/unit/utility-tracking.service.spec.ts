import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UtilityTrackingService } from '../../src/modules/billing/utility-tracking.service';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid';

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    utilityUsedThisPeriod: 301,
    utilityIncluded: 300,
    utilityOverageRate: 20,
    gracePeriodStartedAt: null,
    ...overrides,
  } as Subscription;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('UtilityTrackingService', () => {
  let service: UtilityTrackingService;
  let mockSubRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let mockQb: Record<string, jest.Mock>;
  let mockWalletService: { deductOverage: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockSubRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      findOne: jest.fn().mockResolvedValue(makeSub()),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockWalletService = {
      deductOverage: jest
        .fn()
        .mockResolvedValue({ success: true, newBalance: 4980 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UtilityTrackingService,
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
        { provide: WalletService, useValue: mockWalletService },
      ],
    }).compile();

    service = module.get(UtilityTrackingService);
  });

  // ── T1: Within allowance ───────────────────────────────────────────────────

  it('T1 — within allowance: no wallet deduction', async () => {
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({ utilityUsedThisPeriod: 250, utilityIncluded: 300 }),
    );

    await service.trackUtilityMessage(TENANT_ID);

    expect(mockWalletService.deductOverage).not.toHaveBeenCalled();
  });

  // ── T2: Overage — wallet has funds ────────────────────────────────────────

  it('T2 — overage, wallet has funds: deducts at utilityOverageRate', async () => {
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({
        utilityUsedThisPeriod: 301,
        utilityIncluded: 300,
        utilityOverageRate: 20,
        gracePeriodStartedAt: null,
      }),
    );
    mockWalletService.deductOverage.mockResolvedValue({
      success: true,
      newBalance: 4980,
    });

    await service.trackUtilityMessage(TENANT_ID);

    expect(mockWalletService.deductOverage).toHaveBeenCalledWith(
      TENANT_ID,
      20,
      'Utility message overage',
    );
    expect(mockSubRepo.update).not.toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      expect.objectContaining({
        gracePeriodStartedAt: expect.anything() as unknown,
      }),
    );
  });

  // ── T3: Overage — wallet empty → grace period starts ──────────────────────

  it('T3 — overage, wallet empty: grace period started (gracePeriodStartedAt set)', async () => {
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({ gracePeriodStartedAt: null }),
    );
    mockWalletService.deductOverage.mockResolvedValue({
      success: false,
      newBalance: 0,
    });

    await service.trackUtilityMessage(TENANT_ID);

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { gracePeriodStartedAt: expect.any(Date) as unknown },
    );
  });

  // ── T4: Grace period active, within 7 days ────────────────────────────────

  it('T4 — grace period active within 7 days: no duplicate start', async () => {
    const recentGrace = new Date(Date.now() - 2 * 24 * 3600 * 1000); // 2 days ago
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({ gracePeriodStartedAt: recentGrace }),
    );
    mockWalletService.deductOverage.mockResolvedValue({
      success: false,
      newBalance: 0,
    });

    await service.trackUtilityMessage(TENANT_ID);

    // update should NOT be called to set gracePeriodStartedAt again
    expect(mockSubRepo.update).not.toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { gracePeriodStartedAt: expect.any(Date) as unknown },
    );
  });

  // ── T5: Grace period expired (> 7 days) ───────────────────────────────────

  it('T5 — grace period expired: logger.warn called, no throw', async () => {
    const expiredGrace = new Date(Date.now() - 10 * 24 * 3600 * 1000); // 10 days ago
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({ gracePeriodStartedAt: expiredGrace }),
    );
    mockWalletService.deductOverage.mockResolvedValue({
      success: false,
      newBalance: 0,
    });

    const warnSpy = jest.spyOn(service['logger'], 'warn');

    await expect(service.trackUtilityMessage(TENANT_ID)).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('grace period expired'),
    );
  });

  // ── T6: Grace period was running, wallet topped up ────────────────────────

  it('T6 — wallet topped up after grace: gracePeriodStartedAt reset to null', async () => {
    const pastGrace = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({ gracePeriodStartedAt: pastGrace }),
    );
    mockWalletService.deductOverage.mockResolvedValue({
      success: true,
      newBalance: 5000,
    });

    await service.trackUtilityMessage(TENANT_ID);

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { gracePeriodStartedAt: null },
    );
  });

  // ── T7: Atomic increment via query builder ────────────────────────────────

  it('T7 — increments utility_used_this_period atomically via QB (not read-then-write)', async () => {
    await service.trackUtilityMessage(TENANT_ID);

    expect(mockQb.set).toHaveBeenCalledWith({
      utilityUsedThisPeriod: expect.any(Function) as unknown,
    });
    expect(mockQb.execute).toHaveBeenCalled();
  });

  // ── T8: resetUsageForNewPeriod ─────────────────────────────────────────────

  it('T8 — resetUsageForNewPeriod sets utilityUsedThisPeriod=0 and clears grace', async () => {
    await service.resetUsageForNewPeriod(TENANT_ID);

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { utilityUsedThisPeriod: 0, gracePeriodStartedAt: null },
    );
  });

  // ── T9: trackUtilityMessage — sub not found ───────────────────────────────

  it('T9 — subscription not found: resolves silently without throwing', async () => {
    mockSubRepo.findOne.mockResolvedValue(null);

    await expect(service.trackUtilityMessage(TENANT_ID)).resolves.not.toThrow();
    expect(mockWalletService.deductOverage).not.toHaveBeenCalled();
  });

  // ── T10: Equal to included (boundary) ────────────────────────────────────

  it('T10 — utilityUsedThisPeriod === utilityIncluded: still within allowance, no charge', async () => {
    mockSubRepo.findOne.mockResolvedValue(
      makeSub({ utilityUsedThisPeriod: 300, utilityIncluded: 300 }),
    );

    await service.trackUtilityMessage(TENANT_ID);

    expect(mockWalletService.deductOverage).not.toHaveBeenCalled();
  });
});
