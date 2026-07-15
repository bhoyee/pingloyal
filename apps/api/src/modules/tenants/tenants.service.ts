import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import * as QRCode from 'qrcode';
import sharp from 'sharp';

interface UploadedFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
}
import { UserRole, WaVerificationStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { MailerService } from '../../common/mailer/mailer.service';
import { R2Service } from '../storage/r2.service';
import { User } from '../auth/entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { TierConfig } from './entities/tier-config.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpsertTierConfigDto } from './dto/upsert-tier-config.dto';
import { RequestAccountDeletionDto } from './dto/request-account-deletion.dto';
import { validateTiers } from './utils/validate-tiers.util';
import { TierService } from './tier.service';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(TierConfig)
    private readonly tierConfigRepo: Repository<TierConfig>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly r2: R2Service,
    private readonly config: ConfigService,
    private readonly tierService: TierService,
    private readonly mailer: MailerService,
  ) {}

  // ── Cache helpers ──────────────────────────────────────────────────────────

  private keyFromUrl(url: string): string | null {
    try {
      const path = new URL(url).pathname;
      return path.startsWith('/') ? path.slice(1) : path;
    } catch {
      return null;
    }
  }

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

  async getTenantFull(
    tenantId: string,
    userId?: string,
  ): Promise<TenantFullResponse> {
    let response: TenantFullResponse;
    const cached = await this.redis.get(`tenant:full:${tenantId}`);
    if (cached) {
      response = JSON.parse(cached) as TenantFullResponse;
    } else {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('Tenant not found');

      response = this.toFullResponse(tenant);
      await this.redis.setex(
        `tenant:full:${tenantId}`,
        60,
        JSON.stringify(response),
      );
    }

    response.ownerName = userId ? await this.getOwnerFirstName(userId) : null;
    return response;
  }

  private async getOwnerFirstName(userId: string): Promise<string | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.fullName) return null;
    return user.fullName.trim().split(/\s+/)[0] ?? null;
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
      // Detach customers from the tier configs about to be replaced —
      // tier_id has a FK to tier_configs and would otherwise block the delete.
      await manager.query(
        'UPDATE customers SET tier_id = NULL WHERE tenant_id = $1',
        [tenantId],
      );
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

    // Re-assign every customer to a tier under the new thresholds.
    await this.tierService.recalculateAll(tenantId);

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

  // ── GET /tenants/qr-code ──────────────────────────────────────────────────

  async getOrGenerateQrCode(
    tenantId: string,
    force = false,
  ): Promise<QrCodeResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const registrationUrl = `${this.config.getOrThrow<string>('FRONTEND_URL')}/register/${tenant.slug}`;

    if (tenant.qrCodeUrl && !force) {
      return { qrCodeUrl: tenant.qrCodeUrl, registrationUrl };
    }

    const buffer = await QRCode.toBuffer(registrationUrl, {
      type: 'png',
      margin: 2,
      width: 400,
      color: { dark: '#0F1E35', light: '#FFFFFF' },
    });

    const key = `qr-codes/${tenantId}/${Date.now()}.png`;

    if (force && tenant.qrCodeUrl) {
      const oldKey = this.keyFromUrl(tenant.qrCodeUrl);
      if (oldKey) {
        await this.r2.deleteFile(oldKey).catch(() => undefined);
      }
    }

    const qrCodeUrl = await this.r2.uploadFile({
      key,
      buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    });

    await this.tenantRepo.update(tenantId, { qrCodeUrl });
    await this.invalidateTenantCache(tenantId);

    return { qrCodeUrl, registrationUrl };
  }

  // ── POST /tenants/logo ────────────────────────────────────────────────────

  async uploadLogo(
    tenantId: string,
    file: UploadedFile,
  ): Promise<LogoResponse> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images allowed');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new PayloadTooLargeException('Logo must be under 2 MB');
    }

    const processed = await sharp(file.buffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 90 })
      .toBuffer();

    const key = `logos/${tenantId}/logo.png`;
    const logoUrl = await this.r2.uploadFile({
      key,
      buffer: processed,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    });

    await this.tenantRepo.update(tenantId, { logoUrl });
    await this.invalidateTenantCache(tenantId);

    return { logoUrl };
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
      ownerName: null,
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

  async getPublicInfo(
    slug: string,
  ): Promise<{ businessName: string; logoUrl: string | null }> {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException('Store not found');
    return { businessName: tenant.businessName, logoUrl: tenant.logoUrl };
  }

  // ── Account deletion ─────────────────────────────────────────────────────────

  async requestDeletion(
    tenantId: string,
    dto: RequestAccountDeletionDto,
  ): Promise<{ scheduledAt: Date }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.confirmBusinessName.trim() !== tenant.businessName) {
      throw new BadRequestException(
        "Business name doesn't match — please type it exactly as shown.",
      );
    }

    const owner = await this.userRepo.findOne({
      where: { tenantId, role: UserRole.OWNER },
    });
    if (!owner) throw new NotFoundException('Owner account not found');

    const requestedAt = new Date();
    const scheduledAt = new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000);
    const cancelToken = crypto.randomBytes(32).toString('hex');

    await this.tenantRepo.update(tenantId, {
      deletionRequestedAt: requestedAt,
      deletionScheduledAt: scheduledAt,
      deletionCancelToken: cancelToken,
    });

    const cancelUrl = `${this.config.getOrThrow<string>('FRONTEND_URL')}/account-deletion/cancel?token=${cancelToken}`;

    await Promise.all([
      this.mailer.sendAccountDeletionRequested({
        to: owner.email,
        businessName: tenant.businessName,
        scheduledAt,
        cancelUrl,
      }),
      this.mailer.sendAccountDeletionSupportNotice({
        businessName: tenant.businessName,
        tenantId: tenant.id,
        ownerEmail: owner.email,
        scheduledAt,
      }),
    ]);

    return { scheduledAt };
  }

  async cancelDeletion(token: string): Promise<{ businessName: string }> {
    const tenant = await this.tenantRepo.findOne({
      where: { deletionCancelToken: token },
    });

    if (
      !tenant ||
      !tenant.deletionScheduledAt ||
      tenant.deletionScheduledAt <= new Date()
    ) {
      throw new BadRequestException('Invalid or expired cancellation link');
    }

    await this.tenantRepo.update(tenant.id, {
      deletionRequestedAt: null,
      deletionScheduledAt: null,
      deletionCancelToken: null,
    });

    return { businessName: tenant.businessName };
  }

  // ── Staff admin methods ────────────────────────────────────────────────────

  async adminGetStats() {
    const rows: { status: string; count: string }[] = await this.dataSource.query(
      `SELECT subscription_status AS status, COUNT(*) AS count
       FROM tenants
       WHERE deletion_requested_at IS NULL
       GROUP BY subscription_status`,
    );
    const map: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      map[r.status] = parseInt(r.count, 10);
      total += parseInt(r.count, 10);
    }
    return {
      total,
      trialing: map['trialing'] ?? 0,
      active: map['active'] ?? 0,
      pastDue: map['past_due'] ?? 0,
      suspended: map['suspended'] ?? 0,
      cancelled: map['cancelled'] ?? 0,
    };
  }

  async adminListTenants(query: { search?: string; status?: string; page: number }) {
    const limit = 20;
    const offset = (query.page - 1) * limit;
    const params: unknown[] = [];
    const conditions: string[] = ['t.deletion_requested_at IS NULL'];

    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      conditions.push(`(LOWER(t.business_name) LIKE $${params.length} OR LOWER(t.slug) LIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`t.subscription_status = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM tenants t WHERE ${where}`,
      params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const dataParams = [...params, limit, offset];
    type Row = {
      id: string; business_name: string; slug: string; plan_tier: string;
      subscription_status: string; created_at: string;
      owner_email: string | null; owner_name: string | null; user_count: string;
    };
    const rows: Row[] = await this.dataSource.query(
      `SELECT t.id, t.business_name, t.slug, t.plan_tier, t.subscription_status, t.created_at,
              u.email AS owner_email, u.full_name AS owner_name,
              (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) AS user_count
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        businessName: r.business_name,
        slug: r.slug,
        planTier: r.plan_tier,
        subscriptionStatus: r.subscription_status,
        createdAt: r.created_at,
        ownerEmail: r.owner_email,
        ownerName: r.owner_name,
        userCount: parseInt(r.user_count, 10),
      })),
      total,
      page: query.page,
      limit,
    };
  }

  async adminGetTenant(id: string) {
    type Row = {
      id: string; business_name: string; slug: string; plan_tier: string;
      subscription_status: string; trial_ends_at: string | null;
      created_at: string; logo_url: string | null;
      currency: string; timezone: string; points_threshold: number;
      reward_value: string; marketing_wallet_balance: string;
      owner_email: string | null; owner_name: string | null;
    };
    const rows: Row[] = await this.dataSource.query(
      `SELECT t.id, t.business_name, t.slug, t.plan_tier, t.subscription_status,
              t.trial_ends_at, t.created_at, t.logo_url, t.currency, t.timezone,
              t.points_threshold, t.reward_value, t.marketing_wallet_balance,
              u.email AS owner_email, u.full_name AS owner_name
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       WHERE t.id = $1
       LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Tenant not found');
    const r = rows[0];
    return {
      id: r.id,
      businessName: r.business_name,
      slug: r.slug,
      planTier: r.plan_tier,
      subscriptionStatus: r.subscription_status,
      trialEndsAt: r.trial_ends_at,
      createdAt: r.created_at,
      logoUrl: r.logo_url,
      currency: r.currency,
      timezone: r.timezone,
      pointsThreshold: r.points_threshold,
      rewardValue: Number(r.reward_value),
      marketingWalletBalance: Number(r.marketing_wallet_balance),
      ownerEmail: r.owner_email,
      ownerName: r.owner_name,
    };
  }

  async adminCreateTenant(dto: { businessName: string; ownerEmail: string; ownerFullName: string; planTier?: string }) {
    const slug = await this.generateUniqueSlug(dto.businessName);
    const existing = await this.userRepo.findOne({ where: { email: dto.ownerEmail.toLowerCase() } });
    if (existing) throw new ConflictException('A user with this email already exists');

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const tenant = await this.dataSource.transaction(async (em) => {
      const t = em.create(Tenant, {
        businessName: dto.businessName,
        slug,
        planTier: (dto.planTier as any) ?? 'starter',
        subscriptionStatus: 'active' as any,
      });
      const saved = await em.save(Tenant, t);

      const user = em.create(User, {
        tenantId: saved.id,
        email: dto.ownerEmail.toLowerCase(),
        hashedPassword,
        fullName: dto.ownerFullName,
        role: UserRole.OWNER,
        isActive: true,
        emailVerifiedAt: new Date(),
      });
      await em.save(User, user);
      return saved;
    });

    return {
      id: tenant.id,
      businessName: tenant.businessName,
      slug: tenant.slug,
      ownerEmail: dto.ownerEmail.toLowerCase(),
      temporaryPassword: tempPassword,
    };
  }

  async adminUpdateTenant(id: string, dto: { businessName?: string; planTier?: string; subscriptionStatus?: string }) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updates: Partial<Tenant> = {};
    if (dto.businessName) updates.businessName = dto.businessName;
    if (dto.planTier) updates.planTier = dto.planTier as any;
    if (dto.subscriptionStatus) updates.subscriptionStatus = dto.subscriptionStatus as any;

    await this.tenantRepo.update(id, updates);
    await this.redis.del(`tenant:${id}`);

    return { ...tenant, ...updates };
  }

  async adminDeleteTenant(id: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    await this.tenantRepo.update(id, { deletionRequestedAt: new Date() });
    await this.redis.del(`tenant:${id}`);
  }

  private async generateUniqueSlug(businessName: string): Promise<string> {
    const base = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    let slug = base;
    let attempt = 0;
    while (await this.tenantRepo.findOne({ where: { slug } })) {
      attempt++;
      slug = `${base}-${attempt}`;
    }
    return slug;
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

export interface QrCodeResponse {
  qrCodeUrl: string;
  registrationUrl: string;
}

export interface LogoResponse {
  logoUrl: string;
}

export interface TenantFullResponse {
  id: string;
  businessName: string;
  ownerName: string | null;
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
