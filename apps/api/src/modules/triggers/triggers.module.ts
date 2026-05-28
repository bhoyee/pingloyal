import { Module } from '@nestjs/common';
import { BirthdayCronService } from './birthday-cron.service';

@Module({
  providers: [BirthdayCronService],
  exports: [BirthdayCronService],
})
export class TriggersModule {}
