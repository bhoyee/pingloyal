import { Module } from '@nestjs/common';
import { TenantsModule } from '../modules/tenants/tenants.module';
import { TriggersModule } from '../modules/triggers/triggers.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [TenantsModule, TriggersModule],
  controllers: [AdminController],
})
export class AdminModule {}
