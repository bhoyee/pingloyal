import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PlanTier } from '@pingloyal/types';

export class StaffUpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName?: string;

  @IsOptional()
  @IsEnum(PlanTier)
  planTier?: PlanTier;
}
