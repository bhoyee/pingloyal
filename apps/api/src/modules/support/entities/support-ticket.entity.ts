import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'high' | 'low';

@Entity('support_tickets')
@Index(['tenantId'])
@Index(['status'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'business_name', length: 200 })
  businessName: string;

  @Column({ name: 'opened_by_name', length: 200 })
  openedByName: string;

  @Column({ name: 'opened_by_email', length: 255 })
  openedByEmail: string;

  @Column({ length: 200 })
  subject: string;

  @Column({ length: 20, default: 'open' })
  status: SupportTicketStatus;

  @Column({ length: 10, default: 'low' })
  priority: SupportTicketPriority;

  @Column({ name: 'last_message_at', type: 'timestamptz' })
  lastMessageAt: Date;

  // Denormalized so the unread badge count can be computed with a plain
  // WHERE clause instead of joining/aggregating support_ticket_messages.
  @Column({
    name: 'last_message_author_type',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  lastMessageAuthorType: 'tenant' | 'staff' | null;

  // Null until the tenant has viewed the thread at least once. A ticket is
  // "unread" when the last message came from staff and either this is null
  // or older than lastMessageAt.
  @Column({ name: 'tenant_last_read_at', type: 'timestamptz', nullable: true })
  tenantLastReadAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
