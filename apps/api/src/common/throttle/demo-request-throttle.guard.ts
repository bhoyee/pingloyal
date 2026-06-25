import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class DemoRequestThrottleGuard extends ThrottlerGuard {
  protected errorMessage =
    'Too many requests. Please wait a minute and try again.';

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }
}
