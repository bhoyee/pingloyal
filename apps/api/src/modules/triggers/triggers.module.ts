import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../common/redis/redis.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WaTriggerTemplate } from './entities/wa-trigger-template.entity';
import { BirthdayCronService } from './birthday-cron.service';
import { LapsedCronService } from './lapsed-cron.service';
import { TriggerLogsController } from './trigger-logs.controller';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';
import { WaTemplatesController } from './wa-templates.controller';
import { WaTemplatesService } from './wa-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, WaTriggerTemplate]), RedisModule],
  controllers: [TriggerLogsController, TriggersController, WaTemplatesController],
  providers: [BirthdayCronService, LapsedCronService, TriggersService, WaTemplatesService],
  exports: [BirthdayCronService, LapsedCronService, WaTemplatesService],
})
export class TriggersModule {}
