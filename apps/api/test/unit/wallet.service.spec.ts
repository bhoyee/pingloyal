import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
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
