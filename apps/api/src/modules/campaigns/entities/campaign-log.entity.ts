import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CampaignLogStatus } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Campaign } from './campaign.entity';
import { Customer } from '../../customers/entities/customer.entity';

// Campaign log entries are immutable — no @UpdateDateColumn
@Entity('campaign_logs')
export class CampaignLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Campaign, (campaign) => campaign.campaignLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 255, nullable: true })
  waMessageId: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: CampaignLogStatus.QUEUED,
  })
  status: CampaignLogStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'queued_at' })
  queuedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  failedAt: Date | null;
}
