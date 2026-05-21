import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { Public } from '../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../common/decorators/skip-subscription-check.decorator';
import { REDIS_CLIENT } from '../common/redis/redis.constants';

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  environment: string;
  components: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @SkipSubscriptionCheck()
  @HttpCode(HttpStatus.OK)
  @Get()
  @ApiOperation({ summary: 'Service health — always returns HTTP 200' })
  async check(): Promise<HealthResponse> {
    const [dbStatus, redisStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const components = { database: dbStatus, redis: redisStatus };
    const status: 'ok' | 'degraded' = Object.values(components).every(
      (v) => v === 'ok',
    )
      ? 'ok'
      : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
      components,
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
