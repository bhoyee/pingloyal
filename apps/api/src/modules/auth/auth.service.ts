import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
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
import { MailerService } from '../../common/mailer/mailer.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { PLANS, type PlanId } from '../billing/plans.config';
import { RegisterDto, Country } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

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
const VERIFICATION_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const POSTGRES_UNIQUE_VIOLATION = '23505';

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

export interface RegisterResponse {
  requiresVerification: true;
  email: string;
  /** Only present when Resend is not configured (dev/test environments) */
  devCode?: string;
}

export interface ProfileResponse {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailer: MailerService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Registration ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const email = this.normalizeEmail(dto.email);
    const isNG = dto.country === Country.NG;
    const currency = isNG ? 'NGN' : 'GBP';
    const planTier = dto.planTier ?? PlanTier.STARTER;
    const planId = `${planTier}_${currency.toLowerCase()}` as PlanId;
    const plan = PLANS[planId];
    if (!plan) {
      throw new BadRequestException(
        `No plan available for ${planTier}/${currency}`,
      );
    }

    const existingUser = await this.userRepo.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    let savedUser: User;
    let savedTenant: Tenant;
    try {
      ({ savedUser, savedTenant } = await this.dataSource.transaction(
        async (manager) => {
          // Step 1 — Tenant. The trial clock does not start here — it starts
          // once a card is captured via POST /billing/start-trial. Until then
          // the tenant sits in PENDING_PAYMENT, blocked by SubscriptionGuard.
          const slug = await this.buildUniqueSlug(dto.businessName, manager);
          const tenant = manager.create(Tenant, {
            businessName: dto.businessName,
            slug,
            currency,
            timezone: isNG ? 'Africa/Lagos' : 'Europe/London',
            mode: TenantMode.NATIVE,
            planTier,
            subscriptionStatus: SubscriptionStatus.PENDING_PAYMENT,
            trialEndsAt: null,
            waVerificationStatus: WaVerificationStatus.PENDING,
            marketingWalletBalance: 0,
          });
          const savedTenant = await manager.save(Tenant, tenant);

          // Step 2 — User (unverified)
          const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
          const { code, hashedCode } = this.generateVerificationCode();
          const expiry = new Date(
            Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
          );

          const user = manager.create(User, {
            tenantId: savedTenant.id,
            email,
            fullName: dto.fullName,
            hashedPassword,
            role: UserRole.OWNER,
            isActive: true,
            emailVerifiedAt: null,
            emailVerificationToken: hashedCode,
            emailVerificationExpiry: expiry,
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

          // Step 4 — Subscription row, pending payment — amount/utility terms
          // are looked up from plans.config.ts, never hardcoded or client-supplied.
          const subscription = manager.create(Subscription, {
            tenantId: savedTenant.id,
            planTier,
            billingCycle: 'monthly',
            currency,
            amount: plan.amount,
            utilityIncluded: plan.utilityIncluded,
            utilityUsedThisPeriod: 0,
            utilityOverageRate: plan.utilityOverageRate,
            marketingRate: plan.marketingRate,
            status: SubscriptionStatus.PENDING_PAYMENT,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          });
          await manager.save(Subscription, subscription);

          // Return the code so we can send email AFTER the transaction commits
          (savedUser as User & { _plainCode?: string })._plainCode = code;

          return { savedUser, savedTenant };
        },
      ));
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }

    // Step 5 — Send welcome email (outside transaction so DB row is committed first)
    const plainCode = (savedUser as User & { _plainCode?: string })._plainCode!;
    let devCode: string | undefined;
    let emailSent = false;

    try {
      await this.mailer.sendWelcomeVerification({
        to: savedUser.email,
        name: savedUser.fullName,
        businessName: savedTenant.businessName,
        code: plainCode,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to send welcome email to ${savedUser.email}: ${String(err)}`,
      );
    }

    // In development, surface the code in the response whenever email didn't
    // actually send (no API key, wrong sender domain, etc.) so the dev can
    // still complete the flow without a working email setup.
    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
    if (isDev && !emailSent) {
      devCode = plainCode;
    }

    return {
      requiresVerification: true,
      email: savedUser.email,
      ...(devCode ? { devCode } : {}),
    };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({
      where: { email: this.normalizeEmail(dto.email) },
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

    if (user.tenant.deletionRequestedAt) {
      throw new HttpException('This account has been deleted', HttpStatus.GONE);
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );
    }

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

  // ── Email verification ────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({
      where: { email: this.normalizeEmail(dto.email) },
      relations: ['tenant'],
    });

    if (!user) {
      throw new BadRequestException('Invalid verification request');
    }

    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email is already verified');
    }

    if (
      !user.emailVerificationToken ||
      !user.emailVerificationExpiry ||
      user.emailVerificationExpiry < new Date()
    ) {
      throw new BadRequestException(
        'Verification code has expired — please request a new one',
      );
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(dto.code)
      .digest('hex');

    if (incomingHash !== user.emailVerificationToken) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.userRepo.update(user.id, {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      lastLoginAt: new Date(),
    });

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

  // ── Resend verification code ──────────────────────────────────────────────

  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({
      where: { email: this.normalizeEmail(dto.email) },
    });

    // Return generic response to prevent email enumeration
    if (!user || user.emailVerifiedAt) {
      return {
        message:
          'If the email exists and is unverified, a new code has been sent',
      };
    }

    const { code, hashedCode } = this.generateVerificationCode();
    const expiry = new Date(
      Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.userRepo.update(user.id, {
      emailVerificationToken: hashedCode,
      emailVerificationExpiry: expiry,
    });

    let emailSent = false;
    try {
      await this.mailer.sendVerificationCode({
        to: user.email,
        name: user.fullName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to resend verification to ${user.email}: ${String(err)}`,
      );
    }

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
    const devCode = isDev && !emailSent ? code : undefined;

    return {
      message:
        'If the email exists and is unverified, a new code has been sent',
      ...(devCode ? { devCode } : {}),
    };
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; devCode?: string }> {
    const user = await this.userRepo.findOne({
      where: { email: this.normalizeEmail(dto.email) },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('No account found with this email address');
    }

    const { code, hashedCode } = this.generateVerificationCode();
    const expiry = new Date(
      Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.userRepo.update(user.id, {
      passwordResetToken: hashedCode,
      passwordResetExpiry: expiry,
    });

    let emailSent = false;
    try {
      await this.mailer.sendPasswordResetCode({
        to: user.email,
        name: user.fullName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to send password reset code to ${user.email}: ${String(err)}`,
      );
    }

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
    const devCode = isDev && !emailSent ? code : undefined;

    return {
      message: 'A reset code has been sent to your email',
      ...(devCode ? { devCode } : {}),
    };
  }

  // ── Reset password ───────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({
      where: { email: this.normalizeEmail(dto.email) },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    if (
      !user.passwordResetToken ||
      !user.passwordResetExpiry ||
      user.passwordResetExpiry < new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(dto.code)
      .digest('hex');

    if (incomingHash !== user.passwordResetToken) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.userRepo.update(user.id, {
      hashedPassword,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });

    // Invalidate any existing session so the old password can't be used again
    await this.redis.del(`refresh:${user.id}`);

    return { message: 'Password reset successfully' };
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
      await this.redis.del(`refresh:${userId}`);
      throw new UnauthorizedException('Session expired');
    }

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

  // ── Profile ───────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailVerified: !!user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    await this.userRepo.update(userId, { fullName: dto.fullName });
    return this.getProfile(userId);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const passwordMatch = await bcrypt.compare(
      dto.currentPassword,
      user.hashedPassword,
    );
    if (!passwordMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.userRepo.update(userId, { hashedPassword });

    // Invalidate any existing session so the old password can't be used again
    await this.redis.del(`refresh:${userId}`);

    return { message: 'Password changed successfully' };
  }

  async changeEmail(
    userId: string,
    dto: ChangeEmailDto,
  ): Promise<{ message: string; devCode?: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      user.hashedPassword,
    );
    if (!passwordMatch) {
      throw new BadRequestException('Password is incorrect');
    }

    const newEmail = this.normalizeEmail(dto.newEmail);

    if (newEmail === user.email) {
      throw new BadRequestException(
        'New email must be different from your current email',
      );
    }

    const existing = await this.userRepo.findOne({
      where: { email: newEmail },
    });
    if (existing) {
      throw new BadRequestException('Email is already in use');
    }

    const { code, hashedCode } = this.generateVerificationCode();
    const expiry = new Date(
      Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    try {
      await this.userRepo.update(userId, {
        email: newEmail,
        emailVerifiedAt: null,
        emailVerificationToken: hashedCode,
        emailVerificationExpiry: expiry,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException('Email is already in use');
      }
      throw err;
    }

    // Invalidate the session — the user must verify the new email to sign in again
    await this.redis.del(`refresh:${userId}`);

    let emailSent = false;
    try {
      await this.mailer.sendVerificationCode({
        to: newEmail,
        name: user.fullName,
        code,
      });
      emailSent = true;
    } catch (err) {
      this.logger.error(
        `Failed to send verification code to ${newEmail}: ${String(err)}`,
      );
    }

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
    const devCode = isDev && !emailSent ? code : undefined;

    return {
      message:
        'Email updated — please verify your new email address to continue',
      ...(devCode ? { devCode } : {}),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as QueryFailedError & { code?: string }).code ===
        POSTGRES_UNIQUE_VIOLATION
    );
  }

  private generateVerificationCode(): { code: string; hashedCode: string } {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    return { code, hashedCode };
  }

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

    const accessTokenTtl =
      user.role === UserRole.CASHIER
        ? this.configService.get<string>('JWT_CASHIER_EXPIRES_IN', '24h')
        : this.configService.get<string>('JWT_EXPIRES_IN', '15m');

    const accessToken = this.jwtService.sign(accessPayload, {
      algorithm: 'RS256',
      privateKey,
      expiresIn: accessTokenTtl,
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
    if (!match) return 30 * 86400;
    return parseInt(match[1]) * units[match[2]];
  }
}
