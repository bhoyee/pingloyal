import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SoftDeleteTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
