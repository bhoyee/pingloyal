import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SkipReason, TriggerStatus, TriggerType } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';

// Trigger logs are immutable — no @UpdateDateColumn
@Entity('trigger_logs')
export class TriggerLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 50 })
  triggerType: TriggerType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  waMessageId: string | null;

  @Column({ type: 'varchar', length: 30, default: TriggerStatus.SENT })
  status: TriggerStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  skipReason: SkipReason | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
