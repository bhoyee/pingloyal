import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { StaffRole } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { StaffRolesGuard } from '../staff-auth/guards/staff-roles.guard';
import { StaffRoles } from '../staff-auth/decorators/staff-roles.decorator';
import { TriggersService } from './triggers.service';
import { WaTemplatesService } from './wa-templates.service';
import { UpdateTriggerConfigDto } from './dto/update-trigger-config.dto';
import { UpdateWaTemplateDto } from './dto/update-wa-template.dto';

// Thin re-exposure of the tenant-facing triggers/wa-templates services with
// tenantId taken from the URL instead of @CurrentTenant() — zero new service
// logic, same business rules a tenant owner would get on their own dashboard.
@Controller('staff/tenants/:tenantId')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard, StaffRolesGuard)
export class StaffTriggersController {
  constructor(
    private readonly triggersService: TriggersService,
    private readonly waTemplatesService: WaTemplatesService,
  ) {}

  @Get('triggers')
  getConfig(@Param('tenantId') tenantId: string) {
    return this.triggersService.getConfig(tenantId);
  }

  @Patch('triggers/:type')
  @StaffRoles(StaffRole.SUPER_ADMIN)
  setEnabled(
    @Param('tenantId') tenantId: string,
    @Param('type') type: string,
    @Body() dto: UpdateTriggerConfigDto,
  ) {
    return this.triggersService.setEnabled(tenantId, type, dto.enabled);
  }

  @Get('wa-templates')
  findAllTemplates(@Param('tenantId') tenantId: string) {
    return this.waTemplatesService.findAll(tenantId);
  }

  @Patch('wa-templates/:triggerType')
  @StaffRoles(StaffRole.SUPER_ADMIN)
  upsertTemplate(
    @Param('tenantId') tenantId: string,
    @Param('triggerType') triggerType: string,
    @Body() dto: UpdateWaTemplateDto,
  ) {
    return this.waTemplatesService.upsert(tenantId, triggerType, dto.body);
  }

  @Delete('wa-templates/:triggerType')
  @HttpCode(HttpStatus.OK)
  @StaffRoles(StaffRole.SUPER_ADMIN)
  resetTemplate(
    @Param('tenantId') tenantId: string,
    @Param('triggerType') triggerType: string,
  ) {
    return this.waTemplatesService.reset(tenantId, triggerType);
  }
}
