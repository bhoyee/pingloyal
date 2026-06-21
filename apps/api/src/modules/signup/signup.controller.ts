import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  SignupRegisterThrottleGuard,
  SignupResendCodeThrottleGuard,
  SignupStartTrialThrottleGuard,
} from '../../common/throttle/signup-throttle.guard';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { SignupService } from './signup.service';
import { SignupRegisterDto } from './dto/signup-register.dto';
import { SignupVerifyEmailDto } from './dto/signup-verify-email.dto';
import { SignupResendCodeDto } from './dto/signup-resend-code.dto';
import { SignupStartTrialDto } from './dto/signup-start-trial.dto';

const SIGNUP_SESSION_COOKIE = 'signup_session';
const SIGNUP_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function setSignupSessionCookie(res: Response, browserSecret: string): void {
  res.cookie(SIGNUP_SESSION_COOKIE, browserSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SIGNUP_SESSION_MAX_AGE_MS,
  });
}

// A leaked/logged signup URL (it round-trips through a third-party payment
// redirect) must not be usable alone to mint a session for a never-before-
// authenticated identity — every step also requires this httpOnly cookie.
function readBrowserSecret(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[
    SIGNUP_SESSION_COOKIE
  ];
}

@ApiTags('Signup')
@Controller('signup')
@Public()
@SkipSubscriptionCheck()
export class SignupController {
  constructor(private readonly signupService: SignupService) {}

  @UseGuards(SignupRegisterThrottleGuard)
  @Throttle({ register_account: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new signup — sends a 6-digit email code' })
  async register(
    @Body() dto: SignupRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { browserSecret, ...result } = await this.signupService.register(dto);
    setSignupSessionCookie(res, browserSecret);
    return result;
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the signup email with the 6-digit code' })
  verifyEmail(@Body() dto: SignupVerifyEmailDto, @Req() req: Request) {
    return this.signupService.verifyEmail(dto, readBrowserSecret(req));
  }

  @UseGuards(SignupResendCodeThrottleGuard)
  @Throttle({ default: { ttl: 60 * 1000, limit: 3 } })
  @Post('resend-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the signup email verification code' })
  resendCode(@Body() dto: SignupResendCodeDto, @Req() req: Request) {
    return this.signupService.resendCode(dto, readBrowserSecret(req));
  }

  @Get(':token/plans')
  @ApiOperation({
    summary: "List plans available for this signup session's currency",
  })
  getPlans(@Param('token') token: string, @Req() req: Request) {
    return this.signupService.getPlans(token, readBrowserSecret(req));
  }

  @UseGuards(SignupStartTrialThrottleGuard)
  @Throttle({ default: { ttl: 60 * 1000, limit: 5 } })
  @Post(':token/start-trial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Select a plan and start the 14-day trial card-verification flow',
  })
  startTrial(
    @Param('token') token: string,
    @Body() dto: SignupStartTrialDto,
    @Req() req: Request,
  ) {
    return this.signupService.startTrial(
      token,
      readBrowserSecret(req),
      dto.planTier,
    );
  }

  @Get(':token/status')
  @ApiOperation({
    summary:
      'Poll signup completion — issues tokens once trial payment succeeds',
  })
  getStatus(@Param('token') token: string, @Req() req: Request) {
    return this.signupService.getStatus(token, readBrowserSecret(req));
  }
}
