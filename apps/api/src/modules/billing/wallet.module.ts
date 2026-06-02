import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletService } from './wallet.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, WalletTransaction]),
    BullModule.registerQueue({ name: 'wa-messages' }),
  ],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
