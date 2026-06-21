/**
 * Signup Integration Tests
 *
 * Exercises the full no-tenant-until-payment signup flow against real
 * Postgres + Redis: register -> verify-email -> select plan -> start-trial
 * (Paystack) -> simulated charge.success webhook -> status poll issues
 * tokens. Also verifies the idempotent-claim behavior that prevents two
 * successful charges for the same signup from creating two tenants.
 *
 * Paystack is mocked via global.fetch; BspService is mocked (no real Gupshup).
 */
import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { BspService } from '../../src/modules/whatsapp/bsp.service';
import { MailerService } from '../../src/common/mailer/mailer.service';
import { SignupService } from '../../src/modules/signup/signup.service';

function extractCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const raw = setCookie?.find((c) => c.startsWith('signup_session='));
  if (!raw) throw new Error('signup_session cookie not set');
  return raw.split(';')[0];
}

describe('Signup Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let configService: ConfigService;
  let signupService: SignupService;
  let mockBspService: { sendMessage: jest.Mock };
  let mockMailerService: {
    sendWelcomeVerification: jest.Mock;
    sendVerificationCode: jest.Mock;
  };
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;
  const createdTenantIds: string[] = [];

  // Capture the plain verification code instead of relying on a real (or
  // placeholder) Resend API key — this test must never send a real email.
  function lastSentCode(): string {
    const calls = mockMailerService.sendWelcomeVerification.mock.calls as Array<
      [{ code: string }]
    >;
    return calls[calls.length - 1][0].code;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    mockBspService = {
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'mock-bsp-id' }),
    };
    mockMailerService = {
      sendWelcomeVerification: jest.fn().mockResolvedValue(undefined),
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BspService)
      .useValue(mockBspService)
      .overrideProvider(MailerService)
      .useValue(mockMailerService)
      .compile();

    // rawBody: true is required for Paystack webhook HMAC verification
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    dataSource = app.get<DataSource>(DataSource);
    configService = app.get<ConfigService>(ConfigService);
    signupService = app.get<SignupService>(SignupService);

    await dataSource.runMigrations();
  }, 90_000);

  afterAll(async () => {
    await clearCreatedTenants();
    await app.close();
  }, 30_000);

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function clearCreatedTenants(): Promise<void> {
    if (createdTenantIds.length === 0) return;
    const tables = [
      'product_categories',
      'subscriptions',
      'users',
      'tier_configs',
    ];
    for (const table of tables) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
        [createdTenantIds],
      );
    }
    await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      createdTenantIds,
    ]);
    createdTenantIds.length = 0;
  }

  function paystackSignature(body: string): string {
    const paystackKey = configService.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    return crypto.createHmac('sha512', paystackKey).update(body).digest('hex');
  }

  // ── T1: full happy path ────────────────────────────────────────────────────

  it('T1 — register -> verify -> start-trial -> webhook -> status issues tokens, creates exactly one tenant', async () => {
    const email = `signup-it-${Date.now()}@freshmart.ng`;
    const http = request(app.getHttpServer() as Parameters<typeof request>[0]);

    // Step 1 — register
    const registerRes = await http.post('/api/v1/signup/register').send({
      businessName: 'FreshMart Signup IT',
      fullName: 'Adaeze Okonkwo',
      email,
      password: 'SecurePass123!',
      country: 'NG',
    });
    expect(registerRes.status).toBe(201);
    type RegisterBody = { signupToken: string; email: string };
    const { signupToken } = registerRes.body as RegisterBody;
    expect(signupToken).toBeDefined();
    expect(mockMailerService.sendWelcomeVerification).toHaveBeenCalled();
    const cookie = extractCookie(registerRes);

    // No tenant/user exists yet for this email — the whole point of the redesign
    const preUser = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    expect(preUser.length).toBe(0);

    // Step 2 — verify email
    const verifyRes = await http
      .post('/api/v1/signup/verify-email')
      .set('Cookie', cookie)
      .send({ signupToken, code: lastSentCode() });
    expect(verifyRes.status).toBe(200);
    expect((verifyRes.body as { verified: boolean }).verified).toBe(true);

    // Step 3 — plans
    const plansRes = await http
      .get(`/api/v1/signup/${signupToken}/plans`)
      .set('Cookie', cookie);
    expect(plansRes.status).toBe(200);
    expect((plansRes.body as { currency: string }).currency).toBe('NGN');

    // Step 4 — start-trial (NGN -> Paystack init)
    fetchSpy.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          data: {
            authorization_url: 'https://paystack.com/pay/signup-it-1',
            reference: 'ref_signup_it_1',
          },
        }),
    } as Response);

    const startTrialRes = await http
      .post(`/api/v1/signup/${signupToken}/start-trial`)
      .set('Cookie', cookie)
      .send({ planTier: 'starter' });
    expect(startTrialRes.status).toBe(200);
    expect(
      (startTrialRes.body as { authorizationUrl: string }).authorizationUrl,
    ).toContain('paystack.com');

    // Step 5 — simulate the ₦50 verification charge.success webhook
    fetchSpy.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: true }),
    } as Response); // refund call

    const webhookBody = JSON.stringify({
      event: 'charge.success',
      data: {
        id: Date.now(),
        reference: 'ref_signup_it_1',
        amount: 5000,
        authorization: { authorization_code: 'AUTH_signup_it_1' },
        customer: { customer_code: 'CUS_signup_it_1' },
        metadata: { type: 'signup_trial_verification' },
      },
    });
    const webhookRes = await http
      .post('/api/v1/billing/webhook/paystack')
      .set('x-paystack-signature', paystackSignature(webhookBody))
      .set('Content-Type', 'application/json')
      .send(webhookBody);
    expect(webhookRes.status).toBe(200);

    // Step 6 — status poll issues real tokens
    const statusRes = await http
      .get(`/api/v1/signup/${signupToken}/status`)
      .set('Cookie', cookie);
    expect(statusRes.status).toBe(200);
    type StatusBody = {
      status: string;
      accessToken?: string;
      refreshToken?: string;
      tenant?: { id: string; planTier: string };
    };
    const statusBody = statusRes.body as StatusBody;
    expect(statusBody.status).toBe('completed');
    expect(statusBody.accessToken).toBeDefined();
    expect(statusBody.refreshToken).toBeDefined();
    expect(statusBody.tenant?.planTier).toBe('starter');
    const tenantId = statusBody.tenant!.id;
    createdTenantIds.push(tenantId);

    // Exactly one tenant/user/subscription row exists, trialing, 14-day window
    const tenantRows = await dataSource.query<
      Array<{ subscription_status: string; trial_ends_at: string }>
    >('SELECT subscription_status, trial_ends_at FROM tenants WHERE id = $1', [
      tenantId,
    ]);
    expect(tenantRows.length).toBe(1);
    expect(tenantRows[0].subscription_status).toBe('trialing');
    const daysOut =
      (new Date(tenantRows[0].trial_ends_at).getTime() - Date.now()) /
      (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(13);
    expect(daysOut).toBeLessThan(15);

    const subRows = await dataSource.query<
      Array<{ status: string; paystack_authorization_code: string }>
    >(
      'SELECT status, paystack_authorization_code FROM subscriptions WHERE tenant_id = $1',
      [tenantId],
    );
    expect(subRows.length).toBe(1);
    expect(subRows[0].status).toBe('trialing');
    expect(subRows[0].paystack_authorization_code).toBe('AUTH_signup_it_1');

    const userRows = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    expect(userRows.length).toBe(1);

    // The status poll's handoff key is single-use — replaying it must not
    // re-issue tokens for an already-consumed signup.
    const replayRes = await http
      .get(`/api/v1/signup/${signupToken}/status`)
      .set('Cookie', cookie);
    expect((replayRes.body as { status: string }).status).toBe('expired');
  }, 30_000);

  // ── T2: idempotent claim — two successful charges, one tenant ────────────

  it('T2 — completeSignup is idempotent: calling it twice for the same token creates only one tenant', async () => {
    const email = `signup-it-idempotent-${Date.now()}@freshmart.ng`;
    const http = request(app.getHttpServer() as Parameters<typeof request>[0]);

    const registerRes = await http.post('/api/v1/signup/register').send({
      businessName: 'FreshMart Idempotent IT',
      fullName: 'Chidi Okeke',
      email,
      password: 'SecurePass123!',
      country: 'NG',
    });
    const { signupToken } = registerRes.body as { signupToken: string };
    const cookie = extractCookie(registerRes);

    await http
      .post('/api/v1/signup/verify-email')
      .set('Cookie', cookie)
      .send({ signupToken, code: lastSentCode() });

    await Promise.all([
      signupService.completeSignup({
        signupToken,
        planTier: 'starter',
        paystackAuthorizationCode: 'AUTH_first',
      }),
      signupService.completeSignup({
        signupToken,
        planTier: 'starter',
        paystackAuthorizationCode: 'AUTH_second',
      }),
    ]);

    const userRows = await dataSource.query<Array<{ tenant_id: string }>>(
      'SELECT tenant_id FROM users WHERE email = $1',
      [email],
    );
    expect(userRows.length).toBe(1);
    createdTenantIds.push(userRows[0].tenant_id);

    const tenantRows = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM tenants WHERE id = $1',
      [userRows[0].tenant_id],
    );
    expect(tenantRows.length).toBe(1);
  }, 30_000);

  // ── T3: unverified email refuses account creation ─────────────────────────

  it('T3 — completeSignup refuses to create an account if the email was never verified', async () => {
    const email = `signup-it-unverified-${Date.now()}@freshmart.ng`;
    const http = request(app.getHttpServer() as Parameters<typeof request>[0]);

    const registerRes = await http.post('/api/v1/signup/register').send({
      businessName: 'FreshMart Unverified IT',
      fullName: 'Ngozi Amaka',
      email,
      password: 'SecurePass123!',
      country: 'NG',
    });
    const { signupToken } = registerRes.body as { signupToken: string };

    await signupService.completeSignup({
      signupToken,
      planTier: 'starter',
      paystackAuthorizationCode: 'AUTH_unverified',
    });

    const userRows = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    expect(userRows.length).toBe(0);
  }, 30_000);

  // ── T4: invalid plan tier is rejected, never falls back to a default ─────

  it('T4 — start-trial rejects an invalid plan tier instead of defaulting', async () => {
    const email = `signup-it-badplan-${Date.now()}@freshmart.ng`;
    const http = request(app.getHttpServer() as Parameters<typeof request>[0]);

    const registerRes = await http.post('/api/v1/signup/register').send({
      businessName: 'FreshMart BadPlan IT',
      fullName: 'Tunde Bakare',
      email,
      password: 'SecurePass123!',
      country: 'NG',
    });
    const { signupToken } = registerRes.body as { signupToken: string };
    const cookie = extractCookie(registerRes);

    await http
      .post('/api/v1/signup/verify-email')
      .set('Cookie', cookie)
      .send({ signupToken, code: lastSentCode() });

    const res = await http
      .post(`/api/v1/signup/${signupToken}/start-trial`)
      .set('Cookie', cookie)
      .send({ planTier: 'enterprise' });
    expect(res.status).toBe(400);
  }, 30_000);

  // ── T5: a leaked signupToken alone (no cookie) cannot be used ─────────────

  it('T5 — a request without the signup_session cookie is rejected', async () => {
    const email = `signup-it-nocookie-${Date.now()}@freshmart.ng`;
    const http = request(app.getHttpServer() as Parameters<typeof request>[0]);

    const registerRes = await http.post('/api/v1/signup/register').send({
      businessName: 'FreshMart NoCookie IT',
      fullName: 'Femi Adigun',
      email,
      password: 'SecurePass123!',
      country: 'NG',
    });
    const { signupToken } = registerRes.body as { signupToken: string };

    const res = await http
      .post('/api/v1/signup/verify-email')
      .send({ signupToken, code: lastSentCode() }); // no Cookie header
    expect(res.status).toBe(403);
  }, 30_000);
});
