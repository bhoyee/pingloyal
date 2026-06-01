/**
 * Campaigns Integration Tests
 *
 * Tests campaign CRUD, audience preview, send dispatch, and stats.
 * Mocks BspService to avoid real Gupshup calls.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../../src/app.module';
import { QUEUE_NAMES } from '../../src/queue/queue.module';
import { CampaignStatus } from '@pingloyal/types';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';
import { BspService } from '../../src/modules/whatsapp/bsp.service';
import {
  type TestHelperCtx,
  type CreateTenantResult,
  authenticatedRequest,
  bootstrapTestApp,
  clearTestData,
  createTestCustomer,
  createTestTenant,
  createTestUser,
  setWaVerified,
  setWalletBalance,
} from '../helpers/test-helpers';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';

// ── Test setup ────────────────────────────────────────────────────────────────

describe('Campaigns', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let tenantA: CreateTenantResult;
  let redis: Redis;
  let campaignSendQueue: Queue;
  const createdTenantIds: string[] = [];
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BspService)
      .useValue({
        sendMessage: jest.fn().mockResolvedValue({ messageId: 'mock-wa-msg' }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await bootstrapTestApp(app);

    const dataSource = app.get<DataSource>(DataSource);
    const jwtService = app.get<JwtService>(JwtService);
    const configService = app.get<ConfigService>(ConfigService);
    ctx = { dataSource, jwtService, configService };

    redis = app.get<Redis>(REDIS_CLIENT);
    campaignSendQueue = app.get<Queue>(
      getQueueToken(QUEUE_NAMES.CAMPAIGN_SEND),
    );

    await dataSource.runMigrations();

    tenantA = await createTestTenant(ctx, {
      businessName: 'Campaign Test Store',
      email: `camp-${Date.now()}@test.com`,
    });
    createdTenantIds.push(tenantA.tenant.id);

    // Set up wallet and WA verification for campaign sending
    await setWaVerified(ctx.dataSource, tenantA.tenant.id, redis);
    await setWalletBalance(ctx, tenantA.tenant.id, 500_000, redis);

    // Create 10 opted-in customers
    for (let i = 0; i < 10; i++) {
      const c = await createTestCustomer(ctx, tenantA.tenant.id, {
        waOptedIn: true,
      });
      createdCustomerIds.push(c.id);
    }
  }, 90_000);

  afterAll(async () => {
    await clearTestData(ctx.dataSource, createdTenantIds);
    await app.close();
  }, 30_000);

  // ── T1: Audience preview ──────────────────────────────────────────────────

  it('T1 — audience-preview returns count of opted-in customers', async () => {
    const res = await authenticatedRequest(app, tenantA.token).get(
      '/api/v1/campaigns/audience-preview',
    );

    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(Number(res.body.count)).toBeGreaterThanOrEqual(10);
  }, 30_000);

  // ── T2: Create draft campaign ─────────────────────────────────────────────

  it('T2 — POST /campaigns creates a draft campaign', async () => {
    const res = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/campaigns')
      .send({
        name: 'Integration Test Campaign',
        messageBody: 'Hi {{firstName}}, special offer this weekend!',
        segmentRules: {},
      });

    expect(res.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.status).toBe('draft');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.name).toBe('Integration Test Campaign');
  }, 15_000);

  // ── T3: PATCH on sent campaign → 400 ─────────────────────────────────────

  it('T3 — PATCH on sent campaign returns 400', async () => {
    // Create a campaign directly in DB with status=sent
    const campaignRepo = ctx.dataSource.getRepository(Campaign);
    const campaign = await campaignRepo.save(
      campaignRepo.create({
        tenantId: tenantA.tenant.id,
        name: 'Sent Campaign',
        messageBody: 'Hello!',
        segmentRules: {},
        status: CampaignStatus.SENT,
        totalRecipients: 5,
        sentCount: 5,
        deliveredCount: 4,
        failedCount: 1,
      }),
    );

    const res = await authenticatedRequest(app, tenantA.token)
      .patch(`/api/v1/campaigns/${campaign.id}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(400);

    await campaignRepo.remove(campaign);
  }, 15_000);

  // ── T4: Campaign stats delivery rate ─────────────────────────────────────

  it('T4 — GET /campaigns/:id/stats returns correct delivery rate', async () => {
    const campaignRepo = ctx.dataSource.getRepository(Campaign);
    const campaign = await campaignRepo.save(
      campaignRepo.create({
        tenantId: tenantA.tenant.id,
        name: 'Stats Test Campaign',
        messageBody: 'Test message',
        segmentRules: {},
        status: CampaignStatus.SENT,
        totalRecipients: 100,
        sentCount: 100,
        deliveredCount: 94,
        failedCount: 6,
      }),
    );

    const res = await authenticatedRequest(app, tenantA.token).get(
      `/api/v1/campaigns/${campaign.id}/stats`,
    );

    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.body.deliveryRate).toBe(94); // 94/100 × 100

    await campaignRepo.remove(campaign);
  }, 15_000);

  // ── T5: POST /campaigns/:id/send with audience ─────────────────────────────

  it('T5 — POST /campaigns/:id/send returns 200 with recipientCount and adds fan-out job', async () => {
    await campaignSendQueue.obliterate({ force: true }).catch(() => null);

    // Create campaign
    const createRes = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/campaigns')
      .send({
        name: 'Send Test Campaign',
        messageBody: 'Hi {{firstName}}, great offer!',
        segmentRules: {},
      });
    expect(createRes.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const campaignId: string = createRes.body.id as string;

    // Send the campaign
    const sendRes = await authenticatedRequest(app, tenantA.token).post(
      `/api/v1/campaigns/${campaignId}/send`,
    );

    expect(sendRes.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(Number(sendRes.body.totalRecipients)).toBeGreaterThanOrEqual(10);

    // Verify a fan-out job was added to the campaign-send queue
    await new Promise((r) => setTimeout(r, 500));
    const jobs = await campaignSendQueue.getJobs([
      'waiting',
      'active',
      'delayed',
    ]);
    expect(jobs.length).toBeGreaterThan(0);

    // Verify campaign status updated to 'sending'
    const campaignRows = await ctx.dataSource.query<[{ status: string }]>(
      'SELECT status FROM campaigns WHERE id = $1',
      [campaignId],
    );
    expect(campaignRows[0].status).toBe('sending');
  }, 60_000);

  // ── T6: Send with zero wallet → 400 ──────────────────────────────────────

  it('T6 — send campaign with empty wallet returns 400', async () => {
    // Clear cache so the service sees the new wallet balance from DB
    await setWalletBalance(ctx, tenantA.tenant.id, 0, redis);

    const createRes = await authenticatedRequest(app, tenantA.token)
      .post('/api/v1/campaigns')
      .send({
        name: 'Empty Wallet Campaign',
        messageBody: 'Hi {{firstName}}, check this out!',
        segmentRules: {},
      });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const campaignId: string = createRes.body.id as string;

    const res = await authenticatedRequest(app, tenantA.token).post(
      `/api/v1/campaigns/${campaignId}/send`,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body).toLowerCase()).toContain('wallet');

    // Restore wallet and clear cache for subsequent tests
    await setWalletBalance(ctx, tenantA.tenant.id, 500_000, redis);
  }, 30_000);

  // ── T7: Cashier cannot list campaigns (RBAC) ──────────────────────────────

  it('T7 — cashier cannot access campaign list (403)', async () => {
    // Create cashier token using statically imported helper
    const { token: cashierToken } = await createTestUser(
      ctx,
      tenantA.tenant.id,
      'cashier' as never,
      '-campaigns-test',
    );

    const res = await authenticatedRequest(app, cashierToken).get(
      '/api/v1/campaigns',
    );

    expect(res.status).toBe(403);
  }, 30_000);
});
