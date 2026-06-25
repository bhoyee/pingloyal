import { Module } from '@nestjs/common';
import { MailerService } from '../../common/mailer/mailer.service';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  controllers: [ContactController],
  providers: [ContactService, MailerService],
})
export class ContactModule {}
