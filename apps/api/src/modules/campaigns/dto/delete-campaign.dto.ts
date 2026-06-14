import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitiseString } from '../../../common/decorators/sanitise-string.decorator';

export class DeleteCampaignDto {
  @IsOptional()
  @SanitiseString()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
