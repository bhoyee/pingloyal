import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRedemptionDto {
  @IsUUID()
  customerId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rewardsToRedeem: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
