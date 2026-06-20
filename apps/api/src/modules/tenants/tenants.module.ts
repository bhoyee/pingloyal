import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { RedisModule } from '../../common/redis/redis.module';
import { MailerService } from '../../common/mailer/mailer.service';
import { User } from '../auth/entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { TierConfig } from './entities/tier-config.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TierService } from './tier.service';
import { QuarterlyResetCron } from './quarterly-reset.cron';
import { AccountDeletionCronService } from './account-deletion.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, ProductCategory, TierConfig, User]),
    StorageModule,
    RedisModule,
  ],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    TierService,
    QuarterlyResetCron,
    AccountDeletionCronService,
    MailerService,
  ],
  exports: [TenantsService, TierService, QuarterlyResetCron],
})
export class TenantsModule {}
