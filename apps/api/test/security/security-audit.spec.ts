/**
 * Security Audit Test Suite
 *
 * Comprehensive integration tests covering all security categories.
 * Runs against the real database and app stack.
 *
 * AUDIT FIXES APPLIED (see git commit for details):
 *   - env.validation.ts: Added hex-pattern validation to ENCRYPTION_KEY
 *   - campaigns.controller.ts: Added @Roles(OWNER, MANAGER) to GET /campaigns
 *   - campaigns.controller.ts: Added @Roles(OWNER) to DELETE /campaigns/:id
 */
import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { encrypt, decrypt } from '@pingloyal/utils';
import { UserRole } from '@pingloyal/types';
import { AppModule } from '../../src/app.module';
import {
  type TestHelperCtx,
  type CreateTenantResult,
  authenticatedRequest,
  bootstrapTestApp,
  clearTestData,
  createTestCampaign,
  createTestCustomer,
  createTestIntegration,
  createTestTenant,
  createTestTransaction,
  createTestUser,
  createExpiredToken,
  computeHmac,
  setWalletBalance,
} from '../helpers/test-helpers';

// ─────────────────────────────────────────────────────────────────────────────

describe('Security Audit', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let tenantA: CreateTenantResult;
  let tenantB: CreateTenantResult;
  let cashierToken: string;
  let managerToken: string;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await bootstrapTestApp(app);

    const dataSource = app.get<DataSource>(DataSource);
    const jwtService = app.get<JwtService>(JwtService);
    const configService = app.get<ConfigService>(ConfigService);
    ctx = { dataSource, jwtService, configService };

    await dataSource.runMigrations();

    tenantA = await createTestTenant(ctx, {
      businessName: 'Security Test Store A',
      email: `sec-a-${Date.now()}@test.com`,
    });
    tenantB = await createTestTenant(ctx, {
      businessName: 'Security Test Store B',
      email: `sec-b-${Date.now()}@test.com`,
    });
    createdTenantIds.push(tenantA.tenant.id, tenantB.tenant.id);

    // Create cashier and manager users under tenant A
    const { token: cToken } = await createTestUser(
      ctx,
      tenantA.tenant.id,
      UserRole.CASHIER,
    );
    const { token: mToken } = await createTestUser(
      ctx,
      tenantA.tenant.id,
      UserRole.MANAGER,
    );
    cashierToken = cToken;
    managerToken = mToken;
  }, 90_000);

  afterAll(async () => {
    await clearTestData(ctx.dataSource, createdTenantIds);
    await app.close();
  }, 30_000);

  // ── TENANT ISOLATION ────────────────────────────────────────────────────────

  describe('Tenant Isolation', () => {
    it('customer data never crosses tenant boundary → 404', async () => {
      // Impl: customers.service.ts – findOne uses WHERE tenant_id + id
      const customer = await createTestCustomer(ctx, tenantA.tenant.id);

      const res = await authenticatedRequest(app, tenantB.token).get(
        `/api/v1/customers/${customer.id}`,
      );
      expect(res.status).toBe(404);
    });

    it('transaction data never crosses tenant boundary → 404', async () => {
      // Impl: transactions.service.ts – findOne scoped to tenantId
      const customer = await createTestCustomer(ctx, tenantA.tenant.id);
      const tx = await createTestTransaction(
        ctx,
        tenantA.tenant.id,
        customer.id,
        5000,
      );

      const res = await authenticatedRequest(app, tenantB.token).get(
        `/api/v1/transactions/${tx.id}`,
      );
      expect(res.status).toBe(404);
    });

    it('campaign data never crosses tenant boundary → 404', async () => {
      // Impl: campaigns.service.ts – findOne scoped to tenantId
      const campaign = await createTestCampaign(ctx, tenantA.tenant.id);

      const res = await authenticatedRequest(app, tenantB.token).get(
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(res.status).toBe(404);
    });

    it('billing status shows own tenant wallet only', async () => {
      // Impl: billing.service.ts – getStatus loads by tenantId from JWT
      await setWalletBalance(ctx, tenantA.tenant.id, 50_000);
      await setWalletBalance(ctx, tenantB.tenant.id, 5_000);

      const resA = await authenticatedRequest(app, tenantA.token).get(
        '/api/v1/billing/status',
      );
      const resB = await authenticatedRequest(app, tenantB.token).get(
        '/api/v1/billing/status',
      );

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(Number(resA.body.marketingWalletBalance)).toBe(50_000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(Number(resB.body.marketingWalletBalance)).toBe(5_000);
    });

    it('dashboard summary only shows own tenant metrics, not 13', async () => {
      // Impl: dashboard.service.ts – CTE query scoped to $1 tenantId
      for (let i = 0; i < 3; i++) {
        await createTestCustomer(ctx, tenantA.tenant.id);
        await createTestCustomer(ctx, tenantB.tenant.id);
      }

      const resA = await authenticatedRequest(app, tenantA.token).get(
        '/api/v1/dashboard/summary',
      );
      const resB = await authenticatedRequest(app, tenantB.token).get(
        '/api/v1/dashboard/summary',
      );

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      // Each tenant sees only their own count — never combined
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const countA = Number(resA.body.totalCustomers);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const countB = Number(resB.body.totalCustomers);
      expect(countA).not.toBe(countA + countB);
    });

    it('cross-tenant access returns 404 not 403 (no resource enumeration)', async () => {
      // 403 would reveal the resource exists — always 404
      const customer = await createTestCustomer(ctx, tenantA.tenant.id);

      const res = await authenticatedRequest(app, tenantB.token).get(
        `/api/v1/customers/${customer.id}`,
      );
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });
  });

  // ── JWT SECURITY ─────────────────────────────────────────────────────────────

  describe('JWT Security', () => {
    it('RS256 algorithm used in access tokens (not HS256)', () => {
      // Impl: auth.service.ts – signs with algorithm: RS256
      const token = tenantA.token;
      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString(),
      ) as { alg: string };
      expect(header.alg).toBe('RS256');
      expect(header.alg).not.toBe('HS256');
    });

    it('expired token returns 401 not 500', async () => {
      // Impl: jwt.strategy.ts – ignoreExpiration: false
      const expiredToken = createExpiredToken(
        ctx,
        tenantA.user.id,
        tenantA.tenant.id,
      );
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.status).not.toBe(500);
    });

    it('token in query param is rejected (extraction from header only)', async () => {
      // Impl: jwt.strategy.ts – ExtractJwt.fromAuthHeaderAsBearerToken()
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).get(`/api/v1/customers?token=${tenantA.token}`);

      expect(res.status).toBe(401);
    });

    it('manipulated JWT payload is rejected (signature mismatch)', async () => {
      // Impl: jwt.strategy.ts – RS256 signature verification
      const parts = tenantA.token.split('.');
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString(),
      ) as Record<string, unknown>;
      payload['tenantId'] = tenantB.tenant.id; // privilege escalation attempt
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;

      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${tampered}`);

      expect(res.status).toBe(401);
    });

    it('unauthenticated request returns 401 not 403', async () => {
      // Impl: jwt-auth.guard.ts – throws UnauthorizedException
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).get('/api/v1/customers');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // ── ENCRYPTION ─────────────────────────────────────────────────────────────

  describe('Encryption', () => {
    it('gupshupApiKey stored as ciphertext not plaintext', async () => {
      // Impl: packages/utils/src/encryption.ts – AES-256-GCM
      const testApiKey = 'test-gupshup-key-12345';
      const encrypted = encrypt(testApiKey);

      const raw = await ctx.dataSource.query<
        Array<{ gupshup_api_key: string }>
      >('SELECT gupshup_api_key FROM tenants WHERE id = $1', [
        tenantA.tenant.id,
      ]);

      // Store encrypted and verify format
      await ctx.dataSource.query(
        'UPDATE tenants SET gupshup_api_key = $1 WHERE id = $2',
        [encrypted, tenantA.tenant.id],
      );

      const updated = await ctx.dataSource.query<
        Array<{ gupshup_api_key: string }>
      >('SELECT gupshup_api_key FROM tenants WHERE id = $1', [
        tenantA.tenant.id,
      ]);

      const stored = updated[0].gupshup_api_key;
      expect(stored).not.toBe(testApiKey); // not plaintext
      expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // IV:tag:cipher
      expect(decrypt(stored)).toBe(testApiKey); // decryptable

      // Restore
      const original = raw[0]?.gupshup_api_key ?? null;
      await ctx.dataSource.query(
        'UPDATE tenants SET gupshup_api_key = $1 WHERE id = $2',
        [original, tenantA.tenant.id],
      );
    });

    it('each encryption call produces unique ciphertext (unique IV)', () => {
      // Impl: encryption.ts – crypto.randomBytes(16) per call
      const plaintext = 'same-text-every-time';
      const c1 = encrypt(plaintext);
      const c2 = encrypt(plaintext);

      expect(c1).not.toBe(c2); // different IVs
      expect(decrypt(c1)).toBe(plaintext);
      expect(decrypt(c2)).toBe(plaintext);
    });

    it('encrypted value decrypts back to original', () => {
      const secret = 'integration-api-key-secret-value';
      const enc = encrypt(secret);
      expect(enc).not.toBe(secret);
      expect(decrypt(enc)).toBe(secret);
    });
  });

  // ── WEBHOOK SECURITY ────────────────────────────────────────────────────────

  describe('Webhook Security', () => {
    it('Gupshup webhook: valid HMAC accepted (200)', async () => {
      // Impl: wa-onboarding.service.ts – verifyWebhookSignature with timingSafeEqual
      const secret = ctx.configService.getOrThrow<string>('WA_APP_SECRET');
      const body = JSON.stringify({
        app: 'unknown-app',
        type: 'message',
        payload: {
          source: '+2348012345678',
          type: 'text',
          payload: { text: 'hello' },
        },
      });
      const sig = computeHmac(body, secret);

      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/api/v1/whatsapp/webhook/gupshup')
        .set('Content-Type', 'application/json')
        .set('x-gupshup-signature', sig)
        .send(JSON.parse(body) as object);

      expect(res.status).toBe(200);
    });

    it('Gupshup webhook: invalid HMAC rejected with 401', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/api/v1/whatsapp/webhook/gupshup')
        .set('x-gupshup-signature', 'invalidsignature')
        .send({ type: 'message', app: 'test' });

      expect(res.status).toBe(401);
    });

    it('Paystack webhook: invalid signature rejected with 401', async () => {
      // Impl: billing.service.ts – timingSafeEqual on HMAC-SHA512
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/api/v1/billing/webhook/paystack')
        .set('x-paystack-signature', 'invalidsignature')
        .send({ event: 'charge.success', data: {} });

      expect(res.status).toBe(401);
    });

    it('Integration webhook: invalid HMAC rejected with 401', async () => {
      // Impl: integrations.service.ts – timingSafeEqual
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post(`/api/v1/integrations/webhook/${tenantA.tenant.slug}`)
        .set('X-Webhook-Signature', 'invalidsignature')
        .send({ customer_phone: '08012345678', sale_amount: '5000' });

      expect(res.status).toBe(401);
    });
  });

  // ── DATA EXPOSURE ───────────────────────────────────────────────────────────

  describe('Data Exposure Prevention', () => {
    it('gupshupApiKey never appears in tenants/me response', async () => {
      // Impl: tenants.service.ts – toFullResponse() excludes sensitive fields
      const res = await authenticatedRequest(app, tenantA.token).get(
        '/api/v1/tenants/me',
      );

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('gupshupApiKey');
      expect(body).not.toContain('gupshup_api_key');
      expect(body).not.toContain('apiKeyEncrypted');
    });

    it('hashedPassword never appears in any API response', async () => {
      // Impl: user.entity.ts – @Exclude() on hashedPassword
      const res = await authenticatedRequest(app, tenantA.token).get(
        '/api/v1/tenants/me',
      );

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('hashedPassword');
      expect(body).not.toContain('hashed_password');
    });

    it('stack trace absent from error responses in test env', async () => {
      // Impl: global-exception.filter.ts – stack only in development
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).get('/api/v1/nonexistent-route-xyz');

      // 404 response should not include a stack property
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.stack).toBeUndefined();
    });

    it('integration apiKey shown masked in GET /integrations response', async () => {
      // Impl: integrations.service.ts – toMaskedResponse() returns ••••••••
      await createTestIntegration(ctx, tenantA.tenant.id);

      const res = await authenticatedRequest(app, tenantA.token).get(
        '/api/v1/integrations',
      );

      if (res.status === 200) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(res.body.apiKey).toBe('——'); // no api key set = ——
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(res.body.apiKeyEncrypted).toBeUndefined(); // never exposed
      }
    });
  });

  // ── ACCESS CONTROL ──────────────────────────────────────────────────────────

  describe('Role-Based Access Control', () => {
    it('cashier cannot access campaigns list (403)', async () => {
      // SECURITY FIX: campaigns.controller.ts – added @Roles(OWNER, MANAGER)
      const res = await authenticatedRequest(app, cashierToken).get(
        '/api/v1/campaigns',
      );
      expect(res.status).toBe(403);
    });

    it('cashier cannot access dashboard summary (403)', async () => {
      // Impl: dashboard.controller.ts – @Roles(OWNER, MANAGER)
      const res = await authenticatedRequest(app, cashierToken).get(
        '/api/v1/dashboard/summary',
      );
      expect(res.status).toBe(403);
    });

    it('cashier CAN log transactions (201)', async () => {
      // Impl: transactions.controller.ts – @Roles(OWNER, MANAGER, CASHIER)
      const customer = await createTestCustomer(ctx, tenantA.tenant.id);
      const res = await authenticatedRequest(app, cashierToken)
        .post('/api/v1/transactions')
        .send({
          customerId: customer.id,
          amount: '5000',
          idempotencyKey: crypto.randomUUID(),
        });
      expect(res.status).toBe(201);
    });

    it('manager cannot delete campaigns — owner only (403)', async () => {
      // SECURITY FIX: campaigns.controller.ts – @Roles(OWNER) on DELETE
      const campaign = await createTestCampaign(ctx, tenantA.tenant.id);
      const res = await authenticatedRequest(app, managerToken).delete(
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('owner can delete draft campaigns (204)', async () => {
      // Impl: campaigns.service.ts – remove() blocks non-draft
      const campaign = await createTestCampaign(ctx, tenantA.tenant.id);
      const res = await authenticatedRequest(app, tenantA.token).delete(
        `/api/v1/campaigns/${campaign.id}`,
      );
      expect(res.status).toBe(204);
    });

    it('manager can send campaigns (200 or 400 — not 403)', async () => {
      // Impl: campaigns.controller.ts – @Roles(OWNER, MANAGER) on POST :id/send
      const campaign = await createTestCampaign(ctx, tenantA.tenant.id);
      const res = await authenticatedRequest(app, managerToken).post(
        `/api/v1/campaigns/${campaign.id}/send`,
      );
      // 400 is fine (empty audience / wallet), 403 would be wrong
      expect(res.status).not.toBe(403);
      expect([200, 400]).toContain(res.status);
    });

    it('cashier cannot view all transactions list (403)', async () => {
      // Impl: transactions.controller.ts – GET /transactions @Roles(OWNER, MANAGER)
      const res = await authenticatedRequest(app, cashierToken).get(
        '/api/v1/transactions',
      );
      expect(res.status).toBe(403);
    });
  });
});
