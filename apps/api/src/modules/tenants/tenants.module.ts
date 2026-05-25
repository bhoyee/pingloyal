import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { RedisModule } from '../../common/redis/redis.module';
import { Tenant } from './entities/tenant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { TierConfig } from './entities/tier-config.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TierService } from './tier.service';
import { QuarterlyResetCron } from './quarterly-reset.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, ProductCategory, TierConfig]),
    StorageModule,
    RedisModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService, TierService, QuarterlyResetCron],
  exports: [TenantsService, TierService],
})
export class TenantsModule {}
