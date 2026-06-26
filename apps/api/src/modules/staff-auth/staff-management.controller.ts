import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { StaffRole } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from './guards/staff-auth.guard';
import { StaffRolesGuard } from './guards/staff-roles.guard';
import { StaffRoles } from './decorators/staff-roles.decorator';
import { CurrentStaff } from './decorators/current-staff.decorator';
import { StaffManagementService } from './staff-management.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Controller('staff/accounts')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard, StaffRolesGuard)
@StaffRoles(StaffRole.SUPER_ADMIN)
export class StaffManagementController {
  constructor(
    private readonly staffManagementService: StaffManagementService,
  ) {}

  @Get()
  findAll() {
    return this.staffManagementService.findAll();
  }

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.staffManagementService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentStaff() currentStaff: { staffId: string },
  ) {
    return this.staffManagementService.update(id, dto, currentStaff.staffId);
  }
}
