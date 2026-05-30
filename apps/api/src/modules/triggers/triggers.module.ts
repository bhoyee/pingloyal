import { Module } from '@nestjs/common';
import { BirthdayCronService } from './birthday-cron.service';
import { LapsedCronService } from './lapsed-cron.service';
import { TriggerLogsController } from './trigger-logs.controller';

@Module({
  controllers: [TriggerLogsController],
  providers: [BirthdayCronService, LapsedCronService],
  exports: [BirthdayCronService, LapsedCronService],
})
export class TriggersModule {}
