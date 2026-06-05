import { Module } from '@nestjs/common';
import { TenantsModule } from '../modules/tenants/tenants.module';
import { TriggersModule } from '../modules/triggers/triggers.module';
import { WhatsappModule } from '../modules/whatsapp/whatsapp.module';
import { IntegrationsModule } from '../modules/integrations/integrations.module';
import { BillingModule } from '../modules/billing/billing.module';
import { ReportsModule } from '../modules/reports/reports.module';
import {
  AdminController,
  AdminSimulateController,
  AdminIntegrationController,
  AdminBillingController,
  AdminWalletAlertController,
  AdminReportsCronController,
} from './admin.controller';

@Module({
  imports: [
    TenantsModule,
    TriggersModule,
    WhatsappModule,
    IntegrationsModule,
    BillingModule,
    ReportsModule,
  ],
  controllers: [
    AdminController,
    AdminSimulateController,
    AdminIntegrationController,
    AdminBillingController,
    AdminWalletAlertController,
    AdminReportsCronController,
  ],
})
export class AdminModule {}
