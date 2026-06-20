import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Subscription } from './entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { WalletController } from './wallet.controller';
import { UtilityTrackingService } from './utility-tracking.service';
import { WalletAlertCronService } from './wallet-alert.cron';
import { TrialBillingCronService } from './trial-billing.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      Tenant,
      User,
      WalletTransaction,
      WebhookEvent,
    ]),
    BullModule.registerQueue({ name: 'wa-messages' }),
  ],
  controllers: [BillingController, WalletController],
  providers: [
    BillingService,
    UtilityTrackingService,
    WalletAlertCronService,
    TrialBillingCronService,
  ],
  exports: [
    BillingService,
    UtilityTrackingService,
    WalletAlertCronService,
    TrialBillingCronService,
  ],
})
export class BillingModule {}
