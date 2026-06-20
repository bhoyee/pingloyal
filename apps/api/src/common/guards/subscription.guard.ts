import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import type Redis from 'ioredis';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription-check.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REDIS_CLIENT } from '../redis/redis.constants';

interface SubStatusCache {
  status: string;
  trialEndsAt: string | null;
  planTier: string | null;
}

interface SubStatusRow {
  status: string;
  trial_ends_at: string | null;
  plan_tier: string | null;
}

const ALWAYS_ALLOW_PATHS = ['/api/v1/auth', '/api/v1/health', '/api/docs'];

const ALWAYS_ALLOW_POST_PATHS = [
  '/api/v1/billing/subscribe',
  '/api/v1/billing/start-trial',
  '/api/v1/billing/cancel-trial',
  '/api/v1/billing/webhook',
  '/api/v1/customers/register',
  '/api/v1/integrations/webhook',
];

function throw402(error: string, message: string, action: string): never {
  throw new HttpException(
    {
      statusCode: 402,
      error,
      message,
      action,
      redirectUrl: '/billing',
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;
    const method = request.method.toUpperCase();

    if (ALWAYS_ALLOW_PATHS.some((p) => path.startsWith(p))) return true;

    const tenantId = request.user?.tenantId;
    if (!tenantId) return true;

    const sub = await this.loadSubscription(tenantId);
    if (!sub) return true;

    return this.evaluate(sub, method, path, tenantId);
  }

  private async loadSubscription(
    tenantId: string,
  ): Promise<SubStatusCache | null> {
    const cacheKey = `sub:status:${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SubStatusCache;

    // JOIN tenants to get trial_ends_at (stored on tenants, not subscriptions)
    const rows = await this.dataSource.query<SubStatusRow[]>(
      `SELECT s.status, s.plan_tier, t.trial_ends_at
       FROM subscriptions s
       JOIN tenants t ON s.tenant_id = t.id
       WHERE s.tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );

    if (!rows.length) return null;

    const row = rows[0];
    const result: SubStatusCache = {
      status: row.status,
      trialEndsAt: row.trial_ends_at,
      planTier: row.plan_tier,
    };

    await this.redis.setex(cacheKey, 60, JSON.stringify(result));
    return result;
  }

  private evaluate(
    sub: SubStatusCache,
    method: string,
    path: string,
    tenantId: string,
  ): boolean {
    const { status } = sub;
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
    const isExemptPost = ALWAYS_ALLOW_POST_PATHS.some((p) =>
      path.startsWith(p),
    );

    if (status === 'active') return true;

    if (status === 'pending_payment') {
      if (isExemptPost) return true;
      throw402(
        'Payment Method Required',
        'Add a payment method to start your 7-day free trial.',
        'start_trial',
      );
    }

    if (status === 'trialing') {
      if (!sub.trialEndsAt || new Date(sub.trialEndsAt) > new Date())
        return true;
      throw402(
        'Trial Expired',
        'Your 7-day free trial has ended. Subscribe to continue using PingLoyal.',
        'subscribe',
      );
    }

    if (status === 'past_due') {
      if (!isMutation || isExemptPost) return true;
      throw402(
        'Payment Failed',
        'Your last payment failed. Update your payment method to continue.',
        'update_payment',
      );
    }

    if (status === 'suspended') {
      if (isExemptPost) return true;
      throw402(
        'Account Suspended',
        'Your account is suspended. Subscribe to reactivate.',
        'subscribe',
      );
    }

    if (status === 'cancelled') {
      if (isExemptPost) return true;
      throw402(
        'Subscription Cancelled',
        'Your trial was cancelled. Subscribe to reactivate.',
        'subscribe',
      );
    }

    // Fail closed, not open: an unrecognized status string (a typo, a future
    // status someone forgets to wire in here) must never silently grant
    // full access — block and surface it for investigation instead.
    this.logger.error(
      `Unknown subscription status: ${status} for tenant ${tenantId} — blocking by default`,
    );
    if (isExemptPost) return true;
    throw402(
      'Account Status Unrecognized',
      'There was a problem with your account status. Please contact support.',
      'subscribe',
    );
  }
}
