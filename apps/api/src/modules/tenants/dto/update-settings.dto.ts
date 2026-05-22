import {
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  pointsEarnRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(1_000_000)
  pointsThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(365)
  lapsedDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName?: string;

  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;
}
