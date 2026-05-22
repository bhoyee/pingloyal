import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TierDto {
  @IsString()
  @IsNotEmpty()
  tierName: string;

  @IsString()
  @IsNotEmpty()
  tierLabel: string;

  @IsNumber()
  @Min(0)
  minQuarterlySpend: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQuarterlySpend?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  displayOrder?: number;
}

export class UpsertTierConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TierDto)
  tiers: TierDto[];
}
