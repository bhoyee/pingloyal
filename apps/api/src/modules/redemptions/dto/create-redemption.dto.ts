import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRedemptionDto {
  @IsUUID()
  customerId: string;

  @IsInt()
  @Min(1)
  rewardsToRedeem: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
