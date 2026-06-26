import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import type { TemplateRequestStatus } from './entities/template-request.entity';
import { TemplateRequestsService } from './template-requests.service';
import { UpdateTemplateRequestStatusDto } from './dto/update-template-request-status.dto';

// Both staff roles — reviewing/actioning template requests is operational
// work, the same tier as replying to support tickets.
@Controller('staff/template-requests')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard)
export class StaffTemplateRequestsController {
  constructor(private readonly service: TemplateRequestsService) {}

  @Get()
  findAll(
    @Query('status') status?: TemplateRequestStatus,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.findAllForStaff(status, tenantId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateRequestStatusDto,
  ) {
    return this.service.updateStatusForStaff(id, dto.status);
  }
}
