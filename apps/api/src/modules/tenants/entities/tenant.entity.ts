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

  @Column({ type: 'varchar', length: 255 })
  businessName: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  // ── WhatsApp / Gupshup BSP ─────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, nullable: true })
  waPhoneNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gupshupAppId: string | null;

  @Column({ type: 'text', nullable: true })
  gupshupApiKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  waDisplayName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  waBusinessCategory: string | null;

  @Column({ type: 'text', nullable: true })
  waBusinessDescription: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
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

  // Per-trigger-type on/off switches (e.g. { welcome: false }). A type
  // missing from this map is treated as enabled.
  @Column({ type: 'jsonb', default: {} })
  enabledTriggers: Record<string, boolean>;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'Africa/Lagos' })
  timezone: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: SubscriptionStatus.TRIALING,
  })
  subscriptionStatus: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paystackCustomerId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  stripeCustomerId: string | null;

  // ── Account deletion ───────────────────────────────────────────────────────
  // Set when an owner requests deletion. Login is blocked the moment this is
  // set (see JwtStrategy/AuthService) — deletionScheduledAt is just the cron
  // trigger time for the actual hard delete, not a re-block point.
  @Column({ type: 'timestamptz', nullable: true })
  deletionRequestedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletionScheduledAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deletionCancelToken: string | null;

  // ── Staff-initiated soft delete ───────────────────────────────────────────
  // Distinct from deletionRequestedAt above (self-service, owner-initiated)
  // and from subscriptionStatus (billing-driven) — this is an administrative
  // deactivation a staff member can apply or undo at any time.
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  deletedByStaffId: string | null;

  @Column({ type: 'text', nullable: true })
  deletionReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
