import { IsIn } from 'class-validator';
import type { TemplateRequestStatus } from '../entities/template-request.entity';

export class UpdateTemplateRequestStatusDto {
  @IsIn(['pending', 'in_progress', 'completed'])
  status: TemplateRequestStatus;
}
