import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletTransactionType } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';

// Wallet transactions are immutable — no @UpdateDateColumn
@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 30 })
  type: WalletTransactionType;

  // positive = credit (top-up), negative = debit
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  refId: string | null;

  @Column({ length: 255, nullable: true })
  paystackRef: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
