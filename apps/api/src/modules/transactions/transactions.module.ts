import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module';
import { Customer } from '../customers/entities/customer.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Transaction } from './entities/transaction.entity';
import { PointsLedger } from './entities/points-ledger.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      PointsLedger,
      Customer,
      ProductCategory,
    ]),
    TenantsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
