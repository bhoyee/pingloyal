import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module';
import { Redemption } from './entities/redemption.entity';
import { RedemptionsController } from './redemptions.controller';
import { RedemptionsService } from './redemptions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Redemption]), TenantsModule],
  controllers: [RedemptionsController],
  providers: [RedemptionsService],
  exports: [RedemptionsService],
})
export class RedemptionsModule {}
