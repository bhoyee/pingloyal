/**
 * Wallet Integration Tests
 *
 * Tests WaMessageProcessor wallet gating (marketing vs utility),
 * Paystack webhook top-up crediting, and top-up validation.
 *
 * Uses real PostgreSQL + Redis. BspService is mocked (no real Gupshup).
 */
import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, QueueEvents } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { QUEUE_NAMES } from '../../src/queue/queue.module';
import { redisConfig } from '../../src/queue/redis.config';
import {
  TriggerType,
  CampaignLogStatus,
  CampaignStatus,
} from '@pingloyal/types';
import { BspService } from '../../src/modules/whatsapp/bsp.service';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import {
  type TestHelperCtx,
  type CreateTenantResult,
  authenticatedRequest,
  clearTestData,
  createTestCustomer,
  createTestTenant,
  setWaVerified,
  setWalletBalance,
} from '../helpers/test-helpers';
import type Redis from 'ioredis';
import { CampaignLog } from '../../src/modules/campaigns/entities/campaign-log.entity';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Polling queue.getActiveCount()/getWaitingCount() races with BullMQ's
// Redis→worker pickup latency: a job can be invisible to those counts both
// just after it's added (not yet claimed) and just after its handler
// resolves (not yet flushed from the active set), so "0 and 0" doesn't
// reliably mean "this job ran to completion". Awaiting the Job itself via
// QueueEvents waits on the actual `completed`/`failed` event instead.
async function runJob(
  queue: Queue,
  queueEvents: QueueEvents,
  payload: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<void> {
  const job = await queue.add('send-message', payload);
  await job.waitUntilFinished(queueEvents, timeoutMs);
}

async function getWalletTransactions(
  dataSource: DataSource,
  tenantId: string,
): Promise<
  Array<{ id: string; type: string; amount: string; balance_after: string }>
> {
  return dataSource.query(
    `SELECT id, type, amount, balance_after FROM wallet_transactions
     WHERE tenant_id = $1 ORDER BY created_at ASC`,
    [tenantId],
  );
}

async function getLastTriggerLog(
  dataSource: DataSource,
  tenantId: string,
  customerId: string,
  triggerType: string,
): Promise<{
  trigger_type: string;
  status: string;
  skip_reason: string | null;
}> {
  const rows = await dataSource.query<
    Array<{ trigger_type: string; status: string; skip_reason: string | null }>
  >(
    `SELECT trigger_type, status, skip_reason FROM trigger_logs
     WHERE tenant_id = $1 AND customer_id = $2 AND trigger_type = $3
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, customerId, triggerType],
  );
  return rows[0];
}

async function createCampaignLog(
  dataSource: DataSource,
  tenantId: string,
  campaignId: string,
  customerId: string,
): Promise<CampaignLog> {
  const repo = dataSource.getRepository(CampaignLog);
  return repo.save(
    repo.create({
      tenantId,
      campaign: { id: campaignId } as Campaign,
      customer: { id: customerId } as never,
      status: CampaignLogStatus.QUEUED,
      waMessageId: null,
      sentAt: null,
      deliveredAt: null,
      failedAt: null,
      errorMessage: null,
    }),
  );
}

async function getCampaignLog(
  dataSource: DataSource,
  logId: string,
): Promise<{ status: string; error_message: string | null }> {
  const rows = await dataSource.query<
    Array<{ status: string; error_message: string | null }>
  >('SELECT status, error_message FROM campaign_logs WHERE id = $1', [logId]);
  return rows[0];
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('Wallet Integration Tests', () => {
  let app: INestApplication;
  let ctx: TestHelperCtx;
  let tenantResult: CreateTenantResult;
  let redis: Redis;
  let waMessagesQueue: Queue;
  let queueEvents: QueueEvents;
  let walletService: WalletService;
  let mockBspService: { sendMessage: jest.Mock };
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    mockBspService = {
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'mock-bsp-id' }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BspService)
      .useValue(mockBspService)
      .compile();

    // rawBody: true is required for Paystack webhook HMAC verification
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    const dataSource = app.get<DataSource>(DataSource);
    const jwtService = app.get<JwtService>(JwtService);
    const configService = app.get<ConfigService>(ConfigService);
    ctx = { dataSource, jwtService, configService };

    redis = app.get<Redis>(REDIS_CLIENT);
    waMessagesQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.WA_MESSAGES));
    walletService = app.get<WalletService>(WalletService);

    queueEvents = new QueueEvents(QUEUE_NAMES.WA_MESSAGES, {
      connection: redisConfig.connection,
    });
    await queueEvents.waitUntilReady();

    await dataSource.runMigrations();

    tenantResult = await createTestTenant(ctx, {
      businessName: 'Wallet Test Store',
      email: `wallet-test-${Date.now()}@test.com`,
    });
    createdTenantIds.push(tenantResult.tenant.id);
  }, 90_000);

  afterAll(async () => {
    await queueEvents.close();
    await clearTestData(ctx.dataSource, createdTenantIds);
    await app.close();
  }, 30_000);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBspService.sendMessage.mockResolvedValue({ messageId: 'mock-bsp-id' });

    // Clear queue and per-tenant test data between tests (FK-safe order)
    await waMessagesQueue.obliterate({ force: true }).catch(() => null);
    const tenantId = tenantResult.tenant.id;
    // campaign_logs references campaigns + customers → delete first
    await ctx.dataSource.query(
      'DELETE FROM campaign_logs WHERE tenant_id = $1',
      [tenantId],
    );
    await ctx.dataSource.query(
      'DELETE FROM trigger_logs WHERE tenant_id = $1',
      [tenantId],
    );
    await ctx.dataSource.query(
      'DELETE FROM wallet_transactions WHERE tenant_id = $1',
      [tenantId],
    );
    await ctx.dataSource.query('DELETE FROM customers WHERE tenant_id = $1', [
      tenantId,
    ]);
    await ctx.dataSource.query('DELETE FROM campaigns WHERE tenant_id = $1', [
      tenantId,
    ]);
    // Clear wallet balance cache
    await redis.del(`wallet:balance:${tenantId}`).catch(() => null);
  });

  // ── WaMessageProcessor + WalletService ────────────────────────────────────

  describe('WaMessageProcessor + WalletService', () => {
    const tenantId = () => tenantResult.tenant.id;

    it('T1 — Birthday + sufficient wallet → BSP called, wallet debited', async () => {
      await setWalletBalance(ctx, tenantId(), 10_000, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.BIRTHDAY,
        tenantId: tenantId(),
        customerId: customer.id,
        data: {},
      });

      expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
      const newBalance = await walletService.getBalance(tenantId());
      expect(newBalance).toBeLessThan(10_000);

      const txns = await getWalletTransactions(ctx.dataSource, tenantId());
      expect(txns.some((t) => t.type === 'debit_birthday')).toBe(true);
    }, 30_000);

    it('T2 — Birthday + empty wallet → BSP NOT called, trigger log skipped with wallet_empty', async () => {
      await setWalletBalance(ctx, tenantId(), 0, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.BIRTHDAY,
        tenantId: tenantId(),
        customerId: customer.id,
        data: {},
      });

      expect(mockBspService.sendMessage).not.toHaveBeenCalled();
      const log = await getLastTriggerLog(
        ctx.dataSource,
        tenantId(),
        customer.id,
        'birthday',
      );
      expect(log.status).toBe('skipped');
      expect(log.skip_reason).toBe('wallet_empty');

      const txns = await getWalletTransactions(ctx.dataSource, tenantId());
      expect(txns.filter((t) => t.type === 'debit_birthday').length).toBe(0);
    }, 30_000);

    it('T3 — Lapsed win-back + empty wallet → BSP NOT called, wallet_empty', async () => {
      await setWalletBalance(ctx, tenantId(), 0, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.LAPSED_WINBACK,
        tenantId: tenantId(),
        customerId: customer.id,
        data: { daysSinceVisit: '65' },
      });

      expect(mockBspService.sendMessage).not.toHaveBeenCalled();
      const log = await getLastTriggerLog(
        ctx.dataSource,
        tenantId(),
        customer.id,
        'lapsed_winback',
      );
      expect(log.skip_reason).toBe('wallet_empty');
    }, 30_000);

    it('T4 — Campaign + empty wallet → campaign_log marked failed with wallet_empty', async () => {
      await setWalletBalance(ctx, tenantId(), 0, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      const campaignRepo = ctx.dataSource.getRepository(Campaign);
      const campaign = await campaignRepo.save(
        campaignRepo.create({
          tenantId: tenantId(),
          name: 'Wallet Test Campaign',
          messageBody: 'Hi {{firstName}}!',
          segmentRules: {},
          status: CampaignStatus.SENDING,
          totalRecipients: 1,
          sentCount: 0,
          deliveredCount: 0,
          failedCount: 0,
        }),
      );
      const campaignLog = await createCampaignLog(
        ctx.dataSource,
        tenantId(),
        campaign.id,
        customer.id,
      );

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.CAMPAIGN_MESSAGE,
        tenantId: tenantId(),
        customerId: customer.id,
        campaignLogId: campaignLog.id,
        campaignId: campaign.id,
        data: {},
      });

      expect(mockBspService.sendMessage).not.toHaveBeenCalled();
      const updatedLog = await getCampaignLog(ctx.dataSource, campaignLog.id);
      expect(updatedLog.status).toBe('failed');
      expect(updatedLog.error_message).toBe('wallet_empty');
    }, 30_000);

    it('T5 — Purchase confirmation + empty wallet → BSP STILL called (Utility type)', async () => {
      await setWalletBalance(ctx, tenantId(), 0, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.PURCHASE_CONFIRMATION,
        tenantId: tenantId(),
        customerId: customer.id,
        data: { pointsEarned: '50', newBalance: '550' },
      });

      expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
      // Wallet unchanged — utility messages never deduct
      const balance = await walletService.getBalance(tenantId());
      expect(balance).toBe(0);
    }, 30_000);

    it('T6 — Welcome + empty wallet → BSP STILL called (Utility type)', async () => {
      await setWalletBalance(ctx, tenantId(), 0, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.WELCOME,
        tenantId: tenantId(),
        customerId: customer.id,
        data: {},
      });

      expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
    }, 30_000);

    it('T7 — Balance bot reply + empty wallet → no wallet deduction (bot replies are free)', async () => {
      await setWalletBalance(ctx, tenantId(), 0, redis);
      await setWaVerified(ctx.dataSource, tenantId(), redis);
      const customer = await createTestCustomer(ctx, tenantId(), {
        waOptedIn: true,
      });

      await runJob(waMessagesQueue, queueEvents, {
        type: TriggerType.BALANCE_BOT_REPLY,
        tenantId: tenantId(),
        customerId: customer.id,
        data: { message: 'Your balance is 500 points' },
      });

      // Raw message type — BSP deferred (templateName=null), but no wallet deduction
      const balance = await walletService.getBalance(tenantId());
      expect(balance).toBe(0);
      const txns = await getWalletTransactions(ctx.dataSource, tenantId());
      // No debit transactions — free service type
      expect(txns.filter((t) => t.type.startsWith('debit_')).length).toBe(0);
    }, 30_000);
  });

  // ── Paystack webhook → wallet credit ──────────────────────────────────────

  describe('Paystack webhook → wallet credit', () => {
    it('T8 — charge.success wallet_topup → balance credited and transaction recorded', async () => {
      const tenantId = tenantResult.tenant.id;
      await setWalletBalance(ctx, tenantId, 5_000, redis);

      // Store pending top-up in Redis (simulates POST /billing/wallet/topup)
      const ref = 'test-topup-ref-001';
      await redis.set(
        `billing:wallet:pending:${ref}`,
        JSON.stringify({ tenantId, amount: 10_000 }),
        'EX',
        3600,
      );

      const body = JSON.stringify({
        event: 'charge.success',
        data: {
          reference: ref,
          amount: 1_000_000, // 10,000 naira in kobo
          metadata: { type: 'wallet_topup', tenantId, amount: 10_000 },
        },
      });

      const paystackKey = ctx.configService.getOrThrow<string>(
        'PAYSTACK_SECRET_KEY',
      );
      const signature = crypto
        .createHmac('sha512', paystackKey)
        .update(body)
        .digest('hex');

      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/api/v1/billing/webhook/paystack')
        .set('x-paystack-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(200);

      const newBalance = await walletService.getBalance(tenantId);
      expect(newBalance).toBe(15_000); // 5000 + 10000

      const txns = await getWalletTransactions(ctx.dataSource, tenantId);
      const topup = txns.find((t) => t.type === 'topup');
      expect(topup).toBeDefined();
      expect(Number(topup!.amount)).toBe(10_000); // positive amount

      // GET /billing/wallet/balance returns updated balance
      const balanceRes = await authenticatedRequest(
        app,
        tenantResult.token,
      ).get('/api/v1/billing/wallet/balance');
      expect(balanceRes.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(balanceRes.body.balance).toBe(15_000);
    }, 30_000);
  });

  // ── Top-up validation ──────────────────────────────────────────────────────

  describe('Top-up validation', () => {
    it('T9 — amount=500 → 400 (below ₦1,000 minimum)', async () => {
      const res = await authenticatedRequest(app, tenantResult.token)
        .post('/api/v1/billing/wallet/topup')
        .send({ amount: 500 });
      expect(res.status).toBe(400);
    }, 15_000);

    it('T10 — amount=-1000 → 400 (negative not allowed)', async () => {
      const res = await authenticatedRequest(app, tenantResult.token)
        .post('/api/v1/billing/wallet/topup')
        .send({ amount: -1000 });
      expect(res.status).toBe(400);
    }, 15_000);

    it('T11 — amount=15000 with mocked Paystack → 200, returns authorizationUrl', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/test-abc',
              reference: 'test-ref-002',
            },
          }),
      } as unknown as Response);

      const res = await authenticatedRequest(app, tenantResult.token)
        .post('/api/v1/billing/wallet/topup')
        .send({ amount: 15_000 });

      fetchSpy.mockRestore();

      expect([200, 201]).toContain(res.status);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(String(res.body.authorizationUrl)).toContain('paystack.com');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(res.body.reference).toBeDefined();
    }, 15_000);
  });
});
