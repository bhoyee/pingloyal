import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { TemplateRequestsService } from './template-requests.service';
import { UpdateTemplateRequestStatusDto } from './dto/update-template-request-status.dto';

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
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTemplateRequestStatusDto) {
    return this.service.updateStatusForStaff(id, dto.status);
  }
}
