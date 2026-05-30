import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationsService } from '../../src/modules/integrations/integrations.service';
import { Integration } from '../../src/modules/integrations/entities/integration.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { TransactionsService } from '../../src/modules/transactions/transactions.service';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import {
  IntegrationConnectionType,
  IntegrationSyncStatus,
} from '@pingloyal/types';

// ── Mock normalisePhone ────────────────────────────────────────────────────────

jest.mock('@pingloyal/utils', () => ({
  normalisePhone: jest.fn((phone: string) => {
    if (phone === 'INVALID')
      throw new (class extends Error {
        constructor() {
          super('bad phone');
        }
      })();
    return '+2348012345678';
  }),
  PhoneNormalisationError: class extends Error {},
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace('enc:', '')),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const SLUG = 'freshmart';
const SECRET = 'deadbeef'.repeat(8); // 64-char hex

function makeIntegration(overrides: Partial<Integration> = {}): Integration {
  return {
    id: 'integ-1',
    tenantId: TENANT_ID,
    connectionType: IntegrationConnectionType.WEBHOOK,
    endpointUrl: null,
    apiKeyEncrypted: null,
    webhookSecret: SECRET,
    pollIntervalMins: 5,
    fieldMapping: { phone: 'customer_phone', amount: 'sale_amount' },
    syncStatus: IntegrationSyncStatus.ACTIVE,
    lastSyncedAt: null,
    lastSyncCursor: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenant: null as never,
    ...overrides,
  };
}

function makeTenant(): Partial<Tenant> {
  return { id: TENANT_ID, slug: SLUG };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    tenantId: TENANT_ID,
    fullName: 'Adaeze Obi',
    phoneE164: '+2348012345678',
    waOptedIn: false,
    pointsBalance: 0,
    ...overrides,
  };
}

function signBody(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(body))
    .digest('hex');
}

function makeWebhookCall(
  service: IntegrationsService,
  opts: {
    body?: Record<string, unknown>;
    sigHeader?: string;
    sigValue?: string | null;
    secret?: string;
  } = {},
) {
  const body = opts.body ?? {
    customer_phone: '08012345678',
    sale_amount: '5000',
  };
  const raw = Buffer.from(JSON.stringify(body));
  const secret = opts.secret ?? SECRET;
  const sig =
    opts.sigValue !== undefined
      ? opts.sigValue
      : signBody(raw.toString(), secret);
  const headers: Record<string, string> = {};
  if (sig !== null) {
    headers[opts.sigHeader ?? 'x-webhook-signature'] = sig;
  }
  return service.receiveWebhook(SLUG, raw, headers, body);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('IntegrationsService — webhook receiver', () => {
  let service: IntegrationsService;
  let mockIntegrationRepo: Record<string, jest.Mock>;
  let mockTenantRepo: Record<string, jest.Mock>;
  let mockCustomerRepo: Record<string, jest.Mock>;
  let mockCategoryRepo: Record<string, jest.Mock>;
  let mockTxService: { create: jest.Mock };
  let mockRedis: { del: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue(makeIntegration()),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: unknown) =>
        Promise.resolve({ ...makeIntegration(), ...(d as object) }),
      ),
    };
    mockTenantRepo = {
      findOne: jest.fn().mockResolvedValue(makeTenant()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCustomerRepo = {
      findOne: jest.fn().mockResolvedValue(makeCustomer()),
      create: jest.fn((d: unknown) => d),
      save: jest.fn().mockResolvedValue(makeCustomer()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCategoryRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockTxService = {
      create: jest
        .fn()
        .mockResolvedValue({ pointsEarned: 50, alreadyProcessed: false }),
    };
    mockRedis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        {
          provide: getRepositoryToken(Integration),
          useValue: mockIntegrationRepo,
        },
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        {
          provide: getRepositoryToken(Customer),
          useValue: mockCustomerRepo,
        },
        {
          provide: getRepositoryToken(ProductCategory),
          useValue: mockCategoryRepo,
        },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: TransactionsService, useValue: mockTxService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:3001') },
        },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(IntegrationsService);
  });

  // T1: Valid HMAC → 200 + transaction created ──────────────────────────────

  it('T1 — valid HMAC creates transaction and returns received=true', async () => {
    const result = await makeWebhookCall(service);

    expect(result.received).toBe(true);
    expect(mockTxService.create).toHaveBeenCalledTimes(1);
    expect(result.pointsEarned).toBe(50);
  });

  // T2: Invalid HMAC → 401 ──────────────────────────────────────────────────

  it('T2 — invalid HMAC throws UnauthorizedException (401)', async () => {
    await expect(
      makeWebhookCall(service, { sigValue: 'badhash' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // T3: Missing signature header → 401 ──────────────────────────────────────

  it('T3 — missing signature header throws UnauthorizedException (401)', async () => {
    await expect(makeWebhookCall(service, { sigValue: null })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // T4: X-Webhook-Signature accepted ────────────────────────────────────────

  it('T4 — accepts X-Webhook-Signature header variant', async () => {
    const result = await makeWebhookCall(service, {
      sigHeader: 'x-webhook-signature',
    });
    expect(result.received).toBe(true);
  });

  // T5: X-Hub-Signature-256 accepted ────────────────────────────────────────

  it('T5 — accepts X-Hub-Signature-256 header variant', async () => {
    const body = { customer_phone: '08012345678', sale_amount: '5000' };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);
    const result = await service.receiveWebhook(
      SLUG,
      raw,
      {
        'x-hub-signature-256': sig,
      },
      body,
    );
    expect(result.received).toBe(true);
  });

  // T6: Missing phone → 400 ─────────────────────────────────────────────────

  it('T6 — missing phone field returns 400 with field mapping hint', async () => {
    const body = { sale_amount: '5000' }; // no customer_phone
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);
    await expect(
      service.receiveWebhook(SLUG, raw, { 'x-webhook-signature': sig }, body),
    ).rejects.toThrow(BadRequestException);
  });

  // T7: Invalid phone → 400 ─────────────────────────────────────────────────

  it('T7 — invalid phone format returns 400', async () => {
    const { normalisePhone } = await import('@pingloyal/utils');
    const { PhoneNormalisationError } = await import('@pingloyal/utils');
    (normalisePhone as jest.Mock).mockImplementationOnce(() => {
      throw new PhoneNormalisationError('bad phone');
    });

    const body = { customer_phone: 'INVALID', sale_amount: '5000' };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);
    await expect(
      service.receiveWebhook(SLUG, raw, { 'x-webhook-signature': sig }, body),
    ).rejects.toThrow(BadRequestException);
  });

  // T8: New customer created with waOptedIn=false ───────────────────────────

  it('T8 — new customer created with waOptedIn=false', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(null);
    const savedCustomer = makeCustomer({ waOptedIn: false });
    mockCustomerRepo.save.mockResolvedValue(savedCustomer);

    const result = await makeWebhookCall(service);

    expect(mockCustomerRepo.save).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedArg = mockCustomerRepo.create.mock.calls[0][0] as {
      waOptedIn: boolean;
    };
    expect(savedArg.waOptedIn).toBe(false);
    expect(result.waOptedIn).toBe(false);
  });

  // T9: Existing customer found by phone ────────────────────────────────────

  it('T9 — existing customer found, no duplicate created', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(makeCustomer());

    await makeWebhookCall(service);

    // customerRepo.save should NOT be called for existing customer
    expect(mockCustomerRepo.save).not.toHaveBeenCalled();
  });

  // T10: Nested field path ──────────────────────────────────────────────────

  it("T10 — nested field path 'customer.phone' extracts correctly", async () => {
    mockIntegrationRepo.findOne.mockResolvedValue(
      makeIntegration({
        fieldMapping: {
          phone: 'customer.phone',
          amount: 'sale_amount',
        },
      }),
    );
    const body = { customer: { phone: '08012345678' }, sale_amount: '5000' };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);

    const result = await service.receiveWebhook(
      SLUG,
      raw,
      {
        'x-webhook-signature': sig,
      },
      body,
    );

    expect(result.received).toBe(true);
  });

  // T11: externalTransactionId → idempotency key uses it ────────────────────

  it('T11 — externalTransactionId used in idempotency key', async () => {
    mockIntegrationRepo.findOne.mockResolvedValue(
      makeIntegration({
        fieldMapping: {
          phone: 'customer_phone',
          amount: 'sale_amount',
          transactionId: 'tx_id',
        },
      }),
    );
    const body = {
      customer_phone: '08012345678',
      sale_amount: '5000',
      tx_id: 'TXN-999',
    };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);

    await service.receiveWebhook(
      SLUG,
      raw,
      { 'x-webhook-signature': sig },
      body,
    );

    const [, , dto] = mockTxService.create.mock.calls[0] as [
      string,
      null,
      { idempotencyKey: string },
    ];
    expect(dto.idempotencyKey).toBe(`webhook_${TENANT_ID}_TXN-999`);
  });

  // T12: No externalTransactionId → UUID idempotency key ────────────────────

  it('T12 — no externalTransactionId uses UUID for idempotency key', async () => {
    await makeWebhookCall(service);

    const [, , dto] = mockTxService.create.mock.calls[0] as [
      string,
      null,
      { idempotencyKey: string },
    ];
    expect(dto.idempotencyKey).toMatch(/^webhook_tenant-1_[0-9a-f-]{36}$/);
  });

  // T13: Same externalTransactionId twice → idempotency working ─────────────

  it('T13 — same externalTransactionId submitted twice returns 200 both times', async () => {
    mockIntegrationRepo.findOne.mockResolvedValue(
      makeIntegration({
        fieldMapping: {
          phone: 'customer_phone',
          amount: 'sale_amount',
          transactionId: 'tx_id',
        },
      }),
    );
    // TransactionsService.create() handles idempotency internally
    mockTxService.create.mockResolvedValue({
      pointsEarned: 0,
      alreadyProcessed: true,
    });

    const body = {
      customer_phone: '08012345678',
      sale_amount: '5000',
      tx_id: 'SAME-TX',
    };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);

    const r1 = await service.receiveWebhook(
      SLUG,
      raw,
      { 'x-webhook-signature': sig },
      body,
    );
    const r2 = await service.receiveWebhook(
      SLUG,
      raw,
      { 'x-webhook-signature': sig },
      body,
    );

    expect(r1.received).toBe(true);
    expect(r2.received).toBe(true);
  });

  // T14: waOptedIn=true → WA triggers queued ────────────────────────────────

  it('T14 — waOptedIn=true customer shows WA queued message', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ waOptedIn: true }),
    );

    const result = await makeWebhookCall(service);

    expect(result.waOptedIn).toBe(true);
    expect(result.message).toContain('WhatsApp message queued');
  });

  // T15: waOptedIn=false → no WA triggers ──────────────────────────────────

  it('T15 — waOptedIn=false customer shows not opted in message', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ waOptedIn: false }),
    );

    const result = await makeWebhookCall(service);

    expect(result.waOptedIn).toBe(false);
    expect(result.message).toContain('not yet opted in');
  });

  // T16: Unknown categorySlug → saved with null ─────────────────────────────

  it('T16 — unknown categorySlug results in categoryId=null (no error)', async () => {
    mockIntegrationRepo.findOne.mockResolvedValue(
      makeIntegration({
        fieldMapping: {
          phone: 'customer_phone',
          amount: 'sale_amount',
          categorySlug: 'cat',
        },
      }),
    );
    mockCategoryRepo.findOne.mockResolvedValue(null);

    const body = {
      customer_phone: '08012345678',
      sale_amount: '5000',
      cat: 'unknown-cat',
    };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = signBody(raw.toString(), SECRET);

    const result = await service.receiveWebhook(
      SLUG,
      raw,
      { 'x-webhook-signature': sig },
      body,
    );

    expect(result.received).toBe(true);
    const [, , dto] = mockTxService.create.mock.calls[0] as [
      string,
      null,
      { categoryId?: string },
    ];
    expect(dto.categoryId).toBeUndefined();
  });

  // T17: syncStatus updated to 'active' after success ───────────────────────

  it('T17 — integration syncStatus updated to active after success', async () => {
    await makeWebhookCall(service);

    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      expect.objectContaining({ syncStatus: IntegrationSyncStatus.ACTIVE }),
    );
  });

  // T18: syncStatus updated to 'error' on failure ───────────────────────────

  it('T18 — integration syncStatus updated to error on processing failure', async () => {
    mockTxService.create.mockRejectedValue(new Error('DB error'));

    await expect(makeWebhookCall(service)).rejects.toThrow();

    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      expect.objectContaining({ syncStatus: IntegrationSyncStatus.ERROR }),
    );
  });

  // T19: Tenant not found → 404 ─────────────────────────────────────────────

  it('T19 — unknown tenant slug throws NotFoundException (404)', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    await expect(makeWebhookCall(service)).rejects.toThrow(NotFoundException);
  });

  // T20: Integration not configured → 400 ──────────────────────────────────

  it('T20 — integration not configured throws BadRequestException (400)', async () => {
    mockIntegrationRepo.findOne.mockResolvedValue(null);

    await expect(makeWebhookCall(service)).rejects.toThrow(BadRequestException);
  });
});
