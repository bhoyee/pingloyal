import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { WaVerificationStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { PointsLedger } from '../../src/modules/transactions/entities/points-ledger.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { TransactionsService } from '../../src/modules/transactions/transactions.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { TierService } from '../../src/modules/tenants/tier.service';

jest.mock('@pingloyal/utils', () => ({
  normalisePhone: jest.fn().mockReturnValue('+2348012345678'),
  maskPhone: jest.fn().mockReturnValue('+234 801 *** 5678'),
  PhoneNormalisationError: class extends Error {},
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockWaMessagesQueue = {
  add: jest.fn().mockResolvedValue({ id: 'wa-job-1' }),
};
const mockTriggerCheckQueue = {
  add: jest.fn().mockResolvedValue({ id: 'tc-job-1' }),
};

const TENANT_ID = 'tenant-int-1';
const CUSTOMER_ID = 'cust-int-1';
const TX_ID = 'tx-int-1';

const mockTenant = {
  id: TENANT_ID,
  slug: 'test-store',
  pointsEarnRate: '100',
  pointsThreshold: 1000,
  rewardValue: 500,
  waVerificationStatus: WaVerificationStatus.VERIFIED,
};

const mockCustomer = {
  id: CUSTOMER_ID,
  tenantId: TENANT_ID,
  fullName: 'Test Customer',
  pointsBalance: 0,
  quarterlySpend: '0',
  isActive: true,
  tier: null,
};

const mockTx = {
  id: TX_ID,
  idempotencyKey: 'idem-int-1',
  tenantId: TENANT_ID,
  amount: 500,
  pointsEarned: 5,
  pointsBalanceAfter: 5,
  createdAt: new Date(),
  customer: { ...mockCustomer, pointsBalance: 5, tier: null },
};

// ── T9: POST /transactions → triggerCheckQueue gets 1 job ─────────────────────

describe('T9 — TransactionsService.create enqueues check-triggers job', () => {
  let service: TransactionsService;

  const mockTxRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    findOneOrFail: jest.fn().mockResolvedValue(mockTx),
  };
  const mockCustomerRepo = {
    findOne: jest.fn().mockResolvedValue(mockCustomer),
  };
  const mockCategoryRepo = { findOne: jest.fn() };
  const mockDataSource = {
    transaction: jest
      .fn()
      .mockImplementation(async (cb: (em: unknown) => Promise<void>) => {
        await cb({
          query: jest.fn().mockResolvedValue(undefined),
          find: jest.fn().mockResolvedValue([]),
        });
      }),
  };
  const mockTenantsService = {
    findOne: jest.fn().mockResolvedValue(mockTenant),
  };
  const mockTierService = {
    recalculate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTxRepo.findOne.mockResolvedValue(null);
    mockTxRepo.findOneOrFail.mockResolvedValue(mockTx);
    mockCustomerRepo.findOne.mockResolvedValue(mockCustomer);
    mockTenantsService.findOne.mockResolvedValue(mockTenant);

    const module: TestingModule = await Test.createTestingModule({
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
        { provide: REDIS_CLIENT, useValue: { del: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  it('T9 — triggerCheckQueue.add called once with check-triggers after create()', async () => {
    await service.create(TENANT_ID, 'user-1', {
      customerId: CUSTOMER_ID,
      amount: '500.00',
      idempotencyKey: 'idem-int-1',
    });

    // Allow fire-and-forget promises to settle
    await new Promise((r) => setImmediate(r));

    expect(mockTriggerCheckQueue.add).toHaveBeenCalledTimes(1);
    expect(mockTriggerCheckQueue.add).toHaveBeenCalledWith(
      'check-triggers',
      expect.objectContaining({ tenantId: TENANT_ID, customerId: CUSTOMER_ID }),
      expect.any(Object),
    );
  });

  it('T10 — waMessagesQueue.add called once with purchase_confirmation after create()', async () => {
    await service.create(TENANT_ID, 'user-1', {
      customerId: CUSTOMER_ID,
      amount: '500.00',
      idempotencyKey: 'idem-int-2',
    });

    await new Promise((r) => setImmediate(r));

    expect(mockWaMessagesQueue.add).toHaveBeenCalledTimes(1);
    expect(mockWaMessagesQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        type: 'purchase_confirmation',
        tenantId: TENANT_ID,
      }),
      expect.any(Object),
    );
  });
});

// ── T11: POST /customers/register → waMessagesQueue gets welcome job ──────────

describe('T11 — CustomersService.register enqueues welcome job for verified tenant', () => {
  let service: CustomersService;

  const mockTenantRepo = { findOne: jest.fn().mockResolvedValue(mockTenant) };
  const mockCustomerRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockReturnValue({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      fullName: 'New Customer',
      phoneE164: '+2348012345678',
      waOptedIn: true,
      pointsBalance: 0,
    }),
    save: jest.fn().mockResolvedValue({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      fullName: 'New Customer',
      phoneE164: '+2348012345678',
      waOptedIn: true,
      pointsBalance: 0,
    }),
  };
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWaMessagesQueue.add.mockResolvedValue({ id: 'wa-job-1' });
    mockTenantRepo.findOne.mockResolvedValue(mockTenant);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    mockCustomerRepo.create.mockReturnValue({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      fullName: 'New Customer',
      phoneE164: '+2348012345678',
      waOptedIn: true,
      pointsBalance: 0,
    });
    mockCustomerRepo.save.mockResolvedValue({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      fullName: 'New Customer',
      phoneE164: '+2348012345678',
      waOptedIn: true,
      pointsBalance: 0,
    });
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        {
          provide: getQueueToken('wa-messages'),
          useValue: mockWaMessagesQueue,
        },
      ],
    }).compile();

    service = module.get(CustomersService);
  });

  it('T11 — waMessagesQueue.add called with welcome job when tenant WA is verified', async () => {
    await service.register(
      {
        tenantSlug: 'test-store',
        fullName: 'New Customer',
        phone: '08012345678',
        waOptedIn: true,
      },
      'idem-reg-1',
    );

    expect(mockWaMessagesQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({ type: 'welcome', tenantId: TENANT_ID }),
      expect.any(Object),
    );
  });

  it('T11b — waMessagesQueue.add NOT called when waOptedIn=false', async () => {
    await service.register(
      {
        tenantSlug: 'test-store',
        fullName: 'New Customer',
        phone: '08012345678',
        waOptedIn: false,
      },
      'idem-reg-2',
    );

    expect(mockWaMessagesQueue.add).not.toHaveBeenCalled();
  });
});
