import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import {
  TransactionsService,
  calculatePointsEarned,
} from '../../src/modules/transactions/transactions.service';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { PointsLedger } from '../../src/modules/transactions/entities/points-ledger.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { TierService } from '../../src/modules/tenants/tier.service';
import type { CreateTransactionDto } from '../../src/modules/transactions/dto/create-transaction.dto';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const CUSTOMER_ID = 'cust-uuid-1';
const TX_ID = 'tx-uuid-1';
const IDEMPOTENCY_KEY = '11111111-1111-4111-b111-111111111111';

const mockTenant = {
  id: TENANT_ID,
  pointsEarnRate: '100',
  pointsThreshold: 1000,
  rewardValue: 500,
};

const mockCustomer: Partial<Customer> = {
  id: CUSTOMER_ID,
  tenantId: TENANT_ID,
  fullName: 'Adebayo Okafor',
  pointsBalance: 200,
  quarterlySpend: '500' as unknown as number,
  isActive: true,
  tier: null,
};

const mockTransaction: Partial<Transaction> = {
  id: TX_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  tenantId: TENANT_ID,
  amount: 500,
  pointsEarned: 5,
  pointsBalanceAfter: 205,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  customer: {
    id: CUSTOMER_ID,
    fullName: 'Adebayo Okafor',
    pointsBalance: 205,
    tier: null,
  } as Customer,
};

const BASE_DTO: CreateTransactionDto = {
  customerId: CUSTOMER_ID,
  amount: '500.00',
  idempotencyKey: IDEMPOTENCY_KEY,
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockQb = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
};

const mockTxRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue(mockQb),
  findAndCount: jest.fn(),
};

const mockCustomerRepo = {
  findOne: jest.fn(),
};

const mockCategoryRepo = {
  findOne: jest.fn(),
};

const mockEm = {
  query: jest.fn().mockResolvedValue(undefined),
  find: jest.fn().mockResolvedValue([]),
};

const mockDataSource = {
  transaction: jest
    .fn()
    .mockImplementation((cb: (em: typeof mockEm) => Promise<void>) =>
      cb(mockEm),
    ),
};

const mockTenantsService = {
  findOne: jest.fn().mockResolvedValue(mockTenant),
};

const mockTierService = {
  recalculate: jest.fn().mockResolvedValue(undefined),
};

const mockWaMessagesQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockTriggerCheckQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-2' }),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('calculatePointsEarned', () => {
  it('T1: returns floor(amount / earnRate) for exact division', () => {
    expect(calculatePointsEarned('100', 100)).toBe(1);
  });

  it('T2: returns 0 when amount is below earnRate', () => {
    expect(calculatePointsEarned('50', 100)).toBe(0);
  });

  it('T3: handles decimal amounts correctly', () => {
    expect(calculatePointsEarned('150.50', 100)).toBe(1);
  });

  it('T4: applies Math.floor (not round or ceil)', () => {
    expect(calculatePointsEarned('299', 100)).toBe(2);
  });

  it('T5: works with earnRate of 1', () => {
    expect(calculatePointsEarned('7', 1)).toBe(7);
  });

  it('T6: handles large amounts', () => {
    expect(calculatePointsEarned('10000', 100)).toBe(100);
  });
});

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
        { provide: getRepositoryToken(PointsLedger), useValue: {} },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        {
          provide: getRepositoryToken(ProductCategory),
          useValue: mockCategoryRepo,
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: TierService, useValue: mockTierService },
        {
          provide: getQueueToken('wa-messages'),
          useValue: mockWaMessagesQueue,
        },
        {
          provide: getQueueToken('trigger-check'),
          useValue: mockTriggerCheckQueue,
        },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('T7: returns alreadyProcessed:true when idempotency key already exists', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(mockTransaction);

    const result = await service.create(TENANT_ID, USER_ID, BASE_DTO);

    expect(result.alreadyProcessed).toBe(true);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('T8: proceeds with full flow when idempotency key is new', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockTxRepo.findOneOrFail.mockResolvedValueOnce(mockTransaction);

    const result = await service.create(TENANT_ID, USER_ID, BASE_DTO);

    expect(result.alreadyProcessed).toBe(false);
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('T9: throws BadRequestException when amount is 0', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.create(TENANT_ID, USER_ID, { ...BASE_DTO, amount: '0' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('T10: throws BadRequestException when amount is negative', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.create(TENANT_ID, USER_ID, { ...BASE_DTO, amount: '-100' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('T11: throws BadRequestException when amount has more than 2 decimal places', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.create(TENANT_ID, USER_ID, { ...BASE_DTO, amount: '100.123' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('T12: throws NotFoundException when customer not found', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.create(TENANT_ID, USER_ID, BASE_DTO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('T13: throws NotFoundException when category not found', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockCategoryRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.create(TENANT_ID, USER_ID, {
        ...BASE_DTO,
        categoryId: 'cat-uuid-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('T14: calls dataSource.transaction() once for the atomic write', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockTxRepo.findOneOrFail.mockResolvedValueOnce(mockTransaction);

    await service.create(TENANT_ID, USER_ID, BASE_DTO);

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('T15: calls tierService.recalculate with correct tenant + customer + newQuarterlySpend', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockTxRepo.findOneOrFail.mockResolvedValueOnce(mockTransaction);

    await service.create(TENANT_ID, USER_ID, { ...BASE_DTO, amount: '200' });

    // quarterlySpend was '500', new amount is 200 → 500 + 200 = 700
    expect(mockTierService.recalculate).toHaveBeenCalledWith(
      TENANT_ID,
      CUSTOMER_ID,
      700,
      mockEm,
    );
  });

  it('T16: adds check-triggers job to triggerCheckQueue after DB commit', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockTxRepo.findOneOrFail.mockResolvedValueOnce(mockTransaction);

    await service.create(TENANT_ID, USER_ID, BASE_DTO);
    await new Promise((r) => setImmediate(r));

    expect(mockTriggerCheckQueue.add).toHaveBeenCalledWith(
      'check-triggers',
      expect.objectContaining({ tenantId: TENANT_ID, customerId: CUSTOMER_ID }),
      expect.any(Object),
    );
  });

  it('T17: adds send-message job to waMessagesQueue after DB commit', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockTxRepo.findOneOrFail.mockResolvedValueOnce(mockTransaction);

    await service.create(TENANT_ID, USER_ID, BASE_DTO);
    await new Promise((r) => setImmediate(r));

    expect(mockWaMessagesQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        type: 'purchase_confirmation',
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
      }),
      expect.any(Object),
    );
  });

  it('T18: returns correct TransactionResult shape', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);
    mockCustomerRepo.findOne.mockResolvedValueOnce(mockCustomer);
    mockTxRepo.findOneOrFail.mockResolvedValueOnce(mockTransaction);

    const result = await service.create(TENANT_ID, USER_ID, BASE_DTO);

    expect(result).toMatchObject({
      id: TX_ID,
      amount: '500',
      pointsEarned: 5,
      alreadyProcessed: false,
      customer: {
        id: CUSTOMER_ID,
        fullName: 'Adebayo Okafor',
        pointsBalance: 205,
      },
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(typeof result.customer.progressPercent).toBe('number');
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  it('T19: findAll returns paginated result with data, total, page, limit', async () => {
    const fakeTransactions = [
      mockTransaction,
      mockTransaction,
    ] as Transaction[];
    mockQb.getManyAndCount.mockResolvedValueOnce([fakeTransactions, 2]);

    const result = await service.findAll(TENANT_ID, { page: 1, limit: 20 });

    expect(result).toMatchObject({ total: 2, page: 1, limit: 20 });
    expect(result.data).toHaveLength(2);
  });

  // ── findById ──────────────────────────────────────────────────────────────

  it('T20: findById throws NotFoundException when transaction not found', async () => {
    mockTxRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.findById(TENANT_ID, 'nonexistent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
