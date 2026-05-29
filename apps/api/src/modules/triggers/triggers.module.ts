import { Module } from '@nestjs/common';
import { BirthdayCronService } from './birthday-cron.service';
import { LapsedCronService } from './lapsed-cron.service';

@Module({
  providers: [BirthdayCronService, LapsedCronService],
  exports: [BirthdayCronService, LapsedCronService],
})
export class TriggersModule {}
