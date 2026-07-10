import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { RedemptionsService } from '../../src/modules/redemptions/redemptions.service';
import { Redemption } from '../../src/modules/redemptions/entities/redemption.entity';
import { TenantsService } from '../../src/modules/tenants/tenants.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const CASHIER_ID = 'cashier-uuid-1';
const CUSTOMER_ID = 'cust-uuid-1';
const REDEMPTION_ID = 'redemp-uuid-1';

const mockTenant = {
  id: TENANT_ID,
  pointsThreshold: 1000,
  rewardValue: 500,
  businessName: 'Test Store',
};

// ── QueryBuilder mock ─────────────────────────────────────────────────────────

const mockQb = {
  leftJoin: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  getRawOne: jest.fn().mockResolvedValue({
    totalRedemptions: '0',
    totalPointsRedeemed: '0',
    totalValue: '0',
  }),
};

const mockRedemptionRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQb),
};

// ── DataSource / EntityManager mock ──────────────────────────────────────────

const mockEm = {
  query: jest.fn(),
};

const mockDataSource = {
  transaction: jest
    .fn()
    .mockImplementation(
      (cb: (em: typeof mockEm) => Promise<unknown>) => cb(mockEm),
    ),
};

const mockTenantsService = {
  findOne: jest.fn().mockResolvedValue(mockTenant),
};

const mockWaQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('RedemptionsService', () => {
  let service: RedemptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedemptionRepo.createQueryBuilder.mockReturnValue(mockQb);
    mockTenantsService.findOne.mockResolvedValue(mockTenant);
    mockWaQueue.add.mockResolvedValue({ id: 'job-1' });

    const module = await Test.createTestingModule({
      providers: [
        RedemptionsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: getRepositoryToken(Redemption), useValue: mockRedemptionRepo },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
      ],
    }).compile();

    service = module.get(RedemptionsService);
  });

  // ── createRedemption ────────────────────────────────────────────────────────

  it('T1: happy path — 1 reward — deducts points and returns row', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '0' }]) // UPDATE RETURNING
      .mockResolvedValueOnce(undefined) // INSERT ledger
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date('2024-03-01') }]); // INSERT redemptions

    const result = await service.createRedemption(TENANT_ID, CASHIER_ID, {
      customerId: CUSTOMER_ID,
      rewardsToRedeem: 1,
    });

    expect(result.id).toBe(REDEMPTION_ID);
    expect(result.pointsRedeemed).toBe(1000);
    expect(result.rewardsCount).toBe(1);
    expect(result.value).toBe(500);
    expect(result.balanceAfter).toBe(0);
    expect(result.customerId).toBe(CUSTOMER_ID);
  });

  it('T2: happy path — 3 rewards — points and value scale correctly', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '0' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date() }]);

    const result = await service.createRedemption(TENANT_ID, CASHIER_ID, {
      customerId: CUSTOMER_ID,
      rewardsToRedeem: 3,
    });

    expect(result.pointsRedeemed).toBe(3000);
    expect(result.rewardsCount).toBe(3);
    expect(result.value).toBe(1500);
  });

  it('T3: insufficient points — throws BadRequestException when UPDATE returns 0 rows', async () => {
    mockEm.query.mockResolvedValueOnce([]); // empty = no row updated

    await expect(
      service.createRedemption(TENANT_ID, CASHIER_ID, {
        customerId: CUSTOMER_ID,
        rewardsToRedeem: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('T4: atomic UPDATE uses WHERE points_balance >= required points', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '2000' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date() }]);

    await service.createRedemption(TENANT_ID, CASHIER_ID, {
      customerId: CUSTOMER_ID,
      rewardsToRedeem: 1,
    });

    const updateSql: string = mockEm.query.mock.calls[0][0] as string;
    expect(updateSql).toContain('points_balance >= $1');
    expect(mockEm.query.mock.calls[0][1]).toContain(1000);
  });

  it('T5: notes are passed through to the INSERT', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '0' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date() }]);

    await service.createRedemption(TENANT_ID, CASHIER_ID, {
      customerId: CUSTOMER_ID,
      rewardsToRedeem: 1,
      notes: 'Birthday treat',
    });

    const insertParams: unknown[] = mockEm.query.mock.calls[2][1] as unknown[];
    expect(insertParams).toContain('Birthday treat');
  });

  it('T6: cashier_id is included in the redemption INSERT', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '0' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date() }]);

    await service.createRedemption(TENANT_ID, CASHIER_ID, {
      customerId: CUSTOMER_ID,
      rewardsToRedeem: 1,
    });

    const insertParams: unknown[] = mockEm.query.mock.calls[2][1] as unknown[];
    expect(insertParams).toContain(CASHIER_ID);
  });

  it('T7: queues REWARD_REDEEMED WA message after transaction commits', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '500' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date() }]);

    await service.createRedemption(TENANT_ID, CASHIER_ID, {
      customerId: CUSTOMER_ID,
      rewardsToRedeem: 1,
    });

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        type: 'reward_redeemed',
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      }),
    );
  });

  it('T8: WA queue failure does not propagate — redemption still succeeds', async () => {
    mockEm.query
      .mockResolvedValueOnce([{ points_balance: '0' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: REDEMPTION_ID, redeemed_at: new Date() }]);
    mockWaQueue.add.mockRejectedValueOnce(new Error('Queue unavailable'));

    await expect(
      service.createRedemption(TENANT_ID, CASHIER_ID, {
        customerId: CUSTOMER_ID,
        rewardsToRedeem: 1,
      }),
    ).resolves.toBeDefined();
  });

  // ── getRedemptions ──────────────────────────────────────────────────────────

  it('T9: returns empty list when no redemptions exist', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([[], 0]);

    const result = await service.getRedemptions(TENANT_ID, {});

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('T10: maps a redemption row with cashierName from join', async () => {
    const now = new Date('2024-03-01T12:00:00Z');
    mockQb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: REDEMPTION_ID,
          customerId: CUSTOMER_ID,
          redeemedAt: now,
          pointsRedeemed: 1000,
          rewardsCount: 1,
          value: '500.00',
          balanceAfter: 0,
          cashier: { fullName: 'Ada Okonkwo' },
        },
      ],
      1,
    ]);

    const result = await service.getRedemptions(TENANT_ID, {});

    expect(result.data[0]).toMatchObject({
      id: REDEMPTION_ID,
      customerId: CUSTOMER_ID,
      pointsRedeemed: 1000,
      rewardsCount: 1,
      value: 500,
      balanceAfter: 0,
      cashierName: 'Ada Okonkwo',
    });
    expect(result.total).toBe(1);
  });

  it('T11: filters by customerId when provided', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([[], 0]);

    await service.getRedemptions(TENANT_ID, { customerId: CUSTOMER_ID });

    expect(mockQb.andWhere).toHaveBeenCalledWith(
      'r.customerId = :customerId',
      { customerId: CUSTOMER_ID },
    );
  });

  it('T12: caps limit at 100', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([[], 0]);

    await service.getRedemptions(TENANT_ID, { limit: 999 });

    expect(mockQb.take).toHaveBeenCalledWith(100);
  });

  it('T13: paginates with page and limit', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([[], 0]);

    await service.getRedemptions(TENANT_ID, { page: 2, limit: 5 });

    expect(mockQb.take).toHaveBeenCalledWith(5);
    expect(mockQb.skip).toHaveBeenCalledWith(5);
  });

  it('T14: cashierName is null when cashier relation is missing', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: REDEMPTION_ID,
          customerId: CUSTOMER_ID,
          redeemedAt: new Date(),
          pointsRedeemed: 1000,
          rewardsCount: 1,
          value: '500.00',
          balanceAfter: 0,
          cashier: null,
        },
      ],
      1,
    ]);

    const result = await service.getRedemptions(TENANT_ID, {});

    expect(result.data[0].cashierName).toBeNull();
  });

  // ── getStats ────────────────────────────────────────────────────────────────

  it('T15: returns zero stats when no redemptions exist', async () => {
    mockQb.getRawOne.mockResolvedValueOnce({
      totalRedemptions: '0',
      totalPointsRedeemed: '0',
      totalValue: '0',
    });

    const result = await service.getStats(TENANT_ID, {});

    expect(result).toEqual({
      totalRedemptions: 0,
      totalPointsRedeemed: 0,
      totalValue: 0,
    });
  });

  it('T16: aggregates totalRedemptions, totalPointsRedeemed, totalValue', async () => {
    mockQb.getRawOne.mockResolvedValueOnce({
      totalRedemptions: '5',
      totalPointsRedeemed: '5000',
      totalValue: '2500.00',
    });

    const result = await service.getStats(TENANT_ID, {});

    expect(result.totalRedemptions).toBe(5);
    expect(result.totalPointsRedeemed).toBe(5000);
    expect(result.totalValue).toBe(2500);
  });
});
