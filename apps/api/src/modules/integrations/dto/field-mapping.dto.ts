import { IsOptional, IsString } from 'class-validator';

export class FieldMappingDto {
  @IsString()
  phone: string;

  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}
