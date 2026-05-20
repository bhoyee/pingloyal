import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportPeriodType } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';

// Report snapshots are computed once — no @UpdateDateColumn
@Entity('report_snapshots')
export class ReportSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'date' })
  periodStart: Date;

  @Column({ type: 'date' })
  periodEnd: Date;

  @Column({ type: 'varchar', length: 20 })
  periodType: ReportPeriodType;

  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  computedAt: Date;
}
