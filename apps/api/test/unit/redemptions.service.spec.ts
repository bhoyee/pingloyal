import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RedemptionsService } from '../../src/modules/transactions/redemptions.service';
import { PointsLedger } from '../../src/modules/transactions/entities/points-ledger.entity';
import { TenantsService } from '../../src/modules/tenants/tenants.service';

const TENANT_ID = 'tenant-uuid-1';
const CUSTOMER_ID = 'cust-uuid-1';

const mockTenant = {
  id: TENANT_ID,
  pointsThreshold: 1000,
  rewardValue: 500,
};

const mockQb = {
  leftJoin: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  getRawOne: jest.fn().mockResolvedValue({ totalPoints: '0' }),
};

const mockLedgerRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQb),
};

const mockTenantsService = {
  findOne: jest.fn().mockResolvedValue(mockTenant),
};

describe('RedemptionsService', () => {
  let service: RedemptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockLedgerRepo.createQueryBuilder.mockReturnValue(mockQb);
    mockTenantsService.findOne.mockResolvedValue(mockTenant);

    const module = await Test.createTestingModule({
      providers: [
        RedemptionsService,
        { provide: getRepositoryToken(PointsLedger), useValue: mockLedgerRepo },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    }).compile();

    service = module.get(RedemptionsService);
  });

  it('T1: returns empty list with zero totals when no redemptions exist', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([[], 0]);
    mockQb.getRawOne.mockResolvedValueOnce({ totalPoints: '0' });

    const result = await service.findAll(TENANT_ID, {});

    expect(result).toMatchObject({
      data: [],
      total: 0,
      totalPointsRedeemed: 0,
    });
  });

  it('T2: maps a redemption row — pointsRedeemed is abs(delta), cashierName always null', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: 'ledger-1',
          delta: -1000,
          balanceAfter: 200,
          createdAt: new Date('2024-02-01T00:00:00Z'),
          customer: { id: CUSTOMER_ID },
        },
      ],
      1,
    ]);
    mockQb.getRawOne.mockResolvedValueOnce({ totalPoints: '1000' });

    const result = await service.findAll(TENANT_ID, {
      customerId: CUSTOMER_ID,
    });

    expect(result.data[0]).toMatchObject({
      id: 'ledger-1',
      customerId: CUSTOMER_ID,
      pointsRedeemed: 1000,
      rewardsCount: 1,
      value: 500,
      balanceAfter: 200,
      cashierName: null,
    });
    expect(result.totalPointsRedeemed).toBe(1000);
  });

  it('T3: rewardsCount scales with multiple thresholds redeemed at once', async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([
      [
        {
          id: 'ledger-2',
          delta: -3000,
          balanceAfter: 0,
          createdAt: new Date('2024-02-01T00:00:00Z'),
          customer: { id: CUSTOMER_ID },
        },
      ],
      1,
    ]);
    mockQb.getRawOne.mockResolvedValueOnce({ totalPoints: '3000' });

    const result = await service.findAll(TENANT_ID, {});

    expect(result.data[0]).toMatchObject({
      pointsRedeemed: 3000,
      rewardsCount: 3,
      value: 1500,
    });
  });

  it('T4: filters by customerId when provided', async () => {
    await service.findAll(TENANT_ID, { customerId: CUSTOMER_ID });

    expect(mockQb.andWhere).toHaveBeenCalledWith('customer.id = :customerId', {
      customerId: CUSTOMER_ID,
    });
  });

  it('T5: caps limit at 100', async () => {
    await service.findAll(TENANT_ID, { limit: 500 });

    expect(mockQb.take).toHaveBeenCalledWith(100);
  });
});
