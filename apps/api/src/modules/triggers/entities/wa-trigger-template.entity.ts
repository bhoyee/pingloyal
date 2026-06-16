import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wa_trigger_templates')
@Index(['tenantId', 'triggerType'], { unique: true })
export class WaTriggerTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId: string;

  @Column({ name: 'trigger_type', length: 50 })
  triggerType: string;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
