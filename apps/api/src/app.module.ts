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
import { ContactModule } from './modules/contact/contact.module';
import { AdminModule } from './admin/admin.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UsersModule } from './modules/users/users.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
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
    // Only the `default` bucket applies globally — every unannotated route gets
    // 300 req/min per tenant. Route-specific throttlers (login, transactions,
    // demo_request, etc.) are declared inline via @Throttle() on their own
    // controllers and do NOT need to live here; putting them here causes every
    // unannotated route to inherit them, which previously throttled dashboard
    // read endpoints to 5 req/min (demo_request / contact_form bucket).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 300 },
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
    ContactModule,
    AdminModule,
    RedemptionsModule,
    ActivityLogModule,
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
