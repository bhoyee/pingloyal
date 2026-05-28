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
import { TenantsModule } from './modules/tenants/tenants.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TriggersModule } from './modules/triggers/triggers.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
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
    // login: 5 attempts per 15 min (AuthController)
    // default: 10 requests per 60 s (RegisterController + any future public endpoint)
    ThrottlerModule.forRoot([
      { name: 'login', ttl: 15 * 60 * 1000, limit: 5 },
      { name: 'default', ttl: 60_000, limit: 10 },
    ]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    QueueModule,
    FullAuthModule,
    TenantsModule,
    WhatsappModule,
    HealthModule,
    CustomersModule,
    TransactionsModule,
    TriggersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
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
