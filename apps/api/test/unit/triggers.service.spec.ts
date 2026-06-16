import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TriggerType } from '@pingloyal/types';
import {
  TriggersService,
  TOGGLEABLE_TRIGGER_TYPES,
} from '../../src/modules/triggers/triggers.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';

const TENANT: Partial<Tenant> = {
  id: 'tenant-1',
  timezone: 'Africa/Lagos',
  lapsedDays: 60,
  enabledTriggers: { lapsed_winback: false },
};

const LOG_COUNT_ROWS = [
  {
    trigger_type: 'welcome',
    today: '2',
    this_month: '5',
    all_time: '20',
  },
  {
    trigger_type: 'balance_bot_reply',
    today: '1',
    this_month: '3',
    all_time: '9',
  },
];

describe('TriggersService', () => {
  let service: TriggersService;
  let mockTenantRepo: Record<string, jest.Mock>;
  let mockDataSource: { query: jest.Mock };
  let mockRedis: { del: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTenantRepo = {
      findOne: jest.fn().mockResolvedValue({ ...TENANT }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockDataSource = {
      query: jest.fn((sql: string) => {
        if (sql.includes('FROM trigger_logs')) {
          return Promise.resolve(LOG_COUNT_ROWS);
        }
        if (sql.includes('FROM customers')) {
          return Promise.resolve([{ count: '4' }]);
        }
        return Promise.resolve([]);
      }),
    };
    mockRedis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriggersService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(TriggersService);
  });

  describe('getConfig', () => {
    it('returns a config entry for every toggleable trigger type', async () => {
      const result = await service.getConfig('tenant-1');

      expect(result).toHaveLength(TOGGLEABLE_TRIGGER_TYPES.length);
      expect(result.map((r) => r.type)).toEqual([...TOGGLEABLE_TRIGGER_TYPES]);
    });

    it('fills in counts from trigger_logs and respects enabledTriggers', async () => {
      const result = await service.getConfig('tenant-1');

      const welcome = result.find(
        (r) => r.type === (TriggerType.WELCOME as string),
      );
      expect(welcome).toMatchObject({
        sentToday: 2,
        sentThisMonth: 5,
        allTime: 20,
        enabled: true,
      });

      const lapsed = result.find(
        (r) => r.type === (TriggerType.LAPSED_WINBACK as string),
      );
      expect(lapsed?.enabled).toBe(false);
      expect(lapsed?.pendingToday).toBe(4);

      const birthday = result.find(
        (r) => r.type === (TriggerType.BIRTHDAY as string),
      );
      expect(birthday?.pendingToday).toBeNull();
      expect(birthday?.sentToday).toBe(0);
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      mockTenantRepo.findOne.mockResolvedValue(null);

      await expect(service.getConfig('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBotConfig', () => {
    it('returns the balance_bot_reply config with no pendingToday', async () => {
      const result = await service.getBotConfig('tenant-1');

      expect(result.type).toBe(TriggerType.BALANCE_BOT_REPLY);
      expect(result.sentToday).toBe(1);
      expect(result.sentThisMonth).toBe(3);
      expect(result.allTime).toBe(9);
      expect(result.pendingToday).toBeNull();
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      mockTenantRepo.findOne.mockResolvedValue(null);

      await expect(service.getBotConfig('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setEnabled', () => {
    it('updates enabledTriggers and invalidates tenant caches', async () => {
      const result = await service.setEnabled(
        'tenant-1',
        TriggerType.WELCOME,
        false,
      );

      expect(result).toEqual({ type: TriggerType.WELCOME, enabled: false });
      expect(mockTenantRepo.update).toHaveBeenCalledWith('tenant-1', {
        enabledTriggers: { lapsed_winback: false, welcome: false },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:tenant-1');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:full:tenant-1');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:sub:tenant-1');
    });

    it('allows toggling the balance_bot_reply type', async () => {
      const result = await service.setEnabled(
        'tenant-1',
        TriggerType.BALANCE_BOT_REPLY,
        true,
      );

      expect(result).toEqual({
        type: TriggerType.BALANCE_BOT_REPLY,
        enabled: true,
      });
    });

    it('rejects unknown trigger types', async () => {
      await expect(
        service.setEnabled('tenant-1', 'not_a_real_type', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      mockTenantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setEnabled('missing', TriggerType.WELCOME, true),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
