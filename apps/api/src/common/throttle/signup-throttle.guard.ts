import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class SignupRegisterThrottleGuard extends ThrottlerGuard {
  protected errorMessage =
    'Too many signup attempts. Please wait a while and try again.';

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }
}

@Injectable()
export class SignupResendCodeThrottleGuard extends ThrottlerGuard {
  protected errorMessage =
    'Too many requests. Please wait a minute before requesting another code.';

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }
}

@Injectable()
export class SignupStartTrialThrottleGuard extends ThrottlerGuard {
  protected errorMessage =
    'Too many attempts. Please wait a minute and try again.';

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.shouldSkip(context);
  }
}
