import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { BspService } from './bsp.service';
import { WaOnboardingService } from './wa-onboarding.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [WhatsappController],
  providers: [WaOnboardingService, BspService],
  exports: [BspService],
})
export class WhatsappModule {}
