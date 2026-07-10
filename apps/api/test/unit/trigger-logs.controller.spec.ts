import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TriggerLogsController } from '../../src/modules/triggers/trigger-logs.controller';

const TENANT_ID = 'tenant-uuid-1';
const CUSTOMER_ID = 'cust-uuid-1';

const mockDataSource = {
  query: jest.fn(),
};

describe('TriggerLogsController', () => {
  let controller: TriggerLogsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [TriggerLogsController],
      providers: [{ provide: getDataSourceToken(), useValue: mockDataSource }],
    }).compile();

    controller = module.get(TriggerLogsController);
  });

  const req = { user: { tenantId: TENANT_ID } } as never;

  it('T1: findRecent defaults to limit 10 and tenant-wide scope when no params given', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await controller.findRecent(req);

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $2'),
      [TENANT_ID, 10],
    );
  });

  it('T2: findRecent filters by customerId when provided', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await controller.findRecent(req, CUSTOMER_ID, '1');

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('tl.customer_id = $2'),
      [TENANT_ID, CUSTOMER_ID, 1],
    );
  });

  it('T3: findRecent caps limit at 100', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await controller.findRecent(req, undefined, '500');

    expect(mockDataSource.query).toHaveBeenCalledWith(expect.any(String), [
      TENANT_ID,
      100,
    ]);
  });

  it('T4: count returns tenant-wide count when no customerId given', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ count: '7' }]);

    const result = await controller.count(req);

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.not.stringContaining('customer_id'),
      [TENANT_ID],
    );
    expect(result).toEqual({ count: 7 });
  });

  it('T5: count filters by customerId when given', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ count: '2' }]);

    const result = await controller.count(req, CUSTOMER_ID);

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('customer_id = $2'),
      [TENANT_ID, CUSTOMER_ID],
    );
    expect(result).toEqual({ count: 2 });
  });
});
