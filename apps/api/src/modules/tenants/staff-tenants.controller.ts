import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StaffRole } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { StaffRolesGuard } from '../staff-auth/guards/staff-roles.guard';
import { StaffRoles } from '../staff-auth/decorators/staff-roles.decorator';
import { CurrentStaff } from '../staff-auth/decorators/current-staff.decorator';
import { StaffTenantsService } from './staff-tenants.service';
import { StaffCreateTenantDto } from './dto/staff-create-tenant.dto';
import { StaffUpdateTenantDto } from './dto/staff-update-tenant.dto';
import { StaffListTenantsQueryDto } from './dto/staff-list-tenants-query.dto';
import { SoftDeleteTenantDto } from './dto/soft-delete-tenant.dto';
import { SetUserActiveDto } from './dto/set-user-active.dto';

@Controller('staff/tenants')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard, StaffRolesGuard)
export class StaffTenantsController {
  constructor(private readonly staffTenantsService: StaffTenantsService) {}

  @Get()
  findAll(@Query() query: StaffListTenantsQueryDto) {
    return this.staffTenantsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.staffTenantsService.findOne(id);
  }

  @Post()
  @StaffRoles(StaffRole.SUPER_ADMIN)
  create(@Body() dto: StaffCreateTenantDto) {
    return this.staffTenantsService.create(dto);
  }

  @Post(':id/resend-welcome-email')
  @StaffRoles(StaffRole.SUPER_ADMIN)
  resendWelcomeEmail(@Param('id') id: string) {
    return this.staffTenantsService.resendWelcomeEmail(id);
  }

  @Patch(':id')
  @StaffRoles(StaffRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: StaffUpdateTenantDto) {
    return this.staffTenantsService.update(id, dto);
  }

  @Patch(':id/users/:userId')
  @StaffRoles(StaffRole.SUPER_ADMIN)
  setUserActive(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.staffTenantsService.setUserActive(id, userId, dto.isActive);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.OK)
  @StaffRoles(StaffRole.SUPER_ADMIN)
  softDelete(
    @Param('id') id: string,
    @Body() dto: SoftDeleteTenantDto,
    @CurrentStaff() staff: { staffId: string },
  ) {
    return this.staffTenantsService.softDelete(id, staff.staffId, dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @StaffRoles(StaffRole.SUPER_ADMIN)
  restore(@Param('id') id: string) {
    return this.staffTenantsService.restore(id);
  }
}
