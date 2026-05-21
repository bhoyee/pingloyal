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
import { IntegrationConnectionType, IntegrationSyncStatus } from '@pingloyal/types';
import { Tenant } from '../../tenants/entities/tenant.entity';

@Entity('integrations')
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 30 })
  connectionType: IntegrationConnectionType;

  @Column({ type: 'text', nullable: true })
  endpointUrl: string | null;

  // Stored AES-256-GCM encrypted — never returned in API responses
  @Column({ type: 'text', nullable: true })
  apiKeyEncrypted: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookSecret: string | null;

  @Column({ type: 'int', default: 5 })
  pollIntervalMins: number;

  @Column({ type: 'jsonb', default: {} })
  fieldMapping: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastSyncCursor: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: IntegrationSyncStatus.PENDING,
  })
  syncStatus: IntegrationSyncStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
