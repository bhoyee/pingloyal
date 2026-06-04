import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportSnapshot } from './entities/report-snapshot.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PointsLedger } from '../transactions/entities/points-ledger.entity';
import { TriggerLog } from '../triggers/entities/trigger-log.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { CampaignLog } from '../campaigns/entities/campaign-log.entity';
import { WalletTransaction } from '../billing/entities/wallet-transaction.entity';
import { TierConfig } from '../tenants/entities/tier-config.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportSnapshot,
      ReportSchedule,
      Tenant,
      Customer,
      Transaction,
      PointsLedger,
      TriggerLog,
      Campaign,
      CampaignLog,
      WalletTransaction,
      TierConfig,
      ProductCategory,
      Subscription,
    ]),
  ],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
