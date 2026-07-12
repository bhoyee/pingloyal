import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { RedemptionsService } from '../../src/modules/redemptions/redemptions.service';
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

// ── EntityManager mock (used inside transaction callback) ─────────────────────

const mockEm = {
  query: jest.fn(),
};

// ── DataSource mock ────────────────────────────────────────────────────────────
// `transaction` is used by createRedemption; `query` is used by getRedemptions/getStats

const mockDataSource = {
  transaction: jest
    .fn()
    .mockImplementation((cb: (em: typeof mockEm) => Promise<unknown>) =>
      cb(mockEm),
    ),
  query: jest.fn(),
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
    mockTenantsService.findOne.mockResolvedValue(mockTenant);
    mockWaQueue.add.mockResolvedValue({ id: 'job-1' });

    const module = await Test.createTestingModule({
      providers: [
        RedemptionsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
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
      .mockResolvedValueOnce([
        { id: REDEMPTION_ID, redeemed_at: new Date('2024-03-01') },
      ]); // INSERT redemptions

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

    expect(mockEm.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('points_balance >= $1'),
      expect.arrayContaining([1000]),
    );
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

    expect(mockEm.query).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.arrayContaining(['Birthday treat']),
    );
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

    expect(mockEm.query).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.arrayContaining([CASHIER_ID]),
    );
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
  // Service now uses dataSource.query() with two sequential raw SQL calls:
  //   call 1 → COUNT query  → [{ count: string }]
  //   call 2 → DATA query   → RawRow[]

  it('T9: returns empty list when no redemptions exist', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    const result = await service.getRedemptions(TENANT_ID, {});

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('T10: maps a raw row to camelCase RedemptionRow including cashierName', async () => {
    const now = new Date('2024-03-01T12:00:00Z');
    mockDataSource.query
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([
        {
          id: REDEMPTION_ID,
          customer_id: CUSTOMER_ID,
          customer_name: 'Ada Okonkwo',
          customer_phone: '+2348012345678',
          redeemed_at: now.toISOString(),
          points_redeemed: '1000',
          rewards_count: '1',
          value: '500.00',
          balance_after: '0',
          cashier_name: 'Ada Okonkwo',
        },
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
    mockDataSource.query
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.getRedemptions(TENANT_ID, { customerId: CUSTOMER_ID });

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('r.customer_id = $'),
      expect.arrayContaining([CUSTOMER_ID]),
    );
  });

  it('T12: caps limit at 100', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.getRedemptions(TENANT_ID, { limit: 999 });

    // Second call is the DATA query; its params array contains [tenantId, 100, offset]
    const dataParams = mockDataSource.query.mock.calls[1][1] as unknown[];
    expect(dataParams).toContain(100);
  });

  it('T13: paginates — offset equals (page-1)*limit', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.getRedemptions(TENANT_ID, { page: 2, limit: 5 });

    const dataParams = mockDataSource.query.mock.calls[1][1] as unknown[];
    // params = [tenantId, limit=5, offset=5]
    expect(dataParams).toContain(5); // limit
    expect(dataParams[dataParams.length - 1]).toBe(5); // offset = (2-1)*5
  });

  it('T14: cashierName is null when no cashier is linked', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([
        {
          id: REDEMPTION_ID,
          customer_id: CUSTOMER_ID,
          customer_name: 'Ada Okonkwo',
          customer_phone: '',
          redeemed_at: new Date().toISOString(),
          points_redeemed: '1000',
          rewards_count: '1',
          value: '500.00',
          balance_after: '0',
          cashier_name: null,
        },
      ]);

    const result = await service.getRedemptions(TENANT_ID, {});

    expect(result.data[0].cashierName).toBeNull();
  });

  // ── getStats ────────────────────────────────────────────────────────────────
  // Service calls dataSource.query() once → [{ total, pts, val }]

  it('T15: returns zero stats when no redemptions exist', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { total: '0', pts: '0', val: '0' },
    ]);

    const result = await service.getStats(TENANT_ID, {});

    expect(result).toEqual({
      totalRedemptions: 0,
      totalPointsRedeemed: 0,
      totalValue: 0,
    });
  });

  it('T16: aggregates totalRedemptions, totalPointsRedeemed, totalValue', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      { total: '5', pts: '5000', val: '2500.00' },
    ]);

    const result = await service.getStats(TENANT_ID, {});

    expect(result.totalRedemptions).toBe(5);
    expect(result.totalPointsRedeemed).toBe(5000);
    expect(result.totalValue).toBe(2500);
  });
});
