import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('webhook_events')
@Unique(['provider', 'eventId'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ type: 'varchar', length: 255 })
  eventId: string;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt: Date;
}
