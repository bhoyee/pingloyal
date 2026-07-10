import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubscriptionStatus } from '@pingloyal/types';

export class StaffListTenantsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  includeDeleted?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;
}
