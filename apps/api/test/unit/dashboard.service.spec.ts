import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { WaVerificationStatus } from '@pingloyal/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';

function makeRow(overrides: Record<string, string | number> = {}) {
  return {
    total_customers: '10',
    active_customers: '7',
    inactive_customers: '3',
    new_customers_this_month: '2',
    issued_this_month: '5000',
    redeemed_this_month: '500',
    campaigns_this_month: '3',
    avg_delivery_rate: '92.5',
    messages_sent_this_month: '120',
    messages_skipped_wallet_this_month: '0',
    marketing_messages_this_month: '80',
    wallet_spent_this_month: '10400',
    ...overrides,
  };
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    marketingWalletBalance: 5000,
    waVerificationStatus: WaVerificationStatus.VERIFIED,
    lapsedDays: 60,
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService;
  let mockDataSource: { query: jest.Mock };
  let mockRedis: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };
  let mockTenantsService: { findOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource = { query: jest.fn().mockResolvedValue([makeRow()]) };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockTenantsService = { findOne: jest.fn().mockResolvedValue(makeTenant()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  // ── T1: totalCustomers ────────────────────────────────────────────────────

  it('T1 — summary returns correct totalCustomers count', async () => {
    mockDataSource.query.mockResolvedValue([
      makeRow({ total_customers: '42' }),
    ]);

    const result = await service.getSummary(TENANT_ID);

    expect(result.totalCustomers).toBe(42);
  });

  // ── T2: activeCustomers respects lapsedDays ───────────────────────────────

  it('T2 — activeCustomers reflects correct count from query result', async () => {
    mockDataSource.query.mockResolvedValue([
      makeRow({ active_customers: '15', total_customers: '20' }),
    ]);

    const result = await service.getSummary(TENANT_ID);

    expect(result.activeCustomers).toBe(15);
  });

  // ── T3: inactiveCustomers ─────────────────────────────────────────────────

  it('T3 — inactiveCustomers = total - active (from SQL)', async () => {
    mockDataSource.query.mockResolvedValue([
      makeRow({
        total_customers: '20',
        active_customers: '15',
        inactive_customers: '5',
      }),
    ]);

    const result = await service.getSummary(TENANT_ID);

    expect(result.inactiveCustomers).toBe(5);
    expect(result.totalCustomers - result.activeCustomers).toBe(
      result.inactiveCustomers,
    );
  });

  // ── T4: pointsIssuedThisMonth ─────────────────────────────────────────────

  it('T4 — pointsIssuedThisMonth comes from current-month filter', async () => {
    mockDataSource.query.mockResolvedValue([
      makeRow({ issued_this_month: '12500' }),
    ]);

    const result = await service.getSummary(TENANT_ID);

    expect(result.pointsIssuedThisMonth).toBe(12500);
  });

  // ── T5: avgDeliveryRate = 0 when no campaigns ─────────────────────────────

  it('T5 — avgDeliveryRate is 0 when no campaigns have been sent', async () => {
    mockDataSource.query.mockResolvedValue([
      makeRow({ avg_delivery_rate: '0', campaigns_this_month: '0' }),
    ]);

    const result = await service.getSummary(TENANT_ID);

    expect(result.avgDeliveryRate).toBe(0);
    expect(result.campaignsSentThisMonth).toBe(0);
  });

  // ── T6: walletIsLow ───────────────────────────────────────────────────────

  it('T6 — walletIsLow is true when balance < 3000', async () => {
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 2500 }),
    );

    const result = await service.getSummary(TENANT_ID);

    expect(result.walletIsLow).toBe(true);
    expect(result.walletIsEmpty).toBe(false);
  });

  // ── T7: walletIsEmpty ─────────────────────────────────────────────────────

  it('T7 — walletIsEmpty is true when balance <= 0', async () => {
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 0 }),
    );

    const result = await service.getSummary(TENANT_ID);

    expect(result.walletIsEmpty).toBe(true);
    expect(result.walletIsLow).toBe(false);
  });

  // ── T8: waIsConnected ─────────────────────────────────────────────────────

  it('T8 — waIsConnected is true only when waVerificationStatus is verified', async () => {
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ waVerificationStatus: WaVerificationStatus.PENDING }),
    );

    const result = await service.getSummary(TENANT_ID);

    expect(result.waIsConnected).toBe(false);
  });

  // ── T9: cache hit ─────────────────────────────────────────────────────────

  it('T9 — cache hit returns cached data without running SQL query', async () => {
    const cached = { totalCustomers: 99, walletBalance: 5000 };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getSummary(TENANT_ID);

    expect(result.totalCustomers).toBe(99);
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });

  // ── T10: cache invalidation after new transaction ─────────────────────────

  it('T10 — invalidateCache deletes both dashboard cache keys', async () => {
    await service.invalidateCache(TENANT_ID);

    expect(mockRedis.del).toHaveBeenCalledWith(
      `dashboard:summary:${TENANT_ID}`,
      `dashboard:top-spenders:${TENANT_ID}`,
    );
  });

  // ── T11: top spenders mask phone numbers ──────────────────────────────────

  it('T11 — getTopSpenders masks customer phone numbers', async () => {
    mockDataSource.query.mockResolvedValue([
      {
        id: 'c1',
        full_name: 'Amara Okafor',
        phone_e164: '+2348011234567',
        points_balance: '850',
        total_spend: '150000',
        last_purchase_at: null,
        purchase_count: '12',
        tier_label: 'VIP',
      },
    ]);

    const result = await service.getTopSpenders(TENANT_ID);

    expect(result[0].phone).toBe('+234 801 ****67');
    expect(result[0].fullName).toBe('Amara Okafor');
    expect(result[0].pointsBalance).toBe(850);
    expect(result[0].totalSpend).toBe(150000);
  });

  // ── T12: top spenders with no phone ───────────────────────────────────────

  it('T12 — getTopSpenders leaves a missing phone as null', async () => {
    mockDataSource.query.mockResolvedValue([
      {
        id: 'c2',
        full_name: 'No Phone',
        phone_e164: null,
        points_balance: '0',
        total_spend: '0',
        last_purchase_at: null,
        purchase_count: '0',
        tier_label: null,
      },
    ]);

    const result = await service.getTopSpenders(TENANT_ID);

    expect(result[0].phone).toBeNull();
  });

  // ── T13: top spenders cache hit ───────────────────────────────────────────

  it('T13 — getTopSpenders cache hit returns cached data without running SQL query', async () => {
    const cached = [{ id: 'c1', fullName: 'Cached', phone: '+234 801 ****67' }];
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getTopSpenders(TENANT_ID);

    expect(result).toEqual(cached);
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });
});
