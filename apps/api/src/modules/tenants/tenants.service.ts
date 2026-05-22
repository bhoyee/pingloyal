import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { WaVerificationStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from './entities/tenant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { TierConfig } from './entities/tier-config.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpsertTierConfigDto } from './dto/upsert-tier-config.dto';
import { validateTiers } from './utils/validate-tiers.util';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(TierConfig)
    private readonly tierConfigRepo: Repository<TierConfig>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Cache helpers ──────────────────────────────────────────────────────────

  private async invalidateTenantCache(tenantId: string): Promise<void> {
    await Promise.all([
      this.redis.del(`tenant:${tenantId}`),
      this.redis.del(`tenant:full:${tenantId}`),
      this.redis.del(`tenant:sub:${tenantId}`),
    ]);
  }

  // ── findOne (used by every other module) ──────────────────────────────────

  async findOne(tenantId: string): Promise<Tenant> {
    const cached = await this.redis.get(`tenant:${tenantId}`);
    if (cached) return JSON.parse(cached) as Tenant;

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.redis.setex(`tenant:${tenantId}`, 60, JSON.stringify(tenant));
    return tenant;
  }

  async findOneWithSubscription(tenantId: string): Promise<Tenant> {
    const cached = await this.redis.get(`tenant:sub:${tenantId}`);
    if (cached) return JSON.parse(cached) as Tenant;

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.redis.setex(
      `tenant:sub:${tenantId}`,
      60,
      JSON.stringify(tenant),
    );
    return tenant;
  }

  // ── GET /tenants/me ───────────────────────────────────────────────────────

  async getTenantFull(tenantId: string): Promise<TenantFullResponse> {
    const cached = await this.redis.get(`tenant:full:${tenantId}`);
    if (cached) return JSON.parse(cached) as TenantFullResponse;

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const response = this.toFullResponse(tenant);
    await this.redis.setex(
      `tenant:full:${tenantId}`,
      60,
      JSON.stringify(response),
    );
    return response;
  }

  // ── PATCH /tenants/settings ───────────────────────────────────────────────

  async updateSettings(
    tenantId: string,
    dto: UpdateSettingsDto,
  ): Promise<TenantFullResponse> {
    await this.tenantRepo.update(tenantId, dto);
    await this.invalidateTenantCache(tenantId);
    return this.getTenantFull(tenantId);
  }

  // ── GET /tenants/categories ───────────────────────────────────────────────

  async getCategories(tenantId: string): Promise<ProductCategory[]> {
    const cached = await this.redis.get(`categories:${tenantId}`);
    if (cached) return JSON.parse(cached) as ProductCategory[];

    const categories = await this.categoryRepo.find({
      where: { tenantId },
      order: { isActive: 'DESC', name: 'ASC' },
    });

    await this.redis.setex(
      `categories:${tenantId}`,
      300,
      JSON.stringify(categories),
    );
    return categories;
  }

  // ── POST /tenants/categories ──────────────────────────────────────────────

  async createCategory(
    tenantId: string,
    dto: CreateCategoryDto,
  ): Promise<ProductCategory> {
    const slug = dto.slug ?? this.toSlug(dto.name);

    const existing = await this.categoryRepo.findOne({
      where: { tenantId, slug },
    });
    if (existing) {
      throw new ConflictException(
        `Category slug '${slug}' already exists for this tenant`,
      );
    }

    const category = this.categoryRepo.create({
      tenantId,
      name: dto.name,
      slug,
      isActive: true,
    });
    const saved = await this.categoryRepo.save(category);
    await this.redis.del(`categories:${tenantId}`);
    return saved;
  }

  // ── PUT /tenants/tier-config ──────────────────────────────────────────────

  async upsertTierConfig(
    tenantId: string,
    dto: UpsertTierConfigDto,
  ): Promise<TierConfig[]> {
    validateTiers(
      dto.tiers.map((t, i) => ({
        tierName: t.tierName,
        min: t.minQuarterlySpend,
        max: t.maxQuarterlySpend ?? null,
        // also carry displayOrder for the insert step
        _idx: i,
      })),
    );

    const newTiers = await this.dataSource.transaction(async (manager) => {
      await manager.delete(TierConfig, { tenantId });

      const rows = dto.tiers.map((t, i) =>
        manager.create(TierConfig, {
          tenantId,
          tierName: t.tierName,
          tierLabel: t.tierLabel,
          minQuarterlySpend: t.minQuarterlySpend,
          maxQuarterlySpend: t.maxQuarterlySpend ?? null,
          displayOrder: t.displayOrder ?? i,
        }),
      );
      return manager.save(TierConfig, rows);
    });

    await this.redis.del(`tiers:${tenantId}`);
    return newTiers;
  }

  // ── GET /tenants/tier-config ──────────────────────────────────────────────

  async getTierConfig(tenantId: string): Promise<TierConfig[]> {
    const cached = await this.redis.get(`tiers:${tenantId}`);
    if (cached) return JSON.parse(cached) as TierConfig[];

    const tiers = await this.tierConfigRepo.find({
      where: { tenantId },
      order: { minQuarterlySpend: 'DESC' },
    });

    await this.redis.setex(`tiers:${tenantId}`, 300, JSON.stringify(tiers));
    return tiers;
  }

  // ── GET /tenants/whatsapp/status ──────────────────────────────────────────

  async getWhatsappStatus(tenantId: string): Promise<WhatsappStatusResponse> {
    const tenant = await this.findOne(tenantId);
    return this.toWhatsappStatus(tenant);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (phone.length <= 9) return phone;
    return phone.slice(0, 7) + '****' + phone.slice(-2);
  }

  private toWhatsappStatus(tenant: Tenant): WhatsappStatusResponse {
    return {
      isConnected:
        tenant.waVerificationStatus === WaVerificationStatus.VERIFIED,
      verificationStatus: tenant.waVerificationStatus,
      displayName: tenant.waDisplayName ?? null,
      phoneNumber: this.maskPhone(tenant.waPhoneNumber),
      category: tenant.waBusinessCategory ?? null,
      verifiedAt: tenant.waVerifiedAt ?? null,
    };
  }

  private toFullResponse(tenant: Tenant): TenantFullResponse {
    return {
      id: tenant.id,
      businessName: tenant.businessName,
      slug: tenant.slug,
      mode: tenant.mode,
      planTier: tenant.planTier,
      currency: tenant.currency,
      timezone: tenant.timezone,
      pointsEarnRate: Number(tenant.pointsEarnRate),
      pointsThreshold: tenant.pointsThreshold,
      rewardValue: Number(tenant.rewardValue),
      lapsedDays: tenant.lapsedDays,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt,
      logoUrl: tenant.logoUrl ?? null,
      qrCodeUrl: tenant.qrCodeUrl ?? null,
      marketingWalletBalance: Number(tenant.marketingWalletBalance),
      whatsapp: this.toWhatsappStatus(tenant),
    };
  }
}

// ── Response shapes ──────────────────────────────────────────────────────────

export interface WhatsappStatusResponse {
  isConnected: boolean;
  verificationStatus: WaVerificationStatus;
  displayName: string | null;
  phoneNumber: string | null;
  category: string | null;
  verifiedAt: Date | null;
}

export interface TenantFullResponse {
  id: string;
  businessName: string;
  slug: string;
  mode: string;
  planTier: string;
  currency: string;
  timezone: string;
  pointsEarnRate: number;
  pointsThreshold: number;
  rewardValue: number;
  lapsedDays: number;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  logoUrl: string | null;
  qrCodeUrl: string | null;
  marketingWalletBalance: number;
  whatsapp: WhatsappStatusResponse;
}
