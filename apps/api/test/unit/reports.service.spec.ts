import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

jest.mock('pdfmake/build/pdfmake', () => ({
  createPdf: jest.fn().mockReturnValue({
    getBuffer: (cb: (b: Buffer) => void) => cb(Buffer.from('fake-pdf-content')),
  }),
  vfs: {},
}));
jest.mock('pdfmake/build/vfs_fonts', () => ({ vfs: {} }));
import { ReportsService } from '../../src/modules/reports/reports.service';
import { ReportSnapshot } from '../../src/modules/reports/entities/report-snapshot.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import type { ReportPeriod } from '@pingloyal/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid';

function makePeriod(overrides: Partial<ReportPeriod> = {}): ReportPeriod {
  const start = new Date('2026-05-01T00:00:00Z');
  const end = new Date('2026-05-31T23:59:59Z');
  return {
    type: 'this_month',
    start,
    end,
    durationDays: 30,
    ...overrides,
  };
}

function makeSnapshot(computedAt: Date = new Date()) {
  return {
    id: 'snap-1',
    tenantId: TENANT_ID,
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
    periodType: 'this_month',
    computedAt,
    data: {
      period: makePeriod(),
      generatedAt: new Date().toISOString(),
      timezone: 'Africa/Lagos',
      loyalty: {
        totalCustomers: 50,
        activeCustomers: 35,
        inactiveCustomers: 15,
        newCustomersThisMonth: 5,
        retentionRate: 60,
        avgVisitsPerCustomer: 2.3,
        weeklyNewCustomers: [],
        vsLastPeriod: {
          totalCustomers: 45,
          activeRate: 70,
          avgVisitsPerCustomer: 2.1,
        },
      },
      points: {
        issued: 12000,
        redeemed: 800,
        redemptionRate: 6.7,
        avgPointsPerCustomer: 343,
        nearRewardCount: 8,
        dailyIssued: [],
        issuedVsLastPeriod: 12,
      },
      whatsapp: {
        totalSent: 200,
        deliveryRate: 94,
        botInteractions: 15,
        triggerBreakdown: {},
      },
      wallet: {
        totalSpend: 5000,
        spendByType: {},
        costPerReach: 25,
        estimatedRoi: 1.2,
        estimatedRevenue: 6000,
        lapsedCustomerCount: 10,
        avgTransactionValue: 600,
      },
      content: {
        bestCampaign: null,
        busiestDayOfWeek: [],
        topCustomers: [],
        categoryBreakdown: [],
      },
    },
  };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('ReportsService', () => {
  let service: ReportsService;
  let mockSnapshotRepo: Record<string, jest.Mock>;
  let mockTenantRepo: Record<string, jest.Mock>;
  let mockSubRepo: Record<string, jest.Mock>;
  let mockDataSource: { query: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSnapshotRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
    };

    mockTenantRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: TENANT_ID, businessName: 'FreshMart' }),
    };

    mockSubRepo = {
      findOne: jest.fn().mockResolvedValue({ marketingRate: 130 }),
    };

    // Default query mock — returns empty results for all queries
    mockDataSource = {
      query: jest.fn().mockResolvedValue([
        {
          total_customers: '50',
          active_customers: '35',
          new_customers: '5',
          repeat_buyer_count: '20',
          avg_visits: '2.3',
          issued: '12000',
          redeemed: '800',
          near_reward: '8',
          spend: '5000',
          avg_amount: '2000',
          count: '3',
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: getRepositoryToken(ReportSnapshot),
          useValue: mockSnapshotRepo,
        },
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  // ── T1: cache hit ──────────────────────────────────────────────────────────

  it('T1 — getReport returns cached snapshot when available and fresh (< 24h)', async () => {
    const freshSnap = makeSnapshot(new Date(Date.now() - 3600 * 1000)); // 1h ago
    mockSnapshotRepo.findOne.mockResolvedValue(freshSnap);

    const computeSpy = jest.spyOn(service, 'computeReport');
    const result = await service.getReport(TENANT_ID, makePeriod());

    expect(computeSpy).not.toHaveBeenCalled();
    expect(result).toEqual(freshSnap.data);
  });

  // ── T2: cache stale ────────────────────────────────────────────────────────

  it('T2 — getReport recomputes when cache is stale (> 24h)', async () => {
    const staleSnap = makeSnapshot(new Date(Date.now() - 25 * 3600 * 1000)); // 25h ago
    mockSnapshotRepo.findOne.mockResolvedValue(staleSnap);

    const computeSpy = jest
      .spyOn(service, 'computeReport')
      .mockResolvedValueOnce(staleSnap.data);

    await service.getReport(TENANT_ID, makePeriod());

    expect(computeSpy).toHaveBeenCalledTimes(1);
  });

  // ── T3: computeReport runs all 5 sections ─────────────────────────────────

  it('T3 — computeReport calls all 5 section methods', async () => {
    const loyaltySpy = jest
      .spyOn(service, 'computeLoyaltySection')
      .mockResolvedValueOnce({
        totalCustomers: 50,
        activeCustomers: 35,
        inactiveCustomers: 15,
        newCustomersThisMonth: 5,
        retentionRate: 40,
        avgVisitsPerCustomer: 2,
        weeklyNewCustomers: [],
        vsLastPeriod: {
          totalCustomers: 40,
          activeRate: 75,
          avgVisitsPerCustomer: 2.0,
        },
      });
    const pointsSpy = jest
      .spyOn(service, 'computePointsSection')
      .mockResolvedValueOnce({
        issued: 0,
        redeemed: 0,
        redemptionRate: 0,
        avgPointsPerCustomer: 0,
        nearRewardCount: 0,
        dailyIssued: [],
        issuedVsLastPeriod: null,
      });
    const waSpy = jest
      .spyOn(service, 'computeWhatsappSection')
      .mockResolvedValueOnce({
        totalSent: 0,
        deliveryRate: 0,
        botInteractions: 0,
        triggerBreakdown: {},
      });
    const walletSpy = jest
      .spyOn(service, 'computeWalletSection')
      .mockResolvedValueOnce({
        totalSpend: 0,
        spendByType: {},
        costPerReach: 0,
        estimatedRoi: 0,
        estimatedRevenue: 0,
        lapsedCustomerCount: 0,
        avgTransactionValue: 0,
      });
    const contentSpy = jest
      .spyOn(service, 'computeContentSection')
      .mockResolvedValueOnce({
        bestCampaign: null,
        busiestDayOfWeek: [],
        topCustomers: [],
        categoryBreakdown: [],
      });

    await service.computeReport(TENANT_ID, makePeriod());

    expect(loyaltySpy).toHaveBeenCalledTimes(1);
    expect(pointsSpy).toHaveBeenCalledTimes(1);
    expect(waSpy).toHaveBeenCalledTimes(1);
    expect(walletSpy).toHaveBeenCalledTimes(1);
    expect(contentSpy).toHaveBeenCalledTimes(1);
  });

  // ── T4: upsert called after compute ───────────────────────────────────────

  it('T4 — computeReport upserts result into report_snapshots', async () => {
    jest.spyOn(service, 'computeLoyaltySection').mockResolvedValueOnce({
      totalCustomers: 10,
      activeCustomers: 8,
      inactiveCustomers: 2,
      newCustomersThisMonth: 2,
      retentionRate: 50,
      avgVisitsPerCustomer: 1.5,
      weeklyNewCustomers: [],
      vsLastPeriod: {
        totalCustomers: 9,
        activeRate: 80,
        avgVisitsPerCustomer: 1.5,
      },
    });
    jest.spyOn(service, 'computePointsSection').mockResolvedValueOnce({
      issued: 100,
      redeemed: 10,
      redemptionRate: 10,
      avgPointsPerCustomer: 12,
      nearRewardCount: 1,
      dailyIssued: [],
      issuedVsLastPeriod: 5,
    });
    jest.spyOn(service, 'computeWhatsappSection').mockResolvedValueOnce({
      totalSent: 5,
      deliveryRate: 80,
      botInteractions: 0,
      triggerBreakdown: {},
    });
    jest.spyOn(service, 'computeWalletSection').mockResolvedValueOnce({
      totalSpend: 500,
      spendByType: {},
      costPerReach: 100,
      estimatedRoi: 0,
      estimatedRevenue: 0,
      lapsedCustomerCount: 0,
      avgTransactionValue: 0,
    });
    jest.spyOn(service, 'computeContentSection').mockResolvedValueOnce({
      bestCampaign: null,
      busiestDayOfWeek: [],
      topCustomers: [],
      categoryBreakdown: [],
    });

    await service.computeReport(TENANT_ID, makePeriod());

    expect(mockSnapshotRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      ['tenantId', 'periodStart', 'periodEnd', 'periodType'],
    );
  });

  // ── T5: retentionRate calculation ─────────────────────────────────────────

  it('T5 — loyaltySection: retentionRate = repeat buyers / total customers', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([
        {
          // main CTE
          total_customers: '100',
          active_customers: '60',
          new_customers: '10',
          repeat_buyer_count: '40',
          avg_visits: '2.0',
        },
      ])
      .mockResolvedValueOnce([]) // weekly
      .mockResolvedValueOnce([
        { total_customers: '90', active_customers: '55', avg_visits: '2.1' },
      ]); // prev period

    const result = await service.computeLoyaltySection(TENANT_ID, makePeriod());

    expect(result.retentionRate).toBe(40); // 40/100 * 100
    expect(result.totalCustomers).toBe(100);
    expect(result.activeCustomers).toBe(60);
  });

  // ── T6: vsLastPeriod ──────────────────────────────────────────────────────

  it('T6 — loyaltySection: vsLastPeriod uses previous period dates', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([
        {
          total_customers: '50',
          active_customers: '35',
          new_customers: '5',
          repeat_buyer_count: '20',
          avg_visits: '2.0',
        },
      ])
      .mockResolvedValueOnce([]) // weekly
      .mockResolvedValueOnce([
        { total_customers: '45', active_customers: '30', avg_visits: '2.5' },
      ]); // prev

    const result = await service.computeLoyaltySection(TENANT_ID, makePeriod());

    expect(result.vsLastPeriod.totalCustomers).toBe(45);
    expect(result.vsLastPeriod.activeRate).toBe(67); // 30/45*100 = 66.6 → 67
    expect(result.vsLastPeriod.avgVisitsPerCustomer).toBe(2.5);
  });

  // ── T7: no division by zero in redemptionRate ─────────────────────────────

  it('T7 — pointsSection: redemptionRate = 0 when no points issued', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ issued: '0' }]) // issued
      .mockResolvedValueOnce([{ redeemed: '0' }]) // redeemed
      .mockResolvedValueOnce([{ near_reward: '0' }]) // near reward
      .mockResolvedValueOnce([]); // daily

    const result = await service.computePointsSection(
      TENANT_ID,
      makePeriod(),
      10,
    );

    expect(result.redemptionRate).toBe(0);
    expect(result.issued).toBe(0);
  });

  // ── T8: dailyIssued grouping ───────────────────────────────────────────────

  it('T8 — pointsSection: dailyIssued maps dates and amounts correctly', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ issued: '1000' }])
      .mockResolvedValueOnce([{ redeemed: '100' }])
      .mockResolvedValueOnce([{ near_reward: '5' }])
      .mockResolvedValueOnce([
        { date: '2026-05-01', amount: '300' },
        { date: '2026-05-02', amount: '700' },
      ])
      .mockResolvedValueOnce([{ issued: '900' }]); // prev period

    const result = await service.computePointsSection(
      TENANT_ID,
      makePeriod(),
      20,
    );

    expect(result.dailyIssued).toHaveLength(2);
    expect(result.dailyIssued[0]).toEqual({ date: '2026-05-01', amount: 300 });
    expect(result.dailyIssued[1]).toEqual({ date: '2026-05-02', amount: 700 });
  });

  // ── T9: no division by zero in deliveryRate ────────────────────────────────

  it('T9 — whatsappSection: deliveryRate = 0 when no messages sent', async () => {
    mockDataSource.query.mockResolvedValue([]); // empty trigger logs

    const result = await service.computeWhatsappSection(
      TENANT_ID,
      makePeriod(),
    );

    expect(result.deliveryRate).toBe(0);
    expect(result.totalSent).toBe(0);
  });

  // ── T10: estimatedRoi = 0 when no spend ───────────────────────────────────

  it('T10 — walletSection: estimatedRoi = 0 when totalSpend = 0', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ spend: '0' }]) // total
      .mockResolvedValueOnce([]) // spend by type
      .mockResolvedValueOnce([{ avg_amount: '2000' }]) // avg txn
      .mockResolvedValueOnce([{ count: '5' }]); // lapsed count

    const result = await service.computeWalletSection(TENANT_ID, makePeriod());

    expect(result.estimatedRoi).toBe(0);
    expect(result.totalSpend).toBe(0);
  });

  // ── T11: bestCampaign = null when no sent campaigns ───────────────────────

  it('T11 — contentSection: bestCampaign = null when no campaigns sent this period', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([]) // campaigns
      .mockResolvedValueOnce([]) // DOW
      .mockResolvedValueOnce([]) // top customers
      .mockResolvedValueOnce([]); // categories

    const result = await service.computeContentSection(TENANT_ID, makePeriod());

    expect(result.bestCampaign).toBeNull();
    expect(result.busiestDayOfWeek).toHaveLength(0);
    expect(result.topCustomers).toHaveLength(0);
  });

  // ── T12: tenant isolation ─────────────────────────────────────────────────

  it('T12 — all queries pass tenantId as first parameter (tenant isolation)', async () => {
    await service
      .computeLoyaltySection(TENANT_ID, makePeriod())
      .catch(() => null);

    // Every call to dataSource.query should have TENANT_ID as first param
    for (const call of mockDataSource.query.mock.calls as [
      string,
      unknown[],
    ][]) {
      expect(call[1][0]).toBe(TENANT_ID);
    }
  });

  // ── T13: generatePdf returns Buffer ───────────────────────────────────────

  it('T13 — generatePdf returns a Buffer', async () => {
    jest.spyOn(service, 'getReport').mockResolvedValueOnce(makeSnapshot().data);

    const result = await service.generatePdf(TENANT_ID, makePeriod());

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  }, 15_000);

  // ── T14: generateExcel returns Buffer with 5 sheets ───────────────────────

  it('T14 — generateExcel returns a Buffer and workbook has 5 sheets', async () => {
    jest.spyOn(service, 'getReport').mockResolvedValueOnce(makeSnapshot().data);

    const result = await service.generateExcel(TENANT_ID, makePeriod());

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Parse the buffer back to verify sheet count
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result as unknown as ArrayBuffer);
    expect(wb.worksheets.length).toBe(5);
  }, 15_000);
});
