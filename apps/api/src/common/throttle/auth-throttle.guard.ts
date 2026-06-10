import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class LoginThrottleGuard extends ThrottlerGuard {
  protected errorMessage =
    'Too many login attempts. Please wait 15 minutes and try again.';

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }
}

@Injectable()
export class ResendVerificationThrottleGuard extends ThrottlerGuard {
  protected errorMessage =
    'Too many requests. Please wait a minute before requesting another code.';

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }
}
