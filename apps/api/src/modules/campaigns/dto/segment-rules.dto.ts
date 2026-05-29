import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SegmentRulesDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tierIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPoints?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value : undefined,
  )
  @IsIn(['all', 'active', 'inactive'])
  activityStatus?: 'all' | 'active' | 'inactive';
}
