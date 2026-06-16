import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TemplateRequestStatus = 'pending' | 'in_progress' | 'completed';

@Entity('template_requests')
@Index(['tenantId'])
export class TemplateRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'use_case', type: 'text' })
  useCase: string;

  @Column({ length: 20, default: 'pending' })
  status: TemplateRequestStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
