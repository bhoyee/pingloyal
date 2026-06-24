import { IsIn } from 'class-validator';
import type { SupportTicketStatus } from '../entities/support-ticket.entity';

export class UpdateTicketStatusDto {
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status: SupportTicketStatus;
}
