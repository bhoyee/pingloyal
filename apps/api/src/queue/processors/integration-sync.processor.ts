import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import {
  decrypt,
  normalisePhone,
  PhoneNormalisationError,
} from '@pingloyal/utils';
import {
  CustomerSource,
  IntegrationSyncStatus,
  TransactionSource,
} from '@pingloyal/types';
import { Integration } from '../../modules/integrations/entities/integration.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
import { TransactionsService } from '../../modules/transactions/transactions.service';
import {
  type FieldMapping,
  applyMapping,
  extractTransactions,
  getStr,
} from '../../modules/integrations/utils/apply-mapping.util';

interface SyncJobPayload {
  integrationId: string;
  tenantId: string;
}

interface IntegrationWithTenant {
  id: string;
  tenantId: string;
  endpointUrl: string | null;
  apiKeyEncrypted: string | null;
  webhookSecret: string | null;
  pollIntervalMins: number;
  fieldMapping: Record<string, unknown>;
  syncStatus: string;
  lastSyncCursor: string | null;
  pointsEarnRate: number;
  pointsThreshold: number;
  lapsedDays: number;
}

@Processor('integration-sync')
export class IntegrationSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(IntegrationSyncProcessor.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly txService: TransactionsService,
  ) {
    super();
  }

  async process(job: Job<SyncJobPayload>): Promise<void> {
    const { integrationId, tenantId } = job.data;

    // Step 1 — Load integration with tenant info

    const rows: IntegrationWithTenant[] =
      await this.integrationRepo.manager.query(
        `SELECT i.id, i.tenant_id AS "tenantId", i.endpoint_url AS "endpointUrl",
              i.api_key_encrypted AS "apiKeyEncrypted",
              i.webhook_secret AS "webhookSecret",
              i.poll_interval_mins AS "pollIntervalMins",
              i.field_mapping AS "fieldMapping",
              i.sync_status AS "syncStatus",
              i.last_sync_cursor AS "lastSyncCursor",
              t.points_earn_rate AS "pointsEarnRate",
              t.points_threshold AS "pointsThreshold",
              t.lapsed_days AS "lapsedDays"
       FROM integrations i
       JOIN tenants t ON i.tenant_id = t.id
       WHERE i.id = $1 AND i.tenant_id = $2`,
        [integrationId, tenantId],
      );

    if (!rows.length) {
      this.logger.warn(`Integration not found: id=${integrationId}`);
      return;
    }

    const integration: IntegrationWithTenant = rows[0];

    if (integration.syncStatus === 'paused') {
      this.logger.log(`Integration paused, skipping: id=${integrationId}`);
      return;
    }

    // Step 2 — Decrypt API key
    let apiKey: string;
    try {
      apiKey = decrypt(integration.apiKeyEncrypted ?? '');
    } catch {
      this.logger.error(
        `Failed to decrypt API key for integration ${integrationId}`,
      );
      await this.markError(integrationId, 'Failed to decrypt API key');
      return;
    }

    // Step 7 outer error handler
    try {
      await this.runSync(integration, apiKey, tenantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.markError(integrationId, msg.slice(0, 500));
      throw err;
    }
  }

  private async runSync(
    integration: IntegrationWithTenant,
    apiKey: string,
    tenantId: string,
  ): Promise<void> {
    const integrationId = integration.id;

    // Step 3 — Make GET request
    const params: Record<string, string> = { limit: '100', per_page: '100' };
    if (integration.lastSyncCursor) {
      params.since = integration.lastSyncCursor;
    }

    const url = `${integration.endpointUrl ?? ''}?${new URLSearchParams(params).toString()}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'X-PingLoyal-Source': 'api-pull',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new Error(`HTTP request failed: ${String(err)}`);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await this.markError(
          integrationId,
          'API key rejected — check credentials',
        );
        return; // permanent failure — do not retry
      }
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status} — will retry`);
      }
      await this.markError(integrationId, `HTTP ${response.status}`);
      return;
    }

    // Step 4 — Extract transactions
    const body = (await response.json()) as unknown;
    const transactions = extractTransactions(body);

    if (transactions.length === 0) {
      this.logger.log(
        `API pull: no new transactions from ${integration.endpointUrl ?? ''}`,
      );
      await this.integrationRepo.update(integrationId, {
        syncStatus: IntegrationSyncStatus.ACTIVE,
        lastSyncedAt: new Date(),
        errorMessage: null,
      });
      return;
    }

    // Step 5 — Process each transaction
    const fm = integration.fieldMapping as unknown as FieldMapping;
    let processed = 0;
    let failed = 0;
    let newCursor: string | null = null;

    for (const rawTx of transactions) {
      try {
        const normalised = applyMapping(rawTx, fm);

        let phoneE164: string;
        try {
          phoneE164 = normalisePhone(normalised.phone);
        } catch (err) {
          if (err instanceof PhoneNormalisationError) {
            this.logger.warn(`API pull: invalid phone ${normalised.phone}`);
            failed++;
            continue;
          }
          throw err;
        }

        // Find or create customer
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
        } else if (customer.fullName === 'Unknown' && normalised.customerName) {
          await this.customerRepo.update(customer.id, {
            fullName: normalised.customerName,
          });
          customer.fullName = normalised.customerName;
        }

        // Resolve category
        let categoryId: string | undefined;
        if (normalised.categorySlug) {
          const cat = await this.categoryRepo.findOne({
            where: { tenantId, slug: normalised.categorySlug },
          });
          categoryId = cat?.id;
        }

        // Build idempotency key
        const idempotencyKey = normalised.externalTransactionId
          ? `apipull_${tenantId}_${normalised.externalTransactionId}`
          : `apipull_${tenantId}_${crypto.randomUUID()}`;

        await this.txService.create(
          tenantId,
          null,
          {
            customerId: customer.id,
            amount: parseFloat(normalised.amount).toFixed(2),
            categoryId,
            idempotencyKey,
            occurredAt: normalised.occurredAt || undefined,
          },
          TransactionSource.API_PULL,
        );

        processed++;

        // Track cursor
        if (fm.transactionId) {
          newCursor = getStr(rawTx, fm.transactionId) || newCursor;
        } else if (normalised.occurredAt) {
          newCursor = normalised.occurredAt || newCursor;
        } else {
          newCursor = new Date().toISOString();
        }
      } catch (err) {
        failed++;
        this.logger.warn(
          `API pull transaction failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Step 6 — Update integration
    await this.integrationRepo.update(integrationId, {
      syncStatus: IntegrationSyncStatus.ACTIVE,
      lastSyncedAt: new Date(),
      lastSyncCursor: newCursor ?? integration.lastSyncCursor ?? undefined,
      errorMessage: null,
    });

    this.logger.log(
      `API pull complete: ${processed} processed, ${failed} failed — integrationId=${integrationId}`,
    );
    if (failed > 0) {
      this.logger.warn(
        `API pull: ${failed} transaction(s) failed — integrationId=${integrationId}`,
      );
    }
  }

  private async markError(
    integrationId: string,
    message: string,
  ): Promise<void> {
    await this.integrationRepo.update(integrationId, {
      syncStatus: IntegrationSyncStatus.ERROR,
      errorMessage: message,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Job failed: queue=integration-sync jobId=${job.id} ` +
        `attempts=${job.attemptsMade}/${String(job.opts.attempts ?? 3)} ` +
        `error=${err.message}`,
      err.stack,
    );
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setExtra('queue', 'integration-sync');
        scope.setExtra('jobId', job.id);
        scope.setExtra('jobData', JSON.stringify(job.data).slice(0, 500));
        scope.setExtra('attempts', job.attemptsMade);
        Sentry.captureException(err);
      });
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Job stalled: queue=integration-sync jobId=${jobId}`);
  }
}
