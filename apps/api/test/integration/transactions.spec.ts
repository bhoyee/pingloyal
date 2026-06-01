/**
 * Transactions Integration Tests
 *
 * Tests the full transaction pipeline:
 *   - Points calculation and DB persistence
 *   - Idempotency key deduplication
 *   - Tenant isolation (cross-tenant 404)
 *   - Subscription enforcement (suspended → 402)
 *   - Queue job creation (trigger-check, wa-messages)
 *   - Input validation
 *
 * Requires: real PostgreSQL + Redis + BullMQ (docker compose up -d)
 */
import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TriggerType } from '@pingloyal/types';
import { AppModule } from '../../src/app.module';
import { QUEUE_NAMES } from '../../src/queue/queue.module';
import {
  type TestHelperCtx,
  type CreateTenantResult,
  authenticatedRequest,
  bootstrapTestApp,
  clearTestData,
  createTestCustomer,
  createTestTenant,
  getLedgerEntries,
  suspendTenant,
  reactivateTenant,
} from '../helpers/test-helpers';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import type Redis from 'ioredis';

// ── Test setup ────────────────────────────────────────────────────────────────

describe('POST /transactions', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let tenantA: CreateTenantResult;
  let tenantB: CreateTenantResult;
  let customerId: string;
  let redis: Redis;
  let triggerCheckQueue: Queue;
  let waMessagesQueue: Queue;
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

    redis = app.get<Redis>(REDIS_CLIENT);
    triggerCheckQueue = app.get<Queue>(
      getQueueToken(QUEUE_NAMES.TRIGGER_CHECK),
    );
    waMessagesQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.WA_MESSAGES));

    await dataSource.runMigrations();

    tenantA = await createTestTenant(ctx, {
      businessName: 'Transaction Test Store A',
      email: `tx-a-${Date.now()}@test.com`,
    });
    tenantB = await createTestTenant(ctx, {
      businessName: 'Transaction Test Store B',
      email: `tx-b-${Date.now()}@test.com`,
    });
    createdTenantIds.push(tenantA.tenant.id, tenantB.tenant.id);

    const customer = await createTestCustomer(ctx, tenantA.tenant.id);
    customerId = customer.id;
  }, 90_000);

  afterAll(async () => {
    await clearTestData(ctx.dataSource, createdTenantIds);
    await app.close();
  }, 30_000);

  // ── T1: Creates transaction with correct points ────────────────────────────

  it('T1 — creates transaction, ledger row, and updates customer points', async () => {
    const beforeRows = await ctx.dataSource.query<
      [{ points_balance: string; total_spend: string; purchase_count: string }]
    >(
      'SELECT points_balance, total_spend, purchase_count FROM customers WHERE id = $1',
      [customerId],
    );
    const before = beforeRows[0];

    const res = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({
        customerId,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      });

    expect(res.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.pointsEarned).toBe(50); // ₦5000 / ₦100 earnRate = 50

    const afterRows = await ctx.dataSource.query<
      [{ points_balance: string; total_spend: string; purchase_count: string }]
    >(
      'SELECT points_balance, total_spend, purchase_count FROM customers WHERE id = $1',
      [customerId],
    );
    const after = afterRows[0];

    expect(Number(after.points_balance)).toBe(
      Number(before.points_balance) + 50,
    );
    expect(Number(after.total_spend)).toBe(Number(before.total_spend) + 5000);
    expect(Number(after.purchase_count)).toBe(
      Number(before.purchase_count) + 1,
    );

    const ledger = await getLedgerEntries(ctx.dataSource, customerId);
    const lastEntry = ledger[ledger.length - 1];
    expect(lastEntry.delta).toBe(50);
    expect(lastEntry.reason).toBe('purchase');
  }, 30_000);

  // ── T2: Idempotency ────────────────────────────────────────────────────────

  it('T2 — same idempotency key submitted twice: points added only once', async () => {
    const key = crypto.randomUUID();

    const res1 = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({ customerId, amount: '5000', idempotencyKey: key });

    const res2 = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({ customerId, amount: '5000', idempotencyKey: key });

    expect(res1.status).toBe(201);
    expect([200, 201]).toContain(res2.status);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res2.body.alreadyProcessed).toBe(true);

    // Verify only one transaction row for this key
    const txCount = await ctx.dataSource.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count FROM transactions
       WHERE idempotency_key = $1 AND tenant_id = $2`,
      [key, tenantA.tenant.id],
    );
    expect(parseInt(txCount[0].count, 10)).toBe(1);
  }, 30_000);

  // ── T3: Cross-tenant isolation ─────────────────────────────────────────────

  it('T3 — customer from different tenant returns 404', async () => {
    const otherCustomer = await createTestCustomer(ctx, tenantB.tenant.id);

    const res = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({
        customerId: otherCustomer.id,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      });

    expect(res.status).toBe(404);
  }, 30_000);

  // ── T4: Suspended tenant → 402 ─────────────────────────────────────────────

  it('T4 — suspended tenant returns 402', async () => {
    await suspendTenant(ctx.dataSource, tenantA.tenant.id, redis);

    const res = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({
        customerId,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      });

    expect(res.status).toBe(402);

    await reactivateTenant(ctx.dataSource, tenantA.tenant.id, redis);
  }, 30_000);

  // ── T5: trigger-check queue job created ───────────────────────────────────

  it('T5 — trigger-check queue has a job after successful transaction', async () => {
    // Clear any existing jobs
    await triggerCheckQueue.obliterate({ force: true }).catch(() => null);

    await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({
        customerId,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      });

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 500));

    const jobs = await triggerCheckQueue.getJobs([
      'waiting',
      'active',
      'delayed',
    ]);
    const relevant = jobs.filter(
      (j) => (j.data as { customerId?: string }).customerId === customerId,
    );
    expect(relevant.length).toBeGreaterThan(0);
  }, 30_000);

  // ── T6: wa-messages queue purchase_confirmation job ───────────────────────

  it('T6 — wa-messages queue has purchase_confirmation job after transaction', async () => {
    await waMessagesQueue.obliterate({ force: true }).catch(() => null);

    await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({
        customerId,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      });

    await new Promise((r) => setTimeout(r, 500));

    const jobs = await waMessagesQueue.getJobs([
      'waiting',
      'active',
      'delayed',
    ]);
    const confirmJob = jobs.find(
      (j) =>
        (j.data as { type?: string; customerId?: string }).type ===
          TriggerType.PURCHASE_CONFIRMATION &&
        (j.data as { customerId?: string }).customerId === customerId,
    );
    expect(confirmJob).toBeDefined();
  }, 30_000);

  // ── T7: No JWT → 401 ──────────────────────────────────────────────────────

  it('T7 — request without JWT returns 401', async () => {
    const res = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/api/v1/transactions')
      .send({
        customerId,
        amount: '5000',
        idempotencyKey: crypto.randomUUID(),
      });

    expect(res.status).toBe(401);
  }, 15_000);

  // ── T8: amount=0 → 400 ────────────────────────────────────────────────────

  it('T8 — amount=0 returns 400 validation error', async () => {
    const res = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({ customerId, amount: '0', idempotencyKey: crypto.randomUUID() });

    expect(res.status).toBe(400);
  }, 15_000);

  // ── T9: invalid amount format → 400 ──────────────────────────────────────

  it('T9 — negative amount returns 400', async () => {
    const res = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/transactions')
      .send({
        customerId,
        amount: '-500',
        idempotencyKey: crypto.randomUUID(),
      });

    expect(res.status).toBe(400);
  }, 15_000);
});
