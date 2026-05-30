import * as crypto from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { get } from 'lodash';
import type Redis from 'ioredis';
import {
  encrypt,
  decrypt,
  normalisePhone,
  PhoneNormalisationError,
} from '@pingloyal/utils';
import {
  CustomerSource,
  IntegrationConnectionType,
  IntegrationSyncStatus,
} from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Integration } from './entities/integration.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from '../customers/entities/customer.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';

interface FieldMapping {
  phone: string;
  amount: string;
  customerName?: string;
  categorySlug?: string;
  transactionId?: string;
  occurredAt?: string;
}

interface NormalisedTransaction {
  phone: string;
  amount: string;
  customerName: string;
  categorySlug: string;
  externalTransactionId: string;
}

export interface WebhookResult {
  received: boolean;
  customerId: string;
  pointsEarned: number;
  waOptedIn: boolean;
  message: string;
}

function maskKey(value: string | null): string {
  return value ? '••••••••' : '——';
}

function maskSecret(value: string | null): string {
  if (!value) return '——';
  return '••••••' + value.slice(-6);
}

function getStr(obj: Record<string, unknown>, path: string): string {
  const val = path ? get(obj, path) : undefined;
  if (val === null || val === undefined || typeof val === 'object') return '';
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(val);
}

function applyMapping(
  rawPayload: Record<string, unknown>,
  fieldMapping: FieldMapping,
): NormalisedTransaction {
  return {
    phone: getStr(rawPayload, fieldMapping.phone),
    amount: getStr(rawPayload, fieldMapping.amount),
    customerName: getStr(rawPayload, fieldMapping.customerName ?? ''),
    categorySlug: getStr(rawPayload, fieldMapping.categorySlug ?? ''),
    externalTransactionId: getStr(rawPayload, fieldMapping.transactionId ?? ''),
  };
}

const SIG_HEADERS = [
  'x-webhook-signature',
  'x-hub-signature-256',
  'x-signature',
  'x-hmac-sha256',
];

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly txService: TransactionsService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── GET /integrations ──────────────────────────────────────────────────────

  async findByTenant(tenantId: string) {
    const integration = await this.integrationRepo.findOne({
      where: { tenantId },
    });
    if (!integration) throw new NotFoundException('No integration configured');

    return this.toMaskedResponse(integration);
  }

  // ── POST /integrations ─────────────────────────────────────────────────────

  async upsert(tenantId: string, dto: CreateIntegrationDto) {
    let integration = await this.integrationRepo.findOne({
      where: { tenantId },
    });

    const apiKeyEncrypted = dto.apiKey
      ? encrypt(dto.apiKey)
      : (integration?.apiKeyEncrypted ?? null);

    let webhookSecret = integration?.webhookSecret ?? null;
    if (dto.webhookSecret) {
      webhookSecret = dto.webhookSecret;
    } else if (dto.connectionType === 'webhook' && !webhookSecret) {
      webhookSecret = crypto.randomBytes(32).toString('hex');
    }

    if (integration) {
      integration.connectionType =
        dto.connectionType as IntegrationConnectionType;
      integration.endpointUrl = dto.endpointUrl ?? null;
      integration.apiKeyEncrypted = apiKeyEncrypted;
      integration.webhookSecret = webhookSecret;
      integration.pollIntervalMins =
        dto.pollIntervalMins ?? integration.pollIntervalMins;
      integration.fieldMapping = dto.fieldMapping as unknown as Record<
        string,
        unknown
      >;
      await this.integrationRepo.save(integration);
    } else {
      integration = await this.integrationRepo.save(
        this.integrationRepo.create({
          tenantId,
          connectionType: dto.connectionType as IntegrationConnectionType,
          endpointUrl: dto.endpointUrl ?? null,
          apiKeyEncrypted,
          webhookSecret,
          pollIntervalMins: dto.pollIntervalMins ?? 5,
          fieldMapping: dto.fieldMapping as unknown as Record<string, unknown>,
        }),
      );
    }

    // Set tenant mode = 'connected' + invalidate cache
    await this.tenantRepo.update(tenantId, { mode: 'connected' as never });
    await Promise.all([
      this.redis.del(`tenant:${tenantId}`),
      this.redis.del(`tenant:full:${tenantId}`),
      this.redis.del(`tenant:sub:${tenantId}`),
    ]);

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const apiUrl =
      this.config.get<string>('FRONTEND_URL')?.replace('3001', '3000') ??
      'https://api.pingloyal.com';
    const webhookUrl = `${apiUrl}/api/v1/integrations/webhook/${tenant?.slug ?? tenantId}`;

    return { ...this.toMaskedResponse(integration), webhookUrl };
  }

  // ── POST /integrations/test ────────────────────────────────────────────────

  async test(tenantId: string) {
    const integration = await this.integrationRepo.findOne({
      where: { tenantId },
    });
    if (!integration) throw new NotFoundException('No integration configured');

    if (integration.connectionType === IntegrationConnectionType.WEBHOOK) {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      const apiUrl =
        this.config.get<string>('FRONTEND_URL')?.replace('3001', '3000') ??
        'https://api.pingloyal.com';
      const webhookUrl = `${apiUrl}/api/v1/integrations/webhook/${tenant?.slug ?? tenantId}`;
      const fm = integration.fieldMapping as unknown as FieldMapping;

      return {
        webhookUrl,
        webhookSecret: maskSecret(integration.webhookSecret),
        instructions: [
          'Configure your POS system to POST transaction data to the webhook URL above',
          'Include the header: X-Webhook-Signature: HMAC-SHA256(body, yourSecret)',
          'Test by sending a sample transaction from your POS system',
          'Check the integration status in your dashboard after sending',
        ],
        samplePayload: {
          [fm.phone]: '+2348012345678',
          [fm.amount]: '5000.00',
          [fm.customerName ?? 'customer_name']: 'Adaeze Obi',
          [fm.transactionId ?? 'transaction_id']: 'TXN-001',
        },
      };
    }

    // api_pull: attempt a live connection test
    if (!integration.endpointUrl || !integration.apiKeyEncrypted) {
      return { connected: false, error: 'Missing endpoint URL or API key' };
    }

    try {
      const apiKey = decrypt(integration.apiKeyEncrypted);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(integration.endpointUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = (await res.text()).slice(0, 200);
      return { connected: res.ok, sampleResponse: text };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── POST /integrations/webhook/:tenantSlug ─────────────────────────────────

  async receiveWebhook(
    tenantSlug: string,
    rawBody: Buffer,
    headers: Record<string, string>,
    parsedBody: unknown,
  ): Promise<WebhookResult> {
    // Step 1 — Find tenant
    const tenant = await this.tenantRepo.findOne({
      where: { slug: tenantSlug },
    });
    if (!tenant) throw new NotFoundException(`Tenant not found: ${tenantSlug}`);

    // Step 2 — Load integration
    const integration = await this.integrationRepo.findOne({
      where: { tenantId: tenant.id },
    });
    if (!integration) {
      throw new BadRequestException(
        'Integration not configured for this tenant',
      );
    }
    if (integration.syncStatus === IntegrationSyncStatus.PENDING) {
      // Allow pending integrations through
    }
    if ((integration.syncStatus as string) === 'paused') {
      throw new ServiceUnavailableException('Integration is paused');
    }

    // Step 3 — Verify HMAC
    const sigValue = SIG_HEADERS.map((h) => headers[h]).find(Boolean);
    if (!sigValue) {
      this.logger.warn(
        `Webhook HMAC missing: slug=${tenantSlug} ip=${headers['x-forwarded-for'] ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = crypto
      .createHmac('sha256', integration.webhookSecret ?? '')
      .update(rawBody)
      .digest('hex');

    const cleanSig = sigValue.replace(/^sha256=/, '');
    const sigBuffer = Buffer.from(cleanSig, 'hex');
    const expBuffer = Buffer.from(expected, 'hex');

    let valid = false;
    if (sigBuffer.length === expBuffer.length) {
      try {
        valid = crypto.timingSafeEqual(sigBuffer, expBuffer);
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      this.logger.warn(
        `Webhook HMAC mismatch: slug=${tenantSlug} ip=${headers['x-forwarded-for'] ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Steps 4-11 wrapped in error handler
    try {
      return await this.processWebhookPayload(
        tenant.id,
        integration,
        parsedBody as Record<string, unknown>,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Webhook processing error: tenantId=${tenant.id} error=${errMsg} ` +
          `body=${JSON.stringify(parsedBody).slice(0, 500)}`,
      );
      await this.integrationRepo.update(
        { tenantId: tenant.id },
        { syncStatus: IntegrationSyncStatus.ERROR, errorMessage: errMsg },
      );
      throw err;
    }
  }

  private async processWebhookPayload(
    tenantId: string,
    integration: Integration,
    rawPayload: Record<string, unknown>,
  ): Promise<WebhookResult> {
    const fm = integration.fieldMapping as unknown as FieldMapping;

    // Step 4 — Apply field mapping
    const normalised = applyMapping(rawPayload, fm);

    if (!normalised.phone) {
      throw new BadRequestException(
        'phone field not found. Check your field mapping configuration.',
      );
    }
    if (
      !normalised.amount ||
      isNaN(parseFloat(normalised.amount)) ||
      parseFloat(normalised.amount) <= 0
    ) {
      throw new BadRequestException('amount field invalid');
    }

    let phoneE164: string;
    try {
      phoneE164 = normalisePhone(normalised.phone);
    } catch (err) {
      if (err instanceof PhoneNormalisationError) {
        throw new BadRequestException('Invalid phone number in payload');
      }
      throw err;
    }

    // Step 5 — Find or create customer
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
      this.logger.log(
        `New Connected Mode customer created without WA consent: tenantId=${tenantId}`,
      );
    } else if (customer.fullName === 'Unknown' && normalised.customerName) {
      await this.customerRepo.update(customer.id, {
        fullName: normalised.customerName,
      });
      customer.fullName = normalised.customerName;
    }

    // Step 6 — Resolve category
    let categoryId: string | undefined;
    if (normalised.categorySlug) {
      const cat = await this.categoryRepo.findOne({
        where: { tenantId, slug: normalised.categorySlug },
      });
      categoryId = cat?.id;
    }

    // Step 7 — Build idempotency key
    const idempotencyKey = normalised.externalTransactionId
      ? `webhook_${tenantId}_${normalised.externalTransactionId}`
      : `webhook_${tenantId}_${crypto.randomUUID()}`;

    // Step 8 — Create transaction
    const result = await this.txService.create(tenantId, null, {
      customerId: customer.id,
      amount: parseFloat(normalised.amount).toFixed(2),
      categoryId,
      idempotencyKey,
    });

    // Step 9 — Update sync status
    await this.integrationRepo.update(
      { tenantId },
      {
        syncStatus: IntegrationSyncStatus.ACTIVE,
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    );

    // Step 10 — Return
    return {
      received: true,
      customerId: customer.id,
      pointsEarned: result.pointsEarned,
      waOptedIn: customer.waOptedIn,
      message: customer.waOptedIn
        ? 'Transaction processed. WhatsApp message queued.'
        : 'Transaction processed. Customer not yet opted in to WhatsApp.',
    };
  }

  private toMaskedResponse(integration: Integration) {
    return {
      id: integration.id,
      connectionType: integration.connectionType,
      endpointUrl: integration.endpointUrl,
      apiKey: maskKey(integration.apiKeyEncrypted),
      webhookSecret: maskSecret(integration.webhookSecret),
      pollIntervalMins: integration.pollIntervalMins,
      fieldMapping: integration.fieldMapping,
      syncStatus: integration.syncStatus,
      lastSyncedAt: integration.lastSyncedAt,
      errorMessage: integration.errorMessage,
    };
  }
}
