import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class TenantThrottleGuard extends ThrottlerGuard {
  // Skip throttling entirely in test/CI environments
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { tenantId?: string } | undefined;
    if (user?.tenantId) return Promise.resolve(`tenant:${user.tenantId}`);
    const ip =
      (req['ip'] as string | undefined) ??
      (req['socket'] as { remoteAddress?: string } | undefined)
        ?.remoteAddress ??
      'unknown';
    return Promise.resolve(ip);
  }
}
