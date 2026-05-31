import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { IntegrationsService } from './integrations.service';
import { IntegrationSchedulerService } from './integration-scheduler.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly scheduler: IntegrationSchedulerService,
  ) {}

  @Get()
  @Roles(UserRole.OWNER)
  findByTenant(@Req() req: { user: RequestUser }) {
    return this.integrationsService.findByTenant(req.user.tenantId);
  }

  @Post()
  @Roles(UserRole.OWNER)
  async upsert(
    @Req() req: { user: RequestUser },
    @Body() dto: CreateIntegrationDto,
  ) {
    const result = await this.integrationsService.upsert(
      req.user.tenantId,
      dto,
    );
    if (dto.connectionType === 'api_pull') {
      // Load the raw integration to pass to scheduler
      const integration = await this.integrationsService.findRaw(
        req.user.tenantId,
      );
      if (integration) {
        await this.scheduler
          .scheduleOne(integration)
          .catch((err) =>
            this.logger.error(`Failed to schedule integration: ${String(err)}`),
          );
      }
    } else {
      // Non-api_pull type: remove any existing repeating job
      const integration = await this.integrationsService.findRaw(
        req.user.tenantId,
      );
      if (integration) {
        await this.scheduler.unschedule(integration.id).catch(() => null);
      }
    }
    return result;
  }

  @Post('test')
  @Roles(UserRole.OWNER)
  test(@Req() req: { user: RequestUser }) {
    return this.integrationsService.test(req.user.tenantId);
  }

  @Post('webhook/:tenantSlug')
  @Public()
  @SkipSubscriptionCheck()
  @Throttle({ webhook_integration: { ttl: 60_000, limit: 200 } })
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Param('tenantSlug') tenantSlug: string,
    @Req()
    req: {
      rawBody?: Buffer;
      headers: Record<string, string>;
      body: unknown;
    },
  ) {
    try {
      return await this.integrationsService.receiveWebhook(
        tenantSlug,
        req.rawBody ?? Buffer.alloc(0),
        req.headers,
        req.body,
      );
    } catch (err) {
      // Re-throw NestJS HTTP exceptions (401, 400, 404, 503) as-is
      if (
        err instanceof Error &&
        'status' in err &&
        typeof (err as Record<string, unknown>).status === 'number' &&
        (err as Record<string, unknown>).status !== 500
      ) {
        throw err;
      }
      this.logger.error(
        `Webhook unhandled error for slug=${tenantSlug}: ${String(err)}`,
      );
      throw new InternalServerErrorException('Internal processing error');
    }
  }
}
