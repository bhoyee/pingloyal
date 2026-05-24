import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../../common/queue/queue.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from './entities/customer.entity';
import { CustomersService } from './customers.service';
import {
  CustomersController,
  RegisterController,
} from './customers.controller';
import { ImportService } from './import.service';
import { ImportListener } from './import.listener';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, Customer]), QueueModule],
  controllers: [RegisterController, CustomersController],
  providers: [CustomersService, ImportService, ImportListener],
  exports: [CustomersService],
})
export class CustomersModule {}
