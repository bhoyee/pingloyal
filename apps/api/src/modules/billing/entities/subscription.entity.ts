import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanTier, SubscriptionStatus } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 30, default: PlanTier.STARTER })
  planTier: PlanTier;

  @Column({ type: 'varchar', length: 20, default: 'monthly' })
  billingCycle: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 8000 })
  amount: number;

  // ── Utility message tracking (rates read from DB at runtime — never hardcoded) ──
  @Column({ type: 'int', default: 300 })
  utilityIncluded: number;

  @Column({ type: 'int', default: 0 })
  utilityUsedThisPeriod: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 20.0 })
  utilityOverageRate: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 130.0 })
  marketingRate: number;

  @Column({ type: 'timestamptz', nullable: true })
  gracePeriodStartedAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paystackSubCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  stripeSubId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paystackAuthorizationCode: string | null;

  @Column({ type: 'int', default: 0 })
  trialChargeAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastChargeAttemptAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: SubscriptionStatus.TRIALING,
  })
  status: SubscriptionStatus;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
