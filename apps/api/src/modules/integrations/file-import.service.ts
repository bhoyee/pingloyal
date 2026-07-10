import * as crypto from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type Redis from 'ioredis';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';
import { normalisePhone, PhoneNormalisationError } from '@pingloyal/utils';
import {
  CustomerSource,
  IntegrationConnectionType,
  IntegrationSyncStatus,
  TransactionSource,
} from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Integration } from './entities/integration.entity';
import { Customer } from '../customers/entities/customer.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { type FieldMapping, applyMapping } from './utils/apply-mapping.util';

export const FILE_IMPORT_PROCESS_EVENT = 'integration-file-import.process';

const JOB_TTL_S = 86_400;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;
const VALID_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
];

export interface FileImportJobStatus {
  status: 'pending' | 'processing' | 'done' | 'failed';
  total: number;
  processed: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface FileImportProcessPayload {
  jobId: string;
  tenantId: string;
  integrationId: string;
  buffer: Buffer;
}

@Injectable()
export class FileImportService {
  private readonly logger = new Logger(FileImportService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly txService: TransactionsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly emitter: EventEmitter2,
  ) {}

  async uploadFile(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<{ jobId: string; status: string; message: string }> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    if (!VALID_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Upload a CSV file.`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }

    const integration = await this.integrationRepo.findOne({
      where: { tenantId },
    });
    if (
      !integration ||
      integration.connectionType !== IntegrationConnectionType.FILE_EXPORT
    ) {
      throw new BadRequestException(
        'Save your field mapping with connection type "File Export" first.',
      );
    }

    const jobId = uuidv4();
    const jobKey = `file-import:${tenantId}:${jobId}`;
    const now = new Date().toISOString();
    const initial: FileImportJobStatus = {
      status: 'pending',
      total: 0,
      processed: 0,
      failed: 0,
      errors: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.redis.setex(jobKey, JOB_TTL_S, JSON.stringify(initial));

    const payload: FileImportProcessPayload = {
      jobId,
      tenantId,
      integrationId: integration.id,
      buffer: file.buffer,
    };
    this.emitter.emit(FILE_IMPORT_PROCESS_EVENT, payload);

    return { jobId, status: 'pending', message: 'File import started' };
  }

  async getJobStatus(
    tenantId: string,
    jobId: string,
  ): Promise<FileImportJobStatus> {
    const raw = await this.redis.get(`file-import:${tenantId}:${jobId}`);
    if (!raw) {
      throw new NotFoundException(`Import job not found: ${jobId}`);
    }
    return JSON.parse(raw) as FileImportJobStatus;
  }

  buildTemplate(fieldMapping: FieldMapping): Buffer {
    const headers = [
      fieldMapping.phone || 'phone',
      fieldMapping.amount || 'amount',
      fieldMapping.customerName || 'customer_name',
      fieldMapping.categorySlug || 'category_slug',
      fieldMapping.transactionId || 'transaction_id',
      fieldMapping.occurredAt || 'occurred_at',
    ];
    const lines = [
      '# PingLoyal Transaction File Import',
      `# Columns must match your configured field mapping exactly: ${headers.join(', ')}`,
      '# Maximum 5,000 rows per file.',
      headers.join(','),
      `+2348012345678,5000.00,Adaeze Obi,groceries,TXN-001,${new Date().toISOString()}`,
    ];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  async processFile(payload: FileImportProcessPayload): Promise<void> {
    const { jobId, tenantId, integrationId, buffer } = payload;
    const jobKey = `file-import:${tenantId}:${jobId}`;

    const updateJob = async (
      patch: Partial<FileImportJobStatus>,
    ): Promise<void> => {
      const existing = await this.redis.get(jobKey);
      const current: FileImportJobStatus = existing
        ? (JSON.parse(existing) as FileImportJobStatus)
        : {
            status: 'pending',
            total: 0,
            processed: 0,
            failed: 0,
            errors: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
      const merged = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      await this.redis.setex(jobKey, JOB_TTL_S, JSON.stringify(merged));
    };

    try {
      await updateJob({ status: 'processing' });

      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, tenantId },
      });
      if (!integration) {
        await updateJob({
          status: 'failed',
          errors: [{ row: 0, reason: 'Integration no longer exists' }],
        });
        return;
      }
      const fm = integration.fieldMapping as unknown as FieldMapping;

      // ── 1. Parse CSV — headers are taken verbatim (no case/whitespace
      // normalisation) so they line up 1:1 with whatever the user typed
      // into the Field Mapping table.
      let rawRows: Record<string, string>[];
      try {
        rawRows = parse(buffer, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          comment: '#',
          bom: true,
        });
      } catch (e) {
        await updateJob({
          status: 'failed',
          errors: [{ row: 0, reason: `CSV parse error: ${String(e)}` }],
        });
        return;
      }

      if (rawRows.length > MAX_ROWS) {
        await updateJob({
          status: 'failed',
          errors: [
            {
              row: 0,
              reason: `File contains ${rawRows.length} data rows; maximum allowed is ${MAX_ROWS}`,
            },
          ],
        });
        return;
      }

      // ── 2. Process each row exactly like a webhook/API-pull transaction ──────
      let processed = 0;
      const errors: FileImportJobStatus['errors'] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const rowNum = i + 2; // header is row 1, data starts at row 2
        const rawRow = rawRows[i];

        try {
          const normalised = applyMapping(rawRow, fm);

          if (!normalised.phone) {
            errors.push({
              row: rowNum,
              reason: 'phone field not found — check your field mapping',
            });
            continue;
          }

          let phoneE164: string;
          try {
            phoneE164 = normalisePhone(normalised.phone);
          } catch (err) {
            errors.push({
              row: rowNum,
              reason:
                err instanceof PhoneNormalisationError
                  ? err.message
                  : 'Invalid phone number',
            });
            continue;
          }

          const amountNum = parseFloat(normalised.amount);
          if (!normalised.amount || isNaN(amountNum) || amountNum <= 0) {
            errors.push({
              row: rowNum,
              reason: 'amount field invalid — check your field mapping',
            });
            continue;
          }

          let customer = await this.customerRepo.findOne({
            where: { tenantId, phoneE164 },
          });

          if (!customer) {
            customer = await this.customerRepo.save(
              this.customerRepo.create({
                tenantId,
                fullName: normalised.customerName || 'Unknown',
                phoneE164,
                source: CustomerSource.CONNECTED_SYNC,
                waOptedIn: false,
                waOptedInAt: null,
                isActive: true,
              }),
            );
          } else if (
            customer.fullName === 'Unknown' &&
            normalised.customerName
          ) {
            await this.customerRepo.update(customer.id, {
              fullName: normalised.customerName,
            });
          }

          let categoryId: string | undefined;
          if (normalised.categorySlug) {
            const cat = await this.categoryRepo.findOne({
              where: { tenantId, slug: normalised.categorySlug },
            });
            categoryId = cat?.id;
          }

          // Deterministic per-row hash when no transactionId is mapped, so
          // re-uploading the same file is a harmless no-op (txService.create
          // treats a repeated idempotencyKey as already-processed) instead of
          // double-counting points.
          const idempotencyKey = normalised.externalTransactionId
            ? `fileimport_${tenantId}_${normalised.externalTransactionId}`
            : `fileimport_${tenantId}_${crypto
                .createHash('sha256')
                .update(
                  `${normalised.phone}|${normalised.amount}|${normalised.occurredAt}|${rowNum}`,
                )
                .digest('hex')}`;

          await this.txService.create(
            tenantId,
            null,
            {
              customerId: customer.id,
              amount: amountNum.toFixed(2),
              categoryId,
              idempotencyKey,
              occurredAt: normalised.occurredAt || undefined,
            },
            TransactionSource.FILE_IMPORT,
          );
          processed++;
        } catch (err) {
          errors.push({
            row: rowNum,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await this.integrationRepo.update(integrationId, {
        syncStatus: IntegrationSyncStatus.ACTIVE,
        lastSyncedAt: new Date(),
        errorMessage: null,
      });

      await updateJob({
        status: 'done',
        total: rawRows.length,
        processed,
        failed: errors.length,
        errors,
      });

      this.logger.log(
        `[FILE-IMPORT] job=${jobId} tenant=${tenantId} processed=${processed} failed=${errors.length}`,
      );
    } catch (err) {
      this.logger.error(`[FILE-IMPORT] job=${jobId} failed: ${String(err)}`);
      await updateJob({
        status: 'failed',
        errors: [{ row: 0, reason: String(err) }],
      });
    }
  }
}
