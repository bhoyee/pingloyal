import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TierConfig } from '../tenants/entities/tier-config.entity';
import { TriggerLog } from '../triggers/entities/trigger-log.entity';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { BspService } from './bsp.service';
import { WaOnboardingService } from './wa-onboarding.service';
import { WaBotService } from './wa-bot.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Customer, TierConfig, TriggerLog]),
    CampaignsModule,
  ],
  controllers: [WhatsappController],
  providers: [WaOnboardingService, BspService, WaBotService],
  exports: [BspService, WaBotService],
})
export class WhatsappModule {}
