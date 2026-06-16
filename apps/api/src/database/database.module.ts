import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import {
  Campaign,
  CampaignLog,
  Customer,
  Integration,
  PointsLedger,
  ProductCategory,
  ReportSchedule,
  ReportSnapshot,
  Subscription,
  Tenant,
  TierConfig,
  Transaction,
  TriggerLog,
  User,
  WalletTransaction,
  WaTriggerTemplate,
  TemplateRequest,
} from './entities';

const ALL_ENTITIES = [
  Tenant,
  TierConfig,
  ProductCategory,
  User,
  Customer,
  Transaction,
  PointsLedger,
  Campaign,
  CampaignLog,
  TriggerLog,
  WaTriggerTemplate,
  TemplateRequest,
  Integration,
  Subscription,
  WalletTransaction,
  ReportSnapshot,
  ReportSchedule,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: ALL_ENTITIES,
        synchronize: false,
        poolSize: 10,
        namingStrategy: new SnakeNamingStrategy(),
        logging: config.get<string>('NODE_ENV') !== 'production',
        verboseRetryLog: true,
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
