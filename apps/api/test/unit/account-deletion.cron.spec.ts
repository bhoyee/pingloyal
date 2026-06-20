import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AccountDeletionCronService } from '../../src/modules/tenants/account-deletion.cron';

type TenantDue = { id: string; business_name: string };

describe('AccountDeletionCronService', () => {
  let service: AccountDeletionCronService;
  let mockQuery: jest.Mock<Promise<TenantDue[]>, [string]>;
  let mockTransaction: jest.Mock;
  let mockManagerQuery: jest.Mock<Promise<void>, [string, string[]]>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockManagerQuery = jest
      .fn<Promise<void>, [string, string[]]>()
      .mockResolvedValue(undefined);
    mockTransaction = jest
      .fn()
      .mockImplementation(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) =>
          cb({ query: mockManagerQuery }),
      );
    mockQuery = jest.fn<Promise<TenantDue[]>, [string]>().mockResolvedValue([]);

    const mockDataSource = {
      query: mockQuery,
      transaction: mockTransaction,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionCronService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(AccountDeletionCronService);
  });

  it('T1 — no tenants due: no transaction started', async () => {
    mockQuery.mockResolvedValue([]);

    await service.purgeScheduledDeletions();

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('T2 — one tenant due: deletes from all 4 manual tables then the tenant row, in order', async () => {
    mockQuery.mockResolvedValue([
      { id: 'tenant-1', business_name: 'Mama Store' },
    ]);

    await service.purgeScheduledDeletions();

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const calls = mockManagerQuery.mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('points_ledger');
    expect(calls[1]).toContain('transactions');
    expect(calls[2]).toContain('campaign_logs');
    expect(calls[3]).toContain('trigger_logs');
    expect(calls[4]).toContain('FROM tenants');
    mockManagerQuery.mock.calls.forEach((c) => {
      expect(c[1]).toEqual(['tenant-1']);
    });
  });

  it('T3 — multiple tenants due: each gets its own transaction', async () => {
    mockQuery.mockResolvedValue([
      { id: 'tenant-1', business_name: 'Mama Store' },
      { id: 'tenant-2', business_name: 'Jadefy Store' },
    ]);

    await service.purgeScheduledDeletions();

    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('T4 — one tenant fails: error caught, other tenants still processed', async () => {
    mockQuery.mockResolvedValue([
      { id: 'tenant-1', business_name: 'Mama Store' },
      { id: 'tenant-2', business_name: 'Jadefy Store' },
    ]);
    mockTransaction
      .mockRejectedValueOnce(new Error('db error'))
      .mockImplementationOnce(
        async (cb: (manager: { query: jest.Mock }) => Promise<void>) =>
          cb({ query: mockManagerQuery }),
      );

    await expect(service.purgeScheduledDeletions()).resolves.not.toThrow();
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('T5 — query filters on deletion_requested_at and deletion_scheduled_at', async () => {
    await service.purgeScheduledDeletions();

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('deletion_requested_at IS NOT NULL');
    expect(sql).toContain('deletion_scheduled_at <= NOW()');
  });
});
