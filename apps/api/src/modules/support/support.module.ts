import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketMessage } from './entities/support-ticket-message.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { StorageModule } from '../storage/storage.module';
import { SupportController } from './support.controller';
import { StaffTicketsController } from './staff-tickets.controller';
import { SupportService } from './support.service';
import { MailerService } from '../../common/mailer/mailer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportTicket,
      SupportTicketMessage,
      Tenant,
      User,
    ]),
    StaffAuthModule,
    StorageModule,
  ],
  controllers: [SupportController, StaffTicketsController],
  providers: [SupportService, MailerService],
})
export class SupportModule {}
