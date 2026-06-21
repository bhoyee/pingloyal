import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import type Redis from 'ioredis';
import {
  PlanTier,
  SubscriptionStatus,
  TenantMode,
  UserRole,
  WaVerificationStatus,
} from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { MailerService } from '../../common/mailer/mailer.service';
import { AuthService, type AuthTokens } from '../auth/auth.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { PLANS, type PlanId } from '../billing/plans.config';
import { SignupRegisterDto, Country } from './dto/signup-register.dto';
import { SignupVerifyEmailDto } from './dto/signup-verify-email.dto';
import { SignupResendCodeDto } from './dto/signup-resend-code.dto';
import { createStripeClient, type StripeClient } from './signup-stripe-client';

const DEFAULT_CATEGORIES = [
  { name: 'Food & Groceries', slug: 'food' },
  { name: 'Beverages', slug: 'beverages' },
  { name: 'Baby Products', slug: 'baby_products' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Fashion & Clothing', slug: 'fashion' },
  { name: 'Household Items', slug: 'household' },
  { name: 'Health & Beauty', slug: 'health_beauty' },
  { name: 'Other', slug: 'other' },
];

const BCRYPT_ROUNDS = 12;
const VERIFICATION_EXPIRY_HOURS = 24;
const SIGNUP_INITIAL_TTL_SECONDS = VERIFICATION_EXPIRY_HOURS * 3600;
const SIGNUP_MAX_TTL_SECONDS = 48 * 3600;
const SIGNUP_TRIAL_DAYS = 14;
const PAYSTACK_VERIFICATION_CHARGE_NAIRA = 50;
const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PendingSignupRecord {
  email: string;
  hashedPassword: string;
  businessName: string;
  fullName: string;
  country: Country;
  currency: 'NGN' | 'GBP';
  codeHash: string;
  codeExpiry: number;
  emailVerified: boolean;
  planTier: string | null;
  browserSecret: string;
  createdAt: number;
}

interface PaystackInitResponse {
  status: boolean;
  data: { authorization_url: string; reference: string };
}

export interface CompleteSignupParams {
  signupToken: string;
  planTier: string;
  paystackAuthorizationCode?: string;
  paystackCustomerId?: string;
  stripeSubId?: string;
  stripeCustomerId?: string;
  /** Stripe-supplied trial end date; Paystack computes now+14d internally when omitted */
  trialEndsAt?: Date;
}

export type SignupStatusResponse =
  | { status: 'awaiting_verification' | 'awaiting_payment' | 'expired' }
  | ({
      status: 'completed';
      user: { id: string; email: string; fullName: string; role: UserRole };
      tenant: {
        id: string;
        businessName: string;
        slug: string;
        planTier: PlanTier;
      };
    } & AuthTokens);

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);
  private readonly stripe: StripeClient | null;

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly authService: AuthService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = stripeKey ? createStripeClient(stripeKey) : null;
  }

  // ── POST /signup/register ─────────────────────────────────────────────────

  async register(dto: SignupRegisterDto): Promise<{
    signupToken: string;
    email: string;
    browserSecret: string;
    devCode?: string;
  }> {
    const email = this.normalizeEmail(dto.email);
    const isNG = dto.country === Country.NG;
    const currency: 'NGN' | 'GBP' = isNG ? 'NGN' : 'GBP';

    const existingUser = await this.userRepo.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const { code, hashedCode } = this.generateVerificationCode();
    const signupToken = crypto.randomBytes(32).toString('hex');
    const browserSecret = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    const record: PendingSignupRecord = {
      email,
      hashedPassword,
      businessName: dto.businessName,
      fullName: dto.fullName,
      country: dto.country,
      currency,
      codeHash: hashedCode,
      codeExpiry: now + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
      emailVerified: false,
      planTier: null,
      browserSecret,
      createdAt: now,
    };

    await this.savePending(signupToken, record);

    let emailSent = false;
    try {
      await this.mailer.sendWelcomeVerification({
        to: email,
        name: dto.fullName,
        businessName: dto.businessName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to send welcome email to ${email}: ${String(err)}`,
      );
    }

    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    const devCode = isDev && !emailSent ? code : undefined;

    return {
      signupToken,
      email,
      browserSecret,
      ...(devCode ? { devCode } : {}),
    };
  }

  // ── POST /signup/verify-email ─────────────────────────────────────────────

  async verifyEmail(
    dto: SignupVerifyEmailDto,
    browserSecret: string | undefined,
  ): Promise<{ verified: true }> {
    const record = await this.loadPending(dto.signupToken);
    if (!record) {
      throw new BadRequestException('Invalid or expired signup session');
    }
    this.assertBrowserSecret(record, browserSecret);

    if (record.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    if (record.codeExpiry < Date.now()) {
      throw new BadRequestException(
        'Verification code has expired — please request a new one',
      );
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(dto.code)
      .digest('hex');
    if (incomingHash !== record.codeHash) {
      throw new BadRequestException('Invalid verification code');
    }

    record.emailVerified = true;
    await this.savePending(dto.signupToken, record);

    return { verified: true };
  }

  // ── POST /signup/resend-code ──────────────────────────────────────────────

  async resendCode(
    dto: SignupResendCodeDto,
    browserSecret: string | undefined,
  ): Promise<{ message: string; devCode?: string }> {
    const record = await this.loadPending(dto.signupToken);

    // Generic response to prevent signup-session enumeration
    if (!record || record.emailVerified) {
      return {
        message:
          'If the signup session is valid and unverified, a new code has been sent',
      };
    }
    this.assertBrowserSecret(record, browserSecret);

    const { code, hashedCode } = this.generateVerificationCode();
    record.codeHash = hashedCode;
    record.codeExpiry = Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000;
    await this.savePending(dto.signupToken, record);

    let emailSent = false;
    try {
      await this.mailer.sendVerificationCode({
        to: record.email,
        name: record.fullName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to resend signup verification to ${record.email}: ${String(err)}`,
      );
    }

    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    const devCode = isDev && !emailSent ? code : undefined;

    return {
      message:
        'If the signup session is valid and unverified, a new code has been sent',
      ...(devCode ? { devCode } : {}),
    };
  }

  // ── GET /signup/:token/plans ───────────────────────────────────────────────

  async getPlans(
    token: string,
    browserSecret: string | undefined,
  ): Promise<{ currency: string; plans: unknown[] }> {
    const record = await this.loadPending(token);
    if (!record) {
      throw new BadRequestException('Invalid or expired signup session');
    }
    this.assertBrowserSecret(record, browserSecret);
    if (!record.emailVerified) {
      throw new BadRequestException(
        'Email must be verified before selecting a plan',
      );
    }

    const currencySymbol = record.currency === 'GBP' ? '£' : '₦';
    const plans = Object.entries(PLANS)
      .filter(([, plan]) => plan.currency === record.currency)
      .map(([planId, plan]) => ({
        planId,
        planTier: plan.planTier,
        amount: plan.amount,
        amountDisplay: `${currencySymbol}${plan.amount.toLocaleString()}`,
        utilityIncluded: plan.utilityIncluded,
        marketingRate: plan.marketingRate,
        marketingRateDisplay: `${currencySymbol}${plan.marketingRate}/msg`,
      }));

    return { currency: record.currency, plans };
  }

  // ── POST /signup/:token/start-trial ───────────────────────────────────────

  async startTrial(
    token: string,
    browserSecret: string | undefined,
    planTier: string,
  ): Promise<{ authorizationUrl?: string; checkoutUrl?: string }> {
    const record = await this.loadPending(token);
    if (!record) {
      throw new BadRequestException('Invalid or expired signup session');
    }
    this.assertBrowserSecret(record, browserSecret);
    if (!record.emailVerified) {
      throw new BadRequestException(
        'Email must be verified before selecting a plan',
      );
    }

    const planId = `${planTier}_${record.currency.toLowerCase()}` as PlanId;
    if (!(planId in PLANS)) {
      throw new BadRequestException(
        `No plan available for ${planTier}/${record.currency}`,
      );
    }

    record.planTier = planTier;
    await this.savePending(token, record);

    if (record.currency === 'NGN') {
      return this.startTrialPaystack(token, record);
    }
    return this.startTrialStripe(token, record, planId);
  }

  private async startTrialPaystack(
    token: string,
    record: PendingSignupRecord,
  ): Promise<{ authorizationUrl: string }> {
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    // Card verification only — a small refundable charge, never the plan
    // amount. Mirrors the same Paystack-has-no-true-$0-authorization
    // workaround used elsewhere in billing: charge a small amount to capture
    // a reusable authorization code, then refund once the webhook confirms it.
    const initRes = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: record.email,
          amount: PAYSTACK_VERIFICATION_CHARGE_NAIRA * 100,
          callback_url: `${frontendUrl}/signup-complete?token=${token}`,
          metadata: {
            signupToken: token,
            planTier: record.planTier,
            type: 'signup_trial_verification',
          },
        }),
      },
    );

    const initData = (await initRes.json()) as PaystackInitResponse;
    const { authorization_url, reference } = initData.data;

    await this.redis.set(
      `billing:paystack:pending:${reference}`,
      JSON.stringify({ signupToken: token, planTier: record.planTier }),
      'EX',
      3600,
    );

    return { authorizationUrl: authorization_url };
  }

  private async startTrialStripe(
    token: string,
    record: PendingSignupRecord,
    planId: PlanId,
  ): Promise<{ checkoutUrl: string }> {
    if (!this.stripe) throw new BadRequestException('Stripe not configured');

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const plan = PLANS[planId];
    const priceId = 'stripePriceId' in plan ? plan.stripePriceId : undefined;

    const session = await this.stripe.checkout.sessions.create({
      customer_email: record.email,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Required — otherwise Stripe may skip card collection for a session
      // with nothing due today, which would defeat "card required".
      payment_method_collection: 'always',
      subscription_data: { trial_period_days: SIGNUP_TRIAL_DAYS },
      success_url: `${frontendUrl}/signup-complete?token=${token}`,
      cancel_url: `${frontendUrl}/connect-card?token=${token}`,
      metadata: {
        signupToken: token,
        planTier: record.planTier ?? '',
        type: 'signup_trial_start',
      },
      expand: ['subscription'],
    });

    return { checkoutUrl: session.url ?? '' };
  }

  // ── GET /signup/:token/status ─────────────────────────────────────────────

  async getStatus(
    token: string,
    browserSecret: string | undefined,
  ): Promise<SignupStatusResponse> {
    const completedRaw = await this.redis.get(`signup:completed:${token}`);
    if (completedRaw) {
      const completed = JSON.parse(completedRaw) as {
        userId: string;
        tenantId: string;
        browserSecret: string;
      };
      if (!browserSecret || completed.browserSecret !== browserSecret) {
        throw new ForbiddenException('Invalid signup session');
      }

      const user = await this.userRepo.findOne({
        where: { id: completed.userId },
        relations: ['tenant'],
      });
      if (!user) return { status: 'expired' };

      // Single-use handoff — once tokens are issued, this key must not be
      // replayable to mint a second session for the same completed signup.
      await this.redis.del(`signup:completed:${token}`);

      const tokens = await this.authService.issueTokens(user, user.tenant);
      return {
        status: 'completed',
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        tenant: {
          id: user.tenant.id,
          businessName: user.tenant.businessName,
          slug: user.tenant.slug,
          planTier: user.tenant.planTier,
        },
      };
    }

    const pending = await this.loadPending(token);
    if (!pending) return { status: 'expired' };
    this.assertBrowserSecret(pending, browserSecret);

    return {
      status: pending.emailVerified
        ? 'awaiting_payment'
        : 'awaiting_verification',
    };
  }

  // ── completeSignup — called only from billing webhook handlers ───────────

  async completeSignup(params: CompleteSignupParams): Promise<void> {
    // Atomically claim-and-delete the pending record so a second webhook
    // delivery for the same signup (e.g. a retried start-trial producing two
    // successful charges) finds nothing and no-ops instead of creating a
    // second tenant. This is distinct from — and in addition to — the
    // webhook_events table, which only catches redelivery of the same event.
    const raw = await this.redis.getdel(`signup:pending:${params.signupToken}`);
    if (!raw) {
      this.logger.warn(
        `completeSignup: no pending record for signup token (already claimed or expired)`,
      );
      return;
    }
    const record = JSON.parse(raw) as PendingSignupRecord;

    if (!record.emailVerified) {
      this.logger.error(
        `completeSignup: pending record was not email-verified — refusing to create account`,
      );
      return;
    }

    const planId =
      `${params.planTier}_${record.currency.toLowerCase()}` as PlanId;
    const plan = PLANS[planId];
    if (!plan) {
      this.logger.error(`completeSignup: no plan available for ${planId}`);
      return;
    }

    const now = new Date();
    const trialEndsAt =
      params.trialEndsAt ??
      new Date(now.getTime() + SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const isNG = record.country === Country.NG;

    let savedUser: User;
    let savedTenant: Tenant;
    try {
      ({ savedUser, savedTenant } = await this.dataSource.transaction(
        async (manager) => {
          const slug = await this.authService.buildUniqueSlug(
            record.businessName,
            manager,
          );
          const tenant = manager.create(Tenant, {
            businessName: record.businessName,
            slug,
            currency: record.currency,
            timezone: isNG ? 'Africa/Lagos' : 'Europe/London',
            mode: TenantMode.NATIVE,
            planTier: params.planTier as PlanTier,
            subscriptionStatus: SubscriptionStatus.TRIALING,
            trialEndsAt,
            waVerificationStatus: WaVerificationStatus.PENDING,
            marketingWalletBalance: 0,
            paystackCustomerId: params.paystackCustomerId ?? null,
            stripeCustomerId: params.stripeCustomerId ?? null,
          });
          const savedTenant = await manager.save(Tenant, tenant);

          const user = manager.create(User, {
            tenantId: savedTenant.id,
            email: record.email,
            fullName: record.fullName,
            hashedPassword: record.hashedPassword,
            role: UserRole.OWNER,
            isActive: true,
            emailVerifiedAt: new Date(),
            emailVerificationToken: null,
            emailVerificationExpiry: null,
          });
          const savedUser = await manager.save(User, user);

          const categories = DEFAULT_CATEGORIES.map((cat) =>
            manager.create(ProductCategory, {
              tenantId: savedTenant.id,
              name: cat.name,
              slug: cat.slug,
              isActive: true,
            }),
          );
          await manager.save(ProductCategory, categories);

          const subscription = manager.create(Subscription, {
            tenantId: savedTenant.id,
            planTier: params.planTier as PlanTier,
            billingCycle: 'monthly',
            currency: record.currency,
            amount: plan.amount,
            utilityIncluded: plan.utilityIncluded,
            utilityUsedThisPeriod: 0,
            utilityOverageRate: plan.utilityOverageRate,
            marketingRate: plan.marketingRate,
            status: SubscriptionStatus.TRIALING,
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            cancelAtPeriodEnd: false,
            paystackAuthorizationCode: params.paystackAuthorizationCode ?? null,
            stripeSubId: params.stripeSubId ?? null,
          });
          await manager.save(Subscription, subscription);

          return { savedUser, savedTenant };
        },
      ));
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        this.logger.error(
          `completeSignup: email ${record.email} already has an account — skipping duplicate creation`,
        );
        return;
      }
      throw err;
    }

    await this.redis.setex(
      `signup:completed:${params.signupToken}`,
      3600,
      JSON.stringify({
        userId: savedUser.id,
        tenantId: savedTenant.id,
        browserSecret: record.browserSecret,
      }),
    );

    this.logger.log(
      `Signup completed: tenantId=${savedTenant.id} plan=${planId}`,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code ===
        POSTGRES_UNIQUE_VIOLATION
    );
  }

  private generateVerificationCode(): { code: string; hashedCode: string } {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    return { code, hashedCode };
  }

  private assertBrowserSecret(
    record: PendingSignupRecord,
    browserSecret: string | undefined,
  ): void {
    if (!browserSecret || record.browserSecret !== browserSecret) {
      throw new ForbiddenException('Invalid signup session');
    }
  }

  private async loadPending(
    token: string,
  ): Promise<PendingSignupRecord | null> {
    const raw = await this.redis.get(`signup:pending:${token}`);
    return raw ? (JSON.parse(raw) as PendingSignupRecord) : null;
  }

  private async savePending(
    token: string,
    record: PendingSignupRecord,
  ): Promise<void> {
    const maxExpiryMs = record.createdAt + SIGNUP_MAX_TTL_SECONDS * 1000;
    const remainingMs = maxExpiryMs - Date.now();
    if (remainingMs <= 0) {
      await this.redis.del(`signup:pending:${token}`);
      return;
    }
    const ttlSeconds = Math.min(
      SIGNUP_INITIAL_TTL_SECONDS,
      Math.ceil(remainingMs / 1000),
    );
    await this.redis.setex(
      `signup:pending:${token}`,
      ttlSeconds,
      JSON.stringify(record),
    );
  }
}
