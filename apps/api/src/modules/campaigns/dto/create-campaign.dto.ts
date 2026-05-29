import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SegmentRulesDto } from './segment-rules.dto';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

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
