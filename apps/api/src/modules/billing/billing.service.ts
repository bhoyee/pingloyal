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
import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PlanTier, SubscriptionStatus, TriggerType } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Subscription } from './entities/subscription.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import {
  PLANS,
  PAYSTACK_VERIFICATION_CHARGE_NAIRA,
  type PlanId,
} from './plans.config';
import { WalletService } from './wallet.service';
import { UtilityTrackingService } from './utility-tracking.service';

// ── Minimal Stripe interface (avoids nodenext type resolution issues) ─────────
interface StripeCustomer {
  id: string;
  metadata?: Record<string, string>;
}

interface StripeSubscriptionRef {
  id: string;
  trial_end?: number | null;
}

interface StripeCheckoutSession {
  mode: string;
  url: string | null;
  metadata?: Record<string, string>;
  subscription?: StripeSubscriptionRef | string | null;
}

interface StripeEvent {
  id: string;
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
  subscriptions: {
    update: (id: string, params: object) => Promise<unknown>;
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
    id?: number;
    reference?: string;
    status?: string;
    amount?: number;
    subscription_code?: string;
    customer?: { metadata?: { tenantId?: string } };
    authorization?: { authorization_code?: string };
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
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
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

  private async ensurePaystackCustomer(
    tenant: Tenant,
    owner: User,
  ): Promise<string> {
    if (tenant.paystackCustomerId) return tenant.paystackCustomerId;

    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
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
    return custData.data.customer_code;
  }

  private async ensureStripeCustomer(
    tenant: Tenant,
    owner: User,
  ): Promise<string> {
    if (tenant.stripeCustomerId) return tenant.stripeCustomerId;
    if (!this.stripe) throw new BadRequestException('Stripe not configured');

    const customer = await this.stripe.customers.create({
      email: owner.email,
      name: tenant.businessName,
      metadata: { tenantId: tenant.id },
    });
    await this.tenantRepo.update(tenant.id, {
      stripeCustomerId: customer.id,
    });
    tenant.stripeCustomerId = customer.id;
    return customer.id;
  }

  private async subscribePaystack(
    tenant: Tenant,
    planId: PlanId,
    plan: (typeof PLANS)[PlanId],
    owner: User,
  ): Promise<{ authorizationUrl: string }> {
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    await this.ensurePaystackCustomer(tenant, owner);

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

    await this.ensureStripeCustomer(tenant, owner);

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

  // ── POST /billing/start-trial ─────────────────────────────────────────────

  async startTrial(
    tenantId: string,
    ownerUserId: string,
  ): Promise<{ authorizationUrl?: string; checkoutUrl?: string }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    const sub = await this.subscriptionRepo.findOne({ where: { tenantId } });
    if (!sub || sub.status !== SubscriptionStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Trial already started or subscription is no longer pending payment',
      );
    }

    const owner = await this.userRepo.findOne({ where: { id: ownerUserId } });
    if (!owner) throw new BadRequestException('Owner not found');

    const planId =
      `${tenant.planTier}_${tenant.currency.toLowerCase()}` as PlanId;
    if (!(planId in PLANS)) {
      throw new BadRequestException(`No plan available for ${planId}`);
    }

    if (tenant.currency === 'NGN') {
      return this.startTrialPaystack(tenant, planId, owner);
    }
    return this.startTrialStripe(tenant, planId, owner);
  }

  private async startTrialPaystack(
    tenant: Tenant,
    planId: PlanId,
    owner: User,
  ): Promise<{ authorizationUrl: string }> {
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    await this.ensurePaystackCustomer(tenant, owner);

    // Card verification only — a small refundable charge, never the plan
    // amount. Paystack has no true $0 authorization, so this is the standard
    // workaround: charge a small amount to capture a reusable authorization
    // code, then refund it server-side once the webhook confirms the charge.
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
          amount: PAYSTACK_VERIFICATION_CHARGE_NAIRA * 100,
          callback_url: `${frontendUrl}/billing/start-trial?started=success`,
          metadata: {
            tenantId: tenant.id,
            planId,
            type: 'trial_verification',
          },
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

  private async startTrialStripe(
    tenant: Tenant,
    planId: PlanId,
    owner: User,
  ): Promise<{ checkoutUrl: string }> {
    if (!this.stripe) throw new BadRequestException('Stripe not configured');

    await this.ensureStripeCustomer(tenant, owner);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const plan = PLANS[planId];
    const priceId = 'stripePriceId' in plan ? plan.stripePriceId : undefined;

    const session = await this.stripe.checkout.sessions.create({
      customer: tenant.stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Required — otherwise Stripe may skip card collection for a session
      // with nothing due today, which would defeat "card required".
      payment_method_collection: 'always',
      subscription_data: { trial_period_days: 7 },
      success_url: `${frontendUrl}/billing/start-trial?started=success`,
      cancel_url: `${frontendUrl}/billing/start-trial`,
      metadata: { tenantId: tenant.id, planId, type: 'trial_start' },
      expand: ['subscription'],
    });

    return { checkoutUrl: session.url ?? '' };
  }

  // ── POST /billing/cancel-trial ────────────────────────────────────────────

  async cancelTrial(tenantId: string): Promise<{ message: string }> {
    const sub = await this.subscriptionRepo.findOne({ where: { tenantId } });
    if (!sub) throw new BadRequestException('Subscription not found');

    if (
      sub.status !== SubscriptionStatus.PENDING_PAYMENT &&
      sub.status !== SubscriptionStatus.TRIALING
    ) {
      throw new BadRequestException(
        'Trial cannot be cancelled from its current state',
      );
    }

    await this.subscriptionRepo.update(sub.id, { cancelAtPeriodEnd: true });

    if (sub.stripeSubId && this.stripe) {
      await this.stripe.subscriptions.update(sub.stripeSubId, {
        cancel_at_period_end: true,
      });
    }

    return {
      message:
        'Your trial will not be charged. You can subscribe again any time.',
    };
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

    const eventId = this.extractPaystackEventId(event);
    const shouldProcess = await this.recordWebhookEventOrSkip(
      'paystack',
      eventId,
      event.event,
    );
    if (!shouldProcess) return;

    try {
      await this.processPaystackEvent(event);
    } catch (err) {
      this.logger.error(`Paystack event processing error: ${String(err)}`);
    }
  }

  // Paystack payloads have no top-level unique event id (unlike Stripe's
  // event.id). Transaction-bearing events carry a stable numeric id at
  // data.id; events with no transaction (subscription.create/disable) fall
  // back to a deterministic composite key.
  private extractPaystackEventId(event: PaystackEvent): string {
    if (event.data.id !== undefined) return String(event.data.id);
    return `${event.event}:${event.data.subscription_code ?? event.data.reference ?? ''}:${event.data.status ?? ''}`;
  }

  private async recordWebhookEventOrSkip(
    provider: string,
    eventId: string,
    eventType: string,
  ): Promise<boolean> {
    const result = await this.webhookEventRepo
      .createQueryBuilder()
      .insert()
      .into(WebhookEvent)
      .values({ provider, eventId, eventType })
      .orIgnore()
      .returning('id')
      .execute();

    const insertedRows: unknown[] = Array.isArray(result.raw) ? result.raw : [];
    if (insertedRows.length === 0) {
      this.logger.warn(
        `Duplicate webhook event skipped: provider=${provider} eventId=${eventId} type=${eventType}`,
      );
      return false;
    }
    return true;
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

        // ── Trial card verification (small refundable charge) ──
        if (meta?.type === 'trial_verification') {
          await this.handleTrialVerificationCharge(event, ref);
          return;
        }

        // ── Subscription payment — also used for the day-7/dunning
        //    charge_authorization conversion charge, which is tagged with
        //    this same metadata.type so it reuses this exact path. ──
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
          await this.markPastDue(tenantId);
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

    const shouldProcess = await this.recordWebhookEventOrSkip(
      'stripe',
      event.id,
      event.type,
    );
    if (!shouldProcess) return;

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
        if (!tenantId || !planId) return;

        if (meta?.type === 'trial_start') {
          await this.handleTrialStartCheckout(obj, tenantId);
          break;
        }

        await this.activateSubscription(tenantId, planId);
        break;
      }

      case 'invoice.payment_failed': {
        const subId = this.extractStripeSubscriptionId(obj.subscription);
        if (subId) {
          const sub = await this.subscriptionRepo.findOne({
            where: { stripeSubId: subId },
          });
          if (sub) await this.markPastDue(sub.tenantId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const subId = this.extractStripeSubscriptionId(obj.subscription);
        if (!subId) break;
        const sub = await this.subscriptionRepo.findOne({
          where: { stripeSubId: subId },
        });
        if (!sub) break;
        const planId =
          `${sub.planTier}_${sub.currency.toLowerCase()}` as PlanId;
        await this.activateSubscription(sub.tenantId, planId);
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
          const sub = await this.subscriptionRepo.findOne({
            where: { tenantId },
          });
          if (sub?.cancelAtPeriodEnd) {
            await this.cancelTenant(tenantId);
          } else {
            await this.suspendTenant(tenantId);
          }
        }
        break;
      }
    }
  }

  private extractStripeSubscriptionId(
    subscription: unknown,
  ): string | undefined {
    if (typeof subscription === 'string') return subscription;
    if (typeof subscription === 'object' && subscription !== null) {
      return (subscription as { id?: string }).id;
    }
    return undefined;
  }

  private async handleTrialStartCheckout(
    obj: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const subRef = obj.subscription as StripeSubscriptionRef | string | null;
    const stripeSubId =
      typeof subRef === 'string' ? subRef : (subRef?.id ?? null);
    const trialEndUnix =
      typeof subRef === 'object' && subRef !== null
        ? subRef.trial_end
        : undefined;
    const trialEndsAt = trialEndUnix
      ? new Date(trialEndUnix * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    await this.subscriptionRepo.update(
      { tenantId },
      {
        status: SubscriptionStatus.TRIALING,
        stripeSubId,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    );
    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.TRIALING,
      trialEndsAt,
    });
    await this.invalidateTenantCache(tenantId);
    this.logger.log(
      `Trial started (Stripe) for tenant ${tenantId}, trialEndsAt=${trialEndsAt.toISOString()}`,
    );
  }

  private async handleTrialVerificationCharge(
    event: PaystackEvent,
    ref: string,
  ): Promise<void> {
    const cached = await this.redis.get(`billing:paystack:pending:${ref}`);
    if (!cached) {
      this.logger.warn(
        `Trial verification webhook: no pending reference for ${ref}`,
      );
      return;
    }
    const { tenantId } = JSON.parse(cached) as {
      tenantId: string;
      planId: PlanId;
    };

    const chargedNaira = (event.data.amount ?? 0) / 100;
    if (chargedNaira !== PAYSTACK_VERIFICATION_CHARGE_NAIRA) {
      this.logger.error(
        `Trial verification amount mismatch: expected ₦${PAYSTACK_VERIFICATION_CHARGE_NAIRA}, ` +
          `got ₦${chargedNaira} for ref ${ref}`,
      );
      Sentry.captureMessage('Trial verification amount mismatch', {
        extra: { reference: ref, chargedNaira },
      });
      return;
    }

    const authCode = event.data.authorization?.authorization_code;
    if (!authCode) {
      this.logger.error(
        `Trial verification charge.success had no authorization code for ref ${ref}`,
      );
      Sentry.captureMessage('Trial verification missing authorization code', {
        extra: { reference: ref },
      });
      return;
    }

    await this.subscriptionRepo.update(
      { tenantId },
      { paystackAuthorizationCode: authCode },
    );

    // Refund the verification charge immediately. A failed refund doesn't
    // block trial activation — the card is already validated either way,
    // and this becomes a support/ops follow-up, not a security incident.
    try {
      const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
      await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction: ref }),
      });
    } catch (err) {
      this.logger.error(
        `Failed to refund trial verification charge ref=${ref}: ${String(err)}`,
      );
      Sentry.captureMessage('Failed to refund trial verification charge', {
        extra: { reference: ref, err: String(err) },
      });
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await this.subscriptionRepo.update(
      { tenantId },
      {
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    );
    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.TRIALING,
      trialEndsAt,
    });
    await this.invalidateTenantCache(tenantId);
    await this.redis.del(`billing:paystack:pending:${ref}`);

    this.logger.log(
      `Trial started (Paystack) for tenant ${tenantId}, trialEndsAt=${trialEndsAt.toISOString()}`,
    );
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

  // ── Charge attempt — used by both the day-7 conversion cron and the
  //    dunning retry cron. Never sets status to ACTIVE/PAST_DUE on the
  //    success path itself — the resulting charge.success webhook is the
  //    single source of truth for activation, consistent with every other
  //    payment flow in this service. ──────────────────────────────────────

  async attemptPaystackCharge(params: {
    tenantId: string;
    subscriptionId: string;
    planId: PlanId;
    authorizationCode: string;
    amount: number;
    ownerEmail: string;
  }): Promise<void> {
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');

    await this.dataSource.query(
      `UPDATE subscriptions
       SET trial_charge_attempts = trial_charge_attempts + 1,
           last_charge_attempt_at = NOW()
       WHERE id = $1`,
      [params.subscriptionId],
    );

    let reference: string | undefined;
    try {
      const res = await fetch(
        'https://api.paystack.co/transaction/charge_authorization',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${paystackKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authorization_code: params.authorizationCode,
            email: params.ownerEmail,
            amount: params.amount * 100,
            metadata: {
              tenantId: params.tenantId,
              planId: params.planId,
              type: 'subscription',
            },
          }),
        },
      );
      const data = (await res.json()) as {
        status: boolean;
        data?: { reference?: string };
      };
      if (!data.status || !data.data?.reference) {
        throw new Error('Paystack charge_authorization request failed');
      }
      reference = data.data.reference;
    } catch (err) {
      this.logger.error(
        `Paystack charge_authorization failed for tenant ${params.tenantId}: ${String(err)}`,
      );
      await this.markPastDue(params.tenantId);
      return;
    }

    // No preceding /transaction/initialize call exists for charge_authorization,
    // so there's no pending Redis key yet for the existing 'subscription'
    // charge.success branch to match against — write it here instead, using
    // the reference Paystack just returned synchronously.
    await this.redis.set(
      `billing:paystack:pending:${reference}`,
      JSON.stringify({ tenantId: params.tenantId, planId: params.planId }),
      'EX',
      3600,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async markPastDue(tenantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE subscriptions
       SET status = $1, grace_period_started_at = COALESCE(grace_period_started_at, NOW())
       WHERE tenant_id = $2`,
      [SubscriptionStatus.PAST_DUE, tenantId],
    );
    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
    });
    await this.invalidateTenantCache(tenantId);
  }

  async suspendTenant(tenantId: string): Promise<void> {
    await this.subscriptionRepo.update(
      { tenantId },
      { status: SubscriptionStatus.SUSPENDED },
    );
    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
    });
    await this.invalidateTenantCache(tenantId);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    void this.waMessagesQueue
      .add('send', {
        type: TriggerType.WALLET_ZERO,
        tenantId,
        customerId: null,
        data: { topUpUrl: `${frontendUrl}/billing` },
      })
      .catch((err: unknown) =>
        this.logger.error(`Failed to queue suspension WA: ${String(err)}`),
      );
  }

  async cancelTenant(tenantId: string): Promise<void> {
    await this.subscriptionRepo.update(
      { tenantId },
      { status: SubscriptionStatus.CANCELLED },
    );
    await this.tenantRepo.update(tenantId, {
      subscriptionStatus: SubscriptionStatus.CANCELLED,
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
