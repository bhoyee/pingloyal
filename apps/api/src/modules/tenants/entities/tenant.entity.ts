import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  PlanTier,
  SubscriptionStatus,
  TenantMode,
  WaVerificationStatus,
} from '@pingloyal/types';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  businessName: string;

  @Column({ length: 100, unique: true })
  slug: string;

  // ── WhatsApp / Gupshup BSP ─────────────────────────────────────────────────
  @Column({ length: 20, nullable: true })
  waPhoneNumber: string | null;

  @Column({ length: 255, nullable: true })
  gupshupAppId: string | null;

  @Column({ type: 'text', nullable: true })
  gupshupApiKey: string | null;

  @Column({ length: 255, nullable: true })
  waDisplayName: string | null;

  @Column({ length: 100, nullable: true })
  waBusinessCategory: string | null;

  @Column({ type: 'text', nullable: true })
  waBusinessDescription: string | null;

  @Column({ length: 500, nullable: true })
  waBusinessWebsite: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: WaVerificationStatus.PENDING,
  })
  waVerificationStatus: WaVerificationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  waVerifiedAt: Date | null;

  // ── Marketing wallet ───────────────────────────────────────────────────────
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  marketingWalletBalance: number;

  @Column({ type: 'timestamptz', nullable: true })
  walletLastToppedUpAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  walletLowAlertSentAt: Date | null;

  // ── Branding ───────────────────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  qrCodeUrl: string | null;

  // ── Platform config ────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, default: TenantMode.NATIVE })
  mode: TenantMode;

  @Column({ type: 'varchar', length: 30, default: PlanTier.STARTER })
  planTier: PlanTier;

  @Column({ type: 'numeric', precision: 10, scale: 4, default: 1 })
  pointsEarnRate: number;

  @Column({ type: 'int', default: 1000 })
  pointsThreshold: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1000 })
  rewardValue: number;

  @Column({ type: 'int', default: 60 })
  lapsedDays: number;

  @Column({ length: 3, default: 'NGN' })
  currency: string;

  @Column({ length: 50, default: 'Africa/Lagos' })
  timezone: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: SubscriptionStatus.TRIALING,
  })
  subscriptionStatus: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({ length: 100, nullable: true })
  paystackCustomerId: string | null;

  @Column({ length: 100, nullable: true })
  stripeCustomerId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
