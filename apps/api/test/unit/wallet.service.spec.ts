import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { TriggerType, WalletTransactionType } from '@pingloyal/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid';

function makeTenantRow(balance: number) {
  return { id: TENANT_ID, marketingWalletBalance: balance };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('WalletService', () => {
  let service: WalletService;
  let mockEm: Record<string, jest.Mock>;
  let mockDataSource: { transaction: jest.Mock };
  let mockRedis: { del: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEm = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((_, d: unknown) => d),
      query: jest.fn(),
    };

    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (em: typeof mockEm) => Promise<unknown>) => cb(mockEm),
        ),
    };

    mockRedis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  // ── deductMarketing ────────────────────────────────────────────────────────

  describe('deductMarketing()', () => {
    it('T1 — sufficient balance: deducts amount and returns success', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));

      const result = await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'Birthday message',
        null,
      );

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(4870);
    });

    it('T2 — insufficient balance: does NOT deduct, returns failure', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(50));

      const result = await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'Birthday message',
        null,
      );

      expect(result.success).toBe(false);
      expect(mockEm.update).not.toHaveBeenCalled();
    });

    it('T3 — tenant not found: returns failure without throwing', async () => {
      mockEm.findOne.mockResolvedValue(null);

      const result = await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'test',
        null,
      );

      expect(result.success).toBe(false);
      expect(result.newBalance).toBe(0);
    });

    it('T4 — exact balance equals amount: succeeds (not insufficient)', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(130));

      const result = await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'test',
        null,
      );

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(0);
    });

    it('T5 — uses pessimistic_write lock to prevent race conditions', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));
      await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'test',
        null,
      );

      expect(mockEm.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('T6 — BIRTHDAY type maps to DEBIT_BIRTHDAY wallet transaction', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));
      await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'test',
        null,
      );

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: WalletTransactionType.DEBIT_BIRTHDAY }),
      );
    });

    it('T7 — LAPSED_WINBACK type maps to DEBIT_LAPSED', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));
      await service.deductMarketing(
        TENANT_ID,
        TriggerType.LAPSED_WINBACK,
        115,
        'test',
        null,
      );

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: WalletTransactionType.DEBIT_LAPSED }),
      );
    });

    it('T8 — CAMPAIGN_MESSAGE type maps to DEBIT_CAMPAIGN', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));
      await service.deductMarketing(
        TENANT_ID,
        TriggerType.CAMPAIGN_MESSAGE,
        115,
        'test',
        null,
      );

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: WalletTransactionType.DEBIT_CAMPAIGN }),
      );
    });

    it('T9 — unknown trigger type throws error (not silently swallowed)', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));

      await expect(
        service.deductMarketing(
          TENANT_ID,
          'unknown' as TriggerType,
          130,
          'test',
          null,
        ),
      ).rejects.toThrow();
    });

    it('T10 — refId stored on wallet transaction record', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));
      await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'test',
        'ref-123',
      );

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ refId: 'ref-123' }),
      );
    });

    it('T11 — stored amount is negative (debit)', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(5000));
      await service.deductMarketing(
        TENANT_ID,
        TriggerType.BIRTHDAY,
        130,
        'test',
        null,
      );

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: -130 }),
      );
    });
  });

  // ── creditWallet ───────────────────────────────────────────────────────────

  describe('creditWallet()', () => {
    it('T12 — adds amount to existing balance', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(1000));

      await service.creditWallet(TENANT_ID, 500, 'top_up');

      expect(mockEm.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: TENANT_ID },
        { marketingWalletBalance: 1500 },
      );
    });

    it('T13 — credit to zero balance → balance = amount', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(0));

      await service.creditWallet(TENANT_ID, 1000, 'top_up');

      expect(mockEm.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: TENANT_ID },
        { marketingWalletBalance: 1000 },
      );
    });

    it('T14 — tenant not found: does nothing without throwing', async () => {
      mockEm.findOne.mockResolvedValue(null);
      await expect(
        service.creditWallet(TENANT_ID, 500, 'refund'),
      ).resolves.toBeUndefined();
    });

    it('T15 — credit stores REFUND type transaction', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(1000));
      await service.creditWallet(TENANT_ID, 500, 'refund_failed_send');

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: WalletTransactionType.REFUND }),
      );
    });

    it('T16 — credit amount stored as positive (not negative)', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(1000));
      await service.creditWallet(TENANT_ID, 500, 'top_up');

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 500 }),
      );
    });

    it('T17 — uses pessimistic_write lock on credit too', async () => {
      mockEm.findOne.mockResolvedValue(makeTenantRow(1000));
      await service.creditWallet(TENANT_ID, 500, 'refund');

      expect(mockEm.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });
  });
});

// ── New methods: getBalance, getMonthlySpend, checkLowBalanceAlert, resolveTransactionType ──

describe('WalletService — new methods', () => {
  let service: WalletService;
  let mockEm: Record<string, jest.Mock>;
  let mockDataSource: {
    transaction: jest.Mock;
    query: jest.Mock;
    getRepository: jest.Mock;
  };
  let mockRedis: { del: jest.Mock };
  let mockWaQueue: { add: jest.Mock };
  let mockQb: Record<string, jest.Mock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEm = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((_, d: unknown) => d),
    };

    mockQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(null),
    };

    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (em: typeof mockEm) => Promise<unknown>) => cb(mockEm),
        ),
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      }),
    };

    mockRedis = { del: jest.fn().mockResolvedValue(1) };
    mockWaQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  // ── getBalance ─────────────────────────────────────────────────────────────

  describe('getBalance()', () => {
    it('T18 — returns correct numeric value from DB', async () => {
      mockDataSource.query.mockResolvedValue([
        { marketing_wallet_balance: '1500.50' },
      ]);
      const result = await service.getBalance(TENANT_ID);
      expect(result).toBe(1500.5);
    });

    it('T19 — returns 0 when tenant not found', async () => {
      mockDataSource.query.mockResolvedValue([]);
      const result = await service.getBalance(TENANT_ID);
      expect(result).toBe(0);
    });
  });

  // ── getMonthlySpend ────────────────────────────────────────────────────────

  describe('getMonthlySpend()', () => {
    it('T20 — sums only debit transactions for current month', async () => {
      mockQb.getRawOne.mockResolvedValue({
        totalSpend: '2300',
        messageCount: '20',
      });
      const result = await service.getMonthlySpend(TENANT_ID);
      expect(result.totalSpend).toBe(2300);
      expect(result.messageCount).toBe(20);
    });

    it('T21 — excludes topup transactions (andWhere type != topup)', async () => {
      await service.getMonthlySpend(TENANT_ID);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'wt.type != :topup',
        expect.objectContaining({ topup: WalletTransactionType.TOPUP }),
      );
    });

    it('T22 — filters by startOfMonth (andWhere createdAt >= startOfMonth)', async () => {
      await service.getMonthlySpend(TENANT_ID);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'wt.createdAt >= :startOfMonth',
        expect.objectContaining({ startOfMonth: expect.any(Date) }),
      );
    });

    it('T23 — returns 0 totals when no transactions this month', async () => {
      mockQb.getRawOne.mockResolvedValue(null);
      const result = await service.getMonthlySpend(TENANT_ID);
      expect(result.totalSpend).toBe(0);
      expect(result.messageCount).toBe(0);
    });
  });

  // ── checkLowBalanceAlert ───────────────────────────────────────────────────

  describe('checkLowBalanceAlert() (via deductMarketing)', () => {
    it('T24 — does NOT alert when balance > 3000', async () => {
      mockEm.findOne.mockResolvedValue({ id: TENANT_ID, marketingWalletBalance: 5000 });
      await service.deductMarketing(TENANT_ID, TriggerType.BIRTHDAY, 100, 'test', null);
      // balance after = 4900, above threshold → no alert
      expect(mockWaQueue.add).not.toHaveBeenCalled();
    });

    it('T25 — queues wallet_low_balance alert when balance drops to <= 3000', async () => {
      mockEm.findOne.mockResolvedValue({ id: TENANT_ID, marketingWalletBalance: 3050 });
      // DB query returns tenant with no recent alert
      mockDataSource.query
        .mockResolvedValueOnce([{ wallet_low_alert_sent_at: null }]) // checkLowBalanceAlert SELECT
        .mockResolvedValueOnce([]) // UPDATE wallet_low_alert_sent_at
        .mockResolvedValueOnce([{ marketing_wallet_balance: '2950' }]); // getBalance (not used)

      await service.deductMarketing(TENANT_ID, TriggerType.BIRTHDAY, 100, 'test', null);

      expect(mockWaQueue.add).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({ type: TriggerType.WALLET_LOW_BALANCE }),
        expect.any(Object),
      );
    });

    it('T26 — queues wallet_zero alert when balance drops to <= 0', async () => {
      mockEm.findOne.mockResolvedValue({ id: TENANT_ID, marketingWalletBalance: 100 });
      mockDataSource.query
        .mockResolvedValueOnce([{ wallet_low_alert_sent_at: null }])
        .mockResolvedValueOnce([]);

      await service.deductMarketing(TENANT_ID, TriggerType.BIRTHDAY, 100, 'test', null);

      expect(mockWaQueue.add).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({ type: TriggerType.WALLET_ZERO }),
        expect.any(Object),
      );
    });

    it('T27 — does not send duplicate alert within 24 hours', async () => {
      mockEm.findOne.mockResolvedValue({ id: TENANT_ID, marketingWalletBalance: 3050 });
      const recentAlert = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
      mockDataSource.query.mockResolvedValueOnce([
        { wallet_low_alert_sent_at: recentAlert },
      ]);

      await service.deductMarketing(TENANT_ID, TriggerType.BIRTHDAY, 100, 'test', null);

      expect(mockWaQueue.add).not.toHaveBeenCalled();
    });

    it('T28 — sends new alert after 24h cooldown expires', async () => {
      mockEm.findOne.mockResolvedValue({ id: TENANT_ID, marketingWalletBalance: 3050 });
      const oldAlert = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25h ago
      mockDataSource.query
        .mockResolvedValueOnce([{ wallet_low_alert_sent_at: oldAlert }])
        .mockResolvedValueOnce([]);

      await service.deductMarketing(TENANT_ID, TriggerType.BIRTHDAY, 100, 'test', null);

      expect(mockWaQueue.add).toHaveBeenCalled();
    });
  });

  // ── resolveTransactionType ─────────────────────────────────────────────────

  describe('resolveTransactionType() (private)', () => {
    const resolve = (desc: string): WalletTransactionType =>
      (service as unknown as { resolveTransactionType: (d: string) => WalletTransactionType })
        .resolveTransactionType(desc);

    it('T29 — birthday description → DEBIT_BIRTHDAY', () => {
      expect(resolve('Birthday message for Amaka')).toBe(
        WalletTransactionType.DEBIT_BIRTHDAY,
      );
    });

    it('T30 — lapsed description → DEBIT_LAPSED', () => {
      expect(resolve('Lapsed winback for customer')).toBe(
        WalletTransactionType.DEBIT_LAPSED,
      );
    });

    it('T31 — winback description → DEBIT_LAPSED', () => {
      expect(resolve('Winback nudge sent')).toBe(
        WalletTransactionType.DEBIT_LAPSED,
      );
    });

    it('T32 — campaign description → DEBIT_CAMPAIGN', () => {
      expect(resolve('Campaign blast July')).toBe(
        WalletTransactionType.DEBIT_CAMPAIGN,
      );
    });

    it('T33 — topup description → TOPUP', () => {
      expect(resolve('Wallet topup via Paystack')).toBe(
        WalletTransactionType.TOPUP,
      );
    });

    it('T34 — top-up description → TOPUP', () => {
      expect(resolve('Manual top-up')).toBe(WalletTransactionType.TOPUP);
    });

    it('T35 — refund description → REFUND', () => {
      expect(resolve('refund_failed_send')).toBe(WalletTransactionType.REFUND);
    });

    it('T36 — unknown description → DEBIT_CAMPAIGN (default)', () => {
      expect(resolve('some unknown message type')).toBe(
        WalletTransactionType.DEBIT_CAMPAIGN,
      );
    });
  });
});
