import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { TierConfig } from '../../src/modules/tenants/entities/tier-config.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { R2Service } from '../../src/modules/storage/r2.service';
import { MailerService } from '../../src/common/mailer/mailer.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { TierService } from '../../src/modules/tenants/tier.service';

const mockTenantRepo = { findOne: jest.fn(), update: jest.fn() };
const mockCategoryRepo = { find: jest.fn() };
const mockTierRepo = { find: jest.fn() };
const mockUserRepo = { findOne: jest.fn() };
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};
const mockR2 = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
};
const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('https://app.pingloyal.com'),
};
const mockTierService = {
  recalculate: jest.fn().mockResolvedValue(undefined),
  recalculateAll: jest.fn().mockResolvedValue({ updated: 0 }),
};
const mockMailer = {
  sendAccountDeletionRequested: jest.fn().mockResolvedValue(undefined),
  sendAccountDeletionSupportNotice: jest.fn().mockResolvedValue(undefined),
};

const TENANT_ID = 'tenant-1';

const VALID_TIERS = [
  {
    tierName: 'vip',
    tierLabel: 'VIP Member',
    minQuarterlySpend: 400000,
    maxQuarterlySpend: null,
    displayOrder: 0,
  },
  {
    tierName: 'mid',
    tierLabel: 'Regular Customer',
    minQuarterlySpend: 100000,
    maxQuarterlySpend: 399999,
    displayOrder: 1,
  },
  {
    tierName: 'standard',
    tierLabel: 'Standard',
    minQuarterlySpend: 0,
    maxQuarterlySpend: 99999,
    displayOrder: 2,
  },
];

describe('TenantsService – upsertTierConfig', () => {
  let service: TenantsService;
  let mockManager: {
    query: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    mockManager = {
      query: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, row: unknown) => row),
      save: jest.fn((_entity, rows: unknown) => Promise.resolve(rows)),
    };
    mockDataSource = {
      transaction: jest.fn((cb: (manager: typeof mockManager) => unknown) =>
        Promise.resolve(cb(mockManager)),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        {
          provide: getRepositoryToken(ProductCategory),
          useValue: mockCategoryRepo,
        },
        { provide: getRepositoryToken(TierConfig), useValue: mockTierRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: R2Service, useValue: mockR2 },
        { provide: ConfigService, useValue: mockConfig },
        { provide: TierService, useValue: mockTierService },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get(TenantsService);
    jest.clearAllMocks();
    mockManager.query.mockResolvedValue(undefined);
    mockManager.delete.mockResolvedValue(undefined);
    mockManager.create.mockImplementation((_entity, row: unknown) => row);
    mockManager.save.mockImplementation((_entity, rows: unknown) =>
      Promise.resolve(rows),
    );
    mockDataSource.transaction.mockImplementation(
      (cb: (manager: typeof mockManager) => unknown) =>
        Promise.resolve(cb(mockManager)),
    );
    mockRedis.del.mockResolvedValue(1);
    mockTierService.recalculateAll.mockResolvedValue({ updated: 0 });
  });

  it('detaches existing customers from old tier configs before deleting them', async () => {
    await service.upsertTierConfig(TENANT_ID, { tiers: VALID_TIERS });

    expect(mockManager.query).toHaveBeenCalledWith(
      'UPDATE customers SET tier_id = NULL WHERE tenant_id = $1',
      [TENANT_ID],
    );

    const queryOrder = mockManager.query.mock.invocationCallOrder[0];
    const deleteOrder = mockManager.delete.mock.invocationCallOrder[0];
    expect(queryOrder).toBeLessThan(deleteOrder);
  });

  it('re-runs tier recalculation for all customers after saving the new config', async () => {
    await service.upsertTierConfig(TENANT_ID, { tiers: VALID_TIERS });

    expect(mockTierService.recalculateAll).toHaveBeenCalledWith(TENANT_ID);
  });

  it('invalidates the tiers cache and returns the saved tiers', async () => {
    const result = await service.upsertTierConfig(TENANT_ID, {
      tiers: VALID_TIERS,
    });

    expect(mockRedis.del).toHaveBeenCalledWith(`tiers:${TENANT_ID}`);
    expect(result).toHaveLength(3);
  });
});
