import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { FullAuthModule } from './modules/auth/auth.module';
import { SignupModule } from './modules/signup/signup.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { BillingModule } from './modules/billing/billing.module';
import { WalletModule } from './modules/billing/wallet.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { TriggersModule } from './modules/triggers/triggers.module';
import { TemplateRequestsModule } from './modules/template-requests/template-requests.module';
import { StaffAuthModule } from './modules/staff-auth/staff-auth.module';
import { SupportModule } from './modules/support/support.module';
import { DemoRequestsModule } from './modules/demo-requests/demo-requests.module';
import { AdminModule } from './admin/admin.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { TenantThrottleGuard } from './common/throttle/tenant-throttle.guard';
import { TenantScopeInterceptor } from './common/interceptors/tenant-scope.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { createWinstonConfig } from './common/logger/winston.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    WinstonModule.forRoot(
      createWinstonConfig(
        process.env.NODE_ENV ?? 'development',
        process.env.LOG_LEVEL ?? 'info',
      ),
    ),
    // Every named throttler below applies to every route by default — routes
    // that need a tight limit (login, register, campaign send, etc.) set their
    // own `@Throttle()` override, which takes precedence over these defaults.
    // Keep these defaults generous so unrelated routes (e.g. GET /tenants/me)
    // aren't 429'd by a bucket meant for a different endpoint.
    ThrottlerModule.forRoot([
      { name: 'login', ttl: 900_000, limit: 1000 },
      { name: 'register_account', ttl: 3_600_000, limit: 1000 },
      { name: 'customer_reg', ttl: 60_000, limit: 30 },
      { name: 'tenant_info', ttl: 60_000, limit: 30 },
      { name: 'webhook_gupshup', ttl: 60_000, limit: 500 },
      { name: 'webhook_integration', ttl: 60_000, limit: 200 },
      { name: 'lookup', ttl: 60_000, limit: 60 },
      { name: 'transactions', ttl: 60_000, limit: 120 },
      { name: 'dashboard', ttl: 60_000, limit: 30 },
      { name: 'campaign_send', ttl: 60_000, limit: 1000 },
      { name: 'demo_request', ttl: 60_000, limit: 5 },
      { name: 'default', ttl: 60_000, limit: 100 },
    ]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    QueueModule,
    FullAuthModule,
    SignupModule,
    TenantsModule,
    WhatsappModule,
    HealthModule,
    CustomersModule,
    TransactionsModule,
    CampaignsModule,
    BillingModule,
    WalletModule,
    DashboardModule,
    ReportsModule,
    UsersModule,
    IntegrationsModule,
    TriggersModule,
    TemplateRequestsModule,
    StaffAuthModule,
    SupportModule,
    DemoRequestsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: TenantThrottleGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
