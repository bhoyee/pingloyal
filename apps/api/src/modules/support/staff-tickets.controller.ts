import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { CurrentStaff } from '../staff-auth/decorators/current-staff.decorator';
import { SupportService } from './support.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Controller('staff/tickets')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard)
export class StaffTicketsController {
  constructor(private readonly support: SupportService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.support.findAllForStaff(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.support.findOneForStaff(id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentStaff() staff: { fullName: string },
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.support.addStaffMessage(staff.fullName, id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.support.updateStatus(id, dto);
  }
}
