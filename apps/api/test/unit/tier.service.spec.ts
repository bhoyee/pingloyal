import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EntityManager } from 'typeorm';
import { TierService } from '../../src/modules/tenants/tier.service';
import { QuarterlyResetCron } from '../../src/modules/tenants/quarterly-reset.cron';
import { TierConfig } from '../../src/modules/tenants/entities/tier-config.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';

// ── Tier fixtures ──────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const CUSTOMER_ID = 'cust-uuid-1';

const STANDARD: Partial<TierConfig> = {
  id: 'tier-standard',
  tenantId: TENANT_ID,
  minQuarterlySpend: 0,
  maxQuarterlySpend: 99999,
  tierLabel: 'Standard',
};

const MID: Partial<TierConfig> = {
  id: 'tier-mid',
  tenantId: TENANT_ID,
  minQuarterlySpend: 100000,
  maxQuarterlySpend: 399999,
  tierLabel: 'Mid',
};

const VIP: Partial<TierConfig> = {
  id: 'tier-vip',
  tenantId: TENANT_ID,
  minQuarterlySpend: 400000,
  maxQuarterlySpend: null,
  tierLabel: 'VIP',
};

// Returned DESC by minQuarterlySpend — same order TierService uses
const ALL_TIERS = [VIP, MID, STANDARD] as TierConfig[];

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockQueryFn = jest.fn().mockResolvedValue([]);

const mockEm = {
  query: mockQueryFn,
  find: jest.fn().mockResolvedValue(ALL_TIERS),
};

const mockTierConfigRepo = {
  find: jest.fn().mockResolvedValue(ALL_TIERS),
  manager: {
    query: mockQueryFn,
  },
};

const mockPipeline = {
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
};

// ── TierService tests ──────────────────────────────────────────────────────────

describe('TierService.recalculate()', () => {
  let service: TierService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TierService,
        {
          provide: getRepositoryToken(TierConfig),
          useValue: mockTierConfigRepo,
        },
      ],
    }).compile();

    service = module.get(TierService);
  });

  it('T1: ₦450,000 → VIP tier (min=400k, no max)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      450_000,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [VIP.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T2: ₦400,000 → VIP tier (exactly on lower boundary — inclusive)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      400_000,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [VIP.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T3: ₦399,999 → Mid tier (just below VIP threshold)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      399_999,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [MID.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T4: ₦150,000 → Mid tier (within ₦100k–₦399k range)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      150_000,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [MID.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T5: ₦100,000 → Mid tier (exactly on lower boundary — inclusive)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      100_000,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [MID.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T6: ₦99,999 → Standard tier (just below Mid threshold)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      99_999,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [STANDARD.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T7: ₦50,000 → Standard tier', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      50_000,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [STANDARD.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T8: ₦0 (post-reset) → Standard tier (min=0)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      0,
      mockEm as unknown as EntityManager,
    );
    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers'),
      [STANDARD.id, CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T9: no tier_configs → sets tier_id = null, does not throw', async () => {
    mockEm.find.mockResolvedValueOnce([]);

    await expect(
      service.recalculate(
        TENANT_ID,
        CUSTOMER_ID,
        50_000,
        mockEm as unknown as EntityManager,
      ),
    ).resolves.toBeUndefined();

    expect(mockEm.query).toHaveBeenCalledWith(
      expect.stringContaining('tier_id = NULL'),
      [CUSTOMER_ID, TENANT_ID],
    );
  });

  it('T10: uses provided EntityManager when given (stays inside transaction)', async () => {
    await service.recalculate(
      TENANT_ID,
      CUSTOMER_ID,
      50_000,
      mockEm as unknown as EntityManager,
    );
    // em.find was called — NOT the repo
    expect(mockEm.find).toHaveBeenCalled();
    expect(mockTierConfigRepo.find).not.toHaveBeenCalled();
  });

  it('T11: uses own repo when EntityManager not provided', async () => {
    await service.recalculate(TENANT_ID, CUSTOMER_ID, 50_000);
    expect(mockTierConfigRepo.find).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      order: { minQuarterlySpend: 'DESC' },
    });
    expect(mockEm.find).not.toHaveBeenCalled();
  });
});

describe('TierService.recalculateAll()', () => {
  let service: TierService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Return one batch then empty to end the loop
    mockTierConfigRepo.manager.query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'c1', quarterly_spend: '450000' }, // VIP
        { id: 'c2', quarterly_spend: '150000' }, // Mid
        { id: 'c3', quarterly_spend: '0' }, //     Standard
      ])
      .mockResolvedValue(undefined); // UPDATE calls

    const module = await Test.createTestingModule({
      providers: [
        TierService,
        {
          provide: getRepositoryToken(TierConfig),
          useValue: mockTierConfigRepo,
        },
      ],
    }).compile();

    service = module.get(TierService);
  });

  it('T12: 3 customers with different spends → each assigned correct tier', async () => {
    await service.recalculateAll(TENANT_ID);

    const updateCalls = mockTierConfigRepo.manager.query.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('UPDATE customers'),
    );

    // One UPDATE per unique tier group (VIP, Mid, Standard)
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);

    const allArgs = updateCalls.flatMap((c: unknown[]) => c[1] as unknown[]);
    expect(allArgs).toContain(VIP.id);
    expect(allArgs).toContain(MID.id);
    expect(allArgs).toContain(STANDARD.id);
  });

  it('T13: customer with quarterly_spend=0 after reset → Standard tier', async () => {
    await service.recalculateAll(TENANT_ID);

    const updateCalls = mockTierConfigRepo.manager.query.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes('UPDATE customers'),
    );

    const standardUpdate = updateCalls.find(
      (c: unknown[]) => (c[1] as unknown[])[0] === STANDARD.id,
    ) as unknown[] | undefined;
    expect(standardUpdate).toBeDefined();
    // params = [tierId, customerIds[], tenantId] — customerIds is index 1
    const params = (standardUpdate as unknown[])[1] as unknown[];
    const customerIds = params[1] as string[];
    expect(customerIds).toContain('c3');
  });

  it('T14: no side effects — EventEmitter not called during recalculateAll', async () => {
    const emitSpy = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        TierService,
        {
          provide: getRepositoryToken(TierConfig),
          useValue: mockTierConfigRepo,
        },
        { provide: EventEmitter2, useValue: { emit: emitSpy } },
      ],
    }).compile();

    await module.get(TierService).recalculateAll(TENANT_ID);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('T15: returns correct count of updated customers', async () => {
    const result = await service.recalculateAll(TENANT_ID);
    expect(result).toEqual({ updated: 3 });
  });
});

// ── QuarterlyResetCron tests ───────────────────────────────────────────────────

describe('QuarterlyResetCron.runQuarterlyReset()', () => {
  let cron: QuarterlyResetCron;
  let recalculateAllSpy: jest.SpyInstance;

  const mockTierService = {
    recalculateAll: jest.fn().mockResolvedValue({ updated: 3 }),
  };

  const setupCron = async (dsQueryMock: jest.Mock) => {
    jest.clearAllMocks();
    mockPipeline.del.mockReturnThis();
    mockPipeline.exec.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        QuarterlyResetCron,
        {
          provide: getDataSourceToken(),
          useValue: { query: dsQueryMock },
        },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: TierService, useValue: mockTierService },
      ],
    }).compile();

    cron = module.get(QuarterlyResetCron);
    recalculateAllSpy = mockTierService.recalculateAll;
  };

  const makeTenantQuery = () =>
    jest
      .fn()
      .mockResolvedValueOnce([{ id: 'tenant-1' }, { id: 'tenant-2' }]) // tenants
      .mockResolvedValueOnce([{ count: '10' }]) // customer count
      .mockResolvedValue(undefined); // UPDATE queries

  it('T16: after cron runs, quarterly_spend reset query fired with correct tenant ids', async () => {
    const dsQuery = makeTenantQuery();
    await setupCron(dsQuery);
    await cron.runQuarterlyReset();

    const calls = dsQuery.mock.calls as Array<[string, unknown[]]>;
    const spendResetCall = calls.find(
      (c) =>
        typeof c[0] === 'string' &&
        c[0].includes('quarterly_spend') &&
        c[0].includes('0'),
    );
    expect(spendResetCall).toBeDefined();
    expect(spendResetCall![1]).toEqual([['tenant-1', 'tenant-2']]);
  });

  it('T17: after cron runs, utility_used_this_period reset to 0', async () => {
    const dsQuery = makeTenantQuery();
    await setupCron(dsQuery);
    await cron.runQuarterlyReset();

    const calls = dsQuery.mock.calls as Array<[string, unknown[]]>;
    const utilityResetCall = calls.find(
      (c) =>
        typeof c[0] === 'string' &&
        c[0].includes('utility_used_this_period') &&
        c[0].includes('0'),
    );
    expect(utilityResetCall).toBeDefined();
  });

  it('T18: after cron runs, grace_period_started_at reset to null', async () => {
    const dsQuery = makeTenantQuery();
    await setupCron(dsQuery);
    await cron.runQuarterlyReset();

    const calls = dsQuery.mock.calls as Array<[string, unknown[]]>;
    const graceResetCall = calls.find(
      (c) =>
        typeof c[0] === 'string' &&
        c[0].includes('grace_period_started_at') &&
        c[0].includes('NULL'),
    );
    expect(graceResetCall).toBeDefined();
  });

  it('T19: Redis cache invalidated for all tenants after cron', async () => {
    const dsQuery = makeTenantQuery();
    await setupCron(dsQuery);
    await cron.runQuarterlyReset();

    expect(mockRedis.pipeline).toHaveBeenCalled();
    expect(mockPipeline.del).toHaveBeenCalledWith('tenant:tenant-1');
    expect(mockPipeline.del).toHaveBeenCalledWith('tenant:tenant-2');
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('T20: cron does not throw if one tenant recalculateAll fails — continues others', async () => {
    const dsQuery = makeTenantQuery();
    await setupCron(dsQuery);

    // First tenant recalculation throws
    recalculateAllSpy
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValue({ updated: 3 });

    await expect(cron.runQuarterlyReset()).resolves.toBeUndefined();
  });
});
