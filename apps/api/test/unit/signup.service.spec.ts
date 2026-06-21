import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { SignupService } from '../../src/modules/signup/signup.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { MailerService } from '../../src/common/mailer/mailer.service';
import { User } from '../../src/modules/auth/entities/user.entity';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Country } from '../../src/modules/signup/dto/signup-register.dto';
import { UserRole } from '@pingloyal/types';

// Mock the stripe require inside signup-stripe-client
jest.mock('stripe', () => {
  const mockStripe = {
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          url: 'https://checkout.stripe.com/signup-test',
        }),
      },
    },
  };
  return jest.fn().mockReturnValue(mockStripe);
});

const mockFetch = jest.fn();
global.fetch = mockFetch;

const SIGNUP_TOKEN = 'tok_abc123';

function makePendingRecord(overrides: Record<string, unknown> = {}) {
  return {
    email: 'adebayo@freshmart.ng',
    hashedPassword: 'hashed-pw',
    businessName: 'FreshMart',
    fullName: 'Adebayo Okafor',
    country: Country.NG,
    currency: 'NGN',
    codeHash:
      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // sha256("123456")
    codeExpiry: Date.now() + 3600_000,
    emailVerified: false,
    planTier: null,
    browserSecret: 'secret-abc',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('SignupService', () => {
  let service: SignupService;
  let mockUserRepo: { findOne: jest.Mock };
  let mockRedis: {
    get: jest.Mock;
    set: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    getdel: jest.Mock;
  };
  let mockConfig: { get: jest.Mock; getOrThrow: jest.Mock };
  let mockMailer: {
    sendWelcomeVerification: jest.Mock;
    sendVerificationCode: jest.Mock;
  };
  let mockAuthService: { issueTokens: jest.Mock; buildUniqueSlug: jest.Mock };
  let mockManager: { create: jest.Mock; save: jest.Mock };
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      getdel: jest.fn().mockResolvedValue(null),
    };
    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3001';
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_stripe';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      }),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'PAYSTACK_SECRET_KEY') return 'sk_live_paystack';
        return 'test-value';
      }),
    };
    mockMailer = {
      sendWelcomeVerification: jest.fn().mockResolvedValue(undefined),
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    };
    mockAuthService = {
      issueTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at-1', refreshToken: 'rt-1' }),
      buildUniqueSlug: jest.fn().mockResolvedValue('freshmart'),
    };
    mockManager = {
      create: jest
        .fn()
        .mockImplementation((_entity: unknown, data: unknown) => data),
      save: jest
        .fn()
        .mockImplementation((_entity: unknown, data: unknown) =>
          Promise.resolve(
            Array.isArray(data)
              ? data
              : { id: 'new-id', ...(data as Record<string, unknown>) },
          ),
        ),
    };
    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (manager: typeof mockManager) => unknown) =>
          Promise.resolve(cb(mockManager)),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignupService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailerService, useValue: mockMailer },
        { provide: AuthService, useValue: mockAuthService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(SignupService);
  });

  // ── register ────────────────────────────────────────────────────────────

  it('T1 — register saves a pending record and returns a signupToken', async () => {
    const result = await service.register({
      businessName: 'FreshMart',
      fullName: 'Adebayo Okafor',
      email: 'Adebayo@FreshMart.ng',
      password: 'SecurePass123!',
      country: Country.NG,
    });

    expect(result.signupToken).toBeDefined();
    expect(result.browserSecret).toBeDefined();
    expect(result.email).toBe('adebayo@freshmart.ng');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      `signup:pending:${result.signupToken}`,
      expect.any(Number),
      expect.stringContaining('"emailVerified":false'),
    );
    expect(mockMailer.sendWelcomeVerification).toHaveBeenCalled();
  });

  it('T2 — register throws ConflictException when a verified user already exists', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({
        businessName: 'FreshMart',
        fullName: 'Adebayo Okafor',
        email: 'adebayo@freshmart.ng',
        password: 'SecurePass123!',
        country: Country.NG,
      }),
    ).rejects.toThrow(ConflictException);
  });

  // ── verifyEmail ─────────────────────────────────────────────────────────

  it('T3 — verifyEmail succeeds with the correct code and browserSecret', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(makePendingRecord()));

    const result = await service.verifyEmail(
      { signupToken: SIGNUP_TOKEN, code: '123456' },
      'secret-abc',
    );

    expect(result).toEqual({ verified: true });
    expect(mockRedis.setex).toHaveBeenCalledWith(
      `signup:pending:${SIGNUP_TOKEN}`,
      expect.any(Number),
      expect.stringContaining('"emailVerified":true'),
    );
  });

  it('T4 — verifyEmail throws BadRequestException when no pending record exists', async () => {
    mockRedis.get.mockResolvedValue(null);

    await expect(
      service.verifyEmail(
        { signupToken: SIGNUP_TOKEN, code: '123456' },
        'secret-abc',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('T5 — verifyEmail throws ForbiddenException when the browserSecret cookie does not match', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(makePendingRecord()));

    await expect(
      service.verifyEmail(
        { signupToken: SIGNUP_TOKEN, code: '123456' },
        'wrong-secret',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('T6 — verifyEmail throws BadRequestException when the code has expired', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify(makePendingRecord({ codeExpiry: Date.now() - 1000 })),
    );

    await expect(
      service.verifyEmail(
        { signupToken: SIGNUP_TOKEN, code: '123456' },
        'secret-abc',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('T7 — verifyEmail throws BadRequestException for a wrong code', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(makePendingRecord()));

    await expect(
      service.verifyEmail(
        { signupToken: SIGNUP_TOKEN, code: '000000' },
        'secret-abc',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('T8 — verifyEmail throws BadRequestException when already verified', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify(makePendingRecord({ emailVerified: true })),
    );

    await expect(
      service.verifyEmail(
        { signupToken: SIGNUP_TOKEN, code: '123456' },
        'secret-abc',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ── resendCode ──────────────────────────────────────────────────────────

  it('T9 — resendCode returns a generic message when no pending record exists', async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await service.resendCode(
      { signupToken: SIGNUP_TOKEN },
      'secret-abc',
    );

    expect(result.message).toContain('If the signup session is valid');
    expect(mockMailer.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('T10 — resendCode sends a fresh code and updates the pending record', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(makePendingRecord()));

    await service.resendCode({ signupToken: SIGNUP_TOKEN }, 'secret-abc');

    expect(mockMailer.sendVerificationCode).toHaveBeenCalled();
    expect(mockRedis.setex).toHaveBeenCalledWith(
      `signup:pending:${SIGNUP_TOKEN}`,
      expect.any(Number),
      expect.any(String),
    );
  });

  // ── getPlans ────────────────────────────────────────────────────────────

  it('T11 — getPlans throws BadRequestException when email is not verified', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(makePendingRecord()));

    await expect(service.getPlans(SIGNUP_TOKEN, 'secret-abc')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('T12 — getPlans returns only NGN plans for an NGN signup session', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify(makePendingRecord({ emailVerified: true })),
    );

    const result = await service.getPlans(SIGNUP_TOKEN, 'secret-abc');

    expect(result.currency).toBe('NGN');
    expect(result.plans.length).toBeGreaterThan(0);
    expect(
      (result.plans as Array<{ planId: string }>).every((p) =>
        p.planId.endsWith('_ngn'),
      ),
    ).toBe(true);
  });

  // ── startTrial ──────────────────────────────────────────────────────────

  it('T13 — startTrial throws BadRequestException for an invalid plan tier', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify(makePendingRecord({ emailVerified: true })),
    );

    await expect(
      service.startTrial(SIGNUP_TOKEN, 'secret-abc', 'not-a-real-plan'),
    ).rejects.toThrow(BadRequestException);
  });

  it('T14 — startTrial (NGN) initializes a ₦50 Paystack verification charge', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify(makePendingRecord({ emailVerified: true })),
    );
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: {
            authorization_url: 'https://paystack.com/pay/test',
            reference: 'ref_signup_1',
          },
        }),
    });

    const result = await service.startTrial(
      SIGNUP_TOKEN,
      'secret-abc',
      'starter',
    );

    expect(result.authorizationUrl).toContain('paystack.com');
    const initCall = mockFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(initCall[1].body) as {
      amount: number;
      metadata: { type: string; signupToken: string };
    };
    expect(body.amount).toBe(5000);
    expect(body.metadata.type).toBe('signup_trial_verification');
    expect(body.metadata.signupToken).toBe(SIGNUP_TOKEN);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'billing:paystack:pending:ref_signup_1',
      expect.stringContaining(SIGNUP_TOKEN),
      'EX',
      3600,
    );
  });

  it('T15 — startTrial (GBP) creates a Stripe Checkout session with a 14-day trial', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify(
        makePendingRecord({ emailVerified: true, currency: 'GBP' }),
      ),
    );

    const result = await service.startTrial(
      SIGNUP_TOKEN,
      'secret-abc',
      'starter',
    );

    expect(result.checkoutUrl).toContain('stripe.com');
    const Stripe = jest.requireMock<jest.Mock>('stripe');
    const stripeMock = Stripe.mock.results[0].value as {
      checkout: {
        sessions: {
          create: jest.Mock<unknown, [Record<string, unknown>]>;
        };
      };
    };
    const createCall = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(createCall.payment_method_collection).toBe('always');
    expect(createCall.subscription_data).toEqual({ trial_period_days: 14 });
    expect((createCall.metadata as { type: string }).type).toBe(
      'signup_trial_start',
    );
  });

  // ── getStatus ───────────────────────────────────────────────────────────

  it('T16 — getStatus issues tokens once the handoff key is present with a matching browserSecret', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        userId: 'user-1',
        tenantId: 'tenant-1',
        browserSecret: 'secret-abc',
      }),
    );
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'adebayo@freshmart.ng',
      fullName: 'Adebayo Okafor',
      role: UserRole.OWNER,
      tenant: {
        id: 'tenant-1',
        businessName: 'FreshMart',
        slug: 'freshmart',
        planTier: 'starter',
      },
    });

    const result = await service.getStatus(SIGNUP_TOKEN, 'secret-abc');

    expect(result.status).toBe('completed');
    expect(mockAuthService.issueTokens).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith(
      `signup:completed:${SIGNUP_TOKEN}`,
    );
  });

  it('T17 — getStatus throws ForbiddenException when the handoff browserSecret does not match', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        userId: 'user-1',
        tenantId: 'tenant-1',
        browserSecret: 'secret-abc',
      }),
    );

    await expect(
      service.getStatus(SIGNUP_TOKEN, 'wrong-secret'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('T18 — getStatus returns awaiting_verification before email verification', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null) // no completed handoff
      .mockResolvedValueOnce(JSON.stringify(makePendingRecord()));

    const result = await service.getStatus(SIGNUP_TOKEN, 'secret-abc');

    expect(result.status).toBe('awaiting_verification');
  });

  it('T19 — getStatus returns awaiting_payment after email verification', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        JSON.stringify(makePendingRecord({ emailVerified: true })),
      );

    const result = await service.getStatus(SIGNUP_TOKEN, 'secret-abc');

    expect(result.status).toBe('awaiting_payment');
  });

  it('T20 — getStatus returns expired when neither key exists', async () => {
    mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await service.getStatus(SIGNUP_TOKEN, 'secret-abc');

    expect(result.status).toBe('expired');
  });

  // ── completeSignup ──────────────────────────────────────────────────────

  it('T21 — completeSignup creates the tenant/user/subscription and writes the completion handoff', async () => {
    mockRedis.getdel.mockResolvedValue(
      JSON.stringify(makePendingRecord({ emailVerified: true })),
    );

    await service.completeSignup({
      signupToken: SIGNUP_TOKEN,
      planTier: 'starter',
      paystackAuthorizationCode: 'AUTH_abc',
    });

    expect(mockDataSource.transaction).toHaveBeenCalled();
    expect(mockManager.save).toHaveBeenCalled();
    expect(mockRedis.setex).toHaveBeenCalledWith(
      `signup:completed:${SIGNUP_TOKEN}`,
      3600,
      expect.stringContaining('secret-abc'),
    );
  });

  it('T22 — completeSignup no-ops when the pending record was already claimed', async () => {
    mockRedis.getdel.mockResolvedValue(null);

    await service.completeSignup({
      signupToken: SIGNUP_TOKEN,
      planTier: 'starter',
      paystackAuthorizationCode: 'AUTH_abc',
    });

    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('T23 — completeSignup refuses to create an account when the record was never email-verified', async () => {
    mockRedis.getdel.mockResolvedValue(
      JSON.stringify(makePendingRecord({ emailVerified: false })),
    );

    await service.completeSignup({
      signupToken: SIGNUP_TOKEN,
      planTier: 'starter',
      paystackAuthorizationCode: 'AUTH_abc',
    });

    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });
});
