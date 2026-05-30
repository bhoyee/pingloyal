import { Module } from '@nestjs/common';
import { TenantsModule } from '../modules/tenants/tenants.module';
import { TriggersModule } from '../modules/triggers/triggers.module';
import { WhatsappModule } from '../modules/whatsapp/whatsapp.module';
import { AdminController, AdminSimulateController } from './admin.controller';

@Module({
  imports: [TenantsModule, TriggersModule, WhatsappModule],
  controllers: [AdminController, AdminSimulateController],
})
export class AdminModule {}
