import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReconciliationService } from '../../src/modules/transactions/reconciliation.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';

const mockDataSource = { query: jest.fn() };

// Helper: set up the 5 mock return values the service issues in order:
//   1. tenant earn rate
//   2. tx aggregate
//   3. cashier breakdown
//   4. redemption aggregate
//   5. redemption log

function mockQueries({
  earnRate = '1',
  txAgg = {
    total_transactions: '0',
    total_amount: '0',
    total_points: '0',
    terminal_count: '0',
    terminal_amount: '0',
    manual_count: '0',
    manual_amount: '0',
  },
  cashiers = [] as {
    cashier_id: string | null;
    cashier_name: string;
    transaction_count: string;
    total_amount: string;
    average_amount: string;
    manual_count: string;
  }[],
  redAgg = { total: '0', points_redeemed: '0', reward_value: '0' },
  redLog = [] as {
    redeemed_at: string;
    customer_name: string;
    points_redeemed: string;
    reward_value: string;
    cashier_name: string;
  }[],
} = {}) {
  mockDataSource.query
    .mockResolvedValueOnce([{ points_earn_rate: earnRate }])
    .mockResolvedValueOnce([txAgg])
    .mockResolvedValueOnce(cashiers)
    .mockResolvedValueOnce([redAgg])
    .mockResolvedValueOnce(redLog);
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

  it('T1: pointsDiscrepancy is 0 when issued points match expected from spend', async () => {
    // ₦100,000 spend / earnRate 100 → expected 1,000 pts. Issued 1,000 → discrepancy 0
    mockQueries({
      earnRate: '100',
      txAgg: {
        total_transactions: '20',
        total_amount: '100000',
        total_points: '1000',
        terminal_count: '0',
        terminal_amount: '0',
        manual_count: '20',
        manual_amount: '100000',
      },
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.summary.expectedPoints).toBe(1000);
    expect(result.summary.pointsDiscrepancy).toBe(0);
  });

  it('T2: pointsDiscrepancy is detected when points are over-awarded', async () => {
    // same ₦100,000 spend but 3,500 pts issued → discrepancy +2,500
    mockQueries({
      earnRate: '100',
      txAgg: {
        total_transactions: '20',
        total_amount: '100000',
        total_points: '3500',
        terminal_count: '0',
        terminal_amount: '0',
        manual_count: '20',
        manual_amount: '100000',
      },
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.summary.expectedPoints).toBe(1000);
    expect(result.summary.totalPointsIssued).toBe(3500);
    expect(result.summary.pointsDiscrepancy).toBe(2500);
  });

  it('T3: cashierBreakdown groups rows correctly by cashier', async () => {
    mockQueries({
      txAgg: {
        total_transactions: '15',
        total_amount: '70000',
        total_points: '700',
        terminal_count: '5',
        terminal_amount: '10000',
        manual_count: '10',
        manual_amount: '60000',
      },
      cashiers: [
        {
          cashier_id: 'cid-1',
          cashier_name: 'Chidinma',
          transaction_count: '10',
          total_amount: '60000',
          average_amount: '6000',
          manual_count: '0',
        },
        {
          cashier_id: 'cid-2',
          cashier_name: 'Taiwo',
          transaction_count: '5',
          total_amount: '10000',
          average_amount: '2000',
          manual_count: '5',
        },
      ],
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.cashierBreakdown).toHaveLength(2);
    expect(result.cashierBreakdown[0].cashierName).toBe('Chidinma');
    expect(result.cashierBreakdown[0].transactionCount).toBe(10);
    expect(result.cashierBreakdown[1].cashierName).toBe('Taiwo');
    expect(result.cashierBreakdown[1].transactionCount).toBe(5);
  });

  it('T4: cashier is flagged when average is more than 40% below the store average', async () => {
    // Store: 15 tx, ₦70,000 → storeAvg ≈ ₦4,667
    // Taiwo avg ₦2,000 < 4,667 × 0.6 = ₦2,800 → flagged
    mockQueries({
      txAgg: {
        total_transactions: '15',
        total_amount: '70000',
        total_points: '700',
        terminal_count: '0',
        terminal_amount: '0',
        manual_count: '15',
        manual_amount: '70000',
      },
      cashiers: [
        {
          cashier_id: 'cid-1',
          cashier_name: 'Chidinma',
          transaction_count: '10',
          total_amount: '60000',
          average_amount: '6000',
          manual_count: '0',
        },
        {
          cashier_id: 'cid-2',
          cashier_name: 'Taiwo',
          transaction_count: '5',
          total_amount: '10000',
          average_amount: '2000',
          manual_count: '0',
        },
      ],
    });

    const result = await service.getReport(TENANT_ID, {});

    const taiwo = result.cashierBreakdown.find(
      (c) => c.cashierName === 'Taiwo',
    );
    const chidinma = result.cashierBreakdown.find(
      (c) => c.cashierName === 'Chidinma',
    );
    expect(taiwo?.flagged).toBe(true);
    expect(chidinma?.flagged).toBe(false);
  });

  it('T5: cashier is NOT flagged when average is within the normal range', async () => {
    // Store: 10 tx, ₦50,000 → storeAvg ₦5,000. Both cashiers at ₦5,000 avg → above 60% threshold
    mockQueries({
      txAgg: {
        total_transactions: '10',
        total_amount: '50000',
        total_points: '500',
        terminal_count: '10',
        terminal_amount: '50000',
        manual_count: '0',
        manual_amount: '0',
      },
      cashiers: [
        {
          cashier_id: 'cid-1',
          cashier_name: 'Amaka',
          transaction_count: '5',
          total_amount: '25000',
          average_amount: '5000',
          manual_count: '0',
        },
        {
          cashier_id: 'cid-2',
          cashier_name: 'Emeka',
          transaction_count: '5',
          total_amount: '25000',
          average_amount: '5000',
          manual_count: '0',
        },
      ],
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.cashierBreakdown.every((c) => !c.flagged)).toBe(true);
  });

  it('T6: manual entry count per cashier is returned correctly', async () => {
    mockQueries({
      txAgg: {
        total_transactions: '10',
        total_amount: '50000',
        total_points: '500',
        terminal_count: '5',
        terminal_amount: '25000',
        manual_count: '5',
        manual_amount: '25000',
      },
      cashiers: [
        {
          cashier_id: 'cid-1',
          cashier_name: 'Ngozi',
          transaction_count: '10',
          total_amount: '50000',
          average_amount: '5000',
          manual_count: '5',
        },
      ],
    });

    const result = await service.getReport(TENANT_ID, {});

    const cashier = result.cashierBreakdown[0];
    expect(cashier.manualEntryCount).toBe(5);
    expect(cashier.transactionCount).toBe(10);
  });

  it('T7: redemption totals and log are aggregated correctly for the period', async () => {
    mockQueries({
      redAgg: { total: '6', points_redeemed: '6000', reward_value: '6000.00' },
      redLog: [
        {
          redeemed_at: '2024-03-10T14:32:00.000Z',
          customer_name: 'Ngozi Amaka',
          points_redeemed: '1000',
          reward_value: '1000',
          cashier_name: 'Chidinma',
        },
      ],
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.redemptions.totalRedemptions).toBe(6);
    expect(result.redemptions.totalPointsRedeemed).toBe(6000);
    expect(result.redemptions.totalValueGivenOut).toBe(6000);
    expect(result.redemptionLog).toHaveLength(1);
    expect(result.redemptionLog[0].customerName).toBe('Ngozi Amaka');
    expect(result.redemptionLog[0].cashierName).toBe('Chidinma');
  });

  it('T8: webhook transactions are counted as terminal-verified, not manual', async () => {
    mockQueries({
      txAgg: {
        total_transactions: '5',
        total_amount: '25000',
        total_points: '250',
        terminal_count: '5', // all 5 sourced from webhook
        terminal_amount: '25000',
        manual_count: '0',
        manual_amount: '0',
      },
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.summary.terminalVerifiedCount).toBe(5);
    expect(result.summary.manualEntryCount).toBe(0);
    expect(result.summary.manualEntryPercent).toBe(0);
  });

  it('T9: file_import transactions are counted as terminal-verified, not manual', async () => {
    mockQueries({
      txAgg: {
        total_transactions: '8',
        total_amount: '40000',
        total_points: '400',
        terminal_count: '3', // 3 sourced from file_import
        terminal_amount: '15000',
        manual_count: '5',
        manual_amount: '25000',
      },
    });

    const result = await service.getReport(TENANT_ID, {});

    expect(result.summary.terminalVerifiedCount).toBe(3);
    expect(result.summary.terminalVerifiedAmount).toBe(15000);
    expect(result.summary.manualEntryCount).toBe(5);
  });
});
