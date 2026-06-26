import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateRequest } from './entities/template-request.entity';
import { TemplateRequestsService } from './template-requests.service';
import { TemplateRequestsController } from './template-requests.controller';
import { StaffTemplateRequestsController } from './staff-template-requests.controller';
import { MailerService } from '../../common/mailer/mailer.service';
import { TenantsModule } from '../tenants/tenants.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateRequest]), TenantsModule, StaffAuthModule],
  controllers: [TemplateRequestsController, StaffTemplateRequestsController],
  providers: [TemplateRequestsService, MailerService],
})
export class TemplateRequestsModule {}
