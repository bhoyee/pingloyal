import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { CustomersService } from './customers.service';
import { ImportService } from './import.service';

// ── Public registration endpoint ──────────────────────────────────────────────

@Controller('register')
@Public()
@SkipSubscriptionCheck()
export class RegisterController {
  constructor(private readonly customersService: CustomersService) {}

  @Get(':slug/tenant-info')
  getTenantInfo(@Param('slug') slug: string) {
    return this.customersService.getTenantInfo(slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(
    @Body() dto: RegisterCustomerDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.customersService.register(dto, idempotencyKey);
  }
}

// ── Authenticated customers management ────────────────────────────────────────

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly importService: ImportService,
  ) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  findAll(@CurrentUser() user: RequestUser) {
    return this.customersService.findAll(user.tenantId);
  }

  // ── CSV import endpoints (before /:id to avoid route shadowing) ──────────────

  @Get('import/template')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="customers-import-template.csv"',
  )
  getImportTemplate(): StreamableFile {
    return new StreamableFile(this.importService.buildTemplate());
  }

  @Post('import')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  startImport(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importService.startImport(user.tenantId, file);
  }

  @Get('import/:jobId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  getImportStatus(
    @CurrentUser() user: RequestUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.importService.getJobStatus(user.tenantId, jobId);
  }

  @Get('lookup')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  lookup(@CurrentUser() user: RequestUser, @Query('phone') phone: string) {
    if (!phone) {
      throw new BadRequestException('phone query parameter is required');
    }
    return this.customersService.lookup(user.tenantId, phone);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.findById(user.tenantId, id);
  }
}
