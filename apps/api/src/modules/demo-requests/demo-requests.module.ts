import { Module } from '@nestjs/common';
import { MailerService } from '../../common/mailer/mailer.service';
import { DemoRequestsController } from './demo-requests.controller';
import { DemoRequestsService } from './demo-requests.service';

@Module({
  controllers: [DemoRequestsController],
  providers: [DemoRequestsService, MailerService],
})
export class DemoRequestsModule {}
