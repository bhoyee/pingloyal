import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Tenant, User, WalletTransaction]),
  ],
  controllers: [BillingController, WalletController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
