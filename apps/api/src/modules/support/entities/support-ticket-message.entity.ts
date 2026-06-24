import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SupportTicketMessageAuthorType = 'tenant' | 'staff';

@Entity('support_ticket_messages')
@Index(['ticketId'])
export class SupportTicketMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id' })
  ticketId: string;

  @Column({ name: 'author_type', length: 10 })
  authorType: SupportTicketMessageAuthorType;

  @Column({ name: 'author_name', length: 200 })
  authorName: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'attachment_url', type: 'text', nullable: true })
  attachmentUrl: string | null;

  @Column({
    name: 'attachment_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  attachmentName: string | null;

  @Column({
    name: 'attachment_mime_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  attachmentMimeType: string | null;

  @Column({ name: 'attachment_size', type: 'int', nullable: true })
  attachmentSize: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
