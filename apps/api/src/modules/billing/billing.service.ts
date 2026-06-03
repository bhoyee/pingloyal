import * as crypto from 'crypto';
import * as Sentry from '@sentry/node';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PlanTier, SubscriptionStatus, TriggerType } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Subscription } from './entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { PLANS, type PlanId } from './plans.config';
import { WalletService } from './wallet.service';
import { UtilityTrackingService } from './utility-tracking.service';

// ── Minimal Stripe interface (avoids nodenext type resolution issues) ─────────
interface StripeCustomer {
  id: string;
  metadata?: Record<string, string>;
}

interface StripeCheckoutSession {
  mode: string;
  url: string | null;
  metadata?: Record<string, string>;
}

interface StripeEvent {
  type: string;
  data: { object: unknown };
}

interface StripeClient {
  customers: {
    create: (params: object) => Promise<StripeCustomer>;
  };
  checkout: {
    sessions: {
      create: (params: object) => Promise<StripeCheckoutSession>;
    };
  };
  webhooks: {
    constructEvent: (
      rawBody: Buffer,
      sig: string,
      secret: string,
    ) => StripeEvent;
  };
}

function createStripeClient(key: string): StripeClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call
  return new (require('stripe'))(key, {
    apiVersion: '2024-12-18.acacia',
  }) as StripeClient;
}

// ── Service ───────────────────────────────────────────────────────────────────

interface PaystackInitResponse {
  status: boolean;
  data: { authorization_url: string; reference: string };
}

interface PaystackEvent {
  event: string;
  data: {
    reference?: string;
    status?: string;
    amount?: number;
    subscription_code?: string;
    customer?: { metadata?: { tenantId?: string } };
    metadata?: {
      type?: string;
      tenantId?: string;
      planId?: string;
      amount?: number;
      initiatedBy?: string;
    };
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: StripeClient | null;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue('wa-messages') private readonly waMessagesQueue: Queue,
    private readonly walletService: WalletService,
    private readonly utilityTrackingService: UtilityTrackingService,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = stripeKey ? createStripeClient(stripeKey) : null;
  }

  // ── GET /billing/plans ────────────────────────────────────────────────────

  getPlans(tenantCurrency: string, currentPlanTier: string) {
    const currency = tenantCurrency as 'NGN' | 'GBP';
    const currencySymbol = currency === 'GBP' ? '£' : '₦';

    const plans = Object.entries(PLANS)
      .filter(([, plan]) => plan.currency === currency)
      .map(([planId, plan]) => ({
        planId,
        planTier: plan.planTier,
        amount: plan.amount,
        amountDisplay: `${currencySymbol}${plan.amount.toLocaleString()}`,
        utilityIncluded: plan.utilityIncluded,
        marketingRate: plan.marketingRate,
        marketingRateDisplay: `${currencySymbol}${plan.marketingRate}/msg`,
        isCurrent: plan.planTier === currentPlanTier,
      }));

    return { currency, plans };
  }

  // ── GET /billing/status ───────────────────────────────────────────────────

  async getStatus(tenantId: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const sub = await this.subscriptionRepo.findOne({ where: { tenantId } });

    const now = new Date();
    const daysRemaining = sub?.currentPeriodEnd
      ? Math.max(
          0,
          Math.ceil(
            (sub.currentPeriodEnd.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    const trialDaysRemaining = tenant?.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(tenant.trialEndsAt).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    const utilityUsed = sub?.utilityUsedThisPeriod ?? 0;
    const utilityIncluded = sub?.utilityIncluded ?? 300;

    return {
      status: tenant?.subscriptionStatus ?? 'trialing',
      planTier: tenant?.planTier ?? 'starter',
      currency: tenant?.currency ?? 'NGN',
      amount: sub?.amount ?? 0,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      daysRemaining,
      trialEndsAt: tenant?.trialEndsAt ?? null,
      trialDaysRemaining,
      utilityIncluded,
      utilityUsedThisPeriod: utilityUsed,
      utilityRemainingThisPeriod: Math.max(0, utilityIncluded - utilityUsed),
      utilityOverageRate: sub?.utilityOverageRate ?? 20,
      marketingWalletBalance: tenant?.marketingWalletBalance ?? 0,
      marketingRate: sub?.marketingRate ?? 130,
      paystackManageUrl: tenant?.paystackCustomerId
        ? `https://paystack.com/manage/${tenant.paystackCustomerId}`
        : null,
      stripeManageUrl: tenant?.stripeCustomerId
        ? `https://billing.stripe.com/p/login`
        : null,
    };
  }

  // ── POST /billing/subscribe ───────────────────────────────────────────────

  async subscribe(
    tenantId: string,
    planId: string,
    ownerUserId: string,
  ): Promise<{ authorizationUrl?: string; checkoutUrl?: string }> {
    if (!(planId in PLANS)) {
      throw new BadRequestException(`Invalid plan: ${planId}`);
    }
    const typedPlanId = planId as PlanId;
    const plan = PLANS[typedPlanId];

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    if (plan.currency !== tenant.currency) {
      throw new BadRequestException(
        `Plan currency ${plan.currency} does not match tenant currency ${tenant.currency}`,
      );
    }

    const owner = await this.userRepo.findOne({ where: { id: ownerUserId } });
    if (!owner) throw new BadRequestException('Owner not found');

    if (plan.currency === 'NGN') {
      return this.subscribePaystack(tenant, typedPlanId, plan, owner);
    }
    return this.subscribeStripe(tenant, typedPlanId, plan, owner);
  }

  private async subscribePaystack(
    tenant: Tenant,
    planId: PlanId,
    plan: (typeof PLANS)[PlanId],
    owner: User,
  ): Promise<{ authorizationUrl: string }> {
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    if (!tenant.paystackCustomerId) {
      const custRes = await fetch('https://api.paystack.co/customer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: owner.email,
          first_name: owner.fullName.split(' ')[0],
          last_name: owner.fullName.split(' ').slice(1).join(' ') || '',
        }),
      });
      const custData = (await custRes.json()) as {
        data: { customer_code: string };
      };
      await this.tenantRepo.update(tenant.id, {
        paystackCustomerId: custData.data.customer_code,
      });
      tenant.paystackCustomerId = custData.data.customer_code;
    }

    const planCode =
      'paystackPlanCode' in plan ? plan.paystackPlanCode : undefined;
    const initRes = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: owner.email,
          amount: plan.amount * 100,
          plan: planCode,
          callback_url: `${frontendUrl}/billing/success`,
          metadata: { tenantId: tenant.id, planId, type: 'subscription' },
        }),
      },
    );

    const initData = (await initRes.json()) as PaystackInitResponse;
    const { authorization_url, reference } = initData.data;

    await this.redis.set(
      `billing:paystack:pending:${reference}`,
      JSON.stringify({ tenantId: tenant.id, planId }),
      'EX',
      3600,
    );

    return { authorizationUrl: authorization_url };
  }

  private async subscribeStripe(
    tenant: Tenant,
    planId: PlanId,
    plan: (typeof PLANS)[PlanId],
    owner: User,
  ): Promise<{ checkoutUrl: string }> {
    if (!this.stripe) throw new BadRequestException('Stripe not configured');

    if (!tenant.stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: owner.email,
        name: tenant.businessName,
        metadata: { tenantId: tenant.id },
      });
      await this.tenantRepo.update(tenant.id, {
        stripeCustomerId: customer.id,
      });
      tenant.stripeCustomerId = customer.id;
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const priceId = 'stripePriceId' in plan ? plan.stripePriceId : undefined;

    const session = await this.stripe.checkout.sessions.create({
      customer: tenant.stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing`,
      metadata: { tenantId: tenant.id, planId },
    });

    return { checkoutUrl: session.url ?? '' };
  }

  // ── Paystack webhook ──────────────────────────────────────────────────────

  async handlePaystackWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<void> {
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const hash = crypto
      .createHmac('sha512', paystackKey)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    if (
      sigBuffer.length !== hashBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, hashBuffer)
    ) {
      throw new Error('Invalid Paystack signature');
    }

    const event = JSON.parse(rawBody.toString()) as PaystackEvent;
    this.logger.log(`Paystack event: ${event.event}`);

    try {
      await this.processPaystackEvent(event);
    } catch (err) {
      this.logger.error(`Paystack event processing error: ${String(err)}`);
    }
  }

  private async processPaystackEvent(event: PaystackEvent): Promise<void> {
    switch (event.event) {
      case 'charge.success': {
        const meta = event.data.metadata;
        const ref = event.data.reference ?? '';

        // ── Wallet top-up ──
        if (meta?.type === 'wallet_topup') {
          const pendingKey = `billing:wallet:pending:${ref}`;
          const pending = await this.redis.get(pendingKey);

          if (!pending) {
            this.logger.warn(
              `Wallet topup webhook: no pending record for ref ${ref}`,
            );
            return;
          }

          const pendingData = JSON.parse(pending) as {
            tenantId: string;
            amount: number;
          };

          const paystackNaira = (event.data.amount ?? 0) / 100;
          if (Math.abs(paystackNaira - pendingData.amount) > 1) {
            this.logger.error(
              `Wallet topup amount mismatch: expected ₦${pendingData.amount}, ` +
                `got ₦${paystackNaira} for ref ${ref}`,
            );
            Sentry.captureMessage('Wallet topup amount mismatch', {
              extra: { reference: ref, pendingData, paystackNaira },
            });
            return;
          }

          const newBalance = await this.walletService.topupWallet(
            pendingData.tenantId,
            pendingData.amount,
            ref,
          );

          await this.redis.del(pendingKey);

          this.logger.log(
            `Wallet topped up: tenant=${pendingData.tenantId} ` +
              `amount=₦${pendingData.amount} newBalance=₦${newBalance} ref=${ref}`,
          );
          return;
        }

        // ── Subscription payment ──
        if (meta?.type !== 'subscription' || !meta.tenantId || !meta.planId)
          return;
        const cached = await this.redis.get(`billing:paystack:pending:${ref}`);
        if (!cached) {
          this.logger.warn(
            `Paystack charge.success: no pending reference for ${ref}`,
          );
          return;
        }
        const { tenantId, planId } = JSON.parse(cached) as {
          tenantId: string;
          planId: PlanId;
        };
        await this.activateSubscription(tenantId, planId);
        await this.redis.del(`billing:paystack:pending:${ref}`);
        break;
      }

      case 'subscription.create': {
        if (event.data.status === 'active') {
          const tenantId = event.data.customer?.metadata?.tenantId;
          if (tenantId) {
            await this.subscriptionRepo.update(
              { tenantId },
              { paystackSubCode: event.data.subscription_code },
            );
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const tenantId = event.data.customer?.metadata?.tenantId;
        if (tenantId) {
          await this.subscriptionRepo.update(
            { tenantId },
            { status: SubscriptionStatus.PAST_DUE },
          );
        }
        break;
      }

      case 'subscription.disable': {
        const tenantId = event.data.customer?.metadata?.tenantId;
        if (tenantId) {
          await this.suspendTenant(tenantId);
        }
        break;
      }
    }
  }

  // ── Stripe webhook ────────────────────────────────────────────────────────

  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe) return;

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) return;

    let event: StripeEvent;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      throw new BadRequestException(
        `Stripe webhook verification failed: ${String(err)}`,
      );
    }

    this.logger.log(`Stripe event: ${event.type}`);

    try {
      await this.processStripeEvent(event);
    } catch (err) {
      this.logger.error(`Stripe event processing error: ${String(err)}`);
    }
  }

  private async processStripeEvent(event: StripeEvent): Promise<void> {
    const obj = event.data.object as Record<string, unknown>;

    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') return;
        const meta = obj.metadata as Record<string, string> | undefined;
        const tenantId = meta?.tenantId;
        const planId = meta?.planId as PlanId | undefined;
        if (tenantId && planId) {
          await this.activateSubscription(tenantId, planId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const subId =
          typeof obj.subscription === 'string'
            ? obj.subscription
            : (obj.subscription as { id?: string } | null)?.id;
        if (subId) {
          await this.subscriptionRepo.update(
            { stripeSubId: subId },
            { status: SubscriptionStatus.PAST_DUE },
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const customer = obj.customer;
        const meta =
          typeof customer === 'object' && customer !== null
            ? ((customer as Record<string, unknown>).metadata as
                | Record<string, string>
                | undefined)
            : undefined;
        const tenantId = meta?.tenantId;
        if (tenantId) {
          await this.suspendTenant(tenantId);
        }
        break;
      }
    }
  }

  // ── activateSubscription ──────────────────────────────────────────────────

  async activateSubscription(tenantId: string, planId: PlanId): Promise<void> {
    const plan = PLANS[planId];
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const existing = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });

    const subData = {
      tenantId,
      planTier: plan.planTier as PlanTier,
      currency: plan.currency,
      amount: plan.amount,
      utilityIncluded: plan.utilityIncluded,
      utilityUsedThisPeriod: 0,
      utilityOverageRate: plan.utilityOverageRate,
      marketingRate: plan.marketingRate,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      gracePeriodStartedAt: null,
    };

    if (existing) {
      await this.subscriptionRepo.save(Object.assign(existing, subData));
    } else {
      await this.subscriptionRepo.save(this.subscriptionRepo.create(subData));
    }

    await this.tenantRepo.update(tenantId, {
      planTier: plan.planTier as PlanTier,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    });

    await this.utilityTrackingService.resetUsageForNewPeriod(tenantId);
    await this.invalidateTenantCache(tenantId);
    this.logger.log(
      `Subscription activated: tenantId=${tenantId} plan=${planId}`,
    );
  }

  // ── Trial expiry cron ─────────────────────────────────────────────────────

  @Cron('0 1 * * *')
  async checkExpiredTrials(): Promise<void> {
    const expired: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM tenants
       WHERE subscription_status = 'trialing'
         AND trial_ends_at < NOW()`,
    );

    for (const { id } of expired) {
      await this.suspendTenant(id);
      this.logger.log(`Trial expired for tenant ${id}`);

      const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
      void this.waMessagesQueue
        .add('send', {
          type: TriggerType.WALLET_ZERO,
          tenantId: id,
          customerId: null,
          data: { topUpUrl: `${frontendUrl}/billing` },
        })
        .catch((err: unknown) =>
          this.logger.error(`Failed to queue trial expiry WA: ${String(err)}`),
        );
    }

    if (expired.length > 0) {
      this.logger.log(
        `Trial expiry check: suspended ${expired.length} tenant(s)`,
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async suspendTenant(tenantId: string): Promise<void> {
    await this.subscriptionRepo.update(
      { tenantId },
      { status: SubscriptionStatus.SUSPENDED },
    );
    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
    });
    await this.invalidateTenantCache(tenantId);
  }

  private async invalidateTenantCache(tenantId: string): Promise<void> {
    await Promise.all([
      this.redis.del(`tenant:${tenantId}`),
      this.redis.del(`tenant:full:${tenantId}`),
      this.redis.del(`tenant:sub:${tenantId}`),
      this.redis.del(`dashboard:summary:${tenantId}`),
      this.redis.del(`sub:status:${tenantId}`),
    ]);
  }
}
