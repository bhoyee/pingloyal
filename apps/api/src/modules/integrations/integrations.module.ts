import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from './entities/integration.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from '../customers/entities/customer.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationSchedulerService } from './integration-scheduler.service';
import { FileImportService } from './file-import.service';
import { FileImportListener } from './file-import.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Integration, Tenant, Customer, ProductCategory]),
    TransactionsModule,
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationSchedulerService,
    FileImportService,
    FileImportListener,
  ],
  exports: [IntegrationsService, IntegrationSchedulerService],
})
export class IntegrationsModule {}
