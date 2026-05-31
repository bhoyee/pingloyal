import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class TenantThrottleGuard extends ThrottlerGuard {
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
