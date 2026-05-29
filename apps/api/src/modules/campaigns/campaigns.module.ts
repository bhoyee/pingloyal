import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../../common/redis/redis.module';
import { TenantsModule } from '../tenants/tenants.module';
import { Campaign } from './entities/campaign.entity';
import { CampaignLog } from './entities/campaign-log.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import {
  CampaignsController,
  TemplatesController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignLog, Customer, Subscription]),
    RedisModule,
    TenantsModule,
  ],
  controllers: [CampaignsController, TemplatesController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
