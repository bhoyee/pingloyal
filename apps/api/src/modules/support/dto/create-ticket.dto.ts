import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { SupportTicketPriority } from '../entities/support-ticket.entity';

export class CreateTicketDto {
  @IsString()
  @MinLength(3, { message: 'Subject must be at least 3 characters' })
  @MaxLength(200, { message: 'Subject must be 200 characters or fewer' })
  subject: string;

  // Rich-text HTML from the editor — validated as plain text length
  // server-side (in the service, after stripping tags) since the markup
  // overhead would otherwise let a near-empty message through.
  @IsString()
  @MaxLength(8000, { message: 'Message must be 8000 characters or fewer' })
  message: string;

  @IsIn(['high', 'low'], { message: 'Priority must be "high" or "low"' })
  priority: SupportTicketPriority;
}
