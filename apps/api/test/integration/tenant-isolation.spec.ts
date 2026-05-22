/**
 * Tenant Isolation Tests
 *
 * This is the most important test file in the codebase.
 * It proves that data from one tenant can never be seen, modified, or
 * referenced by another tenant — at any layer of the stack.
 *
 * Runs against the real database. Docker services must be up before running:
 *   docker compose up -d
 *
 * Pattern for every test:
 *   1. Create Tenant A with data
 *   2. Create Tenant B (empty or different data)
 *   3. Use Tenant B's token to attempt accessing Tenant A's data
 *   4. Assert 404 or empty array — NEVER 403 (403 reveals that the record exists)
 */
import { INestApplication, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request, { type Response as SupertestResponse } from 'supertest';
import { AppModule } from '../../src/app.module';
import { Public } from '../../src/common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../src/common/decorators/skip-subscription-check.decorator';
import {
  CreateTenantResult,
  TestHelperCtx,
  bootstrapTestApp,
  clearTestData,
  createTestCustomer,
  createTestTenant,
  createTestTransaction,
} from '../helpers/test-helpers';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';

// ─── Test-only controller for triggering 500 errors ──────────────────────────
// This controller is ONLY loaded in the test module, not in production.
@Public()
@SkipSubscriptionCheck()
@Controller('_test-error')
class TestErrorController {
  @Get('throw')
  throwUnhandled(): never {
    throw new Error('Test unhandled error — controller exists only in tests');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let dataSource: DataSource;

  let tenantAResult: CreateTenantResult;
  let tenantBResult: CreateTenantResult;

  // Track ALL tenant IDs created during the suite (for cleanup)
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorController], // only used in Group 10 tests
    }).compile();

    app = moduleRef.createNestApplication();
    await bootstrapTestApp(app);

    dataSource = app.get<DataSource>(DataSource);
    const jwtService = app.get<JwtService>(JwtService);
    const configService = app.get<ConfigService>(ConfigService);

    ctx = { dataSource, jwtService, configService };

    // Ensure migrations are up-to-date
    await dataSource.runMigrations();

    // Create the two primary test tenants used across most tests
    tenantAResult = await createTestTenant(ctx, {
      businessName: 'Isolation Test Store A',
      email: 'owner@store-a-isolation.test',
    });
    tenantBResult = await createTestTenant(ctx, {
      businessName: 'Isolation Test Store B',
      email: 'owner@store-b-isolation.test',
    });

    createdTenantIds.push(tenantAResult.tenant.id, tenantBResult.tenant.id);
  }, 60000);

  afterAll(async () => {
    await clearTestData(dataSource, createdTenantIds);
    await app.close();
  }, 30000);

  // ─── GROUP 1: Auth isolation ────────────────────────────────────────────────
  describe('Group 1 — Auth isolation', () => {
    it('two tenants can register with the same email address', async () => {
      const sharedEmail = `shared-${Date.now()}@isolation.test`;

      const regA = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/api/v1/auth/register')
        .send({
          businessName: 'Same Email Store Alpha',
          fullName: 'Owner Alpha',
          email: sharedEmail,
          password: 'StrongPass123!',
          country: 'NG',
        });

      const regB = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/api/v1/auth/register')
        .send({
          businessName: 'Same Email Store Beta',
          fullName: 'Owner Beta',
          email: sharedEmail,
          password: 'StrongPass123!',
          country: 'NG',
        });

      expect(regA.status).toBe(201);
      expect(regB.status).toBe(201);

      type RegisterBody = {
        tenant: { id: string };
        user: { id: string; email: string };
      };
      const bodyA = regA.body as RegisterBody;
      const bodyB = regB.body as RegisterBody;

      // Different tenants — different tenant IDs
      expect(bodyA.tenant.id).not.toBe(bodyB.tenant.id);
      // Different users — different user IDs
      expect(bodyA.user.id).not.toBe(bodyB.user.id);
      // Both have the same email but different tenant scopes
      expect(bodyA.user.email).toBe(sharedEmail);
      expect(bodyB.user.email).toBe(sharedEmail);

      // Track for cleanup
      createdTenantIds.push(bodyA.tenant.id, bodyB.tenant.id);
    });

    it("Tenant B's JWT tenantId is B's tenant — cannot masquerade as Tenant A", () => {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const payloadA = ctx.jwtService.decode(tenantAResult.token);
      const payloadB = ctx.jwtService.decode(tenantBResult.token);

      expect(payloadA.tenantId).toBe(tenantAResult.tenant.id);
      expect(payloadB.tenantId).toBe(tenantBResult.tenant.id);
      // Crucially — they are different
      expect(payloadA.tenantId).not.toBe(payloadB.tenantId);
      // And the user subjects are also different
      expect(payloadA.sub).toBe(tenantAResult.user.id);
      expect(payloadB.sub).toBe(tenantBResult.user.id);
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    });
  });

  // ─── GROUP 2: Customer isolation ───────────────────────────────────────────
  describe('Group 2 — Customer isolation', () => {
    it.todo(
      'GET /customers returns empty array for Tenant B when all customers belong to Tenant A',
    );

    it.todo(
      'GET /customers/:id returns 404 when Tenant B tries to access a Tenant A customer by UUID',
    );

    it.todo(
      'GET /customers/lookup?phone=X returns 404 when phone belongs to Tenant A but request uses Tenant B token',
    );
  });

  // ─── GROUP 3: Transaction isolation ────────────────────────────────────────
  describe('Group 3 — Transaction isolation', () => {
    it.todo(
      'POST /transactions returns 404 when Tenant B tries to log a transaction against a Tenant A customer',
    );

    it.todo(
      'GET /transactions returns empty array for Tenant B when all transactions belong to Tenant A',
    );
  });

  // ─── GROUP 4: Campaign isolation ───────────────────────────────────────────
  describe('Group 4 — Campaign isolation', () => {
    it.todo(
      'GET /campaigns returns empty array for Tenant B when all campaigns belong to Tenant A',
    );

    it.todo(
      'GET /campaigns/:id returns 404 when Tenant B tries to access a Tenant A campaign by UUID',
    );

    it.todo(
      'POST /campaigns/:id/send returns 404 when Tenant B tries to send a Tenant A campaign',
    );
  });

  // ─── GROUP 5: Settings isolation ───────────────────────────────────────────
  describe('Group 5 — Settings isolation', () => {
    it.todo(
      'PATCH /tenants/settings updates Tenant B settings only — Tenant A lapsedDays unchanged',
    );

    it.todo(
      'GET /tenants/me returns the correct tenant for each token (A sees A, B sees B)',
    );
  });

  // ─── GROUP 6: Dashboard isolation ──────────────────────────────────────────
  describe('Group 6 — Dashboard isolation', () => {
    it.todo(
      'GET /dashboard/summary totalCustomers counts only Tenant A customers when using Tenant A token',
    );

    it.todo(
      'GET /dashboard/top-spenders results contain only Tenant A customers',
    );
  });

  // ─── GROUP 7: Integration connector isolation ───────────────────────────────
  describe('Group 7 — Integration connector isolation', () => {
    it.todo(
      'GET /integrations returns 404 for Tenant B when only Tenant A has an integration configured',
    );
  });

  // ─── GROUP 8: Wallet isolation ──────────────────────────────────────────────
  describe('Group 8 — Wallet isolation', () => {
    it.todo(
      'GET /billing/wallet/balance returns each tenant only their own balance (A=50000, B=5000)',
    );

    it.todo(
      'GET /billing/wallet/transactions returns empty array for Tenant B when only Tenant A has wallet history',
    );
  });

  // ─── GROUP 9: Report isolation ──────────────────────────────────────────────
  describe('Group 9 — Report isolation', () => {
    it.todo(
      'GET /reports/summary returns only Tenant A snapshot data when using Tenant A token',
    );
  });

  // ─── GROUP 10: Exception filter ─────────────────────────────────────────────
  describe('Group 10 — Exception filter', () => {
    type ErrorBody = {
      statusCode: number;
      message: string;
      error: string;
      timestamp: string;
      path: string;
      requestId: string;
      stack?: string;
    };

    it('unhandled 500 error returns consistent JSON shape', async () => {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).get('/api/v1/_test-error/throw');
      const body = response.body as ErrorBody;

      expect(response.status).toBe(500);
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(body).toMatchObject({
        statusCode: 500,
        message: expect.any(String),
        error: expect.any(String),
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        path: expect.any(String),
        requestId: expect.any(String),
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
      expect(body.path).toBe('/api/v1/_test-error/throw');
      expect(body.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('stack trace is NOT included in production response body', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      let response: SupertestResponse;
      try {
        response = await request(
          app.getHttpServer() as Parameters<typeof request>[0],
        ).get('/api/v1/_test-error/throw');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }

      const body = response!.body as ErrorBody;
      expect(response!.status).toBe(500);
      expect(body.stack).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('at Object.');
      expect(JSON.stringify(body)).not.toContain('at TestErrorController');
      expect(body.message).toBe('Internal server error');
    });

    it('stack trace IS included in development response body', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      let response: SupertestResponse;
      try {
        response = await request(
          app.getHttpServer() as Parameters<typeof request>[0],
        ).get('/api/v1/_test-error/throw');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }

      const body = response!.body as ErrorBody;
      expect(response!.status).toBe(500);
      expect(typeof body.stack).toBe('string');
      expect(body.stack).toContain('Error: Test unhandled error');
    });
  });

  // ─── Cross-cutting: verify isolation helpers work correctly ─────────────────
  describe('Helper integrity checks', () => {
    it('createTestCustomer assigns the correct tenantId', async () => {
      const customer = await createTestCustomer(ctx, tenantAResult.tenant.id, {
        fullName: 'Helper Integrity Check',
      });

      expect(customer.tenantId).toBe(tenantAResult.tenant.id);
      expect(customer.waOptedIn).toBe(true);

      // Cleanup — customer belongs to tenantA which is cleared in afterAll
    });

    it('createTestTransaction records the correct tenant and customer', async () => {
      const customer = await createTestCustomer(ctx, tenantBResult.tenant.id);
      const tx = await createTestTransaction(
        ctx,
        tenantBResult.tenant.id,
        customer.id,
        9999,
      );

      expect(tx.tenantId).toBe(tenantBResult.tenant.id);
      expect(tx.amount).toBeCloseTo(9999);
    });

    it('clearTestData removes data only for the specified tenant', async () => {
      // Create a throwaway tenant
      const throwaway = await createTestTenant(ctx, {
        businessName: 'Throwaway Tenant',
      });

      // Verify it exists
      const tenantsRepo = dataSource.getRepository(Tenant);
      const found = await tenantsRepo.findOne({
        where: { id: throwaway.tenant.id },
      });
      expect(found).toBeTruthy();

      // Clear just the throwaway
      await clearTestData(dataSource, [throwaway.tenant.id]);

      // Verify it's gone
      const gone = await tenantsRepo.findOne({
        where: { id: throwaway.tenant.id },
      });
      expect(gone).toBeNull();

      // Verify Tenant A is untouched
      const aStillExists = await tenantsRepo.findOne({
        where: { id: tenantAResult.tenant.id },
      });
      expect(aStillExists).toBeTruthy();
    });
  });
});
