import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  normalisePhone,
  maskPhone,
  PhoneNormalisationError,
  isTriggerEnabled,
} from '@pingloyal/utils';
import {
  CustomerSource,
  TriggerType,
  WaVerificationStatus,
} from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Customer } from './entities/customer.entity';
import { RegisterCustomerDto } from './dto/register-customer.dto';

const IDEMPOTENCY_TTL_S = 86_400; // 24 hours

export interface RegisterCustomerResult {
  id: string;
  tenantId: string;
  fullName: string;
  phoneE164: string;
  waOptedIn: boolean;
  pointsBalance: number;
  isNew: boolean;
}

export interface CustomerLookupResult {
  id: string;
  fullName: string;
  phoneE164: string;
  pointsBalance: number;
  tierId: string | null;
  tier: string | null;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  progressPercent: number;
}

export interface TenantInfoResult {
  businessName: string;
  logoUrl: string | null;
  qrCodeUrl: string | null;
  currency: string;
  pointsThreshold: number;
  rewardValue: number;
  waVerificationStatus: WaVerificationStatus;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue('wa-messages') private readonly waMessagesQueue: Queue,
  ) {}

  async register(
    dto: RegisterCustomerDto,
    idempotencyKey: string,
  ): Promise<RegisterCustomerResult> {
    // ── Idempotency check ──────────────────────────────────────────────────────
    const idemCacheKey = `idem:register:${idempotencyKey}`;
    const cached = await this.redis.get(idemCacheKey);
    if (cached) {
      return JSON.parse(cached) as RegisterCustomerResult;
    }

    // ── Tenant lookup ──────────────────────────────────────────────────────────
    const tenant = await this.tenantRepo.findOne({
      where: { slug: dto.tenantSlug },
      select: ['id', 'slug', 'waVerificationStatus'],
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant not found: ${dto.tenantSlug}`);
    }

    // ── Phone normalisation ────────────────────────────────────────────────────
    let phoneE164: string;
    try {
      phoneE164 = normalisePhone(dto.phone);
    } catch (err) {
      if (err instanceof PhoneNormalisationError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    // ── Upsert customer by (tenantId, phoneE164) ───────────────────────────────
    const existing = await this.customerRepo.findOne({
      where: { tenantId: tenant.id, phoneE164 },
    });

    const isNew = existing === null;
    let customer: Customer;

    if (isNew) {
      const draft = this.customerRepo.create({
        tenantId: tenant.id,
        fullName: dto.fullName,
        phoneE164,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        waOptedIn: dto.waOptedIn,
        waOptedInAt: dto.waOptedIn ? new Date() : null,
        source: CustomerSource.QR_REGISTRATION,
      });
      customer = await this.customerRepo.save(draft);

      // Assign the lowest configured tier (₦0 spend qualifies for it)
      // so new customers don't show a blank tier until their first purchase.
      await this.customerRepo.manager.query(
        `UPDATE customers SET tier_id = (
           SELECT id FROM tier_configs
            WHERE tenant_id = $1
            ORDER BY min_quarterly_spend ASC
            LIMIT 1
         ) WHERE id = $2`,
        [tenant.id, customer.id],
      );
    } else {
      // Update name and opt-in if changed
      let changed = false;
      if (existing.fullName !== dto.fullName) {
        existing.fullName = dto.fullName;
        changed = true;
      }
      if (dto.waOptedIn && !existing.waOptedIn) {
        existing.waOptedIn = true;
        existing.waOptedInAt = new Date();
        changed = true;
      }
      customer = changed ? await this.customerRepo.save(existing) : existing;
    }

    // ── WhatsApp welcome trigger gate ──────────────────────────────────────────
    if (
      dto.waOptedIn &&
      isNew &&
      isTriggerEnabled(tenant.enabledTriggers, TriggerType.WELCOME)
    ) {
      if (tenant.waVerificationStatus === WaVerificationStatus.VERIFIED) {
        await this.waMessagesQueue.add(
          'send-message',
          {
            type: 'welcome',
            tenantId: tenant.id,
            customerId: customer.id,
            data: { phoneE164 },
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
      } else {
        this.logger.warn(
          `Skipping welcome trigger — tenant ${tenant.id} WhatsApp not verified ` +
            `(status=${tenant.waVerificationStatus})`,
        );
      }
    }

    const result: RegisterCustomerResult = {
      id: customer.id,
      tenantId: customer.tenantId,
      fullName: customer.fullName,
      phoneE164: customer.phoneE164,
      waOptedIn: customer.waOptedIn,
      pointsBalance: customer.pointsBalance,
      isNew,
    };

    // Cache for idempotency window
    await this.redis.setex(
      idemCacheKey,
      IDEMPOTENCY_TTL_S,
      JSON.stringify(result),
    );

    void this.redis
      .del(
        `dashboard:summary:${customer.tenantId}`,
        `dashboard:top-spenders:${customer.tenantId}`,
      )
      .catch(() => null);

    return result;
  }

  async findById(tenantId: string, customerId: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async findAll(tenantId: string): Promise<Customer[]> {
    return this.customerRepo.find({
      where: { tenantId, isActive: true },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });
  }

  async lookup(
    tenantId: string,
    rawPhone: string,
  ): Promise<CustomerLookupResult> {
    let phoneE164: string;
    try {
      phoneE164 = normalisePhone(rawPhone);
    } catch (err) {
      if (err instanceof PhoneNormalisationError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const customer = await this.customerRepo.findOne({
      where: { tenantId, phoneE164, isActive: true },
      relations: ['tier'],
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: ['pointsThreshold'],
    });
    const threshold = tenant?.pointsThreshold ?? 1000;

    return {
      id: customer.id,
      fullName: customer.fullName,
      phoneE164: maskPhone(phoneE164),
      pointsBalance: customer.pointsBalance,
      tierId: customer.tierId,
      tier: customer.tier?.tierLabel ?? null,
      lastPurchaseAt: customer.lastPurchaseAt?.toISOString() ?? null,
      purchaseCount: customer.purchaseCount,
      progressPercent: Math.min(
        100,
        Math.round((customer.pointsBalance / threshold) * 100),
      ),
    };
  }

  async getTenantInfo(slug: string): Promise<TenantInfoResult> {
    const tenant = await this.tenantRepo.findOne({
      where: { slug },
      select: [
        'businessName',
        'logoUrl',
        'qrCodeUrl',
        'currency',
        'pointsThreshold',
        'rewardValue',
        'waVerificationStatus',
      ],
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant not found: ${slug}`);
    }
    return {
      businessName: tenant.businessName,
      logoUrl: tenant.logoUrl,
      qrCodeUrl: tenant.qrCodeUrl,
      currency: tenant.currency,
      pointsThreshold: tenant.pointsThreshold,
      rewardValue: tenant.rewardValue,
      waVerificationStatus: tenant.waVerificationStatus,
    };
  }
}
