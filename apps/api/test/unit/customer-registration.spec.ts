import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WaVerificationStatus, CustomerSource } from '@pingloyal/types';
import { getQueueToken } from '@nestjs/bullmq';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { CustomersService } from '../../src/modules/customers/customers.service';
import type { RegisterCustomerDto } from '../../src/modules/customers/dto/register-customer.dto';

// Hoisting-safe mock — no outer variable references inside the factory
jest.mock('@pingloyal/utils', () => ({
  normalisePhone: jest.fn(),
  maskPhone: jest.fn(),

  PhoneNormalisationError: class PhoneNormalisationError extends Error {
    constructor(raw: string) {
      super(`Cannot normalise phone number: "${raw}"`);
      this.name = 'PhoneNormalisationError';
    }
  },

  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

import { normalisePhone, PhoneNormalisationError } from '@pingloyal/utils';

const mockTenantRepo = {
  findOne: jest.fn(),
};
const mockCustomerRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  manager: { query: jest.fn().mockResolvedValue(undefined) },
};
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};
const mockWaMessagesQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const TENANT_VERIFIED: Partial<Tenant> = {
  id: 'tenant-uuid-1',
  slug: 'my-store',
  waVerificationStatus: WaVerificationStatus.VERIFIED,
};

const TENANT_PENDING: Partial<Tenant> = {
  id: 'tenant-uuid-1',
  slug: 'my-store',
  waVerificationStatus: WaVerificationStatus.PENDING,
};

const BASE_DTO: RegisterCustomerDto = {
  tenantSlug: 'my-store',
  fullName: 'Adebayo Okafor',
  phone: '08012345678',
  waOptedIn: true,
};

const IDEM_KEY = 'idem-key-abc123';
const E164 = '+2348012345678';

describe('CustomersService – register', () => {
  let service: CustomersService;

  beforeEach(async () => {
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
    jest.clearAllMocks();

    // Default: normalisePhone succeeds
    (normalisePhone as jest.Mock).mockReturnValue(E164);
    // Default: no idempotency cache hit
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockWaMessagesQueue.add.mockResolvedValue({ id: 'job-1' });
  });

  // ── 32. Returns cached idempotency result from Redis ──────────────────────────
  it('returns cached result immediately when idempotency key already exists', async () => {
    const cached = JSON.stringify({
      id: 'cust-1',
      tenantId: 'tenant-uuid-1',
      fullName: 'Adebayo Okafor',
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 0,
      isNew: true,
    });
    mockRedis.get.mockResolvedValue(cached);

    const result = await service.register(BASE_DTO, IDEM_KEY);

    expect(result.id).toBe('cust-1');
    expect(mockTenantRepo.findOne).not.toHaveBeenCalled();
  });

  // ── 33. Throws NotFoundException for unknown tenant slug ──────────────────────
  it('throws NotFoundException when tenant slug is not found', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    await expect(service.register(BASE_DTO, IDEM_KEY)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── 34. Throws BadRequestException for invalid phone ─────────────────────────
  it('throws BadRequestException when phone cannot be normalised', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    (normalisePhone as jest.Mock).mockImplementation(() => {
      throw new PhoneNormalisationError('bad-phone');
    });

    await expect(
      service.register({ ...BASE_DTO, phone: 'bad-phone' }, IDEM_KEY),
    ).rejects.toThrow(BadRequestException);
  });

  // ── 35. Creates a new customer when none exists ───────────────────────────────
  it('creates and returns a new customer when phone is not registered', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const saved = {
      id: 'cust-new',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      waOptedInAt: new Date(),
      pointsBalance: 0,
      source: CustomerSource.QR_REGISTRATION,
    };
    mockCustomerRepo.create.mockReturnValue(saved);
    mockCustomerRepo.save.mockResolvedValue(saved);

    const result = await service.register(BASE_DTO, IDEM_KEY);

    expect(result.isNew).toBe(true);
    expect(result.phoneE164).toBe(E164);
    expect(mockCustomerRepo.save).toHaveBeenCalledTimes(1);
  });

  // ── Assigns the lowest tier to a brand-new customer ────────────────────────────
  it('assigns the lowest configured tier to a newly registered customer', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const saved = {
      id: 'cust-new',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 0,
    };
    mockCustomerRepo.create.mockReturnValue(saved);
    mockCustomerRepo.save.mockResolvedValue(saved);

    await service.register(BASE_DTO, IDEM_KEY);

    expect(mockCustomerRepo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE customers SET tier_id'),
      ['tenant-uuid-1', 'cust-new'],
    );
  });

  // ── Does NOT touch tier_id for an existing customer ────────────────────────────
  it('does not run tier assignment query for an existing (returning) customer', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    const existing = {
      id: 'cust-existing',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 50,
    };
    mockCustomerRepo.findOne.mockResolvedValue(existing);

    await service.register(BASE_DTO, IDEM_KEY);

    expect(mockCustomerRepo.manager.query).not.toHaveBeenCalled();
  });

  // ── 36. Returns existing customer (isNew=false) for duplicate phone ───────────
  it('returns existing customer with isNew=false when phone already registered', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    const existing = {
      id: 'cust-existing',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 50,
    };
    mockCustomerRepo.findOne.mockResolvedValue(existing);

    const result = await service.register(BASE_DTO, IDEM_KEY);

    expect(result.isNew).toBe(false);
    expect(result.id).toBe('cust-existing');
    // Should NOT create a second customer
    expect(mockCustomerRepo.create).not.toHaveBeenCalled();
  });

  // ── 37. Queues welcome trigger when waOptedIn + WA verified ──────────────────
  it('enqueues welcome trigger when waOptedIn=true and WA is verified', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const saved = {
      id: 'cust-new',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 0,
    };
    mockCustomerRepo.create.mockReturnValue(saved);
    mockCustomerRepo.save.mockResolvedValue(saved);

    await service.register(BASE_DTO, IDEM_KEY);

    expect(mockWaMessagesQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        type: 'welcome',
        customerId: 'cust-new',
        tenantId: 'tenant-uuid-1',
      }),
      expect.any(Object),
    );
  });

  // ── 38. Does NOT queue when waOptedIn=false ───────────────────────────────────
  it('does not enqueue welcome trigger when waOptedIn=false', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const saved = {
      id: 'cust-new',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: false,
      pointsBalance: 0,
    };
    mockCustomerRepo.create.mockReturnValue(saved);
    mockCustomerRepo.save.mockResolvedValue(saved);

    await service.register({ ...BASE_DTO, waOptedIn: false }, IDEM_KEY);

    expect(mockWaMessagesQueue.add).not.toHaveBeenCalled();
  });

  // ── 39. Skips welcome trigger (no error) when WA not verified ─────────────────
  it('skips welcome trigger with a warning (not an error) when WA is not verified', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_PENDING);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const saved = {
      id: 'cust-new',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 0,
    };
    mockCustomerRepo.create.mockReturnValue(saved);
    mockCustomerRepo.save.mockResolvedValue(saved);

    // Must NOT throw even though WA is not verified
    await expect(service.register(BASE_DTO, IDEM_KEY)).resolves.not.toThrow();
    expect(mockWaMessagesQueue.add).not.toHaveBeenCalled();
  });

  // ── 40. Updates existing customer opt-in when previously opted out ────────────
  it('updates waOptedIn for an existing customer who was previously opted out', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    const existing = {
      id: 'cust-existing',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: false,
      waOptedInAt: null,
      pointsBalance: 100,
    };
    mockCustomerRepo.findOne.mockResolvedValue(existing);
    mockCustomerRepo.save.mockResolvedValue({ ...existing, waOptedIn: true });

    const result = await service.register(BASE_DTO, IDEM_KEY);

    expect(mockCustomerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ waOptedIn: true }),
    );
    expect(result.isNew).toBe(false);
  });

  // ── 41. Caches result in Redis after successful registration ──────────────────
  it('caches the result in Redis under the idempotency key', async () => {
    mockTenantRepo.findOne.mockResolvedValue(TENANT_VERIFIED);
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const saved = {
      id: 'cust-new',
      tenantId: 'tenant-uuid-1',
      fullName: BASE_DTO.fullName,
      phoneE164: E164,
      waOptedIn: true,
      pointsBalance: 0,
    };
    mockCustomerRepo.create.mockReturnValue(saved);
    mockCustomerRepo.save.mockResolvedValue(saved);

    await service.register(BASE_DTO, IDEM_KEY);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      `idem:register:${IDEM_KEY}`,
      86_400,
      expect.stringContaining('"id":"cust-new"'),
    );
  });
});

describe('CustomersService – getTenantInfo', () => {
  let service: CustomersService;

  beforeEach(async () => {
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
    jest.clearAllMocks();
  });

  // ── 58. Returns tenant info fields for a known slug ───────────────────────────
  it('T58 — returns public tenant info for a known slug', async () => {
    mockTenantRepo.findOne.mockResolvedValue({
      businessName: 'Test Store',
      logoUrl: null,
      qrCodeUrl: null,
      currency: 'NGN',
      pointsThreshold: 1000,
      rewardValue: 500,
      waVerificationStatus: WaVerificationStatus.VERIFIED,
    });

    const result = await service.getTenantInfo('test-store');

    expect(result.businessName).toBe('Test Store');
    expect(result.currency).toBe('NGN');
    expect(result.pointsThreshold).toBe(1000);
    expect(result.rewardValue).toBe(500);
    expect(result.waVerificationStatus).toBe(WaVerificationStatus.VERIFIED);
  });

  // ── 59. Throws NotFoundException for unknown slug ─────────────────────────────
  it('T59 — throws NotFoundException for an unknown slug', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    await expect(service.getTenantInfo('no-such-store')).rejects.toThrow(
      NotFoundException,
    );
  });
});
