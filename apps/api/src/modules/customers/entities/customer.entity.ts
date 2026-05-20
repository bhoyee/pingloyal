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
import { CustomerSource } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { TierConfig } from '../../tenants/entities/tier-config.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 255, nullable: true })
  externalId: string | null;

  @Column({ length: 255 })
  fullName: string;

  @Column({ length: 20 })
  phoneE164: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ default: false })
  waOptedIn: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  waOptedInAt: Date | null;

  @Column({ type: 'int', default: 0 })
  pointsBalance: number;

  @Column({ type: 'int', default: 0 })
  lifetimePoints: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalSpend: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  quarterlySpend: number;

  @Column({ type: 'uuid', nullable: true })
  tierId: string | null;

  @ManyToOne(() => TierConfig, { nullable: true })
  @JoinColumn({ name: 'tier_id' })
  tier: TierConfig | null;

  @Column({ type: 'int', default: 0 })
  purchaseCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastPurchaseAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rewardSentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nudgeSentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lapsedSentAt: Date | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: CustomerSource.QR_REGISTRATION,
  })
  source: CustomerSource;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
