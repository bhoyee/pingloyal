import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { encrypt } from '@pingloyal/utils';
import type Redis from 'ioredis';
import {
  CampaignStatus,
  CustomerSource,
  IntegrationConnectionType,
  IntegrationSyncStatus,
  PlanTier,
  SubscriptionStatus,
  TenantMode,
  UserRole,
  WaVerificationStatus,
} from '@pingloyal/types';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Transaction } from '../../src/modules/transactions/entities/transaction.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';
import { Integration } from '../../src/modules/integrations/entities/integration.entity';

// Fewer bcrypt rounds in tests for speed (production uses 12)
const TEST_BCRYPT_ROUNDS = 4;

const DEFAULT_TEST_CATEGORIES = [
  { name: 'Food & Groceries', slug: 'food' },
  { name: 'Beverages', slug: 'beverages' },
  { name: 'Baby Products', slug: 'baby_products' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Fashion & Clothing', slug: 'fashion' },
  { name: 'Household Items', slug: 'household' },
  { name: 'Health & Beauty', slug: 'health_beauty' },
  { name: 'Other', slug: 'other' },
];

export interface TestHelperCtx {
  dataSource: DataSource;
  jwtService: JwtService;
  configService: ConfigService;
}

export interface CreateTenantResult {
  tenant: Tenant;
  user: User;
  token: string;
}

/**
 * Creates a tenant with a user, 8 default categories, and a subscription
 * directly via repositories (no HTTP). Returns a signed access token.
 */
export async function createTestTenant(
  ctx: TestHelperCtx,
  overrides: { businessName?: string; email?: string } = {},
): Promise<CreateTenantResult> {
  const { dataSource, jwtService, configService } = ctx;
  const stamp = Date.now();

  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(ProductCategory);
  const subscriptionRepo = dataSource.getRepository(Subscription);

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // ── Step 1: Tenant ──────────────────────────────────────────────────────────
  const tenant = tenantRepo.create({
    businessName: overrides.businessName ?? `Test Store ${stamp}`,
    slug: `test-${stamp}-${crypto.randomUUID().slice(0, 8)}`,
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    mode: TenantMode.NATIVE,
    planTier: PlanTier.STARTER,
    subscriptionStatus: SubscriptionStatus.TRIALING,
    trialEndsAt: trialEnd,
    waVerificationStatus: WaVerificationStatus.PENDING,
    marketingWalletBalance: 0,
  });
  const savedTenant = await tenantRepo.save(tenant);

  // ── Step 2: Owner user ──────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('TestPass123!', TEST_BCRYPT_ROUNDS);
  const user = userRepo.create({
    tenantId: savedTenant.id,
    email: overrides.email ?? `test-owner-${stamp}@example.com`,
    fullName: 'Test Owner',
    hashedPassword,
    role: UserRole.OWNER,
    isActive: true,
  });
  const savedUser = await userRepo.save(user);

  // ── Step 3: 8 default product categories ───────────────────────────────────
  await categoryRepo.save(
    DEFAULT_TEST_CATEGORIES.map((cat) =>
      categoryRepo.create({
        tenantId: savedTenant.id,
        name: cat.name,
        slug: cat.slug,
        isActive: true,
      }),
    ),
  );

  // ── Step 4: Starter subscription ───────────────────────────────────────────
  await subscriptionRepo.save(
    subscriptionRepo.create({
      tenantId: savedTenant.id,
      planTier: PlanTier.STARTER,
      billingCycle: 'monthly',
      currency: 'NGN',
      amount: 8000,
      utilityIncluded: 300,
      utilityUsedThisPeriod: 0,
      utilityOverageRate: 20,
      marketingRate: 130,
      status: SubscriptionStatus.TRIALING,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
    }),
  );

  // ── Step 5: Sign access token ───────────────────────────────────────────────
  const privateKey = Buffer.from(
    configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
    'base64',
  ).toString('utf8');

  const token = jwtService.sign(
    {
      sub: savedUser.id,
      tenantId: savedTenant.id,
      role: savedUser.role,
      planTier: savedTenant.planTier,
    },
    {
      algorithm: 'RS256',
      privateKey,
      expiresIn: '1h',
    } as Parameters<typeof jwtService.sign>[1],
  );

  return { tenant: savedTenant, user: savedUser, token };
}

/**
 * Creates a customer directly via repository.
 * Uses a unique phone number per call.
 */
export async function createTestCustomer(
  ctx: Pick<TestHelperCtx, 'dataSource'>,
  tenantId: string,
  overrides: Partial<
    Pick<Customer, 'phoneE164' | 'fullName' | 'waOptedIn' | 'source'>
  > = {},
): Promise<Customer> {
  const repo = ctx.dataSource.getRepository(Customer);
  const customer = repo.create({
    tenantId,
    fullName: overrides.fullName ?? 'Test Customer',
    phoneE164: overrides.phoneE164 ?? `+234${Date.now().toString().slice(-10)}`,
    waOptedIn: overrides.waOptedIn ?? true,
    source: overrides.source ?? CustomerSource.QR_REGISTRATION,
    isActive: true,
    pointsBalance: 0,
    lifetimePoints: 0,
    totalSpend: 0,
    quarterlySpend: 0,
    purchaseCount: 0,
  });
  return repo.save(customer);
}

/**
 * Creates a transaction directly via repository.
 * Does NOT update customer points — that logic is tested in later modules.
 */
export async function createTestTransaction(
  ctx: Pick<TestHelperCtx, 'dataSource'>,
  tenantId: string,
  customerId: string,
  amount: number,
): Promise<Transaction> {
  const repo = ctx.dataSource.getRepository(Transaction);
  const tx = repo.create({
    tenantId,
    idempotencyKey: crypto.randomUUID(),
    amount,
    pointsEarned: 0,
    pointsBalanceAfter: 0,
    source: 'cashier_app',
  } as Partial<Transaction>);
  // Set customer relation via ID so we don't need the full entity
  (tx as unknown as Record<string, unknown>).customer = { id: customerId };
  return repo.save(tx);
}

/**
 * Returns a supertest wrapper with the Bearer token pre-set on every method.
 */
export function authenticatedRequest(app: INestApplication, token: string) {
  const base = request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = `Bearer ${token}`;
  return {
    get: (path: string) => base.get(path).set('Authorization', auth),
    post: (path: string) => base.post(path).set('Authorization', auth),
    put: (path: string) => base.put(path).set('Authorization', auth),
    patch: (path: string) => base.patch(path).set('Authorization', auth),
    delete: (path: string) => base.delete(path).set('Authorization', auth),
  };
}

/**
 * Deletes all data seeded for the given tenant IDs, in correct FK order.
 * Safe to call multiple times — uses tenant_id scoping throughout.
 */
export async function clearTestData(
  dataSource: DataSource,
  tenantIds: string[],
): Promise<void> {
  if (tenantIds.length === 0) return;

  // Use parameterized query with array binding
  const tables = [
    'transactions',
    'points_ledger',
    'campaign_logs',
    'trigger_logs',
    'wallet_transactions',
    'customers',
    'campaigns',
    'product_categories',
    'subscriptions',
    'users',
    'tier_configs',
    'integrations',
  ];

  for (const table of tables) {
    await dataSource.query(
      `DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
      [tenantIds],
    );
  }

  await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
    tenantIds,
  ]);
}

/**
 * Creates a user with a specific role under an existing tenant.
 */
export async function createTestUser(
  ctx: Pick<TestHelperCtx, 'dataSource' | 'jwtService' | 'configService'>,
  tenantId: string,
  role: UserRole,
  emailSuffix = '',
): Promise<{ user: User; token: string }> {
  const userRepo = ctx.dataSource.getRepository(User);
  const stamp = Date.now();
  const hashedPassword = await bcrypt.hash('TestPass123!', TEST_BCRYPT_ROUNDS);
  const user = await userRepo.save(
    userRepo.create({
      tenantId,
      email: `test-${role}-${stamp}${emailSuffix}@example.com`,
      fullName: `Test ${role}`,
      hashedPassword,
      role,
      isActive: true,
    }),
  );

  const privateKey = Buffer.from(
    ctx.configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
    'base64',
  ).toString('utf8');

  const token = ctx.jwtService.sign(
    { sub: user.id, tenantId, role, planTier: PlanTier.STARTER },
    { algorithm: 'RS256', privateKey, expiresIn: '1h' } as Parameters<
      typeof ctx.jwtService.sign
    >[1],
  );

  return { user, token };
}

/**
 * Creates a draft campaign directly via the DB.
 */
export async function createTestCampaign(
  ctx: Pick<TestHelperCtx, 'dataSource'>,
  tenantId: string,
  overrides: Partial<Campaign> = {},
): Promise<Campaign> {
  const repo = ctx.dataSource.getRepository(Campaign);
  return repo.save(
    repo.create({
      tenantId,
      name: `Test Campaign ${Date.now()}`,
      messageBody: 'Hi {{firstName}}, special offer this weekend!',
      segmentRules: {},
      status: CampaignStatus.DRAFT,
      totalRecipients: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      ...overrides,
    }),
  );
}

/**
 * Creates a webhook integration with a test secret.
 */
export async function createTestIntegration(
  ctx: Pick<TestHelperCtx, 'dataSource'>,
  tenantId: string,
): Promise<Integration> {
  const repo = ctx.dataSource.getRepository(Integration);
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  return repo.save(
    repo.create({
      tenantId,
      connectionType: IntegrationConnectionType.WEBHOOK,
      webhookSecret,
      pollIntervalMins: 15,
      fieldMapping: { phone: 'customer_phone', amount: 'sale_amount' },
      syncStatus: IntegrationSyncStatus.ACTIVE,
    }),
  );
}

/**
 * Sets the marketing wallet balance for a tenant.
 */
export async function setWalletBalance(
  ctx: Pick<TestHelperCtx, 'dataSource'>,
  tenantId: string,
  amount: number,
): Promise<void> {
  await ctx.dataSource.query(
    'UPDATE tenants SET marketing_wallet_balance = $1 WHERE id = $2',
    [amount, tenantId],
  );
}

/**
 * Creates an expired JWT for testing token rejection.
 */
export function createExpiredToken(
  ctx: Pick<TestHelperCtx, 'jwtService' | 'configService'>,
  userId: string,
  tenantId: string,
): string {
  const privateKey = Buffer.from(
    ctx.configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
    'base64',
  ).toString('utf8');
  return ctx.jwtService.sign(
    { sub: userId, tenantId, role: UserRole.OWNER, planTier: PlanTier.STARTER },
    { algorithm: 'RS256', privateKey, expiresIn: '-1s' } as Parameters<
      typeof ctx.jwtService.sign
    >[1],
  );
}

/**
 * Computes HMAC-SHA256 signature in the format Gupshup uses.
 */
export function computeHmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Applies the same global setup as main.ts so test requests behave identically.
 */
export async function bootstrapTestApp(
  app: INestApplication,
): Promise<INestApplication> {
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
  return app;
}

// ── Additional helpers for integration/E2E tests ──────────────────────────────

/**
 * Sets the tenant's WA verification status to VERIFIED with test credentials.
 */
export async function setWaVerified(
  dataSource: DataSource,
  tenantId: string,
  redis?: Redis,
): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  await tenantRepo.update(tenantId, {
    waVerificationStatus: WaVerificationStatus.VERIFIED,
    waVerifiedAt: new Date(),
    gupshupAppId: 'test-gupshup-app',
    gupshupApiKey: encrypt('test-api-key'),
    waPhoneNumber: '+2348099999999',
    waDisplayName: 'Test Store',
  });
  if (redis) {
    await redis.del(`tenant:${tenantId}`).catch(() => null);
    await redis.del(`tenant:full:${tenantId}`).catch(() => null);
  }
}

/**
 * Suspends a tenant's subscription.
 */
export async function suspendTenant(
  dataSource: DataSource,
  tenantId: string,
  redis?: Redis,
): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const subscriptionRepo = dataSource.getRepository(Subscription);
  await subscriptionRepo.update(
    { tenantId },
    { status: SubscriptionStatus.SUSPENDED },
  );
  await tenantRepo.update(tenantId, {
    subscriptionStatus: SubscriptionStatus.SUSPENDED,
  });
  if (redis) {
    await redis.del(`sub:status:${tenantId}`).catch(() => null);
  }
}

/**
 * Reactivates a suspended tenant.
 */
export async function reactivateTenant(
  dataSource: DataSource,
  tenantId: string,
  redis?: Redis,
): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const subscriptionRepo = dataSource.getRepository(Subscription);
  await subscriptionRepo.update(
    { tenantId },
    { status: SubscriptionStatus.ACTIVE },
  );
  await tenantRepo.update(tenantId, {
    subscriptionStatus: SubscriptionStatus.ACTIVE,
  });
  if (redis) {
    await redis.del(`sub:status:${tenantId}`).catch(() => null);
    await redis.del(`tenant:${tenantId}`).catch(() => null);
  }
}

/**
 * Invalidates the subscription cache entry in Redis.
 */
export async function invalidateSubscriptionCache(
  redis: Redis,
  tenantId: string,
): Promise<void> {
  await redis.del(`sub:status:${tenantId}`).catch(() => null);
}

/**
 * Generates a test CSV string with N rows of customer data.
 */
export function generateTestCsv(rows: number): string {
  const header = 'full_name,phone,date_of_birth,consent\n';
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const phone = `0801${String(i).padStart(7, '0')}`;
    lines.push(`Test Customer ${i},${phone},1990-01-01,true`);
  }
  return header + lines.join('\n');
}

/**
 * Gets the current marketing wallet balance for a tenant.
 */
export async function getWalletBalance(
  dataSource: DataSource,
  tenantId: string,
): Promise<number> {
  const rows = await dataSource.query<
    Array<{ marketing_wallet_balance: string }>
  >('SELECT marketing_wallet_balance FROM tenants WHERE id = $1', [tenantId]);
  return Number(rows[0]?.marketing_wallet_balance ?? 0);
}

/**
 * Gets a customer's points ledger entries.
 */
export async function getLedgerEntries(
  dataSource: DataSource,
  customerId: string,
): Promise<Array<{ delta: number; reason: string; balance_after: number }>> {
  return dataSource.query(
    `SELECT delta, reason, balance_after FROM points_ledger
     WHERE customer_id = $1 ORDER BY created_at ASC`,
    [customerId],
  );
}

/**
 * Gets trigger_logs for a specific tenant+customer.
 */
export async function getTriggerLogs(
  dataSource: DataSource,
  tenantId: string,
  customerId: string,
): Promise<Array<{ trigger_type: string; status: string }>> {
  return dataSource.query(
    `SELECT trigger_type, status FROM trigger_logs
     WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at ASC`,
    [tenantId, customerId],
  );
}

/**
 * Counts transactions for a customer.
 */
export async function countTransactions(
  dataSource: DataSource,
  customerId: string,
  tenantId: string,
): Promise<number> {
  const rows = await dataSource.query<[{ count: string }]>(
    'SELECT COUNT(*) AS count FROM transactions WHERE customer_id = $1 AND tenant_id = $2',
    [customerId, tenantId],
  );
  return parseInt(rows[0].count, 10);
}

/**
 * Gets a customer by phone number within a tenant.
 */
export async function getCustomerByPhone(
  dataSource: DataSource,
  phoneE164: string,
  tenantId: string,
): Promise<Customer | null> {
  const repo = dataSource.getRepository(Customer);
  return repo.findOne({ where: { phoneE164, tenantId } });
}

/**
 * Counts customers matching a phone within a tenant.
 */
export async function countCustomersByPhone(
  dataSource: DataSource,
  phoneE164: string,
  tenantId: string,
): Promise<number> {
  const rows = await dataSource.query<[{ count: string }]>(
    'SELECT COUNT(*) AS count FROM customers WHERE phone_e164 = $1 AND tenant_id = $2',
    [phoneE164, tenantId],
  );
  return parseInt(rows[0].count, 10);
}

/**
 * Gets a campaign's logs.
 */
export async function getCampaignLogs(
  dataSource: DataSource,
  campaignId: string,
): Promise<Array<{ status: string }>> {
  return dataSource.query(
    'SELECT status FROM campaign_logs WHERE campaign_id = $1',
    [campaignId],
  );
}
