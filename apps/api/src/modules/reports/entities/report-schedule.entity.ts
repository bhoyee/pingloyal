import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('report_schedules')
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 20, default: 'monthly' })
  frequency: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSentAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
