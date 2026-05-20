import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TransactionSource } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { ProductCategory } from '../../tenants/entities/product-category.entity';
import { User } from '../../auth/entities/user.entity';

// Transactions are immutable — no @UpdateDateColumn
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  idempotencyKey: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => ProductCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'logged_by_user_id' })
  loggedByUser: User | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int', default: 0 })
  pointsEarned: number;

  @Column({ type: 'int' })
  pointsBalanceAfter: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: TransactionSource.CASHIER_APP,
  })
  source: TransactionSource;

  @Column({ length: 255, nullable: true })
  externalTransactionId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
