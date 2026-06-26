import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PlanTier,
  SubscriptionStatus,
  TenantMode,
  UserRole,
  WaVerificationStatus,
} from '@pingloyal/types';
import { MailerService } from '../../common/mailer/mailer.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/entities/user.entity';
import { Tenant } from './entities/tenant.entity';
import { ProductCategory } from './entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { WaTriggerTemplate } from '../triggers/entities/wa-trigger-template.entity';
import { SupportTicket } from '../support/entities/support-ticket.entity';
import { TemplateRequest } from '../template-requests/entities/template-request.entity';
import { PLANS, type PlanId } from '../billing/plans.config';
import { Country } from '../signup/dto/signup-register.dto';
import { StaffCreateTenantDto } from './dto/staff-create-tenant.dto';
import { StaffUpdateTenantDto } from './dto/staff-update-tenant.dto';
import { StaffListTenantsQueryDto } from './dto/staff-list-tenants-query.dto';

const DEFAULT_CATEGORIES = [
  { name: 'Food & Groceries', slug: 'food' },
  { name: 'Beverages', slug: 'beverages' },
  { name: 'Baby Products', slug: 'baby_products' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Fashion & Clothing', slug: 'fashion' },
  { name: 'Household Items', slug: 'household' },
  { name: 'Health & Beauty', slug: 'health_beauty' },
  { name: 'Other', slug: 'other' },
];

const PASSWORD_RESET_EXPIRY_HOURS = 1;

export interface StaffTenantListRow {
  id: string;
  businessName: string;
  slug: string;
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface StaffTenantDetail {
  tenant: Tenant;
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isActive: boolean;
    lastLoginAt: Date | null;
  }>;
  subscription: Subscription | null;
  waTriggerTemplates: WaTriggerTemplate[];
  recentTickets: SupportTicket[];
  recentTemplateRequests: TemplateRequest[];
}

@Injectable()
export class StaffTenantsService {
  private readonly logger = new Logger(StaffTenantsService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(WaTriggerTemplate)
    private readonly waTriggerTemplateRepo: Repository<WaTriggerTemplate>,
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepo: Repository<SupportTicket>,
    @InjectRepository(TemplateRequest)
    private readonly templateRequestRepo: Repository<TemplateRequest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly authService: AuthService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async findAll(
    query: StaffListTenantsQueryDto,
  ): Promise<{ rows: StaffTenantListRow[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const includeDeleted = query.includeDeleted === 'true';

    const qb = this.tenantRepo.createQueryBuilder('tenant');

    if (!includeDeleted) {
      qb.andWhere('tenant.deletedAt IS NULL');
    }
    if (query.status) {
      qb.andWhere('tenant.subscriptionStatus = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(tenant.businessName ILIKE :search OR tenant.slug ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [rows, total] = await qb
      .orderBy('tenant.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      rows: rows.map((t) => ({
        id: t.id,
        businessName: t.businessName,
        slug: t.slug,
        planTier: t.planTier,
        subscriptionStatus: t.subscriptionStatus,
        trialEndsAt: t.trialEndsAt,
        deletedAt: t.deletedAt,
        createdAt: t.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(tenantId: string): Promise<StaffTenantDetail> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [users, subscription, waTriggerTemplates, recentTickets, recentTemplateRequests] =
      await Promise.all([
        this.userRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } }),
        this.subscriptionRepo.findOne({ where: { tenantId } }),
        this.waTriggerTemplateRepo.find({ where: { tenantId } }),
        this.supportTicketRepo.find({
          where: { tenantId },
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        this.templateRequestRepo.find({
          where: { tenantId },
          order: { createdAt: 'DESC' },
          take: 5,
        }),
      ]);

    return {
      tenant,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
      })),
      subscription,
      waTriggerTemplates,
      recentTickets,
      recentTemplateRequests,
    };
  }

  // ── Manual tenant creation (sales-assisted onboarding) ────────────────────
  // Bypasses public register → trial → payment. The owner account is created
  // active and email-verified immediately (staff already vetted them) and
  // gets in via the existing password-reset-code flow — never a plaintext
  // password over email.
  async create(
    dto: StaffCreateTenantDto,
  ): Promise<{ tenantId: string; userId: string; devCode?: string }> {
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.ownerEmail.trim().toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException('An account with this owner email already exists');
    }

    const isNG = dto.country === Country.NG;
    const currency: 'NGN' | 'GBP' = isNG ? 'NGN' : 'GBP';
    const planId = `${dto.planTier}_${currency.toLowerCase()}` as PlanId;
    const plan = PLANS[planId];
    if (!plan) {
      throw new BadRequestException(`No plan available for ${dto.planTier}/${currency}`);
    }

    const now = new Date();
    const email = dto.ownerEmail.trim().toLowerCase();

    const { savedTenant, savedUser } = await this.dataSource.transaction(
      async (manager) => {
        const slug = await this.authService.buildUniqueSlug(dto.businessName, manager);
        const tenant = manager.create(Tenant, {
          businessName: dto.businessName,
          slug,
          currency,
          timezone: isNG ? 'Africa/Lagos' : 'Europe/London',
          mode: TenantMode.NATIVE,
          planTier: dto.planTier,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          waVerificationStatus: WaVerificationStatus.PENDING,
          marketingWalletBalance: 0,
        });
        const savedTenant = await manager.save(Tenant, tenant);

        const user = manager.create(User, {
          tenantId: savedTenant.id,
          email,
          fullName: dto.ownerFullName,
          // Never a usable hash — the owner sets their real password via the
          // password-reset-code flow triggered below.
          hashedPassword: crypto.randomBytes(32).toString('hex'),
          role: UserRole.OWNER,
          isActive: true,
          emailVerifiedAt: now,
        });
        const savedUser = await manager.save(User, user);

        const categories = DEFAULT_CATEGORIES.map((cat) =>
          manager.create(ProductCategory, {
            tenantId: savedTenant.id,
            name: cat.name,
            slug: cat.slug,
            isActive: true,
          }),
        );
        await manager.save(ProductCategory, categories);

        const subscription = manager.create(Subscription, {
          tenantId: savedTenant.id,
          planTier: dto.planTier,
          billingCycle: 'monthly',
          currency,
          amount: plan.amount,
          utilityIncluded: plan.utilityIncluded,
          utilityUsedThisPeriod: 0,
          utilityOverageRate: plan.utilityOverageRate,
          marketingRate: plan.marketingRate,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        });
        await manager.save(Subscription, subscription);

        return { savedTenant, savedUser };
      },
    );

    const { code, hashedCode } = this.generateResetCode();
    const expiry = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);
    await this.userRepo.update(savedUser.id, {
      passwordResetToken: hashedCode,
      passwordResetExpiry: expiry,
    });

    let emailSent = false;
    try {
      await this.mailer.sendStaffCreatedAccountWelcome({
        to: email,
        name: dto.ownerFullName,
        businessName: dto.businessName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to send staff-created welcome email to ${email}: ${String(err)}`,
      );
    }

    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    return {
      tenantId: savedTenant.id,
      userId: savedUser.id,
      ...(isDev && !emailSent ? { devCode: code } : {}),
    };
  }

  async resendWelcomeEmail(tenantId: string): Promise<{ devCode?: string }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const owner = await this.userRepo.findOne({
      where: { tenantId, role: UserRole.OWNER },
    });
    if (!owner) throw new NotFoundException('Owner account not found');

    const { code, hashedCode } = this.generateResetCode();
    const expiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);
    await this.userRepo.update(owner.id, {
      passwordResetToken: hashedCode,
      passwordResetExpiry: expiry,
    });

    let emailSent = false;
    try {
      await this.mailer.sendStaffCreatedAccountWelcome({
        to: owner.email,
        name: owner.fullName,
        businessName: tenant.businessName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to resend staff-created welcome email to ${owner.email}: ${String(err)}`,
      );
    }

    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    return isDev && !emailSent ? { devCode: code } : {};
  }

  async update(tenantId: string, dto: StaffUpdateTenantDto): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.tenantRepo.update(tenantId, dto);
    return this.tenantRepo.findOneOrFail({ where: { id: tenantId } });
  }

  async setUserActive(
    tenantId: string,
    userId: string,
    isActive: boolean,
  ): Promise<{ id: string; isActive: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found for this tenant');

    await this.userRepo.update(userId, { isActive });
    return { id: userId, isActive };
  }

  async softDelete(
    tenantId: string,
    staffId: string,
    reason: string | undefined,
  ): Promise<{ deletedAt: Date }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.deletedAt) {
      throw new BadRequestException('Tenant is already deleted');
    }

    const deletedAt = new Date();
    await this.tenantRepo.update(tenantId, {
      deletedAt,
      deletedByStaffId: staffId,
      deletionReason: reason ?? null,
    });

    return { deletedAt };
  }

  async restore(tenantId: string): Promise<{ restored: true }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!tenant.deletedAt) {
      throw new BadRequestException('Tenant is not deleted');
    }

    await this.tenantRepo.update(tenantId, {
      deletedAt: null,
      deletedByStaffId: null,
      deletionReason: null,
    });

    return { restored: true };
  }

  private generateResetCode(): { code: string; hashedCode: string } {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    return { code, hashedCode };
  }
}
