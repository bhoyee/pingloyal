import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('tier_configs')
export class TierConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 50 })
  tierName: string;

  @Column({ length: 100 })
  tierLabel: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  minQuarterlySpend: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  maxQuarterlySpend: number | null;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
