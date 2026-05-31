/**
 * SQL Injection Prevention Tests
 *
 * Runs against the real database. Proves TypeORM parameterisation prevents
 * SQL injection attacks. Docker services must be up before running.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  bootstrapTestApp,
  createTestTenant,
  clearTestData,
  type TestHelperCtx,
  type CreateTenantResult,
} from '../helpers/test-helpers';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('SQL Injection Prevention', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let tenantResult: CreateTenantResult;
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

    tenantResult = await createTestTenant(ctx, {
      businessName: 'SQL Test Store',
      email: 'sqltest@security.test',
    });
    createdTenantIds.push(tenantResult.tenant.id);
  }, 60_000);

  afterAll(async () => {
    await clearTestData(ctx.dataSource, createdTenantIds);
    await app.close();
  }, 30_000);

  it('T-SQL-1: phone lookup with SQL injection attempt returns 400 or 404, not 500', async () => {
    const maliciousPhone = "'; DROP TABLE customers; --";

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(
        `/api/v1/customers/lookup?phone=${encodeURIComponent(maliciousPhone)}`,
      )
      .set('Authorization', `Bearer ${tenantResult.token}`);

    // Should be 400 (invalid phone) or 404 (not found) — NOT 500
    expect([400, 404]).toContain(response.status);
    expect(response.status).not.toBe(500);

    // Verify customers table still exists (injection didn't drop it)
    const count = await ctx.dataSource.query<[{ count: string }]>(
      'SELECT COUNT(*) AS count FROM customers WHERE tenant_id = $1',
      [tenantResult.tenant.id],
    );
    expect(parseInt(count[0].count)).toBeGreaterThanOrEqual(0);
  });

  it('T-SQL-2: multiple SQL injection attempts all return safe responses', async () => {
    const attempts = [
      "' OR '1'='1",
      "'; SELECT * FROM users; --",
      '1; DROP TABLE transactions; --',
      "' UNION SELECT * FROM tenants --",
    ];

    for (const attempt of attempts) {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get(`/api/v1/customers/lookup?phone=${encodeURIComponent(attempt)}`)
        .set('Authorization', `Bearer ${tenantResult.token}`);

      expect([400, 404]).toContain(response.status);
      expect(response.status).not.toBe(500);
    }
  });

  it('T-SQL-3: campaign name with HTML injection is sanitised in response', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${tenantResult.token}`)
      .send({
        name: '<script>alert("xss")</script>Weekend Promo',
        messageBody:
          'Hi {{firstName}}, check out our special offer this weekend!',
        segmentRules: {},
      });

    expect(response.status).toBe(201);
    // HTML stripped — script tag removed
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.name).not.toContain('<script>');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.name).toContain('Weekend Promo');
  });
});
