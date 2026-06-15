import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateTriggerConfigDto } from './dto/update-trigger-config.dto';
import { TriggersService } from './triggers.service';

@Controller('triggers')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  @Get()
  getConfig(@Req() req: { user: RequestUser }) {
    return this.triggersService.getConfig(req.user.tenantId);
  }

  @Get('bot')
  getBotConfig(@Req() req: { user: RequestUser }) {
    return this.triggersService.getBotConfig(req.user.tenantId);
  }

  @Patch(':type')
  @Roles(UserRole.OWNER)
  setEnabled(
    @Req() req: { user: RequestUser },
    @Param('type') type: string,
    @Body() dto: UpdateTriggerConfigDto,
  ) {
    return this.triggersService.setEnabled(
      req.user.tenantId,
      type,
      dto.enabled,
    );
  }
}
