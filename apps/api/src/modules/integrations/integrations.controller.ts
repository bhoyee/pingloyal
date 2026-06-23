import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { IntegrationsService } from './integrations.service';
import { IntegrationSchedulerService } from './integration-scheduler.service';
import { FileImportService } from './file-import.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import type { FieldMapping } from './utils/apply-mapping.util';

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly scheduler: IntegrationSchedulerService,
    private readonly fileImportService: FileImportService,
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

  @Get('file-upload/template')
  @Roles(UserRole.OWNER)
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="pingloyal-transactions-template.csv"',
  )
  async getFileUploadTemplate(
    @Req() req: { user: RequestUser },
  ): Promise<StreamableFile> {
    const integration = await this.integrationsService.findRaw(
      req.user.tenantId,
    );
    const fm = (integration?.fieldMapping ?? {}) as unknown as FieldMapping;
    return new StreamableFile(this.fileImportService.buildTemplate(fm));
  }

  @Post('file-upload')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Req() req: { user: RequestUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.fileImportService.uploadFile(req.user.tenantId, file);
  }

  @Get('file-upload/:jobId')
  @Roles(UserRole.OWNER)
  getFileUploadStatus(
    @Req() req: { user: RequestUser },
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.fileImportService.getJobStatus(req.user.tenantId, jobId);
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
