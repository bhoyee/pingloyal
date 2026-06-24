import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginThrottleGuard } from '../../common/throttle/auth-throttle.guard';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from './guards/staff-auth.guard';
import { CurrentStaff } from './decorators/current-staff.decorator';
import { StaffAuthService } from './staff-auth.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { StaffRefreshDto } from './dto/staff-refresh.dto';

@Controller('staff-auth')
@Public()
@SkipSubscriptionCheck()
export class StaffAuthController {
  constructor(private readonly staffAuthService: StaffAuthService) {}

  @UseGuards(LoginThrottleGuard)
  @Throttle({ login: { ttl: 15 * 60 * 1000, limit: 15 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: StaffLoginDto) {
    return this.staffAuthService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: StaffRefreshDto) {
    return this.staffAuthService.refresh(dto);
  }

  @UseGuards(StaffAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentStaff() staff: { staffId: string }) {
    return this.staffAuthService.logout(staff.staffId);
  }
}
