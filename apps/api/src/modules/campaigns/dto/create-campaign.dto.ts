import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SanitiseString } from '../../../common/decorators/sanitise-string.decorator';
import { Type } from 'class-transformer';
import { SegmentRulesDto } from './segment-rules.dto';

export class CreateCampaignDto {
  @SanitiseString()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @SanitiseString()
  @IsString()
  @MinLength(10)
  @MaxLength(1024)
  messageBody: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentRulesDto)
  segmentRules?: SegmentRulesDto;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
