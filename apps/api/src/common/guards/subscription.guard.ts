import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import Redis from 'ioredis';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription-check.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REDIS_CLIENT } from '../redis/redis.constants';

interface TenantSubscriptionRow {
  subscription_status: string;
  trial_ends_at: string | null;
}

const EXEMPT_PATH_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/billing',
  '/api/v1/health',
  '/api/docs',
];

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip on @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Skip on @SkipSubscriptionCheck() routes
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request>();

    // Skip by path pattern (auth/billing/health/docs)
    if (EXEMPT_PATH_PREFIXES.some((p) => request.path.startsWith(p))) {
      return true;
    }

    const tenantId = request.user?.tenantId;
    if (!tenantId) return true; // No user context yet — JwtAuthGuard handles it

    const subscription = await this.loadSubscription(tenantId);
    return this.evaluate(subscription, request.method);
  }

  private async loadSubscription(
    tenantId: string,
  ): Promise<TenantSubscriptionRow> {
    const cacheKey = `subscription:${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TenantSubscriptionRow;
    }

    const rows = await this.dataSource.query<TenantSubscriptionRow[]>(
      `SELECT subscription_status, trial_ends_at FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const row = rows[0] ?? {
      subscription_status: 'trialing',
      trial_ends_at: null,
    };
    await this.redis.setex(cacheKey, 60, JSON.stringify(row));
    return row;
  }

  private evaluate(sub: TenantSubscriptionRow, method: string): boolean {
    const status = sub.subscription_status;
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(
      method.toUpperCase(),
    );

    switch (status) {
      case 'trialing': {
        if (!sub.trial_ends_at) return true;
        const trialEnd = new Date(sub.trial_ends_at);
        if (trialEnd > new Date()) return true;
        throw new HttpException(
          'Trial period has ended — please subscribe to continue',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      case 'active':
        return true;

      case 'past_due':
        if (!isMutation) return true;
        throw new HttpException(
          'Account payment is past due — read-only access only',
          HttpStatus.PAYMENT_REQUIRED,
        );

      case 'suspended':
        throw new HttpException(
          'Account is suspended — please contact support',
          HttpStatus.PAYMENT_REQUIRED,
        );

      default:
        return true;
    }
  }
}
