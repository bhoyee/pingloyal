import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../common/redis/redis.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WaTriggerTemplate } from './entities/wa-trigger-template.entity';
import { BirthdayCronService } from './birthday-cron.service';
import { LapsedCronService } from './lapsed-cron.service';
import { TriggerLogsController } from './trigger-logs.controller';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';
import { WaTemplatesController } from './wa-templates.controller';
import { WaTemplatesService } from './wa-templates.service';
import { StaffTriggersController } from './staff-triggers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, WaTriggerTemplate]),
    RedisModule,
    StaffAuthModule,
  ],
  controllers: [
    TriggerLogsController,
    TriggersController,
    WaTemplatesController,
    StaffTriggersController,
  ],
  providers: [
    BirthdayCronService,
    LapsedCronService,
    TriggersService,
    WaTemplatesService,
  ],
  exports: [BirthdayCronService, LapsedCronService, WaTemplatesService],
})
export class TriggersModule {}
