import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FieldMappingDto } from './field-mapping.dto';

export class CreateIntegrationDto {
  @IsIn(['webhook', 'api_pull', 'file_export'])
  connectionType: 'webhook' | 'api_pull' | 'file_export';

  @IsOptional()
  @IsUrl()
  endpointUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  pollIntervalMins?: number;

  @ValidateNested()
  @Type(() => FieldMappingDto)
  fieldMapping: FieldMappingDto;
}
