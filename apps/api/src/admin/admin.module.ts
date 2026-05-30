import { Module } from '@nestjs/common';
import { TenantsModule } from '../modules/tenants/tenants.module';
import { TriggersModule } from '../modules/triggers/triggers.module';
import { WhatsappModule } from '../modules/whatsapp/whatsapp.module';
import { IntegrationsModule } from '../modules/integrations/integrations.module';
import {
  AdminController,
  AdminSimulateController,
  AdminIntegrationController,
} from './admin.controller';

@Module({
  imports: [TenantsModule, TriggersModule, WhatsappModule, IntegrationsModule],
  controllers: [
    AdminController,
    AdminSimulateController,
    AdminIntegrationController,
  ],
})
export class AdminModule {}
