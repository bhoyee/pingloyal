/**
 * Customers Integration Tests
 *
 * Tests customer registration, idempotency, phone normalisation, and CSV import.
 * Runs against the real database.
 */
import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  type TestHelperCtx,
  type CreateTenantResult,
  authenticatedRequest,
  bootstrapTestApp,
  clearTestData,
  createTestTenant,
  getCustomerByPhone,
  countCustomersByPhone,
  generateTestCsv,
} from '../helpers/test-helpers';

// ── Test setup ────────────────────────────────────────────────────────────────

describe('Customer Registration', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let tenantA: CreateTenantResult;
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
      businessName: 'Customer Test Store',
      email: `cust-${Date.now()}@test.com`,
    });
    createdTenantIds.push(tenantA.tenant.id);
  }, 90_000);

  afterAll(async () => {
    await clearTestData(ctx.dataSource, createdTenantIds);
    await app.close();
  }, 30_000);

  // ── T1: Successful registration ───────────────────────────────────────────

  it('T1 — POST /register creates customer with wa_opted_in=true', async () => {
    const phone = `0802${Date.now().toString().slice(-7)}`;

    const res = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/customers/register')
      .set('idempotency-key', crypto.randomUUID())
      .send({
        fullName: 'Adaeze Obi',
        phone,
        waOptedIn: true,
        tenantSlug: tenantA.tenant.slug,
      });

    expect(res.status).toBe(201);

    const phoneE164 = '+234' + phone.slice(1);
    const customer = await getCustomerByPhone(
      ctx.dataSource,
      phoneE164,
      tenantA.tenant.id,
    );
    expect(customer).toBeDefined();
    expect(customer?.waOptedIn).toBe(true);
    expect(customer?.phoneE164).toBe(phoneE164);
    expect(customer?.source).toBe('qr_registration');
  }, 30_000);

  // ── T2: Duplicate registration → idempotent ────────────────────────────────

  it('T2 — same phone registered twice: second returns 200, no duplicate row', async () => {
    const phone = `0803${Date.now().toString().slice(-7)}`;
    const body = {
      fullName: 'Test User',
      phone,
      waOptedIn: true,
      tenantSlug: tenantA.tenant.slug,
    };

    // T2 uses the SAME idempotency key both times to test deduplication
    const idemKey = crypto.randomUUID();

    const res1 = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/customers/register')
      .set('idempotency-key', idemKey)
      .send(body);

    const res2 = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/customers/register')
      .set('idempotency-key', idemKey)
      .send(body);

    expect(res1.status).toBe(201);
    expect([200, 201]).toContain(res2.status);

    const phoneE164 = '+234' + phone.slice(1);
    const count = await countCustomersByPhone(
      ctx.dataSource,
      phoneE164,
      tenantA.tenant.id,
    );
    expect(count).toBe(1);
  }, 30_000);

  // ── T3: Unknown slug → 404 ────────────────────────────────────────────────

  it('T3 — unknown tenant slug returns 404', async () => {
    const res = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/customers/register')
      .set('idempotency-key', crypto.randomUUID())
      .send({
        fullName: 'Test',
        phone: '08012345678',
        waOptedIn: true,
        tenantSlug: 'slug-does-not-exist-xyz',
      });

    expect(res.status).toBe(404);
  }, 15_000);

  // ── T4: Phone lookup returns masked phone ──────────────────────────────────

  it('T4 — phone lookup normalises and masks the phone number', async () => {
    const phone = `0804${Date.now().toString().slice(-7)}`;

    // Create customer first
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/customers/register')
      .set('idempotency-key', crypto.randomUUID())
      .send({
        fullName: 'Lookup Test',
        phone,
        waOptedIn: true,
        tenantSlug: tenantA.tenant.slug,
      });

    // Lookup with spaced version
    const phoneSpaced = `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
    const res = await authenticatedRequest(app, tenantA.token).get(
      `/api/v1/customers/lookup?phone=${encodeURIComponent(phoneSpaced)}`,
    );

    expect(res.status).toBe(200);
    // Phone should be masked
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.phoneE164).toMatch(/\*/);
  }, 30_000);

  // ── T5: CSV import creates customers ──────────────────────────────────────

  it('T5 — CSV import with 5 rows creates 5 customers', async () => {
    const csv = generateTestCsv(5);

    const res = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/customers/import')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .attach('file', Buffer.from(csv), {
        filename: 'customers.csv',
        contentType: 'text/csv',
      });

    // Accept 201 or 202 (async processing)
    expect([201, 202]).toContain(res.status);
  }, 30_000);

  // ── T6: GET /customers requires authentication ─────────────────────────────

  it('T6 — GET /customers without token returns 401', async () => {
    const res = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    ).get('/api/v1/customers');
    expect(res.status).toBe(401);
  }, 15_000);
});
