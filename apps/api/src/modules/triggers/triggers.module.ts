import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../common/redis/redis.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { BirthdayCronService } from './birthday-cron.service';
import { LapsedCronService } from './lapsed-cron.service';
import { TriggerLogsController } from './trigger-logs.controller';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), RedisModule],
  controllers: [TriggerLogsController, TriggersController],
  providers: [BirthdayCronService, LapsedCronService, TriggersService],
  exports: [BirthdayCronService, LapsedCronService],
})
export class TriggersModule {}
