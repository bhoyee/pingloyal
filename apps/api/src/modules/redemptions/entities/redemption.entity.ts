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
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('redemptions')
export class Redemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Index()
  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'uuid' })
  cashierId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'cashier_id' })
  cashier: User;

  @Column({ type: 'int' })
  rewardsCount: number;

  @Column({ type: 'int' })
  pointsRedeemed: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  value: number;

  @Column({ type: 'int' })
  balanceAfter: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'redeemed_at' })
  redeemedAt: Date;
}
