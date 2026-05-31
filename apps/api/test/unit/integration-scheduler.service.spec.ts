import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IntegrationSchedulerService } from '../../src/modules/integrations/integration-scheduler.service';
import { Integration } from '../../src/modules/integrations/entities/integration.entity';
import {
  IntegrationConnectionType,
  IntegrationSyncStatus,
} from '@pingloyal/types';

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getRepeatableJobs: jest.fn(),
    removeRepeatableByKey: jest.fn(),
    close: jest.fn(),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

function makeIntegration(overrides: Record<string, unknown> = {}): Partial<Integration> {
  return {
    id: 'integ-1',
    tenantId: 'tenant-1',
    connectionType: IntegrationConnectionType.API_PULL,
    syncStatus: IntegrationSyncStatus.ACTIVE,
    pollIntervalMins: 15,
    ...overrides,
  };
}

describe('IntegrationSchedulerService', () => {
  let service: IntegrationSchedulerService;
  let mockQueue: {
    add: jest.Mock;
    getRepeatableJobs: jest.Mock;
    removeRepeatableByKey: jest.Mock;
  };
  let mockIntegrationRepo: { find: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'q1' }),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
    };
    mockIntegrationRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationSchedulerService,
        { provide: getQueueToken('integration-sync'), useValue: mockQueue },
        {
          provide: getRepositoryToken(Integration),
          useValue: mockIntegrationRepo,
        },
      ],
    }).compile();

    service = module.get(IntegrationSchedulerService);
  });

  it('scheduleAll() skips when no integrations configured', async () => {
    mockIntegrationRepo.find.mockResolvedValue([]);
    await service.scheduleAll();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('scheduleAll() adds repeating jobs for all active api_pull integrations', async () => {
    mockIntegrationRepo.find.mockResolvedValue([
      makeIntegration({ id: 'i1' }),
      makeIntegration({ id: 'i2' }),
    ]);

    await service.scheduleAll();

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  it('scheduleOne() adds a repeating job with correct jobId', async () => {
    const integ = makeIntegration() as Integration;
    await service.scheduleOne(integ);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'poll',
      { integrationId: 'integ-1', tenantId: 'tenant-1' },
      expect.objectContaining({ jobId: 'poll-integ-1' }),
    );
  });

  it('scheduleOne() skips non-api_pull integrations', async () => {
    const webhookInteg = makeIntegration({
      connectionType: IntegrationConnectionType.WEBHOOK,
    }) as Integration;
    await service.scheduleOne(webhookInteg);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('scheduleOne() sets repeat.every based on pollIntervalMins', async () => {
    const integ = makeIntegration({ pollIntervalMins: 30 }) as Integration;
    await service.scheduleOne(integ);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'poll',
      expect.anything(),
      expect.objectContaining({ repeat: { every: 30 * 60 * 1000 } }),
    );
  });

  it('unschedule() removes the repeating job by key', async () => {
    mockQueue.getRepeatableJobs.mockResolvedValue([
      { key: 'poll-integ-1::15000' },
    ]);

    await service.unschedule('integ-1');

    expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith(
      'poll-integ-1::15000',
    );
  });

  it('unschedule() does nothing when job not found', async () => {
    mockQueue.getRepeatableJobs.mockResolvedValue([
      { key: 'poll-other-integ::15000' },
    ]);

    await service.unschedule('integ-1');

    expect(mockQueue.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('triggerOnce() adds a manual job to the queue', async () => {
    await service.triggerOnce('integ-1', 'tenant-1');

    expect(mockQueue.add).toHaveBeenCalledWith('manual', {
      integrationId: 'integ-1',
      tenantId: 'tenant-1',
    });
  });

  it('onApplicationBootstrap() calls scheduleAll on startup', async () => {
    const spy = jest.spyOn(service, 'scheduleAll').mockResolvedValue();
    await service.onApplicationBootstrap();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
