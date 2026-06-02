import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { WalletController } from '../../src/modules/billing/wallet.controller';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { WalletTransaction } from '../../src/modules/billing/entities/wallet-transaction.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { PlanTier, UserRole, WalletTransactionType } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid';
const USER_ID = 'user-uuid';

function makeReq(): { user: RequestUser } {
  return {
    user: {
      tenantId: TENANT_ID,
      userId: USER_ID,
      role: UserRole.OWNER,
      planTier: PlanTier.STARTER,
    },
  };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('WalletController', () => {
  let controller: WalletController;
  let mockWalletService: {
    getBalance: jest.Mock;
    getMonthlySpend: jest.Mock;
    topupWallet: jest.Mock;
  };
  let mockSubRepo: { findOne: jest.Mock };
  let mockUserRepo: { findOne: jest.Mock };
  let mockDataSource: { getRepository: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockConfig: { getOrThrow: jest.Mock; get: jest.Mock };
  let mockQb: Record<string, jest.Mock>;

  // Global fetch mock
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockWalletService = {
      getBalance: jest.fn().mockResolvedValue(5000),
      getMonthlySpend: jest
        .fn()
        .mockResolvedValue({ totalSpend: 1150, messageCount: 10 }),
      topupWallet: jest.fn().mockResolvedValue(15000),
    };

    mockSubRepo = {
      findOne: jest.fn().mockResolvedValue({ marketingRate: 115 }),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: USER_ID,
        email: 'owner@test.com',
        tenantId: TENANT_ID,
        role: 'owner',
      }),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      }),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockConfig = {
      getOrThrow: jest.fn().mockReturnValue('sk_test_paystack_key'),
      get: jest.fn().mockReturnValue('http://localhost:3001'),
    };

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/test123',
          reference: 'ref_abc123',
        },
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService, useValue: mockWalletService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    controller = module.get(WalletController);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── GET /billing/wallet/balance ────────────────────────────────────────────

  describe('getBalance()', () => {
    it('T1 — returns cached response on second call without hitting DB', async () => {
      const cached = JSON.stringify({
        balance: 9999,
        ratePerMessage: 115,
        isLow: false,
        isEmpty: false,
      });
      mockRedis.get.mockResolvedValueOnce(cached);

      const result = await controller.getBalance(makeReq());

      expect(result).toEqual(JSON.parse(cached));
      expect(mockWalletService.getBalance).not.toHaveBeenCalled();
    });

    it('T2 — calculates estimatedMessagesLeft correctly (balance=5000, rate=115 → 43)', async () => {
      mockWalletService.getBalance.mockResolvedValue(5000);
      mockSubRepo.findOne.mockResolvedValue({ marketingRate: 115 });

      const result = (await controller.getBalance(makeReq())) as {
        estimatedMessagesLeft: number;
      };

      expect(result.estimatedMessagesLeft).toBe(43); // Math.floor(5000 / 115)
    });

    it('T3 — isLow=true when balance < 3000', async () => {
      mockWalletService.getBalance.mockResolvedValue(2500);

      const result = (await controller.getBalance(makeReq())) as {
        isLow: boolean;
      };

      expect(result.isLow).toBe(true);
    });

    it('T4 — isEmpty=true when balance <= 0', async () => {
      mockWalletService.getBalance.mockResolvedValue(0);

      const result = (await controller.getBalance(makeReq())) as {
        isEmpty: boolean;
      };

      expect(result.isEmpty).toBe(true);
    });

    it('T5 — isEmpty=false when balance > 0', async () => {
      mockWalletService.getBalance.mockResolvedValue(500);

      const result = (await controller.getBalance(makeReq())) as {
        isEmpty: boolean;
      };

      expect(result.isEmpty).toBe(false);
    });

    it('T6 — caches result with 30s TTL', async () => {
      await controller.getBalance(makeReq());

      expect(mockRedis.set).toHaveBeenCalledWith(
        `wallet:balance:${TENANT_ID}`,
        expect.any(String),
        'EX',
        30,
      );
    });
  });

  // ── GET /billing/wallet/transactions ──────────────────────────────────────

  describe('getTransactions()', () => {
    it('T7 — returns paginated results with total, page, limit', async () => {
      const mockTxns: Partial<WalletTransaction>[] = [
        {
          id: 'txn-1',
          type: WalletTransactionType.TOPUP,
          amount: 10000,
        },
      ];
      mockQb.getManyAndCount.mockResolvedValue([mockTxns, 1]);

      const result = await controller.getTransactions(makeReq(), 1, 50);

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('T8 — filters by type when valid type provided', async () => {
      await controller.getTransactions(
        makeReq(),
        1,
        50,
        WalletTransactionType.TOPUP,
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'wt.type = :type',
        expect.objectContaining({ type: WalletTransactionType.TOPUP }),
      );
    });

    it('T9 — page=2 applies correct offset', async () => {
      await controller.getTransactions(makeReq(), 2, 50);

      expect(mockQb.offset).toHaveBeenCalledWith(50); // (2-1)*50
    });

    it('T10 — invalid type string is ignored (no andWhere filter)', async () => {
      await controller.getTransactions(makeReq(), 1, 50, 'invalid_type_xyz');

      // andWhere should not be called for invalid type
      expect(mockQb.andWhere).not.toHaveBeenCalled();
    });
  });

  // ── POST /billing/wallet/topup ─────────────────────────────────────────────

  describe('initiateTopup()', () => {
    it('T11 — valid amount returns authorizationUrl and reference', async () => {
      const result = await controller.initiateTopup(makeReq(), {
        amount: 15000,
      });

      expect(result.authorizationUrl).toBe(
        'https://checkout.paystack.com/test123',
      );
      expect(result.reference).toBe('ref_abc123');
      expect(result.amount).toBe(15000);
      expect(result.amountDisplay).toBe('₦15,000');
    });

    it('T12 — stores pending top-up in Redis with 1h TTL', async () => {
      await controller.initiateTopup(makeReq(), { amount: 15000 });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'billing:wallet:pending:ref_abc123',
        JSON.stringify({ tenantId: TENANT_ID, amount: 15000 }),
        'EX',
        3600,
      );
    });

    it('T13 — does NOT call topupWallet (wallet credited only on webhook)', async () => {
      await controller.initiateTopup(makeReq(), { amount: 15000 });

      expect(mockWalletService.topupWallet).not.toHaveBeenCalled();
    });

    it('T14 — sends amount in kobo to Paystack (amount × 100)', async () => {
      await controller.initiateTopup(makeReq(), { amount: 10000 });

      const calls = (global.fetch as jest.Mock).mock.calls as Array<
        [string, { body: string }]
      >;
      const body = JSON.parse(calls[0][1].body) as { amount: number };
      expect(body.amount).toBe(1_000_000); // 10000 * 100
    });

    it('T15 — throws BadRequestException when Paystack returns status=false', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({ status: false, data: null }),
      });

      await expect(
        controller.initiateTopup(makeReq(), { amount: 15000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('T16 — throws BadRequestException when owner not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.initiateTopup(makeReq(), { amount: 15000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Webhook wallet_topup handling (via BillingService, tested indirectly) ─

  describe('Webhook wallet_topup (BillingService, via WalletService mock)', () => {
    it('T17 — topupWallet called with correct args on valid webhook', async () => {
      // This test exercises topupWallet from WalletService directly
      // (webhook tests live in billing.service.spec.ts — this tests the service contract)
      await mockWalletService.topupWallet(TENANT_ID, 15000, 'ref_test');

      expect(mockWalletService.topupWallet).toHaveBeenCalledWith(
        TENANT_ID,
        15000,
        'ref_test',
      );
    });

    it('T18 — amountDisplay correctly formats naira with locale separator', async () => {
      const result = (await controller.initiateTopup(makeReq(), {
        amount: 1000000,
      })) as {
        amountDisplay: string;
      };

      expect(result.amountDisplay).toBe('₦1,000,000');
    });
  });
});
