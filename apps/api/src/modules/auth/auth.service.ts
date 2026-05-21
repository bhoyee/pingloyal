import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Redis from 'ioredis';
import {
  PlanTier,
  SubscriptionStatus,
  TenantMode,
  UserRole,
  WaVerificationStatus,
} from '@pingloyal/types';
import type { JwtPayload } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { RegisterDto, Country } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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

const BCRYPT_ROUNDS = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: { id: string; email: string; fullName: string; role: UserRole };
  tenant: {
    id: string;
    businessName: string;
    slug: string;
    planTier: PlanTier;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Registration ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const isNG = dto.country === Country.NG;
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    return this.dataSource.transaction(async (manager) => {
      // Step 1 — Tenant
      const slug = await this.buildUniqueSlug(dto.businessName, manager);
      const tenant = manager.create(Tenant, {
        businessName: dto.businessName,
        slug,
        currency: isNG ? 'NGN' : 'GBP',
        timezone: isNG ? 'Africa/Lagos' : 'Europe/London',
        mode: TenantMode.NATIVE,
        planTier: PlanTier.STARTER,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        trialEndsAt: trialEnd,
        waVerificationStatus: WaVerificationStatus.PENDING,
        marketingWalletBalance: 0,
      });
      const savedTenant = await manager.save(Tenant, tenant);

      // Step 2 — User
      const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      const user = manager.create(User, {
        tenantId: savedTenant.id,
        email: dto.email,
        fullName: dto.fullName,
        hashedPassword,
        role: UserRole.OWNER,
        isActive: true,
      });
      const savedUser = await manager.save(User, user);

      // Step 3 — Default product categories
      const categories = DEFAULT_CATEGORIES.map((cat) =>
        manager.create(ProductCategory, {
          tenantId: savedTenant.id,
          name: cat.name,
          slug: cat.slug,
          isActive: true,
        }),
      );
      await manager.save(ProductCategory, categories);

      // Step 4 — Starter subscription (rates stored in DB — never hardcoded)
      const subscription = manager.create(Subscription, {
        tenantId: savedTenant.id,
        planTier: PlanTier.STARTER,
        billingCycle: 'monthly',
        currency: savedTenant.currency,
        amount: isNG ? 8000 : 4900,
        utilityIncluded: 300,
        utilityUsedThisPeriod: 0,
        utilityOverageRate: 20.0,
        marketingRate: 130.0,
        status: SubscriptionStatus.TRIALING,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
        cancelAtPeriodEnd: false,
      });
      await manager.save(Subscription, subscription);

      // Step 5 — Issue tokens
      const tokens = await this.issueTokens(savedUser, savedTenant);

      return {
        ...tokens,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          fullName: savedUser.fullName,
          role: savedUser.role,
        },
        tenant: {
          id: savedTenant.id,
          businessName: savedTenant.businessName,
          slug: savedTenant.slug,
          planTier: savedTenant.planTier,
        },
      };
    });
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Always use the same message for wrong email or wrong password
    // to prevent account-enumeration attacks
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      relations: ['tenant'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      user.hashedPassword,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last_login_at
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.issueTokens(user, user.tenant);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        businessName: user.tenant.businessName,
        slug: user.tenant.slug,
        planTier: user.tenant.planTier,
      },
    };
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      const publicKey = Buffer.from(
        this.configService.getOrThrow<string>('JWT_PUBLIC_KEY'),
        'base64',
      ).toString('utf8');

      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        algorithms: ['RS256'],
        secret: publicKey,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = payload.sub;
    const storedHash = await this.redis.get(`refresh:${userId}`);
    if (!storedHash) {
      throw new UnauthorizedException('Session expired');
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    if (incomingHash !== storedHash) {
      // Possible token reuse — revoke and force re-login
      await this.redis.del(`refresh:${userId}`);
      throw new UnauthorizedException('Session expired');
    }

    // Rotation: delete old key, issue new pair
    await this.redis.del(`refresh:${userId}`);

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['tenant'],
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user, user.tenant);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<{ message: string }> {
    await this.redis.del(`refresh:${userId}`);
    return { message: 'Logged out successfully' };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async issueTokens(user: User, tenant: Tenant): Promise<AuthTokens> {
    const accessPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      planTier: tenant.planTier,
    };

    const privateKey = Buffer.from(
      this.configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
      'base64',
    ).toString('utf8');

    const accessToken = this.jwtService.sign(accessPayload, {
      algorithm: 'RS256',
      privateKey,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    } as Parameters<typeof this.jwtService.sign>[1]);

    const refreshToken = this.jwtService.sign(
      { sub: user.id, tenantId: user.tenantId },
      {
        algorithm: 'RS256',
        privateKey,
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '30d',
        ),
      } as Parameters<typeof this.jwtService.sign>[1],
    );

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const ttl = this.parseTtl(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    );
    await this.redis.setex(`refresh:${user.id}`, ttl, hash);

    return { accessToken, refreshToken };
  }

  private async buildUniqueSlug(
    businessName: string,
    manager: EntityManager,
  ): Promise<string> {
    const base = businessName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const exists = await manager.findOne(Tenant, { where: { slug: base } });
    if (!exists) return base;

    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `${base}-${suffix}`;
  }

  private parseTtl(duration: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
    };
    const match = duration.match(/^(\d+)([smhdw])$/);
    if (!match) return 30 * 86400; // default 30 days
    return parseInt(match[1]) * units[match[2]];
  }
}
