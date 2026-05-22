import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { WaVerificationStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { WaOnboardingService } from '../../src/modules/whatsapp/wa-onboarding.service';

// Mock @pingloyal/utils so encrypt is spy-able
jest.mock('@pingloyal/utils', () => ({
  encrypt: jest.fn().mockReturnValue('iv:tag:cipher'),
  decrypt: jest.fn().mockReturnValue('plaintext-api-key'),
}));

import { encrypt } from '@pingloyal/utils';

const mockTenantRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockRedis = {
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      GUPSHUP_PARTNER_API_URL: 'https://partner.gupshup.io',
      GUPSHUP_PARTNER_KEY: 'test-partner-key',
      GUPSHUP_PARTNER_ID: 'test-partner-id',
    };
    return cfg[key] ?? '';
  }),
};

const mockFetch = jest.fn();

describe('WaOnboardingService', () => {
  let service: WaOnboardingService;

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaOnboardingService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(WaOnboardingService);
    jest.clearAllMocks();
    // Default: rate-limit counter stays under threshold
    mockRedis.incr.mockResolvedValue(1);
  });

  const validDto = {
    phoneNumber: '+2348012345678',
    displayName: 'Test Store',
    category: 'Grocery & Supermarkets' as const,
    description: 'A test grocery store for unit testing purposes',
    website: undefined,
  };

  const wabaResponse = { appId: 'gupshup-app-id', apiKey: 'raw-api-key-value' };

  // ── 1. calls Gupshup Partner API with correct params ────────────────────────
  it('initiateOnboarding calls Gupshup Partner API with correct params', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(wabaResponse),
      })
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve({}) });

    await service.initiateOnboarding('tenant-1', validDto);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [firstUrl, firstOpts] = mockFetch.mock.calls[0] as [
      string,
      { body: string },
    ];
    expect(firstUrl).toBe('https://partner.gupshup.io/partner/accounts');
    const body = JSON.parse(firstOpts.body) as Record<string, string>;
    expect(body.phone).toBe('+2348012345678');
    expect(body.name).toBe('Test Store');
  });

  // ── 2. encrypts apiKey before storing ──────────────────────────────────────
  it('initiateOnboarding encrypts apiKey before storing (never stores plaintext)', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve(wabaResponse),
      })
      .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve({}) });

    await service.initiateOnboarding('tenant-1', validDto);

    expect(encrypt).toHaveBeenCalledWith('raw-api-key-value');
    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ gupshupApiKey: 'iv:tag:cipher' }),
    );
    // Must NOT store the raw key
    const updateCall = mockTenantRepo.update.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(updateCall[1].gupshupApiKey).not.toBe('raw-api-key-value');
  });

  // ── 3. throws BadRequestException for invalid phone ─────────────────────────
  it('initiateOnboarding throws BadRequestException for invalid phone format', async () => {
    await expect(
      service.initiateOnboarding('tenant-1', {
        ...validDto,
        phoneNumber: '080 1234 5678',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── 4. throws ConflictException on Gupshup 409 ──────────────────────────────
  it('initiateOnboarding throws ConflictException on Gupshup 409 response', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 409,
      json: () => Promise.resolve({ error: 'already registered' }),
    });

    await expect(
      service.initiateOnboarding('tenant-1', validDto),
    ).rejects.toThrow(ConflictException);
  });

  // ── 5. handleVerificationReply 'YES' → verified ─────────────────────────────
  it('handleVerificationReply with YES → status becomes verified', async () => {
    const tenant = { id: 'tenant-1', gupshupAppId: 'app-123' };
    mockTenantRepo.findOne.mockResolvedValue(tenant);

    await service.handleVerificationReply({
      app: 'app-123',
      payload: {
        source: '+2348012345678',
        type: 'text',
        payload: { text: 'YES' },
      },
    });

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        waVerificationStatus: WaVerificationStatus.VERIFIED,
      }),
    );
  });

  // ── 6. handleVerificationReply 'yes' (lowercase) → verified ─────────────────
  it('handleVerificationReply with yes (lowercase) → status becomes verified', async () => {
    const tenant = { id: 'tenant-2', gupshupAppId: 'app-456' };
    mockTenantRepo.findOne.mockResolvedValue(tenant);

    await service.handleVerificationReply({
      app: 'app-456',
      payload: {
        source: '+2348012345678',
        type: 'text',
        payload: { text: 'yes' },
      },
    });

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      'tenant-2',
      expect.objectContaining({
        waVerificationStatus: WaVerificationStatus.VERIFIED,
      }),
    );
  });

  // ── 7. handleVerificationReply 'NO' → status unchanged ──────────────────────
  it('handleVerificationReply with NO → status unchanged, still awaiting_reply', async () => {
    await service.handleVerificationReply({
      app: 'app-789',
      payload: {
        source: '+2348012345678',
        type: 'text',
        payload: { text: 'NO' },
      },
    });

    expect(mockTenantRepo.update).not.toHaveBeenCalled();
  });

  // ── 8. unknown appId → no update, no error ───────────────────────────────────
  it('handleVerificationReply with unknown appId → no update, no error', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    await expect(
      service.handleVerificationReply({
        app: 'unknown-app',
        payload: {
          source: '+2348012345678',
          type: 'text',
          payload: { text: 'yes' },
        },
      }),
    ).resolves.toBeUndefined();

    expect(mockTenantRepo.update).not.toHaveBeenCalled();
  });

  // ── 9. getStatus never returns gupshupApiKey ─────────────────────────────────
  it('getStatus never returns gupshupApiKey in response', async () => {
    mockTenantRepo.findOne.mockResolvedValue({
      id: 'tenant-1',
      gupshupApiKey: 'iv:tag:encrypted-secret',
      gupshupAppId: 'app-123',
      waVerificationStatus: WaVerificationStatus.VERIFIED,
      waDisplayName: 'Test Store',
      waPhoneNumber: '+2348012345678',
      waBusinessCategory: 'Grocery',
      waVerifiedAt: new Date(),
    });

    const status = await service.getStatus('tenant-1');

    expect(status).not.toHaveProperty('gupshupApiKey');
    expect(status).not.toHaveProperty('gupshupAppId');
    expect(status.isConnected).toBe(true);
  });

  // ── 10. resendVerification throws after 3 attempts ───────────────────────────
  it('resendVerification throws TooManyRequestsException after 3 attempts', async () => {
    mockRedis.incr.mockResolvedValue(4); // 4th attempt

    await expect(service.resendVerification('tenant-1')).rejects.toThrow(
      HttpException,
    );
    const err = await service
      .resendVerification('tenant-1')
      .catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(429);
  });

  // ── 11. disconnect resets all WA fields to null ───────────────────────────────
  it('disconnect resets all WA fields to null', async () => {
    mockTenantRepo.findOne.mockResolvedValue({
      id: 'tenant-1',
      gupshupAppId: 'app-123',
    });

    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({}),
    });

    await service.disconnect('tenant-1');

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        gupshupAppId: null,
        gupshupApiKey: null,
        waPhoneNumber: null,
        waDisplayName: null,
        waVerificationStatus: WaVerificationStatus.PENDING,
        waVerifiedAt: null,
      }),
    );
  });
});
