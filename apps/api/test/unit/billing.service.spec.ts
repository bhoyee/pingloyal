import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BillingService } from '../../src/modules/billing/billing.service';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { PlanTier, SubscriptionStatus } from '@pingloyal/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('bullmq', () => ({
  Worker: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest
    .fn()
    .mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  QueueEvents: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

// Mock the stripe require inside billing.service
jest.mock('stripe', () => {
  const mockStripe = {
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
    checkout: {
      sessions: {
        create: jest
          .fn()
          .mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
      },
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: {} },
      }),
    },
  };
  return jest.fn().mockReturnValue(mockStripe);
});

// Mock global fetch for Paystack API
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const OWNER_ID = 'user-owner-1';

function makeTenant(overrides: Record<string, unknown> = {}): Partial<Tenant> {
  return {
    id: TENANT_ID,
    businessName: 'FreshMart',
    currency: 'NGN',
    planTier: PlanTier.STARTER,
    subscriptionStatus: SubscriptionStatus.TRIALING,
    paystackCustomerId: null,
    stripeCustomerId: null,
    trialEndsAt: null,
    marketingWalletBalance: 5000,
    ...overrides,
  };
}

function makeOwner(): Partial<User> {
  return {
    id: OWNER_ID,
    email: 'owner@freshmart.ng',
    fullName: 'Chidi Okeke',
    tenantId: TENANT_ID,
  };
}

function makeSubscription(
  overrides: Record<string, unknown> = {},
): Partial<Subscription> {
  return {
    id: 'sub-1',
    tenantId: TENANT_ID,
    planTier: PlanTier.STARTER,
    currency: 'NGN',
    amount: 8000,
    utilityIncluded: 300,
    utilityUsedThisPeriod: 50,
    utilityOverageRate: 20,
    marketingRate: 130,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('BillingService', () => {
  let service: BillingService;
  let mockSubRepo: Record<string, jest.Mock>;
  let mockTenantRepo: Record<string, jest.Mock>;
  let mockUserRepo: Record<string, jest.Mock>;
  let mockDataSource: { query: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockWaQueue: { add: jest.Mock };
  let mockConfig: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default fetch mocks for Paystack
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { customer_code: 'CUS_test123' } }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              authorization_url: 'https://paystack.com/pay/test',
              reference: 'ref_test123',
            },
          }),
      });

    mockSubRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((d: unknown) => Promise.resolve(d)),
      create: jest.fn().mockImplementation((d: unknown) => d),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantRepo = {
      findOne: jest.fn().mockResolvedValue(makeTenant()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockUserRepo = { findOne: jest.fn().mockResolvedValue(makeOwner()) };
    mockDataSource = { query: jest.fn().mockResolvedValue([]) };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockWaQueue = { add: jest.fn().mockResolvedValue({ id: 'q1' }) };
    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3001';
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_stripe';
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test';
        return undefined;
      }),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'PAYSTACK_SECRET_KEY') return 'sk_live_paystack';
        return 'test-value';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfig },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
        {
          provide: WalletService,
          useValue: {
            topupWallet: jest.fn().mockResolvedValue(10000),
            getBalance: jest.fn().mockResolvedValue(10000),
          },
        },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  // ── T1: NGN subscribe → Paystack authorizationUrl ─────────────────────────

  it('T1 — NGN plan subscribe returns Paystack authorizationUrl', async () => {
    const result = await service.subscribe(TENANT_ID, 'starter_ngn', OWNER_ID);

    expect(result.authorizationUrl).toContain('paystack.com');
    expect(result.checkoutUrl).toBeUndefined();
  });

  // ── T2: GBP subscribe → Stripe checkoutUrl ────────────────────────────────

  it('T2 — GBP plan subscribe returns Stripe checkoutUrl', async () => {
    mockTenantRepo.findOne.mockResolvedValue(
      makeTenant({ currency: 'GBP', stripeCustomerId: 'cus_existing' }),
    );

    const result = await service.subscribe(TENANT_ID, 'starter_gbp', OWNER_ID);

    expect(result.checkoutUrl).toContain('stripe.com');
    expect(result.authorizationUrl).toBeUndefined();
  });

  // ── T3: Wrong currency → 400 ──────────────────────────────────────────────

  it('T3 — subscribing to GBP plan as NGN tenant throws 400', async () => {
    // Tenant currency is NGN (default), plan is GBP
    await expect(
      service.subscribe(TENANT_ID, 'starter_gbp', OWNER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T4: Invalid planId → 400 ──────────────────────────────────────────────

  it('T4 — invalid planId throws 400', async () => {
    await expect(
      service.subscribe(TENANT_ID, 'invalid_plan', OWNER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T5: Invalid Paystack signature → 401 ──────────────────────────────────

  it('T5 — invalid Paystack signature throws error', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    await expect(
      service.handlePaystackWebhook(body, 'badhash'),
    ).rejects.toThrow('Invalid Paystack signature');
  });

  // ── T6: charge.success → activateSubscription called ─────────────────────

  it('T6 — Paystack charge.success activates subscription', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_abc',
        metadata: {
          type: 'subscription',
          tenantId: TENANT_ID,
          planId: 'starter_ngn',
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ tenantId: TENANT_ID, planId: 'starter_ngn' }),
    );

    await service.handlePaystackWebhook(rawBody, sig);

    // activateSubscription should have saved a subscription
    expect(mockSubRepo.save).toHaveBeenCalled();
    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      }),
    );
  });

  // ── T7: Paystack invoice.payment_failed → past_due ────────────────────────

  it('T7 — Paystack invoice.payment_failed sets status to past_due', async () => {
    const body = {
      event: 'invoice.payment_failed',
      data: { customer: { metadata: { tenantId: TENANT_ID } } },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { status: SubscriptionStatus.PAST_DUE },
    );
  });

  // ── T8: Paystack subscription.disable → suspended ─────────────────────────

  it('T8 — Paystack subscription.disable suspends tenant', async () => {
    const body = {
      event: 'subscription.disable',
      data: { customer: { metadata: { tenantId: TENANT_ID } } },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      }),
    );
  });

  // ── T9: Invalid Stripe signature → 400 ────────────────────────────────────

  it('T9 — invalid Stripe signature throws BadRequestException', async () => {
    // Override stripe mock to throw on constructEvent
    const Stripe = jest.requireMock<jest.Mock>('stripe');

    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    stripeMock.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found');
    });

    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'bad-sig'),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T10: Stripe checkout.session.completed → activateSubscription ──────────

  it('T10 — Stripe checkout.session.completed activates subscription', async () => {
    const Stripe = jest.requireMock<jest.Mock>('stripe');

    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          metadata: { tenantId: TENANT_ID, planId: 'starter_gbp' },
        },
      },
    });

    mockTenantRepo.findOne.mockResolvedValue(makeTenant({ currency: 'GBP' }));

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockSubRepo.save).toHaveBeenCalled();
  });

  // ── T11: Stripe customer.subscription.deleted → suspended ────────────────

  it('T11 — Stripe customer.subscription.deleted suspends tenant', async () => {
    const Stripe = jest.requireMock<jest.Mock>('stripe');

    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: { id: 'cus_1', metadata: { tenantId: TENANT_ID } },
        },
      },
    });

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      }),
    );
  });

  // ── T12: activateSubscription sets correct utilityIncluded ────────────────

  it('T12 — activateSubscription sets correct utilityIncluded (starter=300, growth=800)', async () => {
    await service.activateSubscription(TENANT_ID, 'starter_ngn');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedArg = mockSubRepo.save.mock.calls[0][0] as {
      utilityIncluded: number;
    };
    expect(savedArg.utilityIncluded).toBe(300);

    jest.clearAllMocks();
    mockSubRepo.findOne.mockResolvedValue(null);
    mockSubRepo.save.mockImplementation((d: unknown) => Promise.resolve(d));
    mockSubRepo.create.mockImplementation((d: unknown) => d);

    await service.activateSubscription(TENANT_ID, 'growth_ngn');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedArg2 = mockSubRepo.save.mock.calls[0][0] as {
      utilityIncluded: number;
    };
    expect(savedArg2.utilityIncluded).toBe(800);
  });

  // ── T13: activateSubscription sets correct marketingRate ──────────────────

  it('T13 — activateSubscription sets correct marketingRate from plan', async () => {
    await service.activateSubscription(TENANT_ID, 'starter_ngn');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedArg = mockSubRepo.save.mock.calls[0][0] as {
      marketingRate: number;
    };
    expect(savedArg.marketingRate).toBe(130);
  });

  // ── T14: activateSubscription resets utilityUsedThisPeriod to 0 ───────────

  it('T14 — activateSubscription resets utilityUsedThisPeriod to 0', async () => {
    mockSubRepo.findOne.mockResolvedValue(
      makeSubscription({ utilityUsedThisPeriod: 150 }),
    );

    await service.activateSubscription(TENANT_ID, 'starter_ngn');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedArg = mockSubRepo.save.mock.calls[0][0] as {
      utilityUsedThisPeriod: number;
    };
    expect(savedArg.utilityUsedThisPeriod).toBe(0);
  });

  // ── T15: activateSubscription updates tenant.planTier ────────────────────

  it('T15 — activateSubscription updates tenant.planTier to match plan', async () => {
    await service.activateSubscription(TENANT_ID, 'growth_ngn');

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ planTier: 'growth' }),
    );
  });

  // ── T16: activateSubscription invalidates Redis cache ─────────────────────

  it('T16 — activateSubscription invalidates all Redis cache keys', async () => {
    await service.activateSubscription(TENANT_ID, 'starter_ngn');

    expect(mockRedis.del).toHaveBeenCalledWith(`tenant:${TENANT_ID}`);
    expect(mockRedis.del).toHaveBeenCalledWith(`tenant:full:${TENANT_ID}`);
    expect(mockRedis.del).toHaveBeenCalledWith(`tenant:sub:${TENANT_ID}`);
    expect(mockRedis.del).toHaveBeenCalledWith(
      `dashboard:summary:${TENANT_ID}`,
    );
  });

  // ── T17: Trial expired yesterday → suspended ──────────────────────────────

  it('T17 — tenant with trial_ends_at yesterday gets suspended', async () => {
    mockDataSource.query.mockResolvedValue([{ id: TENANT_ID }]);

    await service.checkExpiredTrials();

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      }),
    );
  });

  // ── T18: Trial ends tomorrow → not suspended ──────────────────────────────

  it('T18 — tenant with trial_ends_at tomorrow is not suspended', async () => {
    mockDataSource.query.mockResolvedValue([]); // No expired trials

    await service.checkExpiredTrials();

    expect(mockTenantRepo.update).not.toHaveBeenCalled();
  });

  // ── T19: Already suspended → not processed again ─────────────────────────

  it('T19 — already suspended tenants are excluded by SQL (not in query result)', async () => {
    // The SQL filters WHERE subscription_status = 'trialing'
    // so already suspended tenants won't be in the result
    mockDataSource.query.mockResolvedValue([]); // Empty — suspended not included

    await service.checkExpiredTrials();

    expect(mockSubRepo.update).not.toHaveBeenCalled();
  });
});
