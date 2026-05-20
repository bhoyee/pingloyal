import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PointsLedgerReason } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Transaction } from './transaction.entity';

// Ledger entries are immutable — no @UpdateDateColumn
@Entity('points_ledger')
export class PointsLedger {
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

  // positive = earned, negative = redeemed
  @Column({ type: 'int' })
  delta: number;

  @Column({ type: 'varchar', length: 50 })
  reason: PointsLedgerReason;

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'ref_transaction_id' })
  refTransaction: Transaction | null;

  // ref_campaign_id has no FK constraint — plain UUID reference
  @Column({ type: 'uuid', nullable: true })
  refCampaignId: string | null;

  @Column({ type: 'int' })
  balanceAfter: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
