import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { TemplateRequestsService } from './template-requests.service';
import type { TemplateRequestStatus } from './entities/template-request.entity';

class UpdateStatusDto {
  @IsEnum(['pending', 'in_progress', 'completed'] as const)
  status: TemplateRequestStatus;
}

@Controller('staff/template-requests')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard)
export class StaffTemplateRequestsController {
  constructor(private readonly service: TemplateRequestsService) {}

  @Get('counts')
  getCounts() {
    return this.service.getCountsForStaff();
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAllForStaff({
      status,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
    });
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatusForStaff(id, dto.status);
  }
}
