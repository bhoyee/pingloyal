import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BillingService } from '../../src/modules/billing/billing.service';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { UtilityTrackingService } from '../../src/modules/billing/utility-tracking.service';
import { SignupService } from '../../src/modules/signup/signup.service';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import { WebhookEvent } from '../../src/modules/billing/entities/webhook-event.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { PlanTier, SubscriptionStatus } from '@pingloyal/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// growth_gbp.stripePriceId is read from process.env at module-load time and
// is unset in the unit-test environment — override just that one field so
// the Stripe price-swap path has a real-looking price id to assert against,
// while every other plan field stays exactly as plans.config.ts defines it.
jest.mock('../../src/modules/billing/plans.config', () => {
  const actual = jest.requireActual<
    typeof import('../../src/modules/billing/plans.config')
  >('../../src/modules/billing/plans.config');
  return {
    ...actual,
    PLANS: {
      ...actual.PLANS,
      growth_gbp: {
        ...actual.PLANS.growth_gbp,
        stripePriceId: 'price_test_growth_gbp',
      },
    },
  };
});

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
    subscriptions: {
      update: jest.fn().mockResolvedValue({}),
      retrieve: jest
        .fn()
        .mockResolvedValue({ items: { data: [{ id: 'si_test123' }] } }),
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
  let mockWebhookEventRepo: { createQueryBuilder: jest.Mock };
  let mockWebhookEventQb: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock;
  };
  let mockDataSource: { query: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockWaQueue: { add: jest.Mock };
  let mockConfig: { get: jest.Mock; getOrThrow: jest.Mock };
  let mockSignupService: { completeSignup: jest.Mock };
  let mockWalletService: {
    topupWallet: jest.Mock;
    getBalance: jest.Mock;
    getMonthlySpend: jest.Mock;
  };

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

    // Every webhook test in this file represents a "first time seen" event
    // by default — returning a row means recordWebhookEventOrSkip treats it
    // as new and lets processing continue.
    mockWebhookEventQb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: 'we-1' }] }),
    };
    mockWebhookEventRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockWebhookEventQb),
    };

    mockDataSource = { query: jest.fn().mockResolvedValue([]) };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockWaQueue = { add: jest.fn().mockResolvedValue({ id: 'q1' }) };
    mockSignupService = {
      completeSignup: jest.fn().mockResolvedValue(undefined),
    };
    mockWalletService = {
      topupWallet: jest.fn().mockResolvedValue(10000),
      getBalance: jest.fn().mockResolvedValue(10000),
      getMonthlySpend: jest
        .fn()
        .mockResolvedValue({ totalSpend: 0, messageCount: 0 }),
    };
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
        {
          provide: getRepositoryToken(WebhookEvent),
          useValue: mockWebhookEventRepo,
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfig },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
        { provide: WalletService, useValue: mockWalletService },
        {
          provide: UtilityTrackingService,
          useValue: {
            resetUsageForNewPeriod: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: SignupService, useValue: mockSignupService },
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

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('grace_period_started_at = COALESCE'),
      [SubscriptionStatus.PAST_DUE, TENANT_ID],
    );
    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
      }),
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

  // T17-T19 (trial-expiry-suspends-immediately behavior) were removed along
  // with checkExpiredTrials() — trial expiry now triggers a charge attempt
  // (NGN) or is handled natively by Stripe, not an immediate suspend. See
  // trial-billing.cron.spec.ts for the new cron's equivalent coverage.

  // ── T20/T21: signup_trial_verification charge.success captures auth code,
  //              refunds, and calls SignupService.completeSignup ───────────

  it('T20 — signup_trial_verification charge.success refunds and completes the signup', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: true }),
    });

    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_verify_1',
        amount: 5000,
        authorization: { authorization_code: 'AUTH_abc123' },
        customer: { customer_code: 'CUS_signup1' },
        metadata: { type: 'signup_trial_verification' },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ signupToken: 'tok_1', planTier: 'starter' }),
    );

    await service.handlePaystackWebhook(rawBody, sig);

    const refundCall = mockFetch.mock.calls.find(([url]: [string]) =>
      url.includes('/refund'),
    ) as [string, { body: string }];
    expect(JSON.parse(refundCall[1].body)).toEqual({
      transaction: 'ref_verify_1',
    });
    expect(mockSignupService.completeSignup).toHaveBeenCalledWith({
      signupToken: 'tok_1',
      planTier: 'starter',
      paystackAuthorizationCode: 'AUTH_abc123',
      paystackCustomerId: 'CUS_signup1',
    });
    expect(mockRedis.del).toHaveBeenCalledWith(
      'billing:paystack:pending:ref_verify_1',
    );
  });

  // ── T22: refund failure does not block completeSignup ─────────────────────

  it('T22 — failed refund does not block completeSignup from being called', async () => {
    mockFetch.mockReset();
    mockFetch.mockRejectedValueOnce(new Error('refund API down'));

    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_verify_2',
        amount: 5000,
        authorization: { authorization_code: 'AUTH_xyz' },
        metadata: { type: 'signup_trial_verification' },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ signupToken: 'tok_2', planTier: 'starter' }),
    );

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockSignupService.completeSignup).toHaveBeenCalledWith(
      expect.objectContaining({ signupToken: 'tok_2' }),
    );
  });

  // ── T24: cancelTrial sets cancelAtPeriodEnd, calls Stripe only for GBP ────

  it('T24 — cancelTrial sets cancelAtPeriodEnd and updates Stripe for GBP subscriptions', async () => {
    mockSubRepo.findOne.mockResolvedValue(
      makeSubscription({
        status: SubscriptionStatus.TRIALING,
        stripeSubId: 'sub_test123',
      }),
    );

    await service.cancelTrial(TENANT_ID);

    expect(mockSubRepo.update).toHaveBeenCalledWith('sub-1', {
      cancelAtPeriodEnd: true,
    });
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      subscriptions: { update: jest.Mock };
    };
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_test123',
      { cancel_at_period_end: true },
    );
  });

  // ── T25: duplicate webhook event is a no-op ───────────────────────────────

  it('T25 — a duplicate webhook event id is skipped without reprocessing', async () => {
    mockWebhookEventQb.execute.mockResolvedValue({ raw: [] }); // already seen

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

    expect(mockTenantRepo.update).not.toHaveBeenCalled();
  });

  // ── T27: Stripe checkout.session.completed (signup_trial_start) ──────────

  it('T27 — Stripe signup_trial_start checkout completion calls SignupService.completeSignup', async () => {
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    const trialEndUnix = Math.floor(Date.now() / 1000) + 14 * 86400;
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          subscription: { id: 'sub_new123', trial_end: trialEndUnix },
          customer: 'cus_new123',
          metadata: {
            signupToken: 'tok_3',
            planTier: 'starter',
            type: 'signup_trial_start',
          },
        },
      },
    });

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockSignupService.completeSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        signupToken: 'tok_3',
        planTier: 'starter',
        stripeSubId: 'sub_new123',
        stripeCustomerId: 'cus_new123',
        trialEndsAt: new Date(trialEndUnix * 1000),
      }),
    );
  });

  // ── T28: Stripe invoice.payment_failed → past_due ─────────────────────────

  it('T28 — Stripe invoice.payment_failed marks the matching subscription past_due', async () => {
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_test123' } },
    });
    mockSubRepo.findOne.mockResolvedValue(
      makeSubscription({ stripeSubId: 'sub_test123' }),
    );

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('grace_period_started_at = COALESCE'),
      [SubscriptionStatus.PAST_DUE, TENANT_ID],
    );
  });

  // ── T29: Stripe invoice.payment_succeeded → activateSubscription ─────────

  it('T29 — Stripe invoice.payment_succeeded activates the matching subscription', async () => {
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: { object: { subscription: { id: 'sub_test123' } } },
    });
    mockSubRepo.findOne.mockResolvedValue(
      makeSubscription({ stripeSubId: 'sub_test123', currency: 'GBP' }),
    );

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      }),
    );
  });

  // ── T30: Stripe subscription.deleted (cancelAtPeriodEnd) → cancelled ─────

  it('T30 — Stripe customer.subscription.deleted cancels (not suspends) when cancelAtPeriodEnd was set', async () => {
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
    mockSubRepo.findOne.mockResolvedValue(
      makeSubscription({ cancelAtPeriodEnd: true }),
    );

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.CANCELLED,
      }),
    );
  });

  // ── T31/T32: signup_trial_verification guard branches ─────────────────────

  it('T31 — signup_trial_verification charge.success with a mismatched amount does not complete the signup', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_verify_bad_amount',
        amount: 999999, // not ₦50
        authorization: { authorization_code: 'AUTH_should_not_use' },
        metadata: { type: 'signup_trial_verification' },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ signupToken: 'tok_bad', planTier: 'starter' }),
    );

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockSignupService.completeSignup).not.toHaveBeenCalled();
  });

  it('T32 — signup_trial_verification charge.success with no authorization code does not complete the signup', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_verify_no_auth',
        amount: 5000,
        metadata: { type: 'signup_trial_verification' },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ signupToken: 'tok_no_auth', planTier: 'starter' }),
    );

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockSignupService.completeSignup).not.toHaveBeenCalled();
  });

  // ── T33/T34: attemptPaystackCharge ─────────────────────────────────────────

  it('T33 — attemptPaystackCharge increments the attempt counter and stores a pending reference on success', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({ status: true, data: { reference: 'ref_conv_1' } }),
    });

    await service.attemptPaystackCharge({
      tenantId: TENANT_ID,
      subscriptionId: 'sub-1',
      planId: 'starter_ngn',
      authorizationCode: 'AUTH_abc',
      amount: 8000,
      ownerEmail: 'owner@freshmart.ng',
    });

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'trial_charge_attempts = trial_charge_attempts + 1',
      ),
      ['sub-1'],
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'billing:paystack:pending:ref_conv_1',
      expect.stringContaining(TENANT_ID),
      'EX',
      3600,
    );
  });

  it('T34 — attemptPaystackCharge marks the tenant past_due when the charge request fails', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: false }),
    });

    await service.attemptPaystackCharge({
      tenantId: TENANT_ID,
      subscriptionId: 'sub-1',
      planId: 'starter_ngn',
      authorizationCode: 'AUTH_abc',
      amount: 8000,
      ownerEmail: 'owner@freshmart.ng',
    });

    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('grace_period_started_at = COALESCE'),
      [SubscriptionStatus.PAST_DUE, TENANT_ID],
    );
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  // ── T35: cancelTenant ──────────────────────────────────────────────────────

  it('T35 — cancelTenant sets status to cancelled and invalidates the cache', async () => {
    await service.cancelTenant(TENANT_ID);

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { status: SubscriptionStatus.CANCELLED },
    );
    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.CANCELLED,
      }),
    );
    expect(mockRedis.del).toHaveBeenCalledWith(`tenant:${TENANT_ID}`);
  });

  // ── T36: getPlans ──────────────────────────────────────────────────────────

  it("T36 — getPlans returns NGN plans with the tenant's current tier flagged isCurrent", async () => {
    mockTenantRepo.findOne.mockResolvedValue(
      makeTenant({ currency: 'NGN', planTier: PlanTier.GROWTH }),
    );

    const result = await service.getPlans(TENANT_ID);

    expect(result.currency).toBe('NGN');
    expect(result.plans).toHaveLength(3);
    const growth = result.plans.find((p) => p.planTier === 'growth');
    const starter = result.plans.find((p) => p.planTier === 'starter');
    expect(growth?.isCurrent).toBe(true);
    expect(starter?.isCurrent).toBe(false);
    expect(growth?.amountDisplay).toBe('₦20,000');
  });

  it('T37 — getPlans returns GBP plans for a GBP tenant', async () => {
    mockTenantRepo.findOne.mockResolvedValue(
      makeTenant({ currency: 'GBP', planTier: PlanTier.STARTER }),
    );

    const result = await service.getPlans(TENANT_ID);

    expect(result.currency).toBe('GBP');
    result.plans.forEach((p) =>
      expect(p.amountDisplay.startsWith('£')).toBe(true),
    );
  });

  it('T38 — getPlans defaults to NGN/starter when the tenant cannot be found', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    const result = await service.getPlans(TENANT_ID);

    expect(result.currency).toBe('NGN');
    expect(result.plans.find((p) => p.planTier === 'starter')?.isCurrent).toBe(
      true,
    );
  });

  // ── T39-T44: changePlan ────────────────────────────────────────────────────

  describe('changePlan', () => {
    it('T39 — downgrade schedules pending* fields immediately, no payment required', async () => {
      mockTenantRepo.findOne.mockResolvedValue(
        makeTenant({
          currency: 'NGN',
          planTier: PlanTier.GROWTH,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        }),
      );
      const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      mockSubRepo.findOne.mockResolvedValue(
        makeSubscription({
          planTier: PlanTier.GROWTH,
          amount: 20000,
          currentPeriodEnd: periodEnd,
        }),
      );

      const result = await service.changePlan(TENANT_ID, 'starter', OWNER_ID);

      expect(mockSubRepo.update).toHaveBeenCalledWith('sub-1', {
        pendingPlanTier: PlanTier.STARTER,
        pendingPlanEffectiveAt: periodEnd,
        pendingPlanReference: null,
      });
      expect(result.requiresPayment).toBe(false);
      expect(result.message).toContain('Downgrade');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('T40 — active NGN tenant upgrade: initiates a Paystack checkout, writes nothing yet', async () => {
      mockTenantRepo.findOne.mockResolvedValue(
        makeTenant({
          currency: 'NGN',
          planTier: PlanTier.STARTER,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        }),
      );
      mockSubRepo.findOne.mockResolvedValue(
        makeSubscription({ planTier: PlanTier.STARTER, amount: 8000 }),
      );

      const result = await service.changePlan(TENANT_ID, 'growth', OWNER_ID);

      expect(result.requiresPayment).toBe(true);
      expect(result.authorizationUrl).toContain('paystack.com');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'billing:planchange:pending:ref_test123',
        JSON.stringify({ tenantId: TENANT_ID, planTier: 'growth' }),
        'EX',
        3600,
      );
      expect(mockSubRepo.update).not.toHaveBeenCalled();
    });

    it('T41 — active GBP tenant upgrade: initiates a one-time Stripe Checkout, writes nothing yet', async () => {
      mockTenantRepo.findOne.mockResolvedValue(
        makeTenant({
          currency: 'GBP',
          planTier: PlanTier.STARTER,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_existing',
        }),
      );
      mockSubRepo.findOne.mockResolvedValue(
        makeSubscription({
          currency: 'GBP',
          planTier: PlanTier.STARTER,
          stripeSubId: 'sub_live123',
        }),
      );

      const result = await service.changePlan(TENANT_ID, 'growth', OWNER_ID);

      const Stripe = jest.requireMock<jest.Mock>('stripe');
      const stripeMock = Stripe.mock.results[0].value as {
        checkout: {
          sessions: {
            create: jest.Mock<
              Promise<{ url: string }>,
              [Record<string, unknown>]
            >;
          };
        };
      };
      const sessionArgs = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(sessionArgs.mode).toBe('payment');
      expect(sessionArgs.metadata).toEqual({
        tenantId: TENANT_ID,
        planTier: 'growth',
        type: 'plan_change_upgrade',
      });
      expect(result.requiresPayment).toBe(true);
      expect(result.checkoutUrl).toContain('stripe.com');
      expect(mockSubRepo.update).not.toHaveBeenCalled();
    });

    it('T42 — throws 400 when the requested plan equals the current plan', async () => {
      mockTenantRepo.findOne.mockResolvedValue(
        makeTenant({ planTier: PlanTier.STARTER }),
      );

      await expect(
        service.changePlan(TENANT_ID, 'starter', OWNER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('T43 — throws 400 when the tenant is suspended/cancelled/past_due', async () => {
      mockTenantRepo.findOne.mockResolvedValue(
        makeTenant({
          planTier: PlanTier.STARTER,
          subscriptionStatus: SubscriptionStatus.SUSPENDED,
        }),
      );

      await expect(
        service.changePlan(TENANT_ID, 'growth', OWNER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('T44 — throws 400 when a plan change is already pending', async () => {
      mockTenantRepo.findOne.mockResolvedValue(
        makeTenant({
          currency: 'NGN',
          planTier: PlanTier.GROWTH,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        }),
      );
      mockSubRepo.findOne.mockResolvedValue(
        makeSubscription({
          planTier: PlanTier.GROWTH,
          pendingPlanTier: PlanTier.CONNECT,
        }),
      );

      await expect(
        service.changePlan(TENANT_ID, 'starter', OWNER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── T45: getStatus usage fields ────────────────────────────────────────────

  it('T45 — getStatus includes marketing and bot-reply usage for the current month', async () => {
    mockWalletService.getMonthlySpend.mockResolvedValue({
      totalSpend: 4600,
      messageCount: 40,
    });
    mockDataSource.query.mockResolvedValue([{ count: '7' }]);
    mockSubRepo.findOne.mockResolvedValue(makeSubscription());

    const status = await service.getStatus(TENANT_ID);

    expect(status.marketingMessagesThisMonth).toBe(40);
    expect(status.marketingSpendThisMonth).toBe(4600);
    expect(status.botRepliesThisMonth).toBe(7);
  });

  // ── T46-T47: missing subscriptions row (manually seeded tenants) ──────────

  it('T46 — getStatus falls back to the plan config amount when no subscriptions row exists', async () => {
    mockTenantRepo.findOne.mockResolvedValue(
      makeTenant({ currency: 'NGN', planTier: PlanTier.GROWTH }),
    );
    mockSubRepo.findOne.mockResolvedValue(null);

    const status = await service.getStatus(TENANT_ID);

    expect(status.amount).toBe(20000);
    expect(status.utilityIncluded).toBe(800);
    expect(status.marketingRate).toBe(115);
  });

  it('T47 — changePlan creates a missing subscriptions row instead of throwing', async () => {
    mockTenantRepo.findOne.mockResolvedValue(
      makeTenant({
        currency: 'NGN',
        planTier: PlanTier.GROWTH,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      }),
    );
    mockSubRepo.findOne.mockResolvedValue(null);
    const healedPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    mockSubRepo.save.mockResolvedValue(
      makeSubscription({
        id: 'sub-healed',
        planTier: PlanTier.GROWTH,
        currentPeriodEnd: healedPeriodEnd,
      }),
    );

    const result = await service.changePlan(TENANT_ID, 'starter', OWNER_ID);

    expect(mockSubRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        planTier: PlanTier.GROWTH,
        currency: 'NGN',
        status: SubscriptionStatus.ACTIVE,
      }),
    );
    expect(mockSubRepo.update).toHaveBeenCalledWith('sub-healed', {
      pendingPlanTier: PlanTier.STARTER,
      pendingPlanEffectiveAt: healedPeriodEnd,
      pendingPlanReference: null,
    });
    expect(result.requiresPayment).toBe(false);
  });

  it("T47b — healed subscription falls back to the tenant's trialEndsAt when still trialing", async () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    mockTenantRepo.findOne.mockResolvedValue(
      makeTenant({
        currency: 'NGN',
        planTier: PlanTier.GROWTH,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        trialEndsAt,
      }),
    );
    mockSubRepo.findOne.mockResolvedValue(null);
    mockSubRepo.save.mockResolvedValue(
      makeSubscription({ id: 'sub-healed', planTier: PlanTier.GROWTH }),
    );

    await service.changePlan(TENANT_ID, 'starter', OWNER_ID);

    expect(mockSubRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPeriodEnd: trialEndsAt,
      }),
    );
  });

  // ── T48-T50: plan_change_upgrade webhooks ──────────────────────────────────

  it('T48 — Paystack plan_change_upgrade charge.success schedules the pending plan change', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_planchange1',
        amount: 2000000,
        metadata: {
          type: 'plan_change_upgrade',
          tenantId: TENANT_ID,
          planTier: 'growth',
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ tenantId: TENANT_ID, planTier: 'growth' }),
    );
    mockTenantRepo.findOne.mockResolvedValue(makeTenant({ currency: 'NGN' }));
    mockSubRepo.findOne.mockResolvedValue(makeSubscription());

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({ pendingPlanTier: 'growth' }),
    );
    expect(mockRedis.del).toHaveBeenCalledWith(
      'billing:planchange:pending:ref_planchange1',
    );
  });

  it('T49 — Paystack plan_change_upgrade charge.success with a mismatched amount does not schedule', async () => {
    const body = {
      event: 'charge.success',
      data: {
        reference: 'ref_planchange2',
        amount: 100, // ₦1, nowhere near the growth plan's ₦20,000
        metadata: {
          type: 'plan_change_upgrade',
          tenantId: TENANT_ID,
          planTier: 'growth',
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const sig = crypto
      .createHmac('sha512', 'sk_live_paystack')
      .update(rawBody)
      .digest('hex');

    mockRedis.get.mockResolvedValue(
      JSON.stringify({ tenantId: TENANT_ID, planTier: 'growth' }),
    );
    mockTenantRepo.findOne.mockResolvedValue(makeTenant({ currency: 'NGN' }));

    await service.handlePaystackWebhook(rawBody, sig);

    expect(mockSubRepo.update).not.toHaveBeenCalled();
  });

  it('T50 — Stripe plan_change_upgrade checkout.session.completed schedules the pending plan change', async () => {
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      webhooks: { constructEvent: jest.Mock };
    };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_planchange',
          mode: 'payment',
          metadata: {
            type: 'plan_change_upgrade',
            tenantId: TENANT_ID,
            planTier: 'growth',
          },
        },
      },
    });
    mockSubRepo.findOne.mockResolvedValue(makeSubscription());

    await service.handleStripeWebhook(Buffer.from('{}'), 'stripe-sig');

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({
        pendingPlanTier: 'growth',
        pendingPlanReference: 'cs_test_planchange',
      }),
    );
  });

  // ── T51-T52: applyPendingPlanChange ────────────────────────────────────────

  it('T51 — applyPendingPlanChange updates plan fields and clears pending* for an NGN tenant', async () => {
    mockSubRepo.findOne.mockResolvedValue(makeSubscription());

    await service.applyPendingPlanChange({
      subscriptionId: 'sub-1',
      tenantId: TENANT_ID,
      pendingPlanTier: 'growth',
      currency: 'NGN',
      stripeSubId: null,
    });

    expect(mockSubRepo.update).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({
        planTier: PlanTier.GROWTH,
        amount: 20000,
        utilityIncluded: 800,
        pendingPlanTier: null,
        pendingPlanEffectiveAt: null,
        pendingPlanReference: null,
      }),
    );
    expect(mockTenantRepo.update).toHaveBeenCalledWith(TENANT_ID, {
      planTier: PlanTier.GROWTH,
    });
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      subscriptions: { update: jest.Mock };
    };
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });

  it('T52 — applyPendingPlanChange swaps the Stripe price with no proration for a GBP tenant', async () => {
    await service.applyPendingPlanChange({
      subscriptionId: 'sub-1',
      tenantId: TENANT_ID,
      pendingPlanTier: 'growth',
      currency: 'GBP',
      stripeSubId: 'sub_live123',
    });

    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      subscriptions: { retrieve: jest.Mock; update: jest.Mock };
    };
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith(
      'sub_live123',
    );
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_live123',
      expect.objectContaining({
        items: [{ id: 'si_test123', price: 'price_test_growth_gbp' }],
        proration_behavior: 'none',
      }),
    );
  });
});
