import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { RedisModule } from '../../common/redis/redis.module';
import { MailerService } from '../../common/mailer/mailer.service';
import { FullAuthModule } from '../auth/auth.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { User } from '../auth/entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { TierConfig } from './entities/tier-config.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { WaTriggerTemplate } from '../triggers/entities/wa-trigger-template.entity';
import { SupportTicket } from '../support/entities/support-ticket.entity';
import { TemplateRequest } from '../template-requests/entities/template-request.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { StaffTenantsController } from './staff-tenants.controller';
import { StaffTenantsService } from './staff-tenants.service';
import { TierService } from './tier.service';
import { QuarterlyResetCron } from './quarterly-reset.cron';
import { AccountDeletionCronService } from './account-deletion.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      ProductCategory,
      TierConfig,
      User,
      Subscription,
      WaTriggerTemplate,
      SupportTicket,
      TemplateRequest,
    ]),
    StorageModule,
    RedisModule,
    FullAuthModule,
    StaffAuthModule,
  ],
  controllers: [TenantsController, StaffTenantsController],
  providers: [
    TenantsService,
    StaffTenantsService,
    TierService,
    QuarterlyResetCron,
    AccountDeletionCronService,
    MailerService,
  ],
  exports: [TenantsService, TierService, QuarterlyResetCron],
})
export class TenantsModule {}
