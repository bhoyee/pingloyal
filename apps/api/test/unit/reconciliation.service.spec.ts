import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReconciliationService } from '../../src/modules/transactions/reconciliation.service';
import { TransactionSource } from '@pingloyal/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';

const mockDataSource = { query: jest.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTxRows(
  overrides: Partial<{
    source: string;
    count: string;
    revenue: string;
    points: string;
  }>[],
) {
  return overrides.map((o) => ({
    source: TransactionSource.CASHIER_APP,
    count: '0',
    revenue: '0',
    points: '0',
    ...o,
  }));
}

function makeRedemptionRow(
  total = '0',
  points_redeemed = '0',
  reward_value = '0',
) {
  return [{ total, points_redeemed, reward_value }];
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(ReconciliationService);
  });

  it('T1: returns zero totals when no transactions or redemptions exist', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRedemptionRow());

    const result = await service.getReport(TENANT_ID, {});

    expect(result.transactions.total).toBe(0);
    expect(result.transactions.totalRevenue).toBe(0);
    expect(result.transactions.totalPointsIssued).toBe(0);
    expect(result.redemptions.total).toBe(0);
    expect(result.redemptions.totalPointsRedeemed).toBe(0);
    expect(result.redemptions.totalRewardValue).toBe(0);
  });

  it('T2: aggregates totalRevenue and totalPointsIssued across all sources', async () => {
    mockDataSource.query
      .mockResolvedValueOnce(
        makeTxRows([
          { source: TransactionSource.CASHIER_APP, count: '10', revenue: '5000', points: '500' },
          { source: TransactionSource.WEBHOOK, count: '5', revenue: '2500', points: '250' },
        ]),
      )
      .mockResolvedValueOnce(makeRedemptionRow());

    const result = await service.getReport(TENANT_ID, {});

    expect(result.transactions.total).toBe(15);
    expect(result.transactions.totalRevenue).toBe(7500);
    expect(result.transactions.totalPointsIssued).toBe(750);
  });

  it('T3: CASHIER_APP breakdown is populated correctly', async () => {
    mockDataSource.query
      .mockResolvedValueOnce(
        makeTxRows([
          { source: TransactionSource.CASHIER_APP, count: '8', revenue: '4000', points: '400' },
        ]),
      )
      .mockResolvedValueOnce(makeRedemptionRow());

    const result = await service.getReport(TENANT_ID, {});

    expect(result.transactions.bySource[TransactionSource.CASHIER_APP]).toEqual({
      count: 8,
      revenue: 4000,
      points: 400,
    });
  });

  it('T4: WEBHOOK breakdown is populated correctly', async () => {
    mockDataSource.query
      .mockResolvedValueOnce(
        makeTxRows([
          { source: TransactionSource.WEBHOOK, count: '3', revenue: '1500', points: '150' },
        ]),
      )
      .mockResolvedValueOnce(makeRedemptionRow());

    const result = await service.getReport(TENANT_ID, {});

    expect(result.transactions.bySource[TransactionSource.WEBHOOK]).toEqual({
      count: 3,
      revenue: 1500,
      points: 150,
    });
  });

  it('T5: all four source types are present in bySource even when missing from DB rows', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRedemptionRow());

    const result = await service.getReport(TENANT_ID, {});

    expect(Object.keys(result.transactions.bySource)).toEqual(
      expect.arrayContaining([
        TransactionSource.CASHIER_APP,
        TransactionSource.WEBHOOK,
        TransactionSource.API_PULL,
        TransactionSource.FILE_IMPORT,
      ]),
    );
  });

  it('T6: transactions query receives startDate when provided', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRedemptionRow());

    await service.getReport(TENANT_ID, { startDate: '2024-01-01' });

    const [, params] = mockDataSource.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(
      expect.arrayContaining([expect.stringContaining('2024-01-01')]),
    );
  });

  it('T7: transactions query receives endDate when provided', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRedemptionRow());

    await service.getReport(TENANT_ID, { endDate: '2024-03-31' });

    const [, params] = mockDataSource.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(
      expect.arrayContaining([expect.stringContaining('2024-03-31')]),
    );
  });

  it('T8: redemption totals are correctly parsed from DB row', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRedemptionRow('7', '3500', '1750.00'));

    const result = await service.getReport(TENANT_ID, {});

    expect(result.redemptions.total).toBe(7);
    expect(result.redemptions.totalPointsRedeemed).toBe(3500);
    expect(result.redemptions.totalRewardValue).toBe(1750);
  });

  it('T9: period.startDate defaults to 30 days ago when not supplied', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeRedemptionRow());

    const result = await service.getReport(TENANT_ID, {});

    const start = new Date(result.period.startDate);
    const end = new Date(result.period.endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(29, 0);
  });
});
