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
        {
          provide: WalletService,
          useValue: {
            topupWallet: jest.fn().mockResolvedValue(10000),
            getBalance: jest.fn().mockResolvedValue(10000),
          },
        },
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
});
